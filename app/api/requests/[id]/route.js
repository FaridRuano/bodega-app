import mongoose from "mongoose";
import { NextResponse } from "next/server";

import { requireAuthenticatedUser, requireUserRole } from "@libs/apiAuth";
import dbConnect from "@libs/mongodb";
import Request from "@models/Request";
import Product from "@models/Product";
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

function getUserName(user) {
    if (!user) return "";

    if (typeof user === "string") {
        return user.trim();
    }

    if (typeof user === "object") {
        const firstName = String(user.firstName || user._doc?.firstName || "").trim();
        const lastName = String(user.lastName || user._doc?.lastName || "").trim();
        const fullName = [firstName, lastName].filter(Boolean).join(" ").trim();

        if (fullName) return fullName;

        const username = String(user.username || user._doc?.username || "").trim();
        if (username) return username;

        const email = String(user.email || user._doc?.email || "").trim();
        if (email) return email;
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
        .populate({ path: "requestedBy", select: "firstName lastName username email" })
        .populate({ path: "approvedBy", select: "firstName lastName username email" })
        .populate({ path: "rejectedBy", select: "firstName lastName username email" })
        .populate({ path: "cancelledBy", select: "firstName lastName username email" })
        .populate({ path: "items.productId", select: "code name slug unit isActive" })
        .populate({ path: "dispatches.dispatchedBy", select: "firstName lastName username email" })
        .populate({ path: "receipts.receivedBy", select: "firstName lastName username email" })
        .populate({ path: "activityLog.performedBy", select: "firstName lastName username email" })
        .lean({ virtuals: true });
}

export async function GET(_request, { params }) {
    try {
        const { response } = await requireAuthenticatedUser();
        if (response) return response;

        await dbConnect();

        const { id } = await params;

        if (!isValidObjectId(id)) {
            return NextResponse.json(
                { success: false, message: "La solicitud no es vÃƒÂ¡lida." },
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
        const { user, response } = await requireUserRole(["admin", "kitchen"]);
        if (response) return response;

        await dbConnect();

        const { id } = await params;

        if (!isValidObjectId(id)) {
            return NextResponse.json(
                { success: false, message: "La solicitud no es vÃƒÂ¡lida." },
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

        const requestType = requestDoc.requestType || "operation";
        const isReturnRequest = requestType === "return";
        const justification = normalizeNullableText(body.justification);
        const notes = normalizeNullableText(body.notes);
        const rawItems = Array.isArray(body.items) ? body.items : [];

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
                { success: false, message: "Uno o mÃƒÂ¡s productos no son vÃƒÂ¡lidos." },
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
                    message: "Uno o mÃƒÂ¡s productos no existen o estÃƒÂ¡n inactivos.",
                },
                { status: 404 }
            );
        }

        const productMap = new Map(
            products.map((product) => [String(product._id), product])
        );
        const shouldValidateSourceStock = requestDoc.requestType === "return";
        const stocks = shouldValidateSourceStock
            ? await InventoryStock.find({
                productId: { $in: productIds },
                location: requestDoc.sourceLocation,
            }).lean()
            : [];
        const stockMap = new Map(stocks.map((stock) => [String(stock.productId), stock]));

        requestDoc.items = rawItems.map((item) => {
            const productId = normalizeText(item.productId);
            const product = productMap.get(productId);
            const requestedQuantity = Number(item.requestedQuantity);
            const stock = stockMap.get(productId);
            const available = Number(
                typeof stock?.availableQuantity !== "undefined"
                    ? stock.availableQuantity
                    : stock?.quantity || 0
            );

            if (!product) {
                throw new Error("Uno o mÃƒÂ¡s productos no existen.");
            }

            if (!Number.isFinite(requestedQuantity) || requestedQuantity <= 0) {
                throw new Error(
                    `La cantidad solicitada de ${product.name} debe ser mayor que cero.`
                );
            }

            if (shouldValidateSourceStock && requestedQuantity > available) {
                throw new Error(
                    `La cantidad solicitada de ${product.name} supera el stock disponible en ${requestDoc.sourceLocation === "warehouse" ? "bodega" : "cocina"}.`
                );
            }

            return {
                productId: product._id,
                unitSnapshot: product.unit,
                requestedQuantity,
                approvedQuantity: isReturnRequest ? requestedQuantity : 0,
                dispatchedQuantity: 0,
                receivedQuantity: 0,
                returnedQuantity: 0,
                notes: normalizeNullableText(item.notes),
            };
        });

        requestDoc.justification = justification;
        requestDoc.notes = notes;
        if (isReturnRequest) {
            requestDoc.sourceLocation = "kitchen";
            requestDoc.destinationLocation = "warehouse";
        }

        requestDoc.addActivity({
            type: "edited",
            performedBy: user.id,
            performedAt: new Date(),
            title: "Solicitud editada",
            description: "Se actualizó la solicitud.",
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
        const { user, response } = await requireUserRole(["admin", "warehouse", "kitchen"]);
        if (response) return response;

        await dbConnect();

        const { id } = await params;

        if (!isValidObjectId(id)) {
            return NextResponse.json(
                { success: false, message: "La solicitud no es vÃƒÂ¡lida." },
                { status: 400 }
            );
        }

        const body = await request.json().catch(() => ({}));
        const statusReason = normalizeNullableText(body.statusReason);

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
                { success: false, message: "La solicitud ya estÃƒÂ¡ cancelada." },
                { status: 409 }
            );
        }

        if (requestDoc.status === "rejected") {
            return NextResponse.json(
                { success: false, message: "La solicitud ya fue rechazada." },
                { status: 409 }
            );
        }

        const totalDispatched = (requestDoc.items || []).reduce(
            (acc, item) => acc + Number(item.dispatchedQuantity || 0),
            0
        );

        if (totalDispatched > 0) {
            return NextResponse.json(
                {
                    success: false,
                    message: "No se puede cancelar una solicitud que ya tiene despacho registrado.",
                },
                { status: 409 }
            );
        }

        const isReturnRequest = requestDoc.requestType === "return";

        if (isReturnRequest && user.role === "warehouse") {
            return NextResponse.json(
                {
                    success: false,
                    message: "Bodega no puede cancelar devoluciones creadas desde cocina.",
                },
                { status: 403 }
            );
        }

        if (user.role === "kitchen" && requestDoc.status !== "pending") {
            return NextResponse.json(
                {
                    success: false,
                    message: isReturnRequest
                        ? "Cocina solo puede cancelar devoluciones que aún no han sido despachadas."
                        : "Cocina solo puede cancelar solicitudes que aún no han sido aprobadas.",
                },
                { status: 403 }
            );
        }

        const cancelledAt = new Date();

        requestDoc.status = "cancelled";
        requestDoc.cancelledBy = user.id;
        requestDoc.cancelledAt = cancelledAt;
        requestDoc.statusReason = statusReason || "Solicitud cancelada.";

        requestDoc.addActivity({
            type: "cancelled",
            performedBy: user.id,
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
