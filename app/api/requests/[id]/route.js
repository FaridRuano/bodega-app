import mongoose from "mongoose";
import { NextResponse } from "next/server";

import dbConnect from "@libs/mongodb";
import Request from "@models/Request";
import Product from "@models/Product";

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

function getUserName(user) {
    if (!user) return "";

    if (typeof user === "string") {
        return "";
    }

    if (typeof user === "object") {
        if (typeof user.username === "string" && user.username.trim()) {
            return user.username.trim();
        }

        if (user._doc && typeof user._doc.username === "string" && user._doc.username.trim()) {
            return user._doc.username.trim();
        }
    }

    return "";
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

        requestedBy: getUserName(request.requestedBy),
        approvedBy: getUserName(request.approvedBy),
        rejectedBy: getUserName(request.rejectedBy),
        cancelledBy: getUserName(request.cancelledBy),

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
            dispatchedBy: getUserName(dispatch.dispatchedBy),
            dispatchedAt: dispatch.dispatchedAt || null,
            notes: dispatch.notes || "",
            items: mapMovementItems(dispatch.items),
        })),

        receipts: (request.receipts || []).map((receipt) => ({
            _id: receipt._id,
            receivedBy: getUserName(receipt.receivedBy),
            receivedAt: receipt.receivedAt || null,
            notes: receipt.notes || "",
            items: mapMovementItems(receipt.items),
        })),

        activityLog: (request.activityLog || []).map((activity) => ({
            _id: activity._id,
            type: activity.type,
            performedBy: getUserName(activity.performedBy),
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
        .populate({ path: "requestedBy", select: "username" })
        .populate({ path: "approvedBy", select: "username" })
        .populate({ path: "rejectedBy", select: "username" })
        .populate({ path: "cancelledBy", select: "username" })
        .populate({ path: "items.productId", select: "code name slug unit isActive" })
        .populate({ path: "dispatches.dispatchedBy", select: "username" })
        .populate({ path: "receipts.receivedBy", select: "username" })
        .populate({ path: "activityLog.performedBy", select: "username" })
        .lean({ virtuals: true });
}

export async function GET(_request, { params }) {
    try {
        await dbConnect();

        const { id } = await params;

        if (!isValidObjectId(id)) {
            return NextResponse.json(
                { success: false, message: "La solicitud no es válida." },
                { status: 400 }
            );
        }

        const requestDoc = await getRequestById(id);

        if (!requestDoc) {
            return NextResponse.json(
                { success: false, message: "La solicitud no existe." },
            );
        }



        return NextResponse.json(
            { success: true, data: normalizeRequestDocument(requestDoc) },
            { status: 200 }
        );
    } catch (error) {
        console.error("GET /api/requests/[id] error:", error);

        return NextResponse.json(
            { success: false, message: "No se pudo obtener la solicitud." },
            { status: 500 }
        );
    }
}

export async function PATCH(request, { params }) {
    try {
        await dbConnect();

        const { id } = await params;

        if (!isValidObjectId(id)) {
            return NextResponse.json(
                { success: false, message: "La solicitud no es válida." },
                { status: 400 }
            );
        }

        const requestDoc = await Request.findOne({
            _id: id,
            deletedAt: null,
        });

        if (!requestDoc) {
            return NextResponse.json(
                { success: false, message: "La solicitud no existe." },
                { status: 404 }
            );
        }

        if (requestDoc.status !== "pending") {
            return NextResponse.json(
                { success: false, message: "Solo se pueden editar solicitudes pendientes." },
                { status: 409 }
            );
        }

        const body = await request.json();

        const justification = normalizeNullableText(body.justification);
        const notes = normalizeNullableText(body.notes);
        const editedBy = normalizeText(body.requestedBy);
        const rawItems = Array.isArray(body.items) ? body.items : [];

        if (!editedBy || !isValidObjectId(editedBy)) {
            return NextResponse.json(
                { success: false, message: "El usuario que edita no es válido." },
                { status: 400 }
            );
        }

        if (!rawItems.length) {
            return NextResponse.json(
                { success: false, message: "Debes mantener al menos un producto." },
                { status: 400 }
            );
        }

        const productIds = [
            ...new Set(
                rawItems
                    .map((item) => normalizeText(item.productId))
                    .filter(Boolean)
            ),
        ];

        if (productIds.some((itemId) => !isValidObjectId(itemId))) {
            return NextResponse.json(
                { success: false, message: "Uno o más productos no son válidos." },
                { status: 400 }
            );
        }

        const products = await Product.find({
            _id: { $in: productIds },
            isActive: true,
        }).lean();

        if (products.length !== productIds.length) {
            return NextResponse.json(
                {
                    success: false,
                    message: "Uno o más productos no existen o están inactivos.",
                },
                { status: 404 }
            );
        }

        const productMap = new Map(
            products.map((product) => [String(product._id), product])
        );

        requestDoc.items = rawItems.map((item) => {
            const productId = normalizeText(item.productId);
            const product = productMap.get(productId);
            const requestedQuantity = Number(item.requestedQuantity);

            if (!product) {
                throw new Error("Uno o más productos no existen.");
            }

            if (!Number.isFinite(requestedQuantity) || requestedQuantity <= 0) {
                throw new Error(
                    `La cantidad solicitada de ${product.name} debe ser mayor que cero.`
                );
            }

            return {
                productId: product._id,
                unitSnapshot: product.unit,
                requestedQuantity,
                approvedQuantity: 0,
                dispatchedQuantity: 0,
                receivedQuantity: 0,
                returnedQuantity: 0,
                notes: normalizeNullableText(item.notes),
            };
        });

        requestDoc.justification = justification;
        requestDoc.notes = notes;

        requestDoc.addActivity({
            type: "edited",
            performedBy: editedBy,
            performedAt: new Date(),
            title: "Solicitud editada",
            description: "Se actualizaron la solicitud.",
            items: [],
        });

        await requestDoc.save();

        const populated = await getRequestById(requestDoc._id);

        return NextResponse.json(
            {
                success: true,
                message: "Solicitud actualizada correctamente.",
                data: normalizeRequestDocument(populated),
            },
            { status: 200 }
        );
    } catch (error) {
        console.error("PATCH /api/requests/[id] error:", error);

        return NextResponse.json(
            {
                success: false,
                message: error.message || "No se pudo actualizar la solicitud.",
            },
            { status: 500 }
        );
    }
}

export async function DELETE(request, { params }) {
    try {
        await dbConnect();

        const { id } = await params;

        if (!isValidObjectId(id)) {
            return NextResponse.json(
                { success: false, message: "La solicitud no es válida." },
                { status: 400 }
            );
        }

        const body = await request.json().catch(() => ({}));
        const statusReason = normalizeNullableText(body.statusReason);
        const cancelledBy = normalizeText(body.cancelledBy);

        if (!cancelledBy || !isValidObjectId(cancelledBy)) {
            return NextResponse.json(
                { success: false, message: "El usuario que cancela no es válido." },
                { status: 400 }
            );
        }

        const requestDoc = await Request.findOne({
            _id: id,
            deletedAt: null,
        });

        if (!requestDoc) {
            return NextResponse.json(
                { success: false, message: "La solicitud no existe." },
                { status: 404 }
            );
        }

        if (requestDoc.status === "fulfilled") {
            return NextResponse.json(
                {
                    success: false,
                    message: "No se puede cancelar una solicitud completada.",
                },
                { status: 409 }
            );
        }

        if (requestDoc.status === "cancelled") {
            return NextResponse.json(
                { success: false, message: "La solicitud ya está cancelada." },
                { status: 409 }
            );
        }

        if (requestDoc.status === "rejected") {
            return NextResponse.json(
                { success: false, message: "La solicitud ya fue rechazada." },
                { status: 409 }
            );
        }

        const cancelledAt = new Date();

        requestDoc.status = "cancelled";
        requestDoc.cancelledBy = cancelledBy;
        requestDoc.cancelledAt = cancelledAt;
        requestDoc.statusReason = statusReason || "Solicitud cancelada.";

        requestDoc.addActivity({
            type: "cancelled",
            performedBy: cancelledBy,
            performedAt: cancelledAt,
            title: "Solicitud cancelada",
            description: requestDoc.statusReason,
            items: [],
        });

        await requestDoc.save();

        const populated = await getRequestById(requestDoc._id);

        return NextResponse.json(
            {
                success: true,
                message: "Solicitud cancelada correctamente.",
                data: normalizeRequestDocument(populated),
            },
            { status: 200 }
        );
    } catch (error) {
        console.error("DELETE /api/requests/[id] error:", error);

        return NextResponse.json(
            { success: false, message: "No se pudo cancelar la solicitud." },
            { status: 500 }
        );
    }
}