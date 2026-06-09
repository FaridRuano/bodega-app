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
import { assertValidQuantityForUnit } from "@libs/unitQuantities";

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
        let lastAllocation = null;

        for (const requestItem of queue) {
            if (remainingToAllocate <= 0) break;

            const quantity = Math.min(remainingToAllocate, requestItem.remainingQuantity);
            if (quantity <= 0) continue;

            lastAllocation = {
                purchaseRequestId: requestItem.purchaseRequestId,
                purchaseRequestItemId: requestItem.purchaseRequestItemId,
                quantity,
            };
            allocations.push(lastAllocation);

            requestItem.remainingQuantity -= quantity;
            remainingToAllocate -= quantity;
        }

        if (remainingToAllocate > 0 && lastAllocation) {
            lastAllocation.quantity = Number(lastAllocation.quantity || 0) + remainingToAllocate;
            remainingToAllocate = 0;
        }

        return allocations;
    });
}

function createEditableAllocationPlan(requests, purchasedItems, oldAllocationsByRequestItem = new Map()) {
    const requestsByProduct = new Map();

    for (const request of requests) {
        for (const item of request.items || []) {
            const productId = String(item.productId);
            const itemId = String(item._id);
            const approvedQuantity = Number(item.approvedQuantity || item.requestedQuantity || 0);
            const purchasedOutsideCurrentBatch = Math.max(
                Number(item.purchasedQuantity || 0) - Number(oldAllocationsByRequestItem.get(itemId) || 0),
                0
            );
            const editableQuantity = Math.max(approvedQuantity - purchasedOutsideCurrentBatch, 0);

            if (editableQuantity <= 0) continue;

            if (!requestsByProduct.has(productId)) {
                requestsByProduct.set(productId, []);
            }

            requestsByProduct.get(productId).push({
                purchaseRequestId: request._id,
                purchaseRequestItemId: item._id,
                remainingQuantity: editableQuantity,
            });
        }
    }

    return purchasedItems.map((item) => {
        let remainingToAllocate = Number(item.quantity || 0);
        const queue = requestsByProduct.get(String(item.productId)) || [];
        const allocations = [];
        let lastAllocation = null;

        for (const requestItem of queue) {
            if (remainingToAllocate <= 0) break;

            const quantity = Math.min(remainingToAllocate, requestItem.remainingQuantity);
            if (quantity <= 0) continue;

            lastAllocation = {
                purchaseRequestId: requestItem.purchaseRequestId,
                purchaseRequestItemId: requestItem.purchaseRequestItemId,
                quantity,
            };
            allocations.push(lastAllocation);

            requestItem.remainingQuantity -= quantity;
            remainingToAllocate -= quantity;
        }

        if (remainingToAllocate > 0 && lastAllocation) {
            lastAllocation.quantity = Number(lastAllocation.quantity || 0) + remainingToAllocate;
            remainingToAllocate = 0;
        }

        return allocations;
    });
}

function normalizePurchaseAllocations(rawAllocations = [], purchasedQuantity = 0) {
    const allocations = (rawAllocations || [])
        .map((allocation) => ({
            purchaseRequestId: allocation.purchaseRequestId,
            purchaseRequestItemId: allocation.purchaseRequestItemId,
            quantity: Number(allocation.quantity || 0),
        }))
        .filter((allocation) =>
            allocation.purchaseRequestId &&
            allocation.purchaseRequestItemId &&
            allocation.quantity > 0
        );

    const allocatedQuantity = allocations.reduce(
        (sum, allocation) => sum + Number(allocation.quantity || 0),
        0
    );
    const pendingOverflow = Number(purchasedQuantity || 0) - allocatedQuantity;

    if (pendingOverflow > 0 && allocations.length) {
        allocations[allocations.length - 1].quantity =
            Number(allocations[allocations.length - 1].quantity || 0) + pendingOverflow;
    }

    return allocations;
}

function buildAllocationsByRequestItem(items = []) {
    const allocationMap = new Map();

    for (const batchItem of items || []) {
        for (const allocation of batchItem.allocations || []) {
            const requestItemId = String(allocation.purchaseRequestItemId || "");
            if (!requestItemId) continue;
            allocationMap.set(
                requestItemId,
                Number(allocationMap.get(requestItemId) || 0) + Number(allocation.quantity || 0)
            );
        }
    }

    return allocationMap;
}

