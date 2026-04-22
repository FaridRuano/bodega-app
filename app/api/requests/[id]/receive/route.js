import mongoose from "mongoose";
import { NextResponse } from "next/server";

import { requireUserRole } from "@libs/apiAuth";
import { getLocationLabel } from "@libs/constants/domainLabels";
import dbConnect from "@libs/mongodb";
import {
    createNotificationsForRoles,
    createStockAlertNotifications,
    NOTIFICATION_TYPES,
} from "@libs/notifications";
import Product from "@models/Product";
import Request from "@models/Request";
import InventoryStock from "@models/InventoryStock";

function isValidObjectId(value) {
    return mongoose.Types.ObjectId.isValid(value);
}

function normalizeText(value = "") {
    return String(value || "").trim();
}

function normalizeNullableText(value = "") {
    return normalizeText(value) || "";
}

function mapMovementItems(items = []) {
    return (items || []).map((item) => ({
        requestItemId: item.requestItemId || null,
        quantity: Number(item.quantity || 0),
    }));
}

function normalizeRequestDocument(request) {
    const totals = request.totals || {
        requested: 0,
        approved: 0,
        dispatched: 0,
        received: 0,
        returned: 0,
    };

    const normalizedStatus = request.status === "approved" ? "processing" : request.status;

    return {
        _id: request._id,
        requestNumber: request.requestNumber,
        requestType: request.requestType,
        status: normalizedStatus,
        sourceLocation: request.sourceLocation,
        destinationLocation: request.destinationLocation,

        requestedBy: request.requestedBy || null,
        approvedBy: request.approvedBy || null,
        rejectedBy: request.rejectedBy || null,
        cancelledBy: request.cancelledBy || null,

        items: (request.items || []).map((item) => ({
            _id: item._id,
            productId: item.productId?._id || item.productId || null,
            product:
                item.productId && typeof item.productId === "object"
                    ? {
                        _id: item.productId._id,
                        code: item.productId.code,
                        name: item.productId.name,
                        slug: item.productId.slug,
                        unit: item.productId.unit,
                        isActive: item.productId.isActive,
                    }
                    : null,
            unitSnapshot: item.unitSnapshot,
            requestedQuantity: Number(item.requestedQuantity || 0),
            approvedQuantity: Number(item.approvedQuantity || 0),
            dispatchedQuantity: Number(item.dispatchedQuantity || 0),
            receivedQuantity: Number(item.receivedQuantity || 0),
            returnedQuantity: Number(item.returnedQuantity || 0),
            notes: item.notes || "",
        })),

        dispatches: (request.dispatches || []).map((dispatch) => ({
            _id: dispatch._id,
            dispatchedBy: dispatch.dispatchedBy || null,
            dispatchedAt: dispatch.dispatchedAt || null,
            notes: dispatch.notes || "",
            items: mapMovementItems(dispatch.items),
        })),

        receipts: (request.receipts || []).map((receipt) => ({
            _id: receipt._id,
            receivedBy: receipt.receivedBy || null,
            receivedAt: receipt.receivedAt || null,
            notes: receipt.notes || "",
            items: mapMovementItems(receipt.items),
        })),

        activityLog: (request.activityLog || []).map((activity) => ({
            _id: activity._id,
            type: activity.type,
            performedBy: activity.performedBy || null,
            performedAt: activity.performedAt || null,
            title: activity.title || "",
            description: activity.description || "",
            items: mapMovementItems(activity.items),
        })),

        totals: {
            requested: Number(totals.requested || 0),
            approved: Number(totals.approved || 0),
            dispatched: Number(totals.dispatched || 0),
            received: Number(totals.received || 0),
            returned: Number(totals.returned || 0),
        },

        justification: request.justification || "",
        notes: request.notes || "",
        statusReason: request.statusReason || "",

        requestedAt: request.requestedAt || null,
        approvedAt: request.approvedAt || null,
        cancelledAt: request.cancelledAt || null,
        rejectedAt: request.rejectedAt || null,

        createdAt: request.createdAt || null,
        updatedAt: request.updatedAt || null,
    };
}

