import mongoose from "mongoose";
import { NextResponse } from "next/server";

import { requireUserRole } from "@libs/apiAuth";
import {
    DEFAULT_PURCHASE_LOCATION,
    normalizeText,
} from "@libs/purchaseRequests";
import dbConnect from "@libs/mongodb";
import { createNotificationsForUsers, NOTIFICATION_TYPES } from "@libs/notifications";
import PurchaseBatch from "@models/PurchaseBatch";
import PurchaseRequest from "@models/PurchaseRequest";
import { STOCK_LOCATIONS } from "@models/InventoryStock";

function resolveDispatchLocation(value) {
    const normalizedValue = String(value || "").trim().toLowerCase();
    return STOCK_LOCATIONS.includes(normalizedValue)
        ? normalizedValue
        : DEFAULT_PURCHASE_LOCATION;
}

function buildDispatchableBatchQuery(search) {
    const query = {
        dispatchedAt: null,
        status: { $nin: ["draft", "dispatched", "completed", "cancelled"] },
    };
    const normalizedSearch = normalizeText(search);

    if (normalizedSearch) {
        const regex = new RegExp(normalizedSearch, "i");
        query.$or = [
            { batchNumber: regex },
            { supplierName: regex },
            { note: regex },
        ];
    }

    return query;
}

export async function POST(request) {
    const session = await mongoose.startSession();

    try {
        const { user, response } = await requireUserRole(["admin"]);
        if (response) return response;

        await dbConnect();

        const body = await request.json().catch(() => ({}));
        const query = buildDispatchableBatchQuery(body.search);

        session.startTransaction();

        const batches = await PurchaseBatch.find(query)
            .populate("items.productId", "name code unit")
            .session(session);

        if (!batches.length) {
            await session.abortTransaction();
            return NextResponse.json(
                {
                    success: true,
                    message: "No hay compras pendientes por despachar.",
                    data: {
                        dispatchedCount: 0,
                    },
                },
                { status: 200 }
            );
        }

        const allRequestIds = Array.from(
            new Set(
                batches.flatMap((batch) =>
                    (batch.items || []).flatMap((item) =>
                        (item.allocations || [])
                            .map((allocation) => String(allocation.purchaseRequestId || ""))
                            .filter(Boolean)
                    )
                )
            )
        );

        const purchaseRequests = allRequestIds.length
            ? await PurchaseRequest.find({ _id: { $in: allRequestIds } }).session(session)
            : [];
        const purchaseRequestMap = new Map(
            purchaseRequests.map((purchaseRequest) => [
                String(purchaseRequest._id),
                purchaseRequest,
            ])
        );
        const notifiedRequesterIds = new Set();
        const dispatchedAt = new Date();

        for (const batch of batches) {
            const requestDispatchSummary = new Map();

            for (const item of batch.items || []) {
                for (const allocation of item.allocations || []) {
                    const purchaseRequest = purchaseRequestMap.get(
                        String(allocation.purchaseRequestId || "")
                    );
                    if (!purchaseRequest) continue;

                    const requestItem = (purchaseRequest.items || []).find(
                        (entry) =>
                            String(entry._id) === String(allocation.purchaseRequestItemId || "")
                    );
                    if (!requestItem) continue;

                    requestItem.dispatchedQuantity =
                        Number(requestItem.dispatchedQuantity || 0) +
                        Number(allocation.quantity || 0);

                    const requestKey = String(purchaseRequest._id);
                    if (!requestDispatchSummary.has(requestKey)) {
                        requestDispatchSummary.set(requestKey, []);
                    }

                    requestDispatchSummary.get(requestKey).push({
                        purchaseRequestItemId: requestItem._id,
                        quantity: Number(allocation.quantity || 0),
                        location: purchaseRequest.destinationLocation,
                    });

                    if (purchaseRequest.requestedBy) {
                        notifiedRequesterIds.add(String(purchaseRequest.requestedBy));
                    }
                }
            }

            for (const [purchaseRequestId, dispatchItems] of requestDispatchSummary.entries()) {
                const purchaseRequest = purchaseRequestMap.get(purchaseRequestId);
                if (!purchaseRequest || !dispatchItems.length) continue;

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
            }

            batch.status = "dispatched";
            batch.dispatchedAt = dispatchedAt;
            batch.dispatchedBy = user.id;
            batch.addActivity({
                type: "purchase_dispatched",
                performedBy: user.id,
                title: "Compra despachada",
                description:
                    "La compra fue marcada como despachada junto con otras compras pendientes.",
                metadata: {
                    requests: Array.from(requestDispatchSummary.entries()).map(
                        ([purchaseRequestId, items]) => ({
                            purchaseRequestId,
                            items,
                        })
                    ),
                },
                performedAt: dispatchedAt,
            });
        }

        await Promise.all(
            Array.from(purchaseRequestMap.values()).map((purchaseRequest) =>
                purchaseRequest.save({ session })
            )
        );
        await Promise.all(batches.map((batch) => batch.save({ session })));

        await session.commitTransaction();

        await createNotificationsForUsers(Array.from(notifiedRequesterIds), {
            type: NOTIFICATION_TYPES.purchase_batch_dispatched,
            title: "Compra despachada",
            message: "Tu compra ya fue despachada y está esperando confirmación.",
            href: "/dashboard/receiving",
            entityType: "purchase_batch",
            entityId: batches[0]?._id || null,
            priority: "high",
        }).catch((notificationError) => {
            console.error("bulk purchase batches dispatched notification error:", notificationError);
        });

        return NextResponse.json(
            {
                success: true,
                message: "Compras despachadas correctamente.",
                data: {
                    dispatchedCount: batches.length,
                },
            },
            { status: 200 }
        );
    } catch (error) {
        await session.abortTransaction().catch(() => { });
        console.error("POST /api/purchase-batches/dispatch-pending error:", error);
        return NextResponse.json(
            { success: false, message: error.message || "No se pudieron despachar las compras." },
            { status: 500 }
        );
    } finally {
        session.endSession();
    }
}
