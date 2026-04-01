import mongoose from "mongoose";
import { NextResponse } from "next/server";

import dbConnect from "@libs/mongodb";
import Request from "@models/Request";

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

        const rejectedBy = normalizeText(body.rejectedBy);
        const statusReason = normalizeNullableText(body.statusReason);

        if (!rejectedBy || !isValidObjectId(rejectedBy)) {
            return NextResponse.json(
                { success: false, message: "El usuario que rechaza no es válido." },
                { status: 400 }
            );
        }

        if (!statusReason) {
            return NextResponse.json(
                { success: false, message: "Debes indicar un motivo de rechazo." },
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
                { success: false, message: "Solo se pueden rechazar solicitudes pendientes." },
                { status: 409 }
            );
        }

        const rejectedAt = new Date();

        requestDoc.status = "rejected";
        requestDoc.rejectedBy = rejectedBy;
        requestDoc.rejectedAt = rejectedAt;
        requestDoc.statusReason = statusReason;

        requestDoc.addActivity({
            type: "rejected",
            performedBy: rejectedBy,
            performedAt: rejectedAt,
            title: "Solicitud rechazada",
            description: statusReason,
            items: [],
        });

        await requestDoc.save();

        const populated = await getRequestById(requestDoc._id);

        return NextResponse.json(
            {
                success: true,
                message: "Solicitud rechazada correctamente.",
                data: normalizeRequestDocument(populated),
            },
            { status: 200 }
        );
    } catch (error) {
        console.error("POST /api/requests/[id]/reject error:", error);

        return NextResponse.json(
            { success: false, message: error.message || "No se pudo rechazar la solicitud." },
            { status: 500 }
        );
    }
}