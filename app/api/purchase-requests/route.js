import { NextResponse } from "next/server";

import { requireAuthenticatedUser } from "@libs/apiAuth";
import { parsePositiveNumber } from "@libs/apiUtils";
import { getLocationLabel } from "@libs/constants/domainLabels";
import dbConnect from "@libs/mongodb";
import { createNotificationsForRoles, NOTIFICATION_TYPES } from "@libs/notifications";
import { isPurchaseEligibleProductType } from "@libs/constants/productTypes";
import Product from "@models/Product";
import PurchaseRequest from "@models/PurchaseRequest";
import {
    buildPendingShoppingList,
    buildPurchaseSearchFilter,
    generateSequentialCode,
    getDefaultPurchaseRequestLocationForRole,
    isValidObjectId,
    normalizeNullableText,
    normalizePurchaseRequestStatus,
    normalizeText,
    resolvePurchaseRequestStatus,
} from "@libs/purchaseRequests";
import { STOCK_LOCATIONS } from "@models/InventoryStock";

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
        totals: request.totals || { requested: 0, approved: 0, purchased: 0, dispatched: 0, received: 0, pendingPurchase: 0, pendingDispatch: 0, pendingReceipt: 0, remaining: 0 },
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

function normalizeDateOnly(value, endOfDay = false) {
    const raw = String(value || "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;

    const date = new Date(`${raw}T00:00:00.000Z`);
    if (Number.isNaN(date.getTime())) return null;

    if (endOfDay) {
        date.setUTCHours(23, 59, 59, 999);
    }

    return date;
}

function normalizeDestinationLocation(value) {
    const normalized = normalizeText(value).toLowerCase();
    return STOCK_LOCATIONS.includes(normalized) ? normalized : "";
}

function hasPendingReceipt(request) {
    return (request?.items || []).some((item) =>
        Math.max(
            Number(item?.dispatchedQuantity || 0) - Number(item?.receivedQuantity || 0),
            0
        ) > 0
    );
}

function buildPurchaseRequestSummary(requests = []) {
    return requests.reduce(
        (acc, request) => {
            const statusKey = String(request?.status || "").trim();
            acc.total += 1;

            if (statusKey === "pending") acc.pending += 1;
            if (statusKey === "approved") acc.approved += 1;
            if (statusKey === "in_progress") acc.inProgress += 1;
            if (statusKey === "partially_purchased") acc.partiallyPurchased += 1;
            if (statusKey === "completed") acc.completed += 1;
            if (statusKey === "rejected") acc.rejected += 1;
            if (statusKey === "cancelled") acc.cancelled += 1;

            return acc;
        },
        {
            total: 0,
            pending: 0,
            approved: 0,
            inProgress: 0,
            partiallyPurchased: 0,
            completed: 0,
            rejected: 0,
            cancelled: 0,
        }
    );
}

export async function GET(request) {
    try {
        const { user, response } = await requireAuthenticatedUser();
        if (response) return response;

        await dbConnect();

        const { searchParams } = new URL(request.url);
        const hasPagination = searchParams.has("page") || searchParams.has("limit");
        const page = parsePositiveNumber(searchParams.get("page"), 1);
        const limit = Math.min(parsePositiveNumber(searchParams.get("limit"), 12), 100);
        const status = normalizePurchaseRequestStatus(searchParams.get("status"));
        const search = searchParams.get("search");
        const mineParam = searchParams.get("mine") === "true";
        const destinationLocation = normalizeDestinationLocation(searchParams.get("destinationLocation"));
        const pendingReceiptOnly = searchParams.get("pendingReceipt") === "true";
        const consolidated = searchParams.get("consolidated") === "true";
        const dateFrom = normalizeDateOnly(searchParams.get("dateFrom"));
        const dateTo = normalizeDateOnly(searchParams.get("dateTo"), true);

        const filters = [];
        const searchFilter = buildPurchaseSearchFilter(search);

        if (searchFilter) filters.push(searchFilter);
        if (status) filters.push({ status });
        if (user.role === "admin") {
            if (mineParam) {
                filters.push({ requestedBy: user.id });
            }

            if (destinationLocation) {
                filters.push({ destinationLocation });
            }
        } else {
            if (destinationLocation && destinationLocation === user.role) {
                filters.push({
                    $or: [
                        { requestedBy: user.id },
                        { destinationLocation },
                    ],
                });
            } else {
                filters.push({ requestedBy: user.id });
            }
        }

        if (dateFrom || dateTo) {
            const dateFilter = {};
            if (dateFrom) dateFilter.$gte = dateFrom;
            if (dateTo) dateFilter.$lte = dateTo;
            filters.push({ requestedAt: dateFilter });
        }

        const query = filters.length ? { $and: filters } : {};
        const skip = (page - 1) * limit;
        const effectiveLimit = pendingReceiptOnly
            ? Math.max(limit, 500)
            : (hasPagination ? limit : 500);

        const requests = await PurchaseRequest.find(query)
            .populate("requestedBy", "firstName lastName username email role")
            .populate("approvedBy", "firstName lastName username email role")
            .populate("rejectedBy", "firstName lastName username email role")
            .populate("cancelledBy", "firstName lastName username email role")
            .populate("items.productId", "name code unit categoryId")
            .populate("activityLog.performedBy", "firstName lastName username email role")
            .sort({ requestedAt: -1, createdAt: -1 })
            .skip(pendingReceiptOnly ? 0 : (hasPagination ? skip : 0))
            .limit(effectiveLimit)
            .lean({ virtuals: true });

        const mappedRequests = requests.map(mapPurchaseRequestDocument);
        const filteredRequests = pendingReceiptOnly
            ? mappedRequests.filter(hasPendingReceipt)
            : mappedRequests;
        const data = pendingReceiptOnly && hasPagination
            ? filteredRequests.slice(skip, skip + limit)
            : filteredRequests;
        const total = pendingReceiptOnly
            ? filteredRequests.length
            : await PurchaseRequest.countDocuments(query);
        const summary = pendingReceiptOnly
            ? buildPurchaseRequestSummary(filteredRequests)
            : {
                total,
                pending: await PurchaseRequest.countDocuments({ ...query, status: "pending" }),
                approved: await PurchaseRequest.countDocuments({ ...query, status: "approved" }),
                inProgress: await PurchaseRequest.countDocuments({ ...query, status: "in_progress" }),
                partiallyPurchased: await PurchaseRequest.countDocuments({ ...query, status: "partially_purchased" }),
                completed: await PurchaseRequest.countDocuments({ ...query, status: "completed" }),
                rejected: await PurchaseRequest.countDocuments({ ...query, status: "rejected" }),
                cancelled: await PurchaseRequest.countDocuments({ ...query, status: "cancelled" }),
            };

        return NextResponse.json(
            {
                success: true,
                data,
                summary,
                consolidatedShoppingList: consolidated && user.role === "admin"
                    ? buildPendingShoppingList(
                        requests.filter((item) => ["approved", "in_progress", "partially_purchased"].includes(resolvePurchaseRequestStatus(item)))
                    )
                    : [],
                meta: {
                    page,
                    limit: hasPagination ? limit : data.length,
                    total,
                    pages: hasPagination ? Math.max(Math.ceil(total / limit), 1) : 1,
                },
            },
            { status: 200 }
        );
    } catch (error) {
        console.error("GET /api/purchase-requests error:", error);

        return NextResponse.json(
            { success: false, message: "No se pudieron obtener las solicitudes de compra." },
            { status: 500 }
        );
    }
}

export async function POST(request) {
    try {
        const { user, response } = await requireAuthenticatedUser();
        if (response) return response;

        await dbConnect();

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
                { success: false, message: "Debes seleccionar al menos un producto." },
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

        if (products.length !== productIds.length) {
            return NextResponse.json(
                { success: false, message: "Uno o mas productos no existen o estan inactivos." },
                { status: 404 }
            );
        }

        const productMap = new Map(products.map((product) => [String(product._id), product]));

        const items = rawItems.map((item) => {
            const product = productMap.get(normalizeText(item.productId));
            const requestedQuantity = Number(item.requestedQuantity);

            if (!product) {
                throw new Error("Uno o mas productos no existen.");
            }

            if (!Number.isFinite(requestedQuantity) || requestedQuantity <= 0) {
                throw new Error(`La cantidad de ${product.name} debe ser mayor que cero.`);
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
                approvedQuantity: 0,
                purchasedQuantity: 0,
                dispatchedQuantity: 0,
                receivedQuantity: 0,
                requesterNote: normalizeNullableText(item.requesterNote || item.notes),
                adminNote: "",
            };
        });

        const requestNumber = await generateSequentialCode(PurchaseRequest, "PRQ");
        const purchaseRequest = new PurchaseRequest({
            requestNumber,
            status: "pending",
            requestedBy: user.id,
            destinationLocation,
            items,
            requesterNote,
            requestedAt: new Date(),
            activityLog: [],
        });

        purchaseRequest.addActivity({
            type: "request_created",
            performedBy: user.id,
            title: "Solicitud creada",
            description: `Se registro una nueva necesidad de compra para ${destinationLocationLabel}.`,
        });

        await purchaseRequest.save();

        const populatedRequest = await PurchaseRequest.findById(purchaseRequest._id)
            .populate("requestedBy", "firstName lastName username email role")
            .populate("items.productId", "name code unit categoryId")
            .populate("activityLog.performedBy", "firstName lastName username email role")
            .lean({ virtuals: true });

        await createNotificationsForRoles(["admin"], {
            type: NOTIFICATION_TYPES.purchase_request_created,
            title: "Nueva solicitud de compra",
            message: `${purchaseRequest.requestNumber} fue creada para ${destinationLocationLabel}.`,
            href: "/dashboard/purchases?tab=requests",
            entityType: "purchase_request",
            entityId: purchaseRequest._id,
            priority: "high",
        }).catch((notificationError) => {
            console.error("purchase request notification error:", notificationError);
        });

        return NextResponse.json(
            {
                success: true,
                message: "Solicitud de compra creada correctamente.",
                data: mapPurchaseRequestDocument(populatedRequest),
            },
            { status: 201 }
        );
    } catch (error) {
        console.error("POST /api/purchase-requests error:", error);

        return NextResponse.json(
            { success: false, message: error.message || "No se pudo crear la solicitud de compra." },
            { status: 500 }
        );
    }
}
