import mongoose from "mongoose";
import { NextResponse } from "next/server";

import { requireUserRole } from "@libs/apiAuth";
import { parsePositiveNumber } from "@libs/apiUtils";
import {
    DEFAULT_PURCHASE_LOCATION,
    buildBatchReceiptProgressMap,
    buildPendingShoppingList,
    calculateRequestItemProgress,
    generateSequentialCode,
    normalizeText,
    isValidObjectId,
    normalizeNullableText,
} from "@libs/purchaseRequests";
import dbConnect from "@libs/mongodb";
import Product from "@models/Product";
import PurchaseBatch from "@models/PurchaseBatch";
import PurchaseRequest from "@models/PurchaseRequest";

function mapPurchaseBatch(batch, progress = null) {
    const progressSummary = progress || {
        allocatedQuantity: 0,
        receivedQuantity: 0,
        pendingReceiptQuantity: 0,
        isCompleted: false,
    };
    const derivedStatus =
        batch.status === "dispatched" && progressSummary.isCompleted
            ? "completed"
            : batch.status;

    return {
        _id: batch._id,
        batchNumber: batch.batchNumber,
        status: derivedStatus,
        baseStatus: batch.status,
        purchasedAt: batch.purchasedAt,
        dispatchedAt: batch.dispatchedAt || null,
        supplierName: batch.supplierName || "",
        note: batch.note || "",
        destinationLocation: batch.destinationLocation,
        registeredBy: batch.registeredBy || null,
        dispatchedBy: batch.dispatchedBy || null,
        activityLog: (batch.activityLog || []).map((entry) => ({
            _id: entry._id,
            type: entry.type,
            title: entry.title || "",
            description: entry.description || "",
            performedAt: entry.performedAt || null,
            performedBy: entry.performedBy || null,
            metadata: entry.metadata || null,
        })),
        progress: progressSummary,
        items: (batch.items || []).map((item) => ({
            _id: item._id,
            productId: item.productId?._id || item.productId,
            product: item.productId && typeof item.productId === "object" ? item.productId : null,
            unitSnapshot: item.unitSnapshot,
            quantity: Number(item.quantity || 0),
            unitCost: item.unitCost == null ? null : Number(item.unitCost),
            totalCost: item.totalCost == null ? null : Number(item.totalCost),
            note: item.note || "",
            allocations: (item.allocations || []).map((allocation) => ({
                purchaseRequestId: allocation.purchaseRequestId,
                purchaseRequestItemId: allocation.purchaseRequestItemId,
                quantity: Number(allocation.quantity || 0),
            })),
        })),
    };
}

function buildRequestLocationMap(requests = []) {
    return new Map(
        (requests || []).map((request) => [
            String(request._id),
            String(request.destinationLocation || DEFAULT_PURCHASE_LOCATION),
        ])
    );
}

function enrichBatchDestinations(batch, requestLocationMap) {
    const destinations = new Set();

    for (const item of batch.items || []) {
        for (const allocation of item.allocations || []) {
            const requestId = String(allocation.purchaseRequestId || "");
            const location = requestLocationMap.get(requestId);
            if (location) {
                destinations.add(location);
            }
        }
    }

    const destinationLocations = destinations.size
        ? Array.from(destinations)
        : [String(batch.destinationLocation || DEFAULT_PURCHASE_LOCATION)];

    return {
        ...batch,
        destinationLocations,
        primaryDestinationLocation: destinationLocations[0] || DEFAULT_PURCHASE_LOCATION,
    };
}

function createAutoAllocationPlan(requests, purchasedItems) {
    const requestsByProduct = new Map();

    for (const request of requests) {
        for (const item of request.items || []) {
            const progress = calculateRequestItemProgress(item);
            if (progress.pendingPurchaseQuantity <= 0) continue;

            const key = String(item.productId);
            if (!requestsByProduct.has(key)) {
                requestsByProduct.set(key, []);
            }

            requestsByProduct.get(key).push({
                purchaseRequestId: request._id,
                purchaseRequestItemId: item._id,
                remainingQuantity: progress.pendingPurchaseQuantity,
            });
        }
    }

    return purchasedItems.map((item) => {
        let remainingToAllocate = Number(item.quantity || 0);
        const queue = requestsByProduct.get(String(item.productId)) || [];
        const allocations = [];

        for (const requestItem of queue) {
            if (remainingToAllocate <= 0) break;

            const quantity = Math.min(remainingToAllocate, requestItem.remainingQuantity);
            if (quantity <= 0) continue;

            allocations.push({
                purchaseRequestId: requestItem.purchaseRequestId,
                purchaseRequestItemId: requestItem.purchaseRequestItemId,
                quantity,
            });

            requestItem.remainingQuantity -= quantity;
            remainingToAllocate -= quantity;
        }

        return allocations;
    });
}

export async function GET(request) {
    try {
        const { response } = await requireUserRole(["admin"]);
        if (response) return response;

        await dbConnect();

        const { searchParams } = new URL(request.url);
        const hasPagination = searchParams.has("page") || searchParams.has("limit");
        const page = parsePositiveNumber(searchParams.get("page"), 1);
        const limit = Math.min(parsePositiveNumber(searchParams.get("limit"), 20), 100);
        const skip = (page - 1) * limit;
        const search = normalizeText(searchParams.get("search"));
        const registeredBy = normalizeText(searchParams.get("registeredBy"));
        const dateFrom = normalizeText(searchParams.get("dateFrom"));
        const dateTo = normalizeText(searchParams.get("dateTo"));
        const query = {};

        if (search) {
            const regex = new RegExp(search, "i");
            query.$or = [
                { batchNumber: regex },
                { supplierName: regex },
                { note: regex },
            ];
        }

        if (registeredBy && isValidObjectId(registeredBy)) {
            query.registeredBy = registeredBy;
        }

        if (dateFrom || dateTo) {
            query.purchasedAt = {};

            if (dateFrom) {
                query.purchasedAt.$gte = new Date(`${dateFrom}T00:00:00.000Z`);
            }

            if (dateTo) {
                query.purchasedAt.$lte = new Date(`${dateTo}T23:59:59.999Z`);
            }
        }

        const [batches, total, requestDocs] = await Promise.all([
            PurchaseBatch.find(query)
                .populate("registeredBy", "firstName lastName username email role")
                .populate("dispatchedBy", "firstName lastName username email role")
                .populate("activityLog.performedBy", "firstName lastName username email role")
                .populate("items.productId", "name code unit categoryId")
                .sort({ purchasedAt: -1, createdAt: -1 })
                .skip(hasPagination ? skip : 0)
                .limit(hasPagination ? limit : 200)
                .lean(),
            PurchaseBatch.countDocuments(query),
            PurchaseRequest.find({ status: { $in: ["approved", "in_progress", "partially_purchased", "completed"] } })
                .populate("items.productId", "name code unit categoryId")
                .sort({ requestedAt: 1 })
                .lean(),
        ]);

        const batchProgressMap = buildBatchReceiptProgressMap(batches, requestDocs);
        const requestLocationMap = buildRequestLocationMap(requestDocs);

        return NextResponse.json(
            {
                success: true,
                data: batches.map((batch) =>
                    mapPurchaseBatch(
                        enrichBatchDestinations(batch, requestLocationMap),
                        batchProgressMap.get(String(batch._id))
                    )
                ),
                consolidatedShoppingList: buildPendingShoppingList(
                    requestDocs.filter((requestItem) =>
                        ["approved", "in_progress", "partially_purchased"].includes(requestItem.status)
                    )
                ),
                meta: {
                    page,
                    limit: hasPagination ? limit : batches.length,
                    total,
                    pages: hasPagination ? Math.max(Math.ceil(total / limit), 1) : 1,
                },
            },
            { status: 200 }
        );
    } catch (error) {
        console.error("GET /api/purchase-batches error:", error);
        return NextResponse.json(
            { success: false, message: "No se pudieron obtener las compras registradas." },
            { status: 500 }
        );
    }
}

