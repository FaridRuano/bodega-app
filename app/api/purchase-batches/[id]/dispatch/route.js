import mongoose from "mongoose";
import { NextResponse } from "next/server";

import { requireUserRole } from "@libs/apiAuth";
import {
    DEFAULT_PURCHASE_LOCATION,
    isValidObjectId,
} from "@libs/purchaseRequests";
import dbConnect from "@libs/mongodb";
import { createNotificationsForUsers, NOTIFICATION_TYPES } from "@libs/notifications";
import InventoryMovement from "@models/InventoryMovement";
import InventoryStock from "@models/InventoryStock";
import PurchaseBatch from "@models/PurchaseBatch";
import PurchaseRequest from "@models/PurchaseRequest";
import { STOCK_LOCATIONS } from "@models/InventoryStock";

function isDispatchableBatchStatus(batch) {
    const normalizedStatus = String(batch?.status || "").trim().toLowerCase();

    if (batch?.dispatchedAt) {
        return false;
    }

    return !["draft", "dispatched", "completed", "cancelled"].includes(normalizedStatus);
}

function resolveDispatchLocation(value) {
    const normalizedValue = String(value || "").trim().toLowerCase();
    return STOCK_LOCATIONS.includes(normalizedValue)
        ? normalizedValue
        : DEFAULT_PURCHASE_LOCATION;
}

function isAdminCreatedRequest(purchaseRequest) {
    return String(purchaseRequest?.requestedBy?.role || "").trim().toLowerCase() === "admin";
}

function getRequesterId(purchaseRequest) {
    return String(purchaseRequest?.requestedBy?._id || purchaseRequest?.requestedBy || "");
}

async function getOrCreateStock(productId, location, session) {
    let stock = await InventoryStock.findOne({ productId, location }).session(session);

    if (!stock) {
        [stock] = await InventoryStock.create(
            [{
                productId,
                location,
                quantity: 0,
                reservedQuantity: 0,
            }],
            { session }
        );
    }

    return stock;
}

function buildDispatchPlanForItem(item, requestLocationMap, fallbackLocation) {
    const locationQuantities = new Map();
    let remainingQuantity = Number(item.quantity || 0);

    for (const allocation of item.allocations || []) {
        if (remainingQuantity <= 0) break;

        const allocationQuantity = Math.min(
            Number(allocation.quantity || 0),
            remainingQuantity
        );

        if (allocationQuantity <= 0) continue;

        const requestId = String(allocation.purchaseRequestId || "");
        const targetLocation = resolveDispatchLocation(
            requestLocationMap.get(requestId) || fallbackLocation
        );

        locationQuantities.set(
            targetLocation,
            Number(locationQuantities.get(targetLocation) || 0) + allocationQuantity
        );

        remainingQuantity -= allocationQuantity;
    }

    if (remainingQuantity > 0) {
        const fallbackTarget = resolveDispatchLocation(fallbackLocation);
        locationQuantities.set(
            fallbackTarget,
            Number(locationQuantities.get(fallbackTarget) || 0) + remainingQuantity
        );
    }

    return Array.from(locationQuantities.entries()).map(([location, quantity]) => ({
        location,
        quantity,
    }));
}

