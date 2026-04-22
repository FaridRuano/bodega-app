import mongoose from "mongoose";
import { NextResponse } from "next/server";

import { requireUserRole } from "@libs/apiAuth";
import {
    DEFAULT_PURCHASE_LOCATION,
    isValidObjectId,
} from "@libs/purchaseRequests";
import dbConnect from "@libs/mongodb";
import { createNotificationsForUsers, NOTIFICATION_TYPES } from "@libs/notifications";
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
        const { user, response } = await requireUserRole(["admin"]);
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
            ? await PurchaseRequest.find(
                { _id: { $in: requestIds } }
            ).session(session)
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

        for (const item of batch.items || []) {
            for (const allocation of item.allocations || []) {
                const purchaseRequest = purchaseRequestMap.get(String(allocation.purchaseRequestId || ""));
                if (!purchaseRequest) continue;

                const requestItem = (purchaseRequest.items || []).find(
                    (entry) => String(entry._id) === String(allocation.purchaseRequestItemId || "")
                );

                if (!requestItem) continue;

                requestItem.dispatchedQuantity =
                    Number(requestItem.dispatchedQuantity || 0) + Number(allocation.quantity || 0);

                const requestKey = String(purchaseRequest._id);
                if (!requestDispatchSummary.has(requestKey)) {
                    requestDispatchSummary.set(requestKey, []);
                }

                requestDispatchSummary.get(requestKey).push({
                    purchaseRequestItemId: requestItem._id,
                    quantity: Number(allocation.quantity || 0),
                    location: purchaseRequest.destinationLocation,
                });
            }
        }

        for (const purchaseRequest of purchaseRequests) {
            const dispatchItems = requestDispatchSummary.get(String(purchaseRequest._id)) || [];
            if (!dispatchItems.length) continue;

            purchaseRequest.recalculateStatus();
            purchaseRequest.addActivity({
                type: "purchase_registered",
                performedBy: user.id,
                title: "Compra despachada",
                description: `Se despacho compra hacia ${resolveDispatchLocation(
                    purchaseRequest.destinationLocation
                )}. La solicitud queda lista para que el solicitante confirme lo recibido.`,
                metadata: {
                    batchId: batch._id,
                    batchNumber: batch.batchNumber,
                    items: dispatchItems,
                },
            });

            await purchaseRequest.save({ session });
        }

        batch.status = "dispatched";
        batch.dispatchedAt = dispatchedAt;
        batch.dispatchedBy = user.id;
        batch.addActivity({
            type: "purchase_dispatched",
            performedBy: user.id,
            title: "Compra despachada",
            description:
                "La compra fue marcada como despachada y queda pendiente de confirmacion por parte del solicitante.",
            metadata: {
                requests: Array.from(requestDispatchSummary.entries()).map(([purchaseRequestId, items]) => ({
                    purchaseRequestId,
                    items,
                })),
            },
            performedAt: dispatchedAt,
        });
        await batch.save({ session });

        await session.commitTransaction();

        const requesterIds = Array.from(
            new Set(
                purchaseRequests
                    .map((purchaseRequest) => String(purchaseRequest.requestedBy || ""))
                    .filter(Boolean)
            )
        );

        await createNotificationsForUsers(requesterIds, {
            type: NOTIFICATION_TYPES.purchase_batch_dispatched,
            title: "Compra despachada",
            message: `${batch.batchNumber} ya fue despachada y queda pendiente de confirmacion de recibido.`,
            href: "/dashboard/receiving",
            entityType: "purchase_batch",
            entityId: batch._id,
            priority: "high",
        }).catch((notificationError) => {
            console.error("purchase batch dispatched notification error:", notificationError);
        });

        const populatedBatch = await PurchaseBatch.findById(batch._id)
            .populate("registeredBy", "firstName lastName username email role")
            .populate("dispatchedBy", "firstName lastName username email role")
            .populate("activityLog.performedBy", "firstName lastName username email role")
            .populate("items.productId", "name code unit categoryId")
            .lean();

        return NextResponse.json(
            {
                success: true,
                message: "La compra fue despachada. El inventario se actualizara cuando el solicitante confirme la recepcion.",
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
