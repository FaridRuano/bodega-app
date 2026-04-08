import mongoose from "mongoose";
import { NextResponse } from "next/server";

import { requireAuthenticatedUser, requireUserRole } from "@libs/apiAuth";
import dbConnect from "@libs/mongodb";
import Request, { REQUEST_STATUSES, REQUEST_TYPES } from "@models/Request";
import Product from "@models/Product";
import InventoryStock, { STOCK_LOCATIONS } from "@models/InventoryStock";
import { parsePositiveNumber } from "@libs/apiUtils";

function isValidObjectId(value) {
    return mongoose.Types.ObjectId.isValid(value);
}

function normalizeText(value = "") {
    return String(value || "").trim();
}

function normalizeNullableText(value = "") {
    const normalized = normalizeText(value);
    return normalized || "";
}

function normalizeLocation(value, fallback = null) {
    const normalized = normalizeText(value).toLowerCase();
    if (!normalized) return fallback;
    return STOCK_LOCATIONS.includes(normalized) ? normalized : null;
}

function normalizeRequestType(value, fallback = "operation") {
    const normalized = normalizeText(value).toLowerCase();
    if (!normalized) return fallback;
    return REQUEST_TYPES.includes(normalized) ? normalized : null;
}

function normalizeRequestStatus(value) {
    const normalized = normalizeText(value).toLowerCase();
    if (!normalized) return null;
    return REQUEST_STATUSES.includes(normalized) ? normalized : null;
}

async function generateRequestNumber() {
    const prefix = "REQ";
    const year = new Date().getFullYear();

    let attempts = 0;

    while (attempts < 20) {
        const randomPart = Math.floor(100000 + Math.random() * 900000);
        const requestNumber = `${prefix}-${year}-${randomPart}`;

        const exists = await Request.exists({ requestNumber });

        if (!exists) {
            return requestNumber;
        }

        attempts += 1;
    }

    throw new Error("No se pudo generar un nÃºmero Ãºnico de solicitud.");
}

