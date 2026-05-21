import mongoose from "mongoose";
import { NextResponse } from "next/server";

import { requireUserRole } from "@libs/apiAuth";
import {
    DEFAULT_PURCHASE_LOCATION,
    normalizeText,
} from "@libs/purchaseRequests";
import dbConnect from "@libs/mongodb";
import { createNotificationsForUsers, NOTIFICATION_TYPES } from "@libs/notifications";
import InventoryMovement from "@models/InventoryMovement";
import InventoryStock from "@models/InventoryStock";
import PurchaseBatch from "@models/PurchaseBatch";
import PurchaseRequest from "@models/PurchaseRequest";
import { STOCK_LOCATIONS } from "@models/InventoryStock";

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
            ? await PurchaseRequest.find({ _id: { $in: allRequestIds } })
                .populate("requestedBy", "role")
                .session(session)
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
            const requestReceiptSummary = new Map();

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

                    const quantity = Number(allocation.quantity || 0);
                    if (quantity <= 0) continue;
                    const destinationLocation = resolveDispatchLocation(purchaseRequest.destinationLocation);

                    requestItem.dispatchedQuantity =
                        Number(requestItem.dispatchedQuantity || 0) +
                        quantity;

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
                    } else if (purchaseRequest.requestedBy) {
                        notifiedRequesterIds.add(getRequesterId(purchaseRequest));
                    }
                }
            }

            for (const [purchaseRequestId, dispatchItems] of requestDispatchSummary.entries()) {
                const purchaseRequest = purchaseRequestMap.get(purchaseRequestId);
                if (!purchaseRequest || !dispatchItems.length) continue;

                const receiptItems = requestReceiptSummary.get(purchaseRequestId) || [];
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
            }

            batch.status = "dispatched";
            batch.dispatchedAt = dispatchedAt;
            batch.dispatchedBy = user.id;
            batch.addActivity({
                type: "purchase_dispatched",
                performedBy: user.id,
                title: "Compra despachada",
                description: requestReceiptSummary.size
                    ? "La compra fue marcada como despachada junto con otras compras pendientes. Las solicitudes creadas por administrador se recibieron automaticamente."
                    : "La compra fue marcada como despachada junto con otras compras pendientes.",
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
        }

        await Promise.all(
            Array.from(purchaseRequestMap.values()).map((purchaseRequest) =>
                purchaseRequest.save({ session })
            )
        );
        await Promise.all(batches.map((batch) => batch.save({ session })));

        await session.commitTransaction();

        if (notifiedRequesterIds.size) {
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
        }

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