export async function POST(request, { params }) {
    const session = await mongoose.startSession();

    try {
        const { user, response } = await requireUserRole(["admin", "manager"]);
        if (response) return response;

        await dbConnect();
        const { id } = await params;

        if (!isValidObjectId(id)) {
            return NextResponse.json(
                { success: false, message: "La compra no es valida." },
                { status: 400 }
            );
        }

        session.startTransaction();

        const batch = await PurchaseBatch.findById(id)
            .populate("items.productId", "name code unit")
            .session(session);

        if (!batch) {
            await session.abortTransaction();
            return NextResponse.json(
                { success: false, message: "La compra no existe." },
                { status: 404 }
            );
        }

        if (!isDispatchableBatchStatus(batch)) {
            await session.abortTransaction();
            return NextResponse.json(
                { success: false, message: "Esta compra ya fue despachada o no se puede despachar." },
                { status: 409 }
            );
        }

        const requestIds = Array.from(
            new Set(
                (batch.items || []).flatMap((item) =>
                    (item.allocations || [])
                        .map((allocation) => String(allocation.purchaseRequestId || ""))
                        .filter(Boolean)
                )
            )
        );

        const purchaseRequests = requestIds.length
            ? await PurchaseRequest.find({ _id: { $in: requestIds } })
                .populate("requestedBy", "role")
                .session(session)
            : [];

        const purchaseRequestMap = new Map(
            purchaseRequests.map((purchaseRequest) => [
                String(purchaseRequest._id),
                purchaseRequest,
            ])
        );

        const requestLocationMap = new Map(
            purchaseRequests.map((purchaseRequest) => [
                String(purchaseRequest._id),
                resolveDispatchLocation(purchaseRequest.destinationLocation),
            ])
        );

        const dispatchedAt = new Date();
        const fallbackLocation = resolveDispatchLocation(batch.destinationLocation);
        const requestDispatchSummary = new Map();
        const requestReceiptSummary = new Map();

        for (const item of batch.items || []) {
            for (const allocation of item.allocations || []) {
                const purchaseRequest = purchaseRequestMap.get(String(allocation.purchaseRequestId || ""));
                if (!purchaseRequest) continue;

                const requestItem = (purchaseRequest.items || []).find(
                    (entry) => String(entry._id) === String(allocation.purchaseRequestItemId || "")
                );

                if (!requestItem) continue;

                const quantity = Number(allocation.quantity || 0);
                if (quantity <= 0) continue;
                const destinationLocation = resolveDispatchLocation(purchaseRequest.destinationLocation);

                requestItem.dispatchedQuantity =
                    Number(requestItem.dispatchedQuantity || 0) + quantity;

                if (isAdminCreatedRequest(purchaseRequest)) {
                    const destinationStock = await getOrCreateStock(
                        requestItem.productId,
                        destinationLocation,
                        session
                    );

                    destinationStock.quantity = Number(destinationStock.quantity || 0) + quantity;
                    destinationStock.lastMovementAt = dispatchedAt;
                    await destinationStock.save({ session });

                    requestItem.receivedQuantity =
                        Number(requestItem.receivedQuantity || 0) + quantity;

                    await InventoryMovement.create(
                        [{
                            productId: requestItem.productId,
                            movementType: "purchase_entry",
                            quantity,
                            unitSnapshot: requestItem.unitSnapshot,
                            toLocation: destinationLocation,
                            referenceType: "request",
                            referenceId: purchaseRequest._id,
                            notes: "Recepcion automatica por compra creada por administrador.",
                            performedBy: user.id,
                            movementDate: dispatchedAt,
                        }],
                        { session }
                    );
                }

                const requestKey = String(purchaseRequest._id);
                if (!requestDispatchSummary.has(requestKey)) {
                    requestDispatchSummary.set(requestKey, []);
                }

                requestDispatchSummary.get(requestKey).push({
                    purchaseRequestItemId: requestItem._id,
                    quantity,
                    location: destinationLocation,
                });

                if (isAdminCreatedRequest(purchaseRequest)) {
                    if (!requestReceiptSummary.has(requestKey)) {
                        requestReceiptSummary.set(requestKey, []);
                    }

                    requestReceiptSummary.get(requestKey).push({
                        purchaseRequestItemId: requestItem._id,
                        quantity,
                    });
                }
            }
        }

        for (const purchaseRequest of purchaseRequests) {
            const dispatchItems = requestDispatchSummary.get(String(purchaseRequest._id)) || [];
            if (!dispatchItems.length) continue;

            const receiptItems = requestReceiptSummary.get(String(purchaseRequest._id)) || [];
            purchaseRequest.recalculateStatus();
            purchaseRequest.addActivity({
                type: "purchase_registered",
                performedBy: user.id,
                title: "Compra despachada",
                description: receiptItems.length
                    ? `Se despacho compra hacia ${resolveDispatchLocation(
                        purchaseRequest.destinationLocation
                    )} y se confirmo la recepcion automaticamente porque la solicitud fue creada por administrador.`
                    : `Se despacho compra hacia ${resolveDispatchLocation(
                        purchaseRequest.destinationLocation
                    )}. La solicitud queda lista para que el solicitante confirme lo recibido.`,
                metadata: {
                    batchId: batch._id,
                    batchNumber: batch.batchNumber,
                    items: dispatchItems,
                },
            });

            if (receiptItems.length) {
                purchaseRequest.addActivity({
                    type: "purchase_registered",
                    performedBy: user.id,
                    title: "Recepcion automatica",
                    description:
                        "La recepcion fue confirmada automaticamente porque la solicitud fue creada por administrador.",
                    metadata: {
                        batchId: batch._id,
                        batchNumber: batch.batchNumber,
                        destinationLocation: resolveDispatchLocation(purchaseRequest.destinationLocation),
                        items: receiptItems,
                    },
                    performedAt: dispatchedAt,
                });
            }

            await purchaseRequest.save({ session });
        }

        batch.status = "dispatched";
        batch.dispatchedAt = dispatchedAt;
        batch.dispatchedBy = user.id;
        batch.addActivity({
            type: "purchase_dispatched",
            performedBy: user.id,
            title: "Compra despachada",
            description: requestReceiptSummary.size
                ? "La compra fue marcada como despachada. Las solicitudes creadas por administrador se recibieron automaticamente."
                : "La compra fue marcada como despachada y queda pendiente de confirmacion por parte del solicitante.",
            metadata: {
                requests: Array.from(requestDispatchSummary.entries()).map(([purchaseRequestId, items]) => ({
                    purchaseRequestId,
                    items,
                })),
            },
            performedAt: dispatchedAt,
        });
        for (const [purchaseRequestId, items] of requestReceiptSummary.entries()) {
            const purchaseRequest = purchaseRequestMap.get(purchaseRequestId);
            batch.addActivity({
                type: "receipt_confirmed",
                performedBy: user.id,
                title: "Recepcion automatica",
                description:
                    "La recepcion fue confirmada automaticamente porque la solicitud fue creada por administrador.",
                metadata: {
                    purchaseRequestId,
                    requestNumber: purchaseRequest?.requestNumber || "",
                    destinationLocation: resolveDispatchLocation(purchaseRequest?.destinationLocation),
                    items,
                },
                performedAt: dispatchedAt,
            });
        }
        await batch.save({ session });

        await session.commitTransaction();

        const requesterIds = Array.from(
            new Set(
                purchaseRequests
                    .filter((purchaseRequest) => !isAdminCreatedRequest(purchaseRequest))
                    .map((purchaseRequest) => getRequesterId(purchaseRequest))
                    .filter(Boolean)
            )
        );

        if (requesterIds.length) {
            await createNotificationsForUsers(requesterIds, {
                type: NOTIFICATION_TYPES.purchase_batch_dispatched,
                title: "Compra despachada",
                message: "Tu compra ya fue despachada y está esperando confirmación.",
                href: "/dashboard/receiving",
                entityType: "purchase_batch",
                entityId: batch._id,
                priority: "high",
            }).catch((notificationError) => {
                console.error("purchase batch dispatched notification error:", notificationError);
            });
        }

        const populatedBatch = await PurchaseBatch.findById(batch._id)
            .populate("registeredBy", "firstName lastName username email role")
            .populate("dispatchedBy", "firstName lastName username email role")
            .populate("activityLog.performedBy", "firstName lastName username email role")
            .populate("items.productId", "name code unit categoryId")
            .lean();

        return NextResponse.json(
            {
                success: true,
                message: requestReceiptSummary.size
                    ? "La compra fue despachada y las solicitudes creadas por administrador quedaron recibidas automaticamente."
                    : "La compra fue despachada. El inventario se actualizara cuando el solicitante confirme la recepcion.",
                data: populatedBatch,
            },
            { status: 200 }
        );
    } catch (error) {
        await session.abortTransaction().catch(() => { });
        console.error("POST /api/purchase-batches/[id]/dispatch error:", error);
        return NextResponse.json(
            { success: false, message: error.message || "No se pudo despachar la compra." },
            { status: 500 }
        );
    } finally {
        session.endSession();
    }
}
