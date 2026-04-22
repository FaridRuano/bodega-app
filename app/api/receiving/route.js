import { NextResponse } from "next/server";

import { requireAuthenticatedUser } from "@libs/apiAuth";
import dbConnect from "@libs/mongodb";
import PurchaseRequest from "@models/PurchaseRequest";
import Request from "@models/Request";
import { STOCK_LOCATIONS } from "@models/InventoryStock";
import { resolvePurchaseRequestStatus } from "@libs/purchaseRequests";

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
        createdAt: request.createdAt || null,
        updatedAt: request.updatedAt || null,
        totals: request.totals || {
            requested: 0,
            approved: 0,
            purchased: 0,
            dispatched: 0,
            received: 0,
            pendingPurchase: 0,
            pendingDispatch: 0,
            pendingReceipt: 0,
            remaining: 0,
        },
        items: (request.items || []).map((item) => ({
            _id: item._id,
            productId: item.productId?._id || item.productId,
            product: item.productId && typeof item.productId === "object"
                ? {
                    _id: item.productId._id,
                    name: item.productId.name,
                    code: item.productId.code,
                    unit: item.productId.unit,
                    categoryId: item.productId.categoryId || null,
                }
                : null,
            unitSnapshot: item.unitSnapshot,
            requestedQuantity: Number(item.requestedQuantity || 0),
            approvedQuantity: Number(item.approvedQuantity || 0),
            purchasedQuantity: Number(item.purchasedQuantity || 0),
            dispatchedQuantity: Number(item.dispatchedQuantity || 0),
            receivedQuantity: Number(item.receivedQuantity || 0),
            requesterNote: item.requesterNote || "",
            adminNote: item.adminNote || "",
        })),
        activityLog: (request.activityLog || []).map((activity) => ({
            _id: activity._id,
            type: activity.type,
            performedBy: activity.performedBy || null,
            performedAt: activity.performedAt || null,
            title: activity.title || "",
            description: activity.description || "",
            metadata: activity.metadata || null,
        })),
    };
}

function mapMovementItems(items = []) {
    return (items || []).map((item) => ({
        requestItemId: item.requestItemId || null,
        quantity: Number(item.quantity || 0),
    }));
}

function mapInternalRequestDocument(request) {
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

function buildScopeFilter(user) {
    const role = String(user?.role || "").trim();

    if (role === "admin") {
        return null;
    }

    if (STOCK_LOCATIONS.includes(role)) {
        return {
            $or: [
                { destinationLocation: role },
                { requestedBy: user.id },
            ],
        };
    }

    return { requestedBy: user.id };
}

function hasPendingPurchaseReceipt(request) {
    return (request?.items || []).some((item) =>
        Math.max(
            Number(item?.dispatchedQuantity || 0) - Number(item?.receivedQuantity || 0),
            0
        ) > 0
    );
}

function hasPendingInternalReceipt(request) {
    return (request?.items || []).some((item) =>
        Math.max(
            Number(item?.dispatchedQuantity || 0) - Number(item?.receivedQuantity || 0),
            0
        ) > 0
    );
}

export async function GET() {
    try {
        const { user, response } = await requireAuthenticatedUser();
        if (response) return response;

        await dbConnect();

        const scopeFilter = buildScopeFilter(user);
        const purchaseQuery = scopeFilter || {};
        const internalQuery = scopeFilter
            ? { $and: [{ deletedAt: null }, scopeFilter] }
            : { deletedAt: null };

        const [purchaseRequests, internalRequests] = await Promise.all([
            PurchaseRequest.find(purchaseQuery)
                .populate("requestedBy", "firstName lastName username email role")
                .populate("approvedBy", "firstName lastName username email role")
                .populate("rejectedBy", "firstName lastName username email role")
                .populate("cancelledBy", "firstName lastName username email role")
                .populate("items.productId", "name code unit categoryId")
                .populate("activityLog.performedBy", "firstName lastName username email role")
                .sort({ updatedAt: -1, requestedAt: -1, createdAt: -1 })
                .limit(500)
                .lean({ virtuals: true }),
            Request.find(internalQuery)
                .populate("requestedBy", "firstName lastName username email")
                .populate("approvedBy", "firstName lastName username email")
                .populate("rejectedBy", "firstName lastName username email")
                .populate("cancelledBy", "firstName lastName username email")
                .populate("items.productId", "code name slug unit isActive")
                .populate("dispatches.dispatchedBy", "firstName lastName username email")
                .populate("receipts.receivedBy", "firstName lastName username email")
                .populate("activityLog.performedBy", "firstName lastName username email")
                .sort({ updatedAt: -1, requestedAt: -1, createdAt: -1 })
                .limit(500)
                .lean({ virtuals: true }),
        ]);

        const mappedPurchases = purchaseRequests
            .map(mapPurchaseRequestDocument)
            .filter(hasPendingPurchaseReceipt);
        const mappedInternalRequests = internalRequests
            .map(mapInternalRequestDocument)
            .filter((request) => request.requestType !== "return")
            .filter(hasPendingInternalReceipt);

        return NextResponse.json(
            {
                success: true,
                data: {
                    purchases: mappedPurchases,
                    internalRequests: mappedInternalRequests,
                },
                user,
            },
            { status: 200 }
        );
    } catch (error) {
        console.error("GET /api/receiving error:", error);

        return NextResponse.json(
            { success: false, message: "No se pudieron obtener los procesos de recepcion." },
            { status: 500 }
        );
    }
}
