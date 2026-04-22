import mongoose from "mongoose";
import { NextResponse } from "next/server";

import { requireAuthenticatedUser } from "@libs/apiAuth";
import { getLocationLabel } from "@libs/constants/domainLabels";
import {
    DEFAULT_PURCHASE_LOCATION,
    isValidObjectId,
    normalizeNullableText,
    normalizeText,
} from "@libs/purchaseRequests";
import dbConnect from "@libs/mongodb";
import { createNotificationsForRoles, NOTIFICATION_TYPES } from "@libs/notifications";
import InventoryMovement from "@models/InventoryMovement";
import InventoryStock from "@models/InventoryStock";
import PurchaseBatch from "@models/PurchaseBatch";
import PurchaseRequest from "@models/PurchaseRequest";

function mapPurchaseRequestDocument(request) {
    return {
        _id: request._id,
        requestNumber: request.requestNumber,
        status: request.status,
        requestedBy: request.requestedBy || null,
        approvedBy: request.approvedBy || null,
        rejectedBy: request.rejectedBy || null,
        cancelledBy: request.cancelledBy || null,
        destinationLocation: request.destinationLocation || "warehouse",
        requesterNote: request.requesterNote || "",
        adminNote: request.adminNote || "",
        statusReason: request.statusReason || "",
        requestedAt: request.requestedAt || null,
        approvedAt: request.approvedAt || null,
        rejectedAt: request.rejectedAt || null,
        cancelledAt: request.cancelledAt || null,
        completedAt: request.completedAt || null,
        totals: request.totals || { requested: 0, approved: 0, purchased: 0, dispatched: 0, received: 0, pendingPurchase: 0, pendingDispatch: 0, pendingReceipt: 0, remaining: 0 },
        items: (request.items || []).map((item) => ({
            _id: item._id,
            productId: item.productId?._id || item.productId,
            product: item.productId && typeof item.productId === "object" ? item.productId : null,
            unitSnapshot: item.unitSnapshot,
            requestedQuantity: Number(item.requestedQuantity || 0),
            approvedQuantity: Number(item.approvedQuantity || 0),
            purchasedQuantity: Number(item.purchasedQuantity || 0),
            dispatchedQuantity: Number(item.dispatchedQuantity || 0),
            receivedQuantity: Number(item.receivedQuantity || 0),
            requesterNote: item.requesterNote || "",
            adminNote: item.adminNote || "",
        })),
        activityLog: request.activityLog || [],
    };
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

function buildBatchReceiptAllocationPlan(batches, purchaseRequestId, receiptItems) {
    const remainingByRequestItem = new Map(
        (receiptItems || []).map((item) => [
            String(item.purchaseRequestItemId || ""),
            Number(item.quantity || 0),
        ])
    );
    const confirmedByBatchRequestItem = new Map();

    for (const batch of batches || []) {
        for (const entry of batch.activityLog || []) {
            if (entry?.type !== "receipt_confirmed") continue;

            for (const item of entry?.metadata?.items || []) {
                const batchKey = `${String(batch._id)}:${String(item.purchaseRequestItemId || "")}`;
                confirmedByBatchRequestItem.set(
                    batchKey,
                    Number(confirmedByBatchRequestItem.get(batchKey) || 0) + Number(item.quantity || 0)
                );
            }
        }
    }

    const allocationPlans = [];
    const batchAllocationRemaining = new Map();
    const sortedBatches = [...(batches || [])].sort((left, right) => {
        const leftDate = new Date(left?.purchasedAt || left?.createdAt || 0).getTime();
        const rightDate = new Date(right?.purchasedAt || right?.createdAt || 0).getTime();
        return leftDate - rightDate;
    });

    for (const batch of sortedBatches) {
        for (const batchItem of batch.items || []) {
            for (const allocation of batchItem.allocations || []) {
                if (String(allocation.purchaseRequestId || "") !== String(purchaseRequestId || "")) continue;

                const batchKey = `${String(batch._id)}:${String(allocation.purchaseRequestItemId || "")}`;
                if (!batchAllocationRemaining.has(batchKey)) {
                    const totalAllocatedToRequestItem = (batch.items || []).reduce((sum, currentItem) => {
                        const matchingQuantity = (currentItem.allocations || []).reduce((innerSum, currentAllocation) => {
                            if (
                                String(currentAllocation.purchaseRequestId || "") === String(purchaseRequestId || "") &&
                                String(currentAllocation.purchaseRequestItemId || "") === String(allocation.purchaseRequestItemId || "")
                            ) {
                                return innerSum + Number(currentAllocation.quantity || 0);
                            }

                            return innerSum;
                        }, 0);

                        return sum + matchingQuantity;
                    }, 0);
                    const confirmed = Number(confirmedByBatchRequestItem.get(batchKey) || 0);

                    batchAllocationRemaining.set(
                        batchKey,
                        Math.max(totalAllocatedToRequestItem - confirmed, 0)
                    );
                }
            }
        }
    }

    for (const batch of sortedBatches) {
        const planItems = [];

        for (const [requestItemId, remainingToAssignRaw] of remainingByRequestItem.entries()) {
            let remainingToAssign = Number(remainingToAssignRaw || 0);
            if (remainingToAssign <= 0) continue;

            const batchKey = `${String(batch._id)}:${requestItemId}`;
            const remainingForBatch = Number(batchAllocationRemaining.get(batchKey) || 0);
            if (remainingForBatch <= 0) continue;

            const assignedQuantity = Math.min(remainingToAssign, remainingForBatch);
            if (assignedQuantity <= 0) continue;

            planItems.push({
                purchaseRequestItemId: requestItemId,
                quantity: assignedQuantity,
            });

            batchAllocationRemaining.set(batchKey, remainingForBatch - assignedQuantity);
            remainingByRequestItem.set(requestItemId, remainingToAssign - assignedQuantity);
        }

        if (planItems.length) {
            allocationPlans.push({
                batch,
                items: planItems,
            });
        }
    }

    return allocationPlans;
}

export async function POST(request, { params }) {
    const session = await mongoose.startSession();

    try {
        const { user, response } = await requireAuthenticatedUser();
        if (response) return response;

        await dbConnect();
        await Promise.all([
            InventoryStock.createCollection().catch(() => null),
            InventoryMovement.createCollection().catch(() => null),
            InventoryStock.syncIndexes().catch(() => null),
            InventoryMovement.syncIndexes().catch(() => null),
        ]);
        const { id } = await params;

        if (!isValidObjectId(id)) {
            return NextResponse.json(
                { success: false, message: "La solicitud no es valida." },
                { status: 400 }
            );
        }

        const body = await request.json();
        const notes = normalizeNullableText(body.notes);
        const items = Array.isArray(body.items) ? body.items : [];

        if (!items.length) {
            return NextResponse.json(
                { success: false, message: "Debes registrar al menos un producto recibido." },
                { status: 400 }
            );
        }

        session.startTransaction();

        const purchaseRequest = await PurchaseRequest.findById(id)
            .populate("requestedBy", "role")
            .session(session);

        if (!purchaseRequest) {
            await session.abortTransaction();
            return NextResponse.json(
                { success: false, message: "La solicitud no existe." },
                { status: 404 }
            );
        }

        const isOwner = String(purchaseRequest.requestedBy?._id || purchaseRequest.requestedBy) === user.id;
        if (user.role !== "admin" && !isOwner) {
            await session.abortTransaction();
            return NextResponse.json(
                { success: false, message: "No tienes permiso para registrar esta recepcion." },
                { status: 403 }
            );
        }

        if (!["approved", "in_progress", "partially_purchased"].includes(purchaseRequest.status)) {
            await session.abortTransaction();
            return NextResponse.json(
                { success: false, message: "Solo se pueden recibir solicitudes con productos ya despachados." },
                { status: 409 }
            );
        }

        const destinationLocation = purchaseRequest.destinationLocation || DEFAULT_PURCHASE_LOCATION;
        const destinationLocationLabel = getLocationLabel(destinationLocation, "Bodega");
        const itemMap = new Map(purchaseRequest.items.map((item) => [String(item._id), item]));
        const receivedAt = new Date();
        const receiptItems = [];
        const relatedBatches = await PurchaseBatch.find({
            status: "dispatched",
            "items.allocations.purchaseRequestId": purchaseRequest._id,
        }).session(session);

        for (const incomingItem of items) {
            const itemId = normalizeText(incomingItem.itemId || incomingItem.purchaseRequestItemId);
            const receivedQuantity = Number(incomingItem.receivedQuantity);

            if (!itemId || !isValidObjectId(itemId)) {
                throw new Error("Uno de los productos a recibir no es valido.");
            }

            if (!Number.isFinite(receivedQuantity) || receivedQuantity < 0) {
                throw new Error("La cantidad recibida no es valida.");
            }

            if (receivedQuantity === 0) continue;

            const requestItem = itemMap.get(itemId);
            if (!requestItem) {
                throw new Error("Uno de los productos a recibir no es valido.");
            }

            const pendingToReceive = Math.max(
                Number(requestItem.dispatchedQuantity || 0) - Number(requestItem.receivedQuantity || 0),
                0
            );

            if (receivedQuantity > pendingToReceive) {
                throw new Error("La cantidad recibida no puede exceder lo comprado pendiente.");
            }

            const destinationStock = await getOrCreateStock(
                requestItem.productId,
                destinationLocation,
                session
            );

            destinationStock.quantity = Number(destinationStock.quantity || 0) + receivedQuantity;
            destinationStock.lastMovementAt = receivedAt;
            await destinationStock.save({ session });

            requestItem.receivedQuantity = Number(requestItem.receivedQuantity || 0) + receivedQuantity;

            await InventoryMovement.create(
                [{
                    productId: requestItem.productId,
                    movementType: "purchase_entry",
                    quantity: receivedQuantity,
                    unitSnapshot: requestItem.unitSnapshot,
                    toLocation: destinationLocation,
                    referenceType: "request",
                    referenceId: purchaseRequest._id,
                    notes,
                    performedBy: user.id,
                    movementDate: receivedAt,
                }],
                { session }
            );

            receiptItems.push({
                purchaseRequestItemId: requestItem._id,
                quantity: receivedQuantity,
            });
        }

        if (!receiptItems.length) {
            await session.abortTransaction();
            return NextResponse.json(
                { success: false, message: "Debes registrar al menos una cantidad mayor a cero." },
                { status: 400 }
            );
        }

        purchaseRequest.recalculateStatus();
        purchaseRequest.addActivity({
            type: "purchase_registered",
            performedBy: user.id,
            title: "Recepcion registrada",
            description:
                notes ||
                "Se confirmo la recepcion parcial o total de productos ya despachados a la ubicacion solicitada.",
            metadata: {
                destinationLocation,
                items: receiptItems,
            },
        });

        const batchReceiptPlans = buildBatchReceiptAllocationPlan(
            relatedBatches,
            purchaseRequest._id,
            receiptItems
        );

        for (const plan of batchReceiptPlans) {
            plan.batch.addActivity({
                type: "receipt_confirmed",
                performedBy: user.id,
                title: "Recepcion confirmada",
                description:
                    notes ||
                    `El solicitante confirmo la recepcion de productos para ${destinationLocationLabel}.`,
                metadata: {
                    purchaseRequestId: purchaseRequest._id,
                    requestNumber: purchaseRequest.requestNumber,
                    destinationLocation,
                    items: plan.items,
                },
                performedAt: receivedAt,
            });

            await plan.batch.save({ session });
        }

        await purchaseRequest.save({ session });
        await session.commitTransaction();

        await createNotificationsForRoles(["admin"], {
            type: NOTIFICATION_TYPES.purchase_request_received,
            title: "Recepcion confirmada",
            message: `${purchaseRequest.requestNumber} ya registro productos recibidos en ${destinationLocationLabel}.`,
            href: "/dashboard/purchases?tab=requests",
            entityType: "purchase_request",
            entityId: purchaseRequest._id,
            priority: "normal",
        }).catch((notificationError) => {
            console.error("purchase request received notification error:", notificationError);
        });

        const populatedRequest = await PurchaseRequest.findById(purchaseRequest._id)
            .populate("requestedBy", "firstName lastName username email role")
            .populate("approvedBy", "firstName lastName username email role")
            .populate("rejectedBy", "firstName lastName username email role")
            .populate("cancelledBy", "firstName lastName username email role")
            .populate("items.productId", "name code unit categoryId")
            .populate("activityLog.performedBy", "firstName lastName username email role")
            .lean({ virtuals: true });

        return NextResponse.json(
            {
                success: true,
                message: "Recepcion registrada correctamente.",
                data: populatedRequest ? mapPurchaseRequestDocument(populatedRequest) : null,
            },
            { status: 200 }
        );
    } catch (error) {
        await session.abortTransaction().catch(() => { });
        console.error("POST /api/purchase-requests/[id]/receive error:", error);
        return NextResponse.json(
            { success: false, message: error.message || "No se pudo registrar la recepcion." },
            { status: 500 }
        );
    } finally {
        session.endSession();
    }
}
