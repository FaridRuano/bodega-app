import mongoose from "mongoose";

export const PURCHASE_REQUEST_STATUSES = [
    "pending",
    "approved",
    "in_progress",
    "partially_purchased",
    "completed",
    "rejected",
    "cancelled",
];

export const PURCHASE_REQUEST_ACTIVITY_TYPES = [
    "request_created",
    "request_updated",
    "request_approved",
    "request_rejected",
    "request_cancelled",
    "purchase_registered",
    "admin_override",
];

export const PURCHASE_BATCH_STATUSES = [
    "draft",
    "purchased",
    "dispatched",
    "cancelled",
];

export const PURCHASE_BATCH_ACTIVITY_TYPES = [
    "purchase_saved_draft",
    "purchase_updated_draft",
    "purchase_created",
    "purchase_dispatched",
    "receipt_confirmed",
    "purchase_deleted_draft",
];

export const DEFAULT_PURCHASE_LOCATION = "warehouse";
export const PURCHASE_REQUEST_RECEIPT_LOCATION = "warehouse";

export const PURCHASE_BATCH_STATUS_LABELS = {
    draft: "Borrador",
    purchased: "Compra realizada",
    dispatched: "Despachada",
    completed: "Completada",
    cancelled: "Cancelada",
};

export function isValidObjectId(value) {
    return mongoose.Types.ObjectId.isValid(value);
}

export function normalizeText(value = "") {
    return String(value || "").trim();
}

export function normalizeNullableText(value = "") {
    return normalizeText(value) || "";
}

export function normalizePurchaseRequestStatus(value) {
    const normalized = normalizeText(value).toLowerCase();
    return PURCHASE_REQUEST_STATUSES.includes(normalized) ? normalized : null;
}

export function buildPurchaseSearchFilter(search) {
    const query = normalizeText(search);
    if (!query) return null;

    const regex = new RegExp(query, "i");

    return {
        $or: [
            { requestNumber: regex },
            { requesterNote: regex },
            { adminNote: regex },
            { statusReason: regex },
        ],
    };
}

export async function generateSequentialCode(Model, prefix) {
    const year = new Date().getFullYear();
    let attempts = 0;

    while (attempts < 20) {
        const randomPart = Math.floor(100000 + Math.random() * 900000);
        const code = `${prefix}-${year}-${randomPart}`;
        const exists = await Model.exists({ [prefix === "PRQ" ? "requestNumber" : "batchNumber"]: code });

        if (!exists) {
            return code;
        }

        attempts += 1;
    }

    throw new Error("No se pudo generar un identificador unico.");
}

export function calculateRequestItemProgress(item = {}) {
    const requestedQuantity = Number(item.requestedQuantity || 0);
    const hasApprovedQuantity =
        typeof item.approvedQuantity !== "undefined" && item.approvedQuantity !== null;
    const approvedQuantity = Number(
        hasApprovedQuantity ? item.approvedQuantity : (requestedQuantity || 0)
    );
    const purchasedQuantity = Number(item.purchasedQuantity || 0);
    const dispatchedQuantity = Number(item.dispatchedQuantity || 0);
    const receivedQuantity = Number(item.receivedQuantity || 0);
    const pendingPurchaseQuantity = Math.max(approvedQuantity - purchasedQuantity, 0);
    const pendingDispatchQuantity = Math.max(purchasedQuantity - dispatchedQuantity, 0);
    const pendingReceiptQuantity = Math.max(dispatchedQuantity - receivedQuantity, 0);
    const remainingQuantity = Math.max(approvedQuantity - receivedQuantity, 0);

    return {
        requestedQuantity,
        approvedQuantity,
        purchasedQuantity,
        dispatchedQuantity,
        receivedQuantity,
        pendingPurchaseQuantity,
        pendingDispatchQuantity,
        pendingReceiptQuantity,
        remainingQuantity,
        isCompleted: approvedQuantity > 0 && remainingQuantity <= 0,
    };
}

export function calculateRequestTotals(items = []) {
    return (items || []).reduce(
        (acc, item) => {
            const progress = calculateRequestItemProgress(item);
            acc.requested += progress.requestedQuantity;
            acc.approved += progress.approvedQuantity;
            acc.purchased += progress.purchasedQuantity;
            acc.dispatched += progress.dispatchedQuantity;
            acc.received += progress.receivedQuantity;
            acc.pendingPurchase += progress.pendingPurchaseQuantity;
            acc.pendingDispatch += progress.pendingDispatchQuantity;
            acc.pendingReceipt += progress.pendingReceiptQuantity;
            acc.remaining += progress.remainingQuantity;
            return acc;
        },
        { requested: 0, approved: 0, purchased: 0, dispatched: 0, received: 0, pendingPurchase: 0, pendingDispatch: 0, pendingReceipt: 0, remaining: 0 }
    );
}

export function resolvePurchaseRequestStatus(request) {
    if (!request) return "pending";

    if (["cancelled", "rejected"].includes(request.status)) {
        return request.status;
    }

    const totals = calculateRequestTotals(request.items || []);

    if (totals.approved <= 0) {
        return "pending";
    }

    if (totals.received >= totals.approved) {
        return "completed";
    }

    if (totals.dispatched > 0 || totals.received > 0) {
        return "partially_purchased";
    }

    if (totals.purchased > 0) {
        return "in_progress";
    }

    return "approved";
}

export function buildPendingShoppingList(requests = []) {
    const grouped = new Map();

    for (const request of requests) {
        for (const item of request.items || []) {
            const progress = calculateRequestItemProgress(item);
            if (progress.pendingPurchaseQuantity <= 0) continue;

            const productId = String(item.productId?._id || item.productId);
            if (!grouped.has(productId)) {
                grouped.set(productId, {
                    productId,
                    product: item.productId && typeof item.productId === "object" ? item.productId : null,
                    unitSnapshot: item.unitSnapshot,
                    pendingQuantity: 0,
                    purchasedQuantity: 0,
                    dispatchedQuantity: 0,
                    receivedQuantity: 0,
                    requests: [],
                });
            }

            const current = grouped.get(productId);
            current.pendingQuantity += progress.pendingPurchaseQuantity;
            current.purchasedQuantity += progress.purchasedQuantity;
            current.dispatchedQuantity += progress.dispatchedQuantity;
            current.receivedQuantity += progress.receivedQuantity;
            current.requests.push({
                purchaseRequestId: request._id,
                purchaseRequestItemId: item._id,
                requestNumber: request.requestNumber,
                quantity: progress.pendingPurchaseQuantity,
            });
        }
    }

    return Array.from(grouped.values()).sort((a, b) =>
        (a.product?.name || "").localeCompare(b.product?.name || "")
    );
}

export function getPurchaseBatchStatusLabel(value) {
    return PURCHASE_BATCH_STATUS_LABELS[value] || value || "Compra";
}

export function buildBatchReceiptProgressMap(batches = [], requests = []) {
    const progressMap = new Map();
    const requestItemReceivedMap = new Map();
    const allocationsByRequestItem = new Map();

    for (const batch of batches || []) {
        progressMap.set(String(batch._id), {
            allocatedQuantity: 0,
            receivedQuantity: 0,
            pendingReceiptQuantity: 0,
            isCompleted: false,
        });
    }

    for (const request of requests || []) {
        for (const item of request.items || []) {
            requestItemReceivedMap.set(
                String(item._id),
                Number(item.receivedQuantity || 0)
            );
        }
    }

    const sortedBatches = [...(batches || [])].sort((left, right) => {
        const leftDate = new Date(left?.purchasedAt || left?.createdAt || 0).getTime();
        const rightDate = new Date(right?.purchasedAt || right?.createdAt || 0).getTime();
        return leftDate - rightDate;
    });

    for (const batch of sortedBatches) {
        for (const item of batch.items || []) {
            for (const allocation of item.allocations || []) {
                const requestItemId = String(allocation.purchaseRequestItemId || "");
                if (!requestItemId) continue;

                if (!allocationsByRequestItem.has(requestItemId)) {
                    allocationsByRequestItem.set(requestItemId, []);
                }

                allocationsByRequestItem.get(requestItemId).push({
                    batchId: String(batch._id),
                    quantity: Number(allocation.quantity || 0),
                });
            }
        }
    }

    for (const [requestItemId, allocations] of allocationsByRequestItem.entries()) {
        let remainingReceived = Number(requestItemReceivedMap.get(requestItemId) || 0);

        for (const allocation of allocations) {
            const current = progressMap.get(allocation.batchId);
            if (!current) continue;

            const allocationQuantity = Number(allocation.quantity || 0);
            const coveredQuantity = Math.min(remainingReceived, allocationQuantity);

            current.allocatedQuantity += allocationQuantity;
            current.receivedQuantity += coveredQuantity;
            remainingReceived = Math.max(remainingReceived - coveredQuantity, 0);
        }
    }

    for (const [batchId, progress] of progressMap.entries()) {
        progress.pendingReceiptQuantity = Math.max(
            Number(progress.allocatedQuantity || 0) - Number(progress.receivedQuantity || 0),
            0
        );
        progress.isCompleted = progress.pendingReceiptQuantity <= 0;
        progressMap.set(batchId, progress);
    }

    return progressMap;
}

export function getDefaultPurchaseRequestLocationForRole(role = "") {
    switch (String(role || "").trim()) {
        case "kitchen":
            return "kitchen";
        case "lounge":
            return "lounge";
        case "warehouse":
        case "admin":
        default:
            return PURCHASE_REQUEST_RECEIPT_LOCATION;
    }
}
