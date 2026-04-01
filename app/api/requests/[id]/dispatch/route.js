import mongoose from "mongoose";
import { NextResponse } from "next/server";

import dbConnect from "@libs/mongodb";
import Request from "@models/Request";
import InventoryStock from "@models/InventoryStock";
import InventoryMovement from "@models/InventoryMovement";

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

    return {
        _id: request._id,
        requestNumber: request.requestNumber,
        requestType: request.requestType,
        status: request.status,
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
        await dbConnect();

        const { id } = await params;

        if (!isValidObjectId(id)) {
            return NextResponse.json(
                { success: false, message: "La solicitud no es válida." },
                { status: 400 }
            );
        }

        const body = await request.json();

        const dispatchedBy = normalizeText(body.dispatchedBy);
        const notes = normalizeNullableText(body.notes);
        const items = Array.isArray(body.items) ? body.items : [];

        if (!dispatchedBy || !isValidObjectId(dispatchedBy)) {
            return NextResponse.json(
                { success: false, message: "El usuario que despacha no es válido." },
                { status: 400 }
            );
        }

        if (!items.length) {
            return NextResponse.json(
                { success: false, message: "Debes enviar los items a despachar." },
                { status: 400 }
            );
        }

        session.startTransaction();

        const requestDoc = await Request.findOne({
            _id: id,
            deletedAt: null,
        }).session(session);

        if (!requestDoc) {
            await session.abortTransaction();
            session.endSession();

            return NextResponse.json(
                { success: false, message: "La solicitud no existe." },
                { status: 404 }
            );
        }

        if (!["approved", "partially_fulfilled"].includes(requestDoc.status)) {
            await session.abortTransaction();
            session.endSession();

            return NextResponse.json(
                {
                    success: false,
                    message:
                        "Solo se pueden despachar solicitudes aprobadas o parcialmente atendidas.",
                },
                { status: 409 }
            );
        }

        const itemMap = new Map(
            requestDoc.items.map((item) => [String(item._id), item])
        );

        const providedItemIds = new Set();
        const dispatchLogItems = [];
        const movementsToCreate = [];
        const dispatchedAt = new Date();

        for (const incomingItem of items) {
            const itemId = normalizeText(incomingItem.itemId || incomingItem.requestItemId);
            const dispatchQuantity = Number(incomingItem.dispatchedQuantity);

            if (!itemId || !isValidObjectId(itemId)) {
                throw new Error("Uno de los items a despachar no es válido.");
            }

            if (providedItemIds.has(itemId)) {
                throw new Error("Hay items repetidos en el despacho.");
            }

            providedItemIds.add(itemId);

            const requestItem = itemMap.get(itemId);

            if (!requestItem) {
                throw new Error("Uno de los items a despachar no es válido.");
            }

            if (!Number.isFinite(dispatchQuantity) || dispatchQuantity < 0) {
                throw new Error("La cantidad despachada no es válida.");
            }

            const approvedQuantity = Number(requestItem.approvedQuantity || 0);
            const alreadyDispatched = Number(requestItem.dispatchedQuantity || 0);
            const remainingToDispatch = approvedQuantity - alreadyDispatched;

            if (dispatchQuantity > remainingToDispatch) {
                throw new Error("No puedes despachar más de la cantidad pendiente aprobada.");
            }

            if (dispatchQuantity === 0) {
                continue;
            }

            const stock = await InventoryStock.findOne({
                productId: requestItem.productId,
                location: requestDoc.sourceLocation,
            }).session(session);

            if (!stock) {
                throw new Error(
                    "No existe stock para uno de los productos en la ubicación de origen."
                );
            }

            if (Number(stock.availableQuantity || 0) < dispatchQuantity) {
                throw new Error("Stock insuficiente para completar el despacho.");
            }

            stock.quantity = Number(stock.quantity || 0) - dispatchQuantity;
            stock.lastMovementAt = dispatchedAt;

            await stock.save({ session });

            requestItem.dispatchedQuantity = alreadyDispatched + dispatchQuantity;

            dispatchLogItems.push({
                requestItemId: requestItem._id,
                quantity: dispatchQuantity,
            });

            movementsToCreate.push({
                productId: requestItem.productId,
                movementType: "request_dispatch",
                quantity: dispatchQuantity,
                unitSnapshot: requestItem.unitSnapshot,
                fromLocation: requestDoc.sourceLocation,
                toLocation: requestDoc.destinationLocation,
                referenceType: "request",
                referenceId: requestDoc._id,
                notes,
                performedBy: dispatchedBy,
            });
        }

        if (!dispatchLogItems.length) {
            await session.abortTransaction();
            session.endSession();

            return NextResponse.json(
                { success: false, message: "Debes despachar al menos una cantidad mayor a cero." },
                { status: 400 }
            );
        }

        requestDoc.dispatches.push({
            dispatchedBy,
            dispatchedAt,
            notes,
            items: dispatchLogItems,
        });

        requestDoc.notes = notes || requestDoc.notes;

        requestDoc.recalculateStatus();

        requestDoc.addActivity({
            type: "dispatch",
            performedBy: dispatchedBy,
            performedAt: dispatchedAt,
            title: "Despacho registrado",
            description: notes || "Se registró un despacho para la solicitud.",
            items: dispatchLogItems,
        });

        await requestDoc.save({ session });

        await InventoryMovement.create(movementsToCreate, { session });

        await session.commitTransaction();
        session.endSession();

        const populated = await getRequestById(requestDoc._id);

        return NextResponse.json(
            {
                success: true,
                message: "Despacho registrado correctamente.",
                data: normalizeRequestDocument(populated),
            },
            { status: 200 }
        );
    } catch (error) {
        await session.abortTransaction();
        session.endSession();

        console.error("POST /api/requests/[id]/dispatch error:", error);

        return NextResponse.json(
            { success: false, message: error.message || "No se pudo registrar el despacho." },
            { status: 500 }
        );
    }
}