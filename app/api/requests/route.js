import mongoose from "mongoose";
import { NextResponse } from "next/server";

import { requireAuthenticatedUser, requireUserRole } from "@libs/apiAuth";
import dbConnect from "@libs/mongodb";
import Request, { REQUEST_STATUSES, REQUEST_TYPES } from "@models/Request";
import Product from "@models/Product";
import InventoryStock, { STOCK_LOCATIONS } from "@models/InventoryStock";
import InventoryMovement from "@models/InventoryMovement";
import { parsePositiveNumber } from "@libs/apiUtils";
import { createNotificationsForRoles, NOTIFICATION_TYPES } from "@libs/notifications";

const OPERATION_LOCATIONS = ["kitchen", "lounge"];

function getRoleForLocation(location) {
    if (location === "warehouse") return "warehouse";
    if (location === "kitchen") return "kitchen";
    if (location === "lounge") return "loung";
    return "";
}

function getOperationalLocationFromRole(role) {
    if (role === "warehouse") return "warehouse";
    if (role === "loung") return "lounge";
    return "kitchen";
}

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
    if (normalized === "approved") return "processing";
    return REQUEST_STATUSES.includes(normalized) ? normalized : null;
}

function normalizeFlowKind(value, fallback = "request") {
    const normalized = normalizeText(value).toLowerCase();
    if (!normalized) return fallback;
    return ["request", "transfer"].includes(normalized) ? normalized : null;
}

function getLocationName(location) {
    switch (location) {
        case "warehouse":
            return "bodega";
        case "kitchen":
            return "cocina";
        case "lounge":
            return "salon";
        default:
            return location || "ubicacion";
    }
}

function getActorName(user) {
    if (!user || typeof user !== "object") return "Usuario";

    const firstName = normalizeText(user.firstName);
    const lastName = normalizeText(user.lastName);
    const fullName = [firstName, lastName].filter(Boolean).join(" ").trim();

    if (fullName) return fullName;

    const username = normalizeText(user.username);
    if (username) return username;

    const email = normalizeText(user.email);
    if (email) return email;

    return "Usuario";
}

function buildStatusCondition(status) {
    if (status === "processing") {
        return { status: { $in: ["approved", "processing"] } };
    }

    return { status };
}

function getInventoryLocations({ requestType, sourceLocation, destinationLocation }) {
    const isWarehouseRequest =
        requestType !== "return" && sourceLocation === "warehouse";

    return {
        isWarehouseRequest,
        inventorySourceLocation: isWarehouseRequest ? "warehouse" : sourceLocation,
        inventoryDestinationLocation: isWarehouseRequest
            ? sourceLocation
            : destinationLocation,
    };
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

    throw new Error("No se pudo generar un número único de solicitud.");
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

function normalizeDateOnly(value, endOfDay = false) {
    const raw = normalizeText(value);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;

    const date = new Date(`${raw}T00:00:00.000Z`);
    if (Number.isNaN(date.getTime())) return null;

    if (endOfDay) {
        date.setUTCHours(23, 59, 59, 999);
    }

    return date;
}

function mapMovementItems(items = []) {
    return (items || []).map((item) => ({
        requestItemId: item.requestItemId || null,
        quantity: Number(item.quantity || 0),
    }));
}

function normalizeRequestDocument(request) {
    const flowKind =
        request.flowKind ||
        (request.requestType !== "return" && request.sourceLocation === "warehouse"
            ? "request"
            : "transfer");
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
        flowKind,
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

export async function GET(request) {
    try {
        const { user, response } = await requireAuthenticatedUser();
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
        const dateFrom = normalizeDateOnly(searchParams.get("dateFrom"));
        const dateTo = normalizeDateOnly(searchParams.get("dateTo"), true);

        const filters = [{ deletedAt: null }];
        const normalizedUserRole = normalizeText(user?.role).toLowerCase();

        if (normalizedUserRole === "warehouse") {
            filters.push({
                $or: [{ sourceLocation: "warehouse" }, { destinationLocation: "warehouse" }],
            });
        } else if (normalizedUserRole === "kitchen") {
            filters.push({
                $or: [{ sourceLocation: "kitchen" }, { destinationLocation: "kitchen" }],
            });
        } else if (normalizedUserRole === "loung") {
            filters.push({
                $or: [{ sourceLocation: "lounge" }, { destinationLocation: "lounge" }],
            });
        }

        const searchFilter = buildSearchFilter(search);
        if (searchFilter) filters.push(searchFilter);

        if (status) filters.push(buildStatusCondition(status));
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

        if (dateFrom || dateTo) {
            const dateFilter = {};
            if (dateFrom) dateFilter.$gte = dateFrom;
            if (dateTo) dateFilter.$lte = dateTo;
            filters.push({ requestedAt: dateFilter });
        }

        const query = { $and: filters };
        const skip = (page - 1) * limit;

        const [requests, total, pending, processing, partiallyFulfilled, fulfilled, rejected, cancelled] = await Promise.all([
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
            Request.countDocuments({ ...query, status: { $in: ["approved", "processing"] } }),
            Request.countDocuments({ ...query, status: "partially_fulfilled" }),
            Request.countDocuments({ ...query, status: "fulfilled" }),
            Request.countDocuments({ ...query, status: "rejected" }),
            Request.countDocuments({ ...query, status: "cancelled" }),
        ]);

        const data = requests.map(normalizeRequestDocument);

        const summary = {
            total,
            pending,
            approved: processing,
            processing,
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
    const session = await mongoose.startSession();

    try {
        const { user, response } = await requireUserRole(["warehouse", "kitchen", "loung"]);
        if (response) return response;

        await dbConnect();

        const body = await request.json();
        const operationalLocation = getOperationalLocationFromRole(user.role);
        const flowKind = normalizeFlowKind(body.flowKind, "request");
        const requestedDestinationLocation = normalizeLocation(body.destinationLocation);
        const requestType = normalizeRequestType(body.requestType, "operation");
        const sourceLocation = flowKind === "request" ? "warehouse" : operationalLocation;
        const destinationLocation =
            flowKind === "request" ? operationalLocation : requestedDestinationLocation;
        const isReturnRequest = requestType === "return";
        const {
            isWarehouseRequest,
            inventorySourceLocation,
        } = getInventoryLocations({
            requestType,
            sourceLocation,
            destinationLocation,
        });

        const justification = normalizeNullableText(body.justification);
        const notes = normalizeNullableText(body.notes);

        if (!flowKind) {
            return NextResponse.json(
                { success: false, message: "El tipo de flujo no es válido." },
                { status: 400 }
            );
        }

        if (!sourceLocation || !destinationLocation) {
            return NextResponse.json(
                { success: false, message: "Las ubicaciones no son vÃ¡lidas." },
                { status: 400 }
            );
        }

        if (destinationLocation === sourceLocation) {
            return NextResponse.json(
                {
                    success: false,
                    message: "La ubicacion destino debe ser diferente al origen.",
                },
                { status: 400 }
            );
        }

        if (flowKind === "request") {
            if (!["kitchen", "loung"].includes(user.role)) {
                return NextResponse.json(
                    {
                        success: false,
                        message: "Solo cocina o salón pueden crear solicitudes a bodega.",
                    },
                    { status: 403 }
                );
            }

            if (sourceLocation !== "warehouse" || destinationLocation !== operationalLocation) {
                return NextResponse.json(
                    {
                        success: false,
                        message: "Las solicitudes deben salir de bodega hacia tu ubicación.",
                    },
                    { status: 400 }
                );
            }
        }

        if (
            !isReturnRequest &&
            flowKind === "transfer" &&
            destinationLocation !== "warehouse" &&
            !OPERATION_LOCATIONS.includes(destinationLocation)
        ) {
            return NextResponse.json(
                {
                    success: false,
                    message: "Las solicitudes internas solo pueden dirigirse a cocina, salon o bodega.",
                },
                { status: 400 }
            );
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
            location: inventorySourceLocation,
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
                    `La cantidad solicitada de ${product.name} supera el stock disponible en ${getLocationName(inventorySourceLocation)}.`
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
        const isTransferFlow = flowKind === "transfer";

        session.startTransaction();

        const createdRequest = new Request({
            requestNumber,
            requestType: "operation",
            flowKind,
            status: isTransferFlow ? "processing" : "pending",
            sourceLocation,
            destinationLocation,
            requestedBy: user.id,
            items: items.map((item) => ({
                ...item,
                approvedQuantity: isTransferFlow ? item.requestedQuantity : item.approvedQuantity,
                dispatchedQuantity: isTransferFlow ? item.requestedQuantity : item.dispatchedQuantity,
            })),
            dispatches: isTransferFlow
                ? [
                    {
                        dispatchedBy: user.id,
                        dispatchedAt: requestedAt,
                        notes,
                        items: items.map((item) => ({
                            requestItemId: new mongoose.Types.ObjectId(),
                            quantity: Number(item.requestedQuantity || 0),
                        })),
                    },
                ]
                : [],
            receipts: [],
            activityLog: [],
            justification,
            notes,
            requestedAt,
        });

        if (isTransferFlow) {
            createdRequest.dispatches = [
                {
                    dispatchedBy: user.id,
                    dispatchedAt: requestedAt,
                    notes,
                    items: createdRequest.items.map((item) => ({
                        requestItemId: item._id,
                        quantity: Number(item.requestedQuantity || 0),
                    })),
                },
            ];
        }

        if (!isTransferFlow) {
            createdRequest.addActivity({
                type: "request_created",
                performedBy: user.id,
                performedAt: requestedAt,
                title: "Solicitud creada",
                description: "Se registró una solicitud de productos desde bodega.",
                items: [],
            });
        }

        if (isTransferFlow) {
            createdRequest.addActivity({
                type: "dispatch",
                performedBy: user.id,
                performedAt: requestedAt,
                title: "Transferencia creada",
                description:
                    notes || `Los productos salieron de ${getLocationName(sourceLocation)} y quedaron pendientes de confirmación.`,
                items: createdRequest.items.map((item) => ({
                    requestItemId: item._id,
                    quantity: Number(item.requestedQuantity || 0),
                })),
            });
        }

        createdRequest.recalculateStatus();
        await createdRequest.save({ session });

        if (isTransferFlow) {
            const movementsToCreate = [];

            for (const item of createdRequest.items || []) {
                let stock = await InventoryStock.findOne({
                    productId: item.productId,
                    location: sourceLocation,
                }).session(session);

                if (!stock) {
                    throw new Error(
                        `No existe inventario disponible en ${getLocationName(sourceLocation)} para completar la transferencia.`
                    );
                }

                const movementQuantity = Number(item.requestedQuantity || 0);

                if (Number(stock.availableQuantity || 0) < movementQuantity) {
                    throw new Error("Stock insuficiente para completar la transferencia.");
                }

                stock.quantity = Number(stock.quantity || 0) - movementQuantity;
                stock.lastMovementAt = requestedAt;
                await stock.save({ session });

                movementsToCreate.push({
                    productId: item.productId,
                    movementType: "request_dispatch",
                    quantity: movementQuantity,
                    unitSnapshot: item.unitSnapshot,
                    fromLocation: sourceLocation,
                    toLocation: destinationLocation,
                    referenceType: "request",
                    referenceId: createdRequest._id,
                    notes,
                    performedBy: user.id,
                    movementDate: requestedAt,
                });
            }

            if (movementsToCreate.length) {
                await InventoryMovement.create(movementsToCreate, { session });
            }
        }

        await session.commitTransaction();
        session.endSession();

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

        const destinationRole = getRoleForLocation(
            isWarehouseRequest ? inventorySourceLocation : destinationLocation
        );
        const targetRoles = [destinationRole].filter(Boolean);

        if (targetRoles.length) {
            const actorName = getActorName(user);
            await createNotificationsForRoles(targetRoles, {
                type: NOTIFICATION_TYPES.internal_request_created,
                title: isWarehouseRequest ? "Nueva solicitud interna" : "Nueva transferencia interna",
                message: isWarehouseRequest
                    ? `Se solicitan productos en ${getLocationName(destinationLocation)}.`
                    : `${actorName} transfiere productos hacia ${getLocationName(destinationLocation)}.`,
                href: "/dashboard/requests",
                entityType: "request",
                entityId: createdRequest._id,
                priority: "high",
            }).catch((notificationError) => {
                console.error("internal request notification error:", notificationError);
            });
        }

        return NextResponse.json(
            {
                success: true,
                message: "Solicitud creada correctamente.",
                data: normalizeRequestDocument(populatedRequest),
            },
            { status: 201 }
        );
    } catch (error) {
        await session.abortTransaction().catch(() => {});
        session.endSession();
        console.error("POST /api/requests error:", error);

        if (error?.code === 11000) {
            return NextResponse.json(
                { success: false, message: "Ya existe una solicitud con ese número." },
                { status: 409 }
            );
        }

        return NextResponse.json(
            { success: false, message: error.message || "No se pudo crear la solicitud." },
            { status: 500 }
        );
    }
}