function buildItemNotesByProduct(items = []) {
    const notesByProduct = new Map();

    for (const item of items || []) {
        const productId = normalizeText(item.productId);
        const note = normalizeNullableText(item.note);

        if (!productId || !note) continue;
        notesByProduct.set(productId, note);
    }

    return notesByProduct;
}

function normalizeDateOnly(value, endOfDay = false) {
    const raw = normalizeText(value);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;

    const date = new Date(`${raw}T00:00:00.000Z`);
    if (Number.isNaN(date.getTime())) return null;

    if (endOfDay) {
        date.setUTCHours(23, 59, 59, 999);
    }

    return date;
}

export async function GET(request) {
    try {
        const { response } = await requireUserRole(["admin", "manager"]);
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
        const { user, response } = await requireUserRole(["admin", "manager"]);
        if (response) return response;

        await dbConnect();

        const body = await request.json();
        const batchId = normalizeText(body.batchId);
        const saveAsDraft = Boolean(body.saveAsDraft);
        const closeUnpurchased = Boolean(body.closeUnpurchased);
        const purchaseScopeDate = normalizeText(body.purchaseScopeDate);
        const scopeDateFrom = normalizeDateOnly(purchaseScopeDate);
        const scopeDateTo = normalizeDateOnly(purchaseScopeDate, true);
        const rawItems = Array.isArray(body.items) ? body.items : [];
        const meaningfulItems = rawItems.filter(
            (item) => Number(item?.quantity) > 0 || Boolean(normalizeNullableText(item?.note))
        );
        const normalizedItems = rawItems.filter((item) => Number(item?.quantity) > 0);
        const itemNotesByProduct = buildItemNotesByProduct(meaningfulItems);

        const hasMeaningfulDraftContent =
            meaningfulItems.length > 0 ||
            Boolean(normalizeNullableText(body.supplierName)) ||
            Boolean(normalizeNullableText(body.note));

        if (!saveAsDraft && !normalizedItems.length && !itemNotesByProduct.size && !closeUnpurchased) {
            return NextResponse.json(
                { success: false, message: "Debes registrar al menos un producto comprado o una nota por producto." },
                { status: 400 }
            );
        }

        if (closeUnpurchased && (!scopeDateFrom || !scopeDateTo)) {
            return NextResponse.json(
                { success: false, message: "Debes elegir un dia valido para cerrar pendientes no comprados." },
                { status: 400 }
            );
        }

        if (saveAsDraft && !hasMeaningfulDraftContent) {
            return NextResponse.json(
                { success: false, message: "Agrega al menos un producto o una nota para guardar el borrador." },
                { status: 400 }
            );
        }

        const productIds = [...new Set(meaningfulItems.map((item) => normalizeText(item.productId)).filter(Boolean))];

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

            assertValidQuantityForUnit(
                quantity,
                product.unit,
                `La cantidad comprada de ${product.name}`
            );

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
        let isUpdatingRegisteredPurchase = false;
        let previousAllocationsByRequestItem = new Map();

        if (batchId) {
            if (!isValidObjectId(batchId)) {
                return NextResponse.json(
                    { success: false, message: "La compra no es valida." },
                    { status: 400 }
                );
            }

            draftBatch = await PurchaseBatch.findById(batchId).session(session);

            if (!draftBatch) {
                return NextResponse.json(
                    { success: false, message: "La compra no existe." },
                    { status: 404 }
                );
            }

            isUpdatingRegisteredPurchase = draftBatch.status === "purchased" && !draftBatch.dispatchedAt;

            if (draftBatch.status !== "draft" && !isUpdatingRegisteredPurchase) {
                return NextResponse.json(
                    { success: false, message: "Solo se pueden editar compras en borrador o pendientes de despacho." },
                    { status: 409 }
                );
            }

            previousAllocationsByRequestItem = buildAllocationsByRequestItem(draftBatch.items || []);

            if (isUpdatingRegisteredPurchase && (!scopeDateFrom || !scopeDateTo)) {
                return NextResponse.json(
                    { success: false, message: "Debes elegir un dia valido para editar la compra." },
                    { status: 400 }
                );
            }
        }

        const pendingRequestQuery = {
            status: {
                $in: isUpdatingRegisteredPurchase
                    ? ["approved", "in_progress", "partially_purchased", "not_purchased"]
                    : ["approved", "in_progress", "partially_purchased"],
            },
        };

        if (closeUnpurchased || isUpdatingRegisteredPurchase) {
            pendingRequestQuery.requestedAt = { $gte: scopeDateFrom, $lte: scopeDateTo };
        } else if (productIds.length) {
            pendingRequestQuery["items.productId"] = { $in: productIds };
        }

        const pendingRequests =
            saveAsDraft || (!productIds.length && !itemNotesByProduct.size && !closeUnpurchased)
                ? []
                : await PurchaseRequest.find(pendingRequestQuery)
                    .sort({ requestedAt: 1, createdAt: 1 })
                    .session(session);

        const autoAllocations = saveAsDraft
            ? purchaseItems.map(() => [])
            : isUpdatingRegisteredPurchase
                ? createEditableAllocationPlan(pendingRequests, purchaseItems, previousAllocationsByRequestItem)
                : createAutoAllocationPlan(pendingRequests, purchaseItems);
        const batchNumber = draftBatch?.batchNumber || await generateSequentialCode(PurchaseBatch, "PBT");
        const purchasedAt = body.purchasedAt ? new Date(body.purchasedAt) : new Date();

        session.startTransaction();

        if (!saveAsDraft && !purchaseItems.length && itemNotesByProduct.size && !closeUnpurchased) {
            let updatedRequestsCount = 0;

            for (const purchaseRequest of pendingRequests) {
                let requestWasUpdated = false;

                purchaseRequest.items = purchaseRequest.items.map((item) => {
                    const note = itemNotesByProduct.get(String(item.productId));

                    if (note) {
                        item.adminNote = note;
                        requestWasUpdated = true;
                    }

                    return item;
                });

                if (requestWasUpdated) {
                    purchaseRequest.addActivity({
                        type: "purchase_registered",
                        performedBy: user.id,
                        title: "Nota de compra registrada",
                        description: "Se agrego una nota del administrador para productos pendientes de compra.",
                        metadata: {
                            notes: Array.from(itemNotesByProduct.entries()).map(([productId, note]) => ({
                                productId,
                                note,
                            })),
                        },
                        performedAt: purchasedAt,
                    });

                    await purchaseRequest.save({ session });
                    updatedRequestsCount += 1;
                }
            }

            await session.commitTransaction();

            return NextResponse.json(
                {
                    success: true,
                    message: updatedRequestsCount
                        ? "Notas registradas correctamente en las solicitudes pendientes."
                        : "No habia solicitudes pendientes para actualizar con esas notas.",
                    data: null,
                },
                { status: 200 }
            );
        }

        const batch = purchaseItems.length ? (draftBatch || new PurchaseBatch({
            batchNumber,
            registeredBy: user.id,
            destinationLocation: DEFAULT_PURCHASE_LOCATION,
            items: [],
        })) : null;

        if (batch) {
            batch.batchNumber = batchNumber;
            batch.status = saveAsDraft ? "draft" : "purchased";
            batch.purchasedAt = purchasedAt;
            batch.supplierName = normalizeNullableText(body.supplierName);
            batch.note = normalizeNullableText(body.note);
            batch.destinationLocation = DEFAULT_PURCHASE_LOCATION;
            batch.items = [];
        }

        for (let index = 0; index < purchaseItems.length; index += 1) {
            const item = purchaseItems[index];
            const product = productMap.get(String(item.productId));
            const allocations = item.allocations.length
                ? normalizePurchaseAllocations(item.allocations, item.quantity)
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

        if (batch) {
            batch.addActivity({
                type: isUpdatingRegisteredPurchase ? "purchase_updated" : "purchase_created",
                performedBy: user.id,
                title: isUpdatingRegisteredPurchase
                    ? "Compra actualizada"
                    : draftBatch
                        ? "Compra registrada desde borrador"
                        : "Compra registrada",
                description: isUpdatingRegisteredPurchase
                    ? "La compra pendiente de despacho fue actualizada."
                    : draftBatch
                        ? "El borrador se registró como compra y queda pendiente de despacho."
                        : "La compra fue registrada y queda pendiente de despacho.",
                metadata: {
                    purchasedAt,
                },
                performedAt: purchasedAt,
            });
        }

        const allocationMap = buildAllocationsByRequestItem(batch?.items || []);

        for (const purchaseRequest of pendingRequests) {
            let requestWasUpdated = false;

            purchaseRequest.items = purchaseRequest.items.map((item) => {
                const itemId = String(item._id);
                const purchasedIncrement = allocationMap.get(itemId) || 0;
                const previousPurchasedIncrement = previousAllocationsByRequestItem.get(itemId) || 0;
                const itemNote = itemNotesByProduct.get(String(item.productId));

                if (isUpdatingRegisteredPurchase) {
                    const approvedQuantity = Number(item.approvedQuantity || item.requestedQuantity || 0);
                    const purchasedOutsideCurrentBatch = Math.max(
                        Number(item.purchasedQuantity || 0) - previousPurchasedIncrement,
                        0
                    );
                    const nextPurchasedQuantity = purchasedOutsideCurrentBatch + purchasedIncrement;
                    const nextNotPurchasedQuantity = Math.max(approvedQuantity - nextPurchasedQuantity, 0);
                    const didChangeQuantities =
                        Number(item.purchasedQuantity || 0) !== nextPurchasedQuantity ||
                        Number(item.notPurchasedQuantity || 0) !== nextNotPurchasedQuantity;

                    item.purchasedQuantity = nextPurchasedQuantity;
                    item.notPurchasedQuantity = nextNotPurchasedQuantity;
                    requestWasUpdated = requestWasUpdated || didChangeQuantities;
                } else if (purchasedIncrement > 0) {
                    item.purchasedQuantity = Number(item.purchasedQuantity || 0) + purchasedIncrement;
                    requestWasUpdated = true;
                }

                if (itemNote) {
                    item.adminNote = itemNote;
                    requestWasUpdated = true;
                }

                if (closeUnpurchased && !isUpdatingRegisteredPurchase) {
                    const progress = calculateRequestItemProgress(item);
                    if (progress.pendingPurchaseQuantity > 0) {
                        item.notPurchasedQuantity =
                            Number(item.notPurchasedQuantity || 0) + progress.pendingPurchaseQuantity;
                        item.adminNote =
                            item.adminNote ||
                            `No comprado en el cierre de compras del ${purchaseScopeDate}.`;
                        requestWasUpdated = true;
                    }
                }

                return item;
            });

            if (requestWasUpdated) {
                purchaseRequest.recalculateStatus();
                purchaseRequest.addActivity({
                    type: batch ? "purchase_registered" : "purchase_not_purchased",
                    performedBy: user.id,
                    title: batch
                        ? isUpdatingRegisteredPurchase
                            ? "Compra actualizada"
                            : "Compra registrada"
                        : "Pendientes marcados como no comprados",
                    description: batch
                        ? isUpdatingRegisteredPurchase
                            ? `Se actualizo la compra del lote ${batch.batchNumber}.`
                            : `Se registro la compra del lote ${batch.batchNumber}. Lo no comprado del dia quedo cerrado.`
                        : `Se cerro el dia ${purchaseScopeDate} sin compra registrada para estos pendientes.`,
                    metadata: batch
                        ? { batchId: batch._id, batchNumber: batch.batchNumber, closedUnpurchased: closeUnpurchased && !isUpdatingRegisteredPurchase }
                        : { purchaseScopeDate, closedUnpurchased: true },
                });

                await purchaseRequest.save({ session });
            }
        }

        if (batch) {
            await batch.save({ session });
        }
        await session.commitTransaction();

        if (!batch) {
            return NextResponse.json(
                {
                    success: true,
                    message: "Los pendientes del dia fueron marcados como no comprados.",
                    data: null,
                },
                { status: 200 }
            );
        }

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
                message: isUpdatingRegisteredPurchase
                    ? "Compra actualizada correctamente."
                    : draftBatch
                    ? "Borrador registrado como compra correctamente."
                    : "Compra registrada correctamente.",
                data: mapPurchaseBatch(
                    enrichBatchDestinations(populatedBatch, requestLocationMap)
                ),
            },
            { status: isUpdatingRegisteredPurchase ? 200 : 201 }
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