function buildSearchFilter(search) {
    const query = normalizeText(search);
    if (!query) return null;

    const regex = new RegExp(query, "i");

    return {
        $or: [
            { requestNumber: regex },
            { justification: regex },
            { notes: regex },
            { statusReason: regex },
        ],
    };
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

export async function GET(request) {
    try {
        const { response } = await requireAuthenticatedUser();
        if (response) return response;

        await dbConnect();

        const { searchParams } = new URL(request.url);

        const search = searchParams.get("search");
        const hasPagination = searchParams.has("page") || searchParams.has("limit");
        const page = parsePositiveNumber(searchParams.get("page"), 1);
        const limit = Math.min(parsePositiveNumber(searchParams.get("limit"), 10), 100);
        const status = normalizeRequestStatus(searchParams.get("status"));
        const requestType = normalizeRequestType(searchParams.get("requestType"), null);
        const sourceLocation = normalizeLocation(searchParams.get("sourceLocation"));
        const destinationLocation = normalizeLocation(searchParams.get("destinationLocation"));
        const requestedBy = normalizeText(searchParams.get("requestedBy"));

        const filters = [{ deletedAt: null }];

        const searchFilter = buildSearchFilter(search);
        if (searchFilter) filters.push(searchFilter);

        if (status) filters.push({ status });
        if (requestType) filters.push({ requestType });
        if (sourceLocation) filters.push({ sourceLocation });
        if (destinationLocation) filters.push({ destinationLocation });

        if (requestedBy) {
            if (!isValidObjectId(requestedBy)) {
                return NextResponse.json(
                    { success: false, message: "El usuario solicitante no es vÃ¡lido." },
                    { status: 400 }
                );
            }

            filters.push({ requestedBy });
        }

        const query = { $and: filters };
        const skip = (page - 1) * limit;

        const [requests, total, pending, approved, partiallyFulfilled, fulfilled, rejected, cancelled] = await Promise.all([
            Request.find(query)
                 .populate("requestedBy", "firstName lastName username email")
                 .populate("approvedBy", "firstName lastName username email")
                 .populate("rejectedBy", "firstName lastName username email")
                 .populate("cancelledBy", "firstName lastName username email")
                .populate("items.productId", "code name slug unit isActive")
                 .populate("dispatches.dispatchedBy", "firstName lastName username email")
                 .populate("receipts.receivedBy", "firstName lastName username email")
                 .populate("activityLog.performedBy", "firstName lastName username email")
                .sort({ requestedAt: -1, createdAt: -1 })
                .skip(hasPagination ? skip : 0)
                .limit(hasPagination ? limit : 1000)
                .lean({ virtuals: true }),
            Request.countDocuments(query),
            Request.countDocuments({ ...query, status: "pending" }),
            Request.countDocuments({ ...query, status: "approved" }),
            Request.countDocuments({ ...query, status: "partially_fulfilled" }),
            Request.countDocuments({ ...query, status: "fulfilled" }),
            Request.countDocuments({ ...query, status: "rejected" }),
            Request.countDocuments({ ...query, status: "cancelled" }),
        ]);

        const data = requests.map(normalizeRequestDocument);

        const summary = {
            total,
            pending,
            approved,
            partiallyFulfilled,
            fulfilled,
            rejected,
            cancelled,
        };

        return NextResponse.json(
            {
                success: true,
                data,
                summary,
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
        console.error("GET /api/requests error:", error);

        return NextResponse.json(
            { success: false, message: "No se pudieron obtener las solicitudes." },
            { status: 500 }
        );
    }
}

export async function POST(request) {
    try {
        const { user, response } = await requireUserRole(["admin", "kitchen"]);
        if (response) return response;

        await dbConnect();

        const body = await request.json();

        const requestType = normalizeRequestType(body.requestType, "operation");
        const isReturnRequest = requestType === "return";
        const sourceLocation = normalizeLocation(
            body.sourceLocation,
            isReturnRequest ? "kitchen" : "warehouse"
        );
        const destinationLocation = normalizeLocation(
            body.destinationLocation,
            isReturnRequest ? "warehouse" : "kitchen"
        );
        const justification = normalizeNullableText(body.justification);
        const notes = normalizeNullableText(body.notes);

        if (!requestType) {
            return NextResponse.json(
                { success: false, message: "El tipo de solicitud no es vÃ¡lido." },
                { status: 400 }
            );
        }

        if (!sourceLocation || !destinationLocation) {
            return NextResponse.json(
                { success: false, message: "Las ubicaciones no son vÃ¡lidas." },
                { status: 400 }
            );
        }

        if (isReturnRequest) {
            if (sourceLocation !== "kitchen" || destinationLocation !== "warehouse") {
                return NextResponse.json(
                    {
                        success: false,
                        message: "Las devoluciones solo pueden enviarse de cocina hacia bodega.",
                    },
                    { status: 400 }
                );
            }
        }

        const rawItems = Array.isArray(body.items) ? body.items : [];

        if (!rawItems.length) {
            return NextResponse.json(
                { success: false, message: "Debes agregar al menos un producto." },
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

        const invalidId = productIds.find((id) => !isValidObjectId(id));

        if (invalidId) {
            return NextResponse.json(
                { success: false, message: "Uno o mÃ¡s productos no son vÃ¡lidos." },
                { status: 400 }
            );
        }

        const products = await Product.find({
            _id: { $in: productIds },
            isActive: true,
        }).lean();

        if (products.length !== productIds.length) {
            return NextResponse.json(
                { success: false, message: "Uno o mÃ¡s productos no existen o estÃ¡n inactivos." },
                { status: 404 }
            );
        }

        const productMap = new Map(
            products.map((product) => [String(product._id), product])
        );
        const stocks = await InventoryStock.find({
            productId: { $in: productIds },
            location: sourceLocation,
        }).lean();
        const stockMap = new Map(stocks.map((stock) => [String(stock.productId), stock]));

        const items = rawItems.map((item) => {
            const productId = normalizeText(item.productId);
            const product = productMap.get(productId);
            const requestedQuantity = Number(item.requestedQuantity);
            const itemNotes = normalizeNullableText(item.notes);
            const stock = stockMap.get(productId);
            const available = Number(
                typeof stock?.availableQuantity !== "undefined"
                    ? stock.availableQuantity
                    : stock?.quantity || 0
            );

            if (!product) {
                throw new Error("Uno o mÃ¡s productos no existen.");
            }

            if (!Number.isFinite(requestedQuantity) || requestedQuantity <= 0) {
                throw new Error(
                    `La cantidad solicitada de ${product.name} debe ser mayor que cero.`
                );
            }

            if (requestedQuantity > available) {
                throw new Error(
                    `La cantidad solicitada de ${product.name} supera el stock disponible en ${sourceLocation === "warehouse" ? "bodega" : "cocina"}.`
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
                notes: itemNotes,
            };
        });

        const requestNumber = await generateRequestNumber();
        const requestedAt = new Date();

        const createdRequest = new Request({
            requestNumber,
            requestType,
            status: "pending",
            sourceLocation,
            destinationLocation,
            requestedBy: user.id,
            items,
            dispatches: [],
            receipts: [],
            activityLog: [],
            justification,
            notes,
            requestedAt,
        });

        createdRequest.addActivity({
            type: "request_created",
            performedBy: user.id,
            performedAt: requestedAt,
            title: "Solicitud creada",
            description: isReturnRequest
                ? "Se registró una devolución pendiente hacia bodega."
                : null,
            items: [],
        });

        await createdRequest.save();

        const populatedRequest = await Request.findById(createdRequest._id)
             .populate("requestedBy", "firstName lastName username email")
             .populate("approvedBy", "firstName lastName username email")
             .populate("rejectedBy", "firstName lastName username email")
             .populate("cancelledBy", "firstName lastName username email")
            .populate("items.productId", "code name slug unit isActive")
             .populate("dispatches.dispatchedBy", "firstName lastName username email")
             .populate("receipts.receivedBy", "firstName lastName username email")
             .populate("activityLog.performedBy", "firstName lastName username email")
            .lean({ virtuals: true });

        return NextResponse.json(
            {
                success: true,
                message: "Solicitud creada correctamente.",
                data: normalizeRequestDocument(populatedRequest),
            },
            { status: 201 }
        );
    } catch (error) {
        console.error("POST /api/requests error:", error);

        if (error?.code === 11000) {
            return NextResponse.json(
                { success: false, message: "Ya existe una solicitud con ese nÃºmero." },
                { status: 409 }
            );
        }

        return NextResponse.json(
            { success: false, message: error.message || "No se pudo crear la solicitud." },
            { status: 500 }
        );
    }
}