export async function POST(request) {
    const session = await mongoose.startSession();

    try {
        const { user, response } = await requireUserRole(["admin"]);
        if (response) return response;

        await dbConnect();

        const body = await request.json();
        const batchId = normalizeText(body.batchId);
        const saveAsDraft = Boolean(body.saveAsDraft);
        const rawItems = Array.isArray(body.items) ? body.items : [];
        const normalizedItems = rawItems.filter((item) => Number(item?.quantity) > 0);

        const hasMeaningfulDraftContent =
            normalizedItems.length > 0 ||
            Boolean(normalizeNullableText(body.supplierName)) ||
            Boolean(normalizeNullableText(body.note));

        if (!saveAsDraft && !normalizedItems.length) {
            return NextResponse.json(
                { success: false, message: "Debes registrar al menos un producto comprado." },
                { status: 400 }
            );
        }

        if (saveAsDraft && !hasMeaningfulDraftContent) {
            return NextResponse.json(
                { success: false, message: "Agrega al menos un producto o una nota para guardar el borrador." },
                { status: 400 }
            );
        }

        const productIds = [...new Set(normalizedItems.map((item) => normalizeText(item.productId)).filter(Boolean))];

        if (productIds.some((id) => !isValidObjectId(id))) {
            return NextResponse.json(
                { success: false, message: "Uno o mas productos no son validos." },
                { status: 400 }
            );
        }

        const products = await Product.find({ _id: { $in: productIds }, isActive: true }).lean();
        const productMap = new Map(products.map((product) => [String(product._id), product]));

        if (products.length !== productIds.length) {
            return NextResponse.json(
                { success: false, message: "Uno o mas productos no existen o estan inactivos." },
                { status: 404 }
            );
        }

        const purchaseItems = normalizedItems.map((item) => {
            const product = productMap.get(normalizeText(item.productId));
            const quantity = Number(item.quantity);
            const unitCost = item.unitCost == null || item.unitCost === "" ? null : Number(item.unitCost);
            const totalCost = item.totalCost == null || item.totalCost === "" ? null : Number(item.totalCost);

            if (!product) {
                throw new Error("Uno o mas productos no existen.");
            }

            if (!Number.isFinite(quantity) || quantity <= 0) {
                throw new Error(`La cantidad comprada de ${product.name} debe ser mayor que cero.`);
            }

            if (unitCost != null && (!Number.isFinite(unitCost) || unitCost < 0)) {
                throw new Error(`El costo unitario de ${product.name} no es valido.`);
            }

            if (totalCost != null && (!Number.isFinite(totalCost) || totalCost < 0)) {
                throw new Error(`El costo total de ${product.name} no es valido.`);
            }

            return {
                productId: product._id,
                unitSnapshot: product.unit,
                quantity,
                unitCost,
                totalCost,
                note: normalizeNullableText(item.note),
                allocations: Array.isArray(item.allocations) ? item.allocations : [],
            };
        });

        let draftBatch = null;

        if (batchId) {
            if (!isValidObjectId(batchId)) {
                return NextResponse.json(
                    { success: false, message: "El borrador de compra no es valido." },
                    { status: 400 }
                );
            }

            draftBatch = await PurchaseBatch.findById(batchId).session(session);

            if (!draftBatch) {
                return NextResponse.json(
                    { success: false, message: "El borrador de compra no existe." },
                    { status: 404 }
                );
            }

            if (draftBatch.status !== "draft") {
                return NextResponse.json(
                    { success: false, message: "Solo se pueden editar compras en borrador." },
                    { status: 409 }
                );
            }
        }

        const pendingRequests =
            saveAsDraft || !productIds.length
                ? []
                : await PurchaseRequest.find({
                    status: { $in: ["approved", "in_progress", "partially_purchased"] },
                    "items.productId": { $in: productIds },
                })
                    .sort({ requestedAt: 1, createdAt: 1 })
                    .session(session);

        const autoAllocations = saveAsDraft
            ? purchaseItems.map(() => [])
            : createAutoAllocationPlan(pendingRequests, purchaseItems);
        const batchNumber = draftBatch?.batchNumber || await generateSequentialCode(PurchaseBatch, "PBT");
        const purchasedAt = body.purchasedAt ? new Date(body.purchasedAt) : new Date();

        session.startTransaction();

        const batch = draftBatch || new PurchaseBatch({
            batchNumber,
            registeredBy: user.id,
            destinationLocation: DEFAULT_PURCHASE_LOCATION,
            items: [],
        });

        batch.batchNumber = batchNumber;
        batch.status = saveAsDraft ? "draft" : "purchased";
        batch.purchasedAt = purchasedAt;
        batch.supplierName = normalizeNullableText(body.supplierName);
        batch.note = normalizeNullableText(body.note);
        batch.destinationLocation = DEFAULT_PURCHASE_LOCATION;
        batch.items = [];

        for (let index = 0; index < purchaseItems.length; index += 1) {
            const item = purchaseItems[index];
            const product = productMap.get(String(item.productId));
            const allocations = item.allocations.length
                ? item.allocations.map((allocation) => ({
                    purchaseRequestId: allocation.purchaseRequestId,
                    purchaseRequestItemId: allocation.purchaseRequestItemId,
                    quantity: Number(allocation.quantity || 0),
                }))
                : autoAllocations[index];

            batch.items.push({
                productId: item.productId,
                unitSnapshot: product.unit,
                quantity: item.quantity,
                unitCost: item.unitCost,
                totalCost: item.totalCost,
                note: item.note,
                allocations,
            });
        }

        if (saveAsDraft) {
            batch.addActivity({
                type: draftBatch ? "purchase_updated_draft" : "purchase_saved_draft",
                performedBy: user.id,
                title: draftBatch ? "Borrador actualizado" : "Borrador guardado",
                description: draftBatch
                    ? "El borrador de compra fue actualizado para continuar luego."
                    : "La compra fue guardada como borrador para continuar luego.",
                metadata: {
                    itemsCount: batch.items.length,
                },
                performedAt: new Date(),
            });

            await batch.save({ session });
            await session.commitTransaction();

            const populatedDraft = await PurchaseBatch.findById(batch._id)
                .populate("registeredBy", "firstName lastName username email role")
                .populate("dispatchedBy", "firstName lastName username email role")
                .populate("activityLog.performedBy", "firstName lastName username email role")
                .populate("items.productId", "name code unit categoryId")
                .lean();

            return NextResponse.json(
                {
                    success: true,
                    message: draftBatch
                        ? "Borrador actualizado correctamente."
                        : "Borrador guardado correctamente.",
                    data: mapPurchaseBatch(populatedDraft),
                },
                { status: draftBatch ? 200 : 201 }
            );
        }

        batch.addActivity({
            type: "purchase_created",
            performedBy: user.id,
            title: draftBatch ? "Compra registrada desde borrador" : "Compra registrada",
            description: draftBatch
                ? "El borrador se registró como compra y queda pendiente de despacho."
                : "La compra fue registrada y queda pendiente de despacho.",
            metadata: {
                purchasedAt,
            },
            performedAt: purchasedAt,
        });

        const allocationMap = new Map();

        for (const batchItem of batch.items) {
            for (const allocation of batchItem.allocations || []) {
                const key = `${allocation.purchaseRequestId}:${allocation.purchaseRequestItemId}`;
                allocationMap.set(key, (allocationMap.get(key) || 0) + Number(allocation.quantity || 0));
            }
        }

        for (const purchaseRequest of pendingRequests) {
            let requestWasUpdated = false;

            purchaseRequest.items = purchaseRequest.items.map((item) => {
                const key = `${purchaseRequest._id}:${item._id}`;
                const purchasedIncrement = allocationMap.get(key) || 0;

                if (purchasedIncrement > 0) {
                    item.purchasedQuantity = Number(item.purchasedQuantity || 0) + purchasedIncrement;
                    requestWasUpdated = true;
                }

                return item;
            });

            if (requestWasUpdated) {
                purchaseRequest.recalculateStatus();
                purchaseRequest.addActivity({
                    type: "purchase_registered",
                    performedBy: user.id,
                    title: "Compra registrada",
                    description: `Se registro la compra del lote ${batch.batchNumber}. La solicitud queda en proceso hasta despacharse.`,
                    metadata: { batchId: batch._id, batchNumber: batch.batchNumber },
                });

                await purchaseRequest.save({ session });
            }
        }

        await batch.save({ session });
        await session.commitTransaction();

        const populatedBatch = await PurchaseBatch.findById(batch._id)
            .populate("registeredBy", "firstName lastName username email role")
            .populate("dispatchedBy", "firstName lastName username email role")
            .populate("activityLog.performedBy", "firstName lastName username email role")
            .populate("items.productId", "name code unit categoryId")
            .lean();

        const requestIds = Array.from(
            new Set(
                (populatedBatch?.items || []).flatMap((item) =>
                    (item.allocations || [])
                        .map((allocation) => String(allocation.purchaseRequestId || ""))
                        .filter(Boolean)
                )
            )
        );

        const relatedRequests = requestIds.length
            ? await PurchaseRequest.find(
                { _id: { $in: requestIds } },
                { destinationLocation: 1 }
            ).lean()
            : [];

        const requestLocationMap = buildRequestLocationMap(relatedRequests);

        return NextResponse.json(
            {
                success: true,
                message: draftBatch
                    ? "Borrador registrado como compra correctamente."
                    : "Compra registrada correctamente.",
                data: mapPurchaseBatch(
                    enrichBatchDestinations(populatedBatch, requestLocationMap)
                ),
            },
            { status: 201 }
        );
    } catch (error) {
        await session.abortTransaction().catch(() => { });
        console.error("POST /api/purchase-batches error:", error);
        return NextResponse.json(
            { success: false, message: error.message || "No se pudo registrar la compra." },
            { status: 500 }
        );
    } finally {
        session.endSession();
    }
}
