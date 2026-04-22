import { NextResponse } from "next/server";

import { requireAuthenticatedUser } from "@libs/apiAuth";
import { isPurchaseEligibleProductType } from "@libs/constants/productTypes";
import { getLocationLabel } from "@libs/constants/domainLabels";
import dbConnect from "@libs/mongodb";
import { STOCK_LOCATIONS } from "@models/InventoryStock";
import Product from "@models/Product";
import PurchaseRequest from "@models/PurchaseRequest";
import {
    getDefaultPurchaseRequestLocationForRole,
    isValidObjectId,
    normalizeNullableText,
    normalizeText,
    resolvePurchaseRequestStatus,
} from "@libs/purchaseRequests";

function mapPurchaseRequestDocument(request) {
    const effectiveStatus = resolvePurchaseRequestStatus(request);

    return {
        _id: request._id,
        requestNumber: request.requestNumber,
        status: effectiveStatus,
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

export async function GET(_request, { params }) {
    try {
        const { user, response } = await requireAuthenticatedUser();
        if (response) return response;

        await dbConnect();
        const { id } = await params;

        if (!isValidObjectId(id)) {
            return NextResponse.json(
                { success: false, message: "La solicitud no es valida." },
                { status: 400 }
            );
        }

        const purchaseRequest = await PurchaseRequest.findById(id)
            .populate("requestedBy", "firstName lastName username email role")
            .populate("approvedBy", "firstName lastName username email role")
            .populate("rejectedBy", "firstName lastName username email role")
            .populate("cancelledBy", "firstName lastName username email role")
            .populate("items.productId", "name code unit categoryId")
            .populate("activityLog.performedBy", "firstName lastName username email role")
            .lean({ virtuals: true });

        if (!purchaseRequest) {
            return NextResponse.json(
                { success: false, message: "La solicitud no existe." },
                { status: 404 }
            );
        }

        if (user.role !== "admin" && String(purchaseRequest.requestedBy?._id || purchaseRequest.requestedBy) !== user.id) {
            return NextResponse.json(
                { success: false, message: "No tienes acceso a esta solicitud." },
                { status: 403 }
            );
        }

        return NextResponse.json(
            { success: true, data: mapPurchaseRequestDocument(purchaseRequest) },
            { status: 200 }
        );
    } catch (error) {
        console.error("GET /api/purchase-requests/[id] error:", error);
        return NextResponse.json(
            { success: false, message: "No se pudo obtener la solicitud de compra." },
            { status: 500 }
        );
    }
}

export async function PATCH(request, { params }) {
    try {
        const { user, response } = await requireAuthenticatedUser();
        if (response) return response;

        await dbConnect();
        const { id } = await params;

        if (!isValidObjectId(id)) {
            return NextResponse.json(
                { success: false, message: "La solicitud no es valida." },
                { status: 400 }
            );
        }

        const purchaseRequest = await PurchaseRequest.findById(id);

        if (!purchaseRequest) {
            return NextResponse.json(
                { success: false, message: "La solicitud no existe." },
                { status: 404 }
            );
        }

        const isOwner = String(purchaseRequest.requestedBy) === user.id;
        const effectiveStatus = resolvePurchaseRequestStatus(purchaseRequest);
        const canEdit = user.role === "admin" || (isOwner && effectiveStatus === "pending");

        if (!canEdit) {
            return NextResponse.json(
                { success: false, message: "No puedes editar esta solicitud." },
                { status: 403 }
            );
        }

        const body = await request.json();
        const requesterNote = normalizeNullableText(body.requesterNote || body.notes);
        const rawItems = Array.isArray(body.items) ? body.items : [];
        const requestedDestinationLocation = normalizeText(body.destinationLocation);
        const destinationLocation = user.role === "admin"
            ? (STOCK_LOCATIONS.includes(requestedDestinationLocation) ? requestedDestinationLocation : "")
            : getDefaultPurchaseRequestLocationForRole(user.role);
        const destinationLocationLabel = getLocationLabel(destinationLocation, "Bodega");

        if (!rawItems.length) {
            return NextResponse.json(
                { success: false, message: "Debes incluir al menos un producto." },
                { status: 400 }
            );
        }

        if (!destinationLocation) {
            return NextResponse.json(
                { success: false, message: "Debes elegir una ubicacion destino valida." },
                { status: 400 }
            );
        }

        const productIds = [...new Set(rawItems.map((item) => normalizeText(item.productId)).filter(Boolean))];

        if (productIds.some((id) => !isValidObjectId(id))) {
            return NextResponse.json(
                { success: false, message: "Uno o mas productos no son validos." },
                { status: 400 }
            );
        }

        const products = await Product.find({
            _id: { $in: productIds },
            isActive: true,
        }).lean();

        const productMap = new Map(products.map((product) => [String(product._id), product]));

        purchaseRequest.items = rawItems.map((item) => {
            const product = productMap.get(normalizeText(item.productId));
            const requestedQuantity = Number(item.requestedQuantity);

            if (!product || !Number.isFinite(requestedQuantity) || requestedQuantity <= 0) {
                throw new Error("Los items de la solicitud no son validos.");
            }

            if (!isPurchaseEligibleProductType(product.productType)) {
                throw new Error(
                    `${product.name} no se puede solicitar en compras porque no es un producto comprable.`
                );
            }

            return {
                productId: product._id,
                unitSnapshot: product.unit,
                requestedQuantity,
                approvedQuantity: user.role === "admin" ? Number(item.approvedQuantity || 0) : 0,
                purchasedQuantity: user.role === "admin" ? Number(item.purchasedQuantity || 0) : 0,
                dispatchedQuantity: user.role === "admin" ? Number(item.dispatchedQuantity || 0) : 0,
                receivedQuantity: user.role === "admin" ? Number(item.receivedQuantity || 0) : 0,
                requesterNote: normalizeNullableText(item.requesterNote || item.notes),
                adminNote: normalizeNullableText(item.adminNote),
            };
        });

        purchaseRequest.requesterNote = requesterNote;
        purchaseRequest.destinationLocation = destinationLocation;
        purchaseRequest.recalculateStatus();
        purchaseRequest.addActivity({
            type: "request_updated",
            performedBy: user.id,
            title: "Solicitud actualizada",
            description: user.role === "admin"
                ? `El administrador actualizo la solicitud para ${destinationLocationLabel}.`
                : `El solicitante ajusto los productos requeridos para ${destinationLocationLabel}.`,
        });

        await purchaseRequest.save();

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
                message: "Solicitud actualizada correctamente.",
                data: mapPurchaseRequestDocument(populatedRequest),
            },
            { status: 200 }
        );
    } catch (error) {
        console.error("PATCH /api/purchase-requests/[id] error:", error);
        return NextResponse.json(
            { success: false, message: error.message || "No se pudo actualizar la solicitud de compra." },
            { status: 500 }
        );
    }
}

export async function DELETE(_request, { params }) {
    try {
        const { user, response } = await requireAuthenticatedUser();
        if (response) return response;

        if (user.role !== "admin") {
            return NextResponse.json(
                { success: false, message: "Solo administracion puede eliminar solicitudes." },
                { status: 403 }
            );
        }

        await dbConnect();
        const { id } = await params;

        if (!isValidObjectId(id)) {
            return NextResponse.json(
                { success: false, message: "La solicitud no es valida." },
                { status: 400 }
            );
        }

        const purchaseRequest = await PurchaseRequest.findById(id);

        if (!purchaseRequest) {
            return NextResponse.json(
                { success: false, message: "La solicitud no existe." },
                { status: 404 }
            );
        }

        await PurchaseRequest.deleteOne({ _id: id });

        return NextResponse.json(
            {
                success: true,
                message: "Solicitud eliminada correctamente.",
            },
            { status: 200 }
        );
    } catch (error) {
        console.error("DELETE /api/purchase-requests/[id] error:", error);
        return NextResponse.json(
            { success: false, message: error.message || "No se pudo eliminar la solicitud de compra." },
            { status: 500 }
        );
    }
}