async function getRequestById(id) {
    return Request.findOne({
        _id: id,
        deletedAt: null,
    })
        .populate("requestedBy", "name email")
        .populate("approvedBy", "name email")
        .populate("rejectedBy", "name email")
        .populate("cancelledBy", "name email")
        .populate("items.productId", "code name slug unit isActive")
        .populate("dispatches.dispatchedBy", "name email")
        .populate("receipts.receivedBy", "name email")
        .populate("activityLog.performedBy", "name email")
        .lean({ virtuals: true });
}

export async function POST(request, { params }) {
    const session = await mongoose.startSession();

    try {
        const { user, response } = await requireUserRole(["admin", "warehouse", "kitchen", "lounge"]);
        if (response) return response;

        await dbConnect();

        const { id } = await params;

        if (!isValidObjectId(id)) {
            return NextResponse.json(
                { success: false, message: "La solicitud no es válida." },
                { status: 400 }
            );
        }

        const body = await request.json();
        const notes = normalizeNullableText(body.notes);
        const items = Array.isArray(body.items) ? body.items : [];

        if (!items.length) {
            return NextResponse.json(
                { success: false, message: "Debes enviar los items a recibir." },
                { status: 400 }
            );
        }

        session.startTransaction();

        const requestDoc = await Request.findOne({
            _id: id,
            deletedAt: null,
        }).session(session);

        if (!requestDoc) {
            throw new Error("La solicitud no existe.");
        }

        const isReturnRequest = requestDoc.requestType === "return";
        if (isReturnRequest) {
            await session.abortTransaction();
            session.endSession();
            return NextResponse.json(
                {
                    success: false,
                    message: "Las devoluciones se registran automaticamente al despacharlas.",
                },
                { status: 409 }
            );
        }

        const canReceive = isReturnRequest
            ? ["admin", "warehouse"].includes(user.role)
            : ["admin", "kitchen", "lounge"].includes(user.role);

        if (!canReceive) {
            await session.abortTransaction();
            session.endSession();
            return NextResponse.json(
                {
                    success: false,
                    message: isReturnRequest
                        ? "Solo bodega o administración pueden confirmar devoluciones."
                        : "Solo cocina o administración pueden confirmar recepciones.",
                },
                { status: 403 }
            );
        }

        const allowedStatuses = ["approved", "processing", "partially_fulfilled"];

        if (!allowedStatuses.includes(requestDoc.status)) {
            await session.abortTransaction();
            session.endSession();
            return NextResponse.json(
                {
                    success: false,
                    message: isReturnRequest
                        ? "Solo se pueden recibir devoluciones con cantidades ya despachadas."
                        : "Solo se pueden recibir solicitudes con despacho pendiente o parcial.",
                },
                { status: 409 }
            );
        }

        async function getOrCreateStock(productId, location) {
            let stock = await InventoryStock.findOne({
                productId,
                location,
            }).session(session);

            if (!stock) {
                const created = await InventoryStock.create(
                    [
                        {
                            productId,
                            location,
                            quantity: 0,
                            reservedQuantity: 0,
                        },
                    ],
                    { session }
                );

                stock = created[0];
            }

            return stock;
        }

        const itemMap = new Map(
            requestDoc.items.map((item) => [String(item._id), item])
        );
        const productIdMap = new Map(
            requestDoc.items.map((item) => [String(item._id), String(item.productId || "")])
        );

        const providedItemIds = new Set();
        const receiptLogItems = [];
        const receivedAt = new Date();

        for (const incomingItem of items) {
            const itemId = normalizeText(incomingItem.itemId || incomingItem.requestItemId);
            const receivedQuantity = Number(incomingItem.receivedQuantity);

            if (!itemId || !isValidObjectId(itemId)) {
                throw new Error("Uno de los items a recibir no es válido.");
            }

            if (providedItemIds.has(itemId)) {
                throw new Error("Hay items repetidos en la recepción.");
            }

            providedItemIds.add(itemId);

            const requestItem = itemMap.get(itemId);

            if (!requestItem) {
                throw new Error("Uno de los items a recibir no es válido.");
            }

            if (!Number.isFinite(receivedQuantity) || receivedQuantity < 0) {
                throw new Error("La cantidad recibida no es válida.");
            }

            const alreadyReceived = Number(requestItem.receivedQuantity || 0);
            const alreadyDispatched = Number(requestItem.dispatchedQuantity || 0);
            const remainingToReceive = alreadyDispatched - alreadyReceived;

            if (receivedQuantity > remainingToReceive) {
                throw new Error("La cantidad recibida no puede exceder la pendiente por recibir.");
            }

            if (receivedQuantity === 0) {
                continue;
            }

            const stock = await getOrCreateStock(requestItem.productId, requestDoc.destinationLocation);
            stock.quantity = Number(stock.quantity || 0) + receivedQuantity;
            stock.lastMovementAt = receivedAt;
            await stock.save({ session });

            requestItem.receivedQuantity = alreadyReceived + receivedQuantity;

            receiptLogItems.push({
                requestItemId: requestItem._id,
                quantity: receivedQuantity,
            });
        }

        if (!receiptLogItems.length) {
            await session.abortTransaction();
            session.endSession();
            return NextResponse.json(
                {
                    success: false,
                    message: isReturnRequest
                        ? "Debes confirmar al menos una cantidad mayor a cero de la devolución."
                        : "Debes registrar al menos una cantidad mayor a cero.",
                },
                { status: 400 }
            );
        }

        requestDoc.receipts.push({
            receivedBy: user.id,
            receivedAt,
            notes,
            items: receiptLogItems,
        });

        requestDoc.notes = notes || requestDoc.notes;
        requestDoc.recalculateStatus();

        requestDoc.addActivity({
            type: "receive",
            performedBy: user.id,
            performedAt: receivedAt,
            title: isReturnRequest ? "Devolución recibida" : "Recepción registrada",
            description: notes || (isReturnRequest
                ? "Bodega confirmó la recepción de la devolución."
                : "Se registró una recepción para la solicitud."),
            items: receiptLogItems,
        });

        await requestDoc.save({ session });
        await session.commitTransaction();
        session.endSession();

        const productIds = Array.from(
            new Set(receiptLogItems.map((item) => productIdMap.get(String(item.requestItemId))).filter(Boolean))
        );
        const [products, destinationStocks] = await Promise.all([
            Product.find({ _id: { $in: productIds } })
                .select("name minStock reorderPoint")
                .lean(),
            InventoryStock.find({
                productId: { $in: productIds },
                location: requestDoc.destinationLocation,
            }).lean(),
        ]);

        const productMap = new Map(products.map((product) => [String(product._id), product]));
        const stockAlerts = destinationStocks.map((stock) => ({
            productId: stock.productId,
            product: productMap.get(String(stock.productId)) || {},
            location: stock.location,
            quantity: Number(stock.quantity || 0),
        }));

        await Promise.all([
            createNotificationsForRoles(["admin"], {
                type: NOTIFICATION_TYPES.internal_request_received,
                title: "Transferencia confirmada",
                message: `${requestDoc.requestNumber} ya fue confirmada en ${getLocationLabel(
                    requestDoc.destinationLocation
                )}.`,
                href: "/dashboard/requests",
                entityType: "request",
                entityId: requestDoc._id,
                priority: "normal",
            }),
            createStockAlertNotifications(stockAlerts),
        ]).catch((notificationError) => {
            console.error("internal request received notification error:", notificationError);
        });

        const populated = await getRequestById(requestDoc._id);

        return NextResponse.json(
            {
                success: true,
                message: isReturnRequest
                    ? "Devolución recibida correctamente."
                    : "Recepción registrada correctamente.",
                data: normalizeRequestDocument(populated),
            },
            { status: 200 }
        );
    } catch (error) {
        await session.abortTransaction().catch(() => {});
        session.endSession();

        console.error("POST /api/requests/[id]/receive error:", error);

        return NextResponse.json(
            { success: false, message: error.message || "No se pudo registrar la recepción." },
            { status: 500 }
        );
    }
}
