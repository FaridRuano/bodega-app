import mongoose from "mongoose";
import { NextResponse } from "next/server";

import dbConnect from "@libs/mongodb";
import { requireUserRole } from "@libs/apiAuth";
import InventoryStock from "@models/InventoryStock";
import InventoryMovement from "@models/InventoryMovement";
import Product from "@models/Product";
import Category from "@models/Category";
import DailyInventoryControl, {
    DAILY_CONTROL_LOCATIONS,
} from "@models/DailyInventoryControl";
import {
    getLocationLabel,
    getReferenceTypeLabel,
} from "@libs/constants/domainLabels";
import {
    createStockAlertNotifications,
} from "@libs/notifications";

function normalizeLocation(value, fallback = null) {
    const normalized = String(value || "")
        .trim()
        .toLowerCase();
    if (!normalized) return fallback;
    return DAILY_CONTROL_LOCATIONS.includes(normalized) ? normalized : fallback;
}

function normalizeDateOnly(value) {
    const raw = String(value || "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;

    const date = new Date(`${raw}T00:00:00.000Z`);
    return Number.isNaN(date.getTime()) ? null : date;
}

function startOfUtcDay(date) {
    const nextDate = new Date(date);
    nextDate.setUTCHours(0, 0, 0, 0);
    return nextDate;
}

function endOfUtcDay(date) {
    const nextDate = new Date(date);
    nextDate.setUTCHours(23, 59, 59, 999);
    return nextDate;
}

function resolveOpeningQuantity(previousClosingMap, productId, fallbackQuantity = 0) {
    if (previousClosingMap.has(String(productId))) {
        return Number(previousClosingMap.get(String(productId)) || 0);
    }

    return Number(fallbackQuantity || 0);
}

function formatLine(line) {
    return {
        _id: line._id,
        productId: line.productId,
        productCodeSnapshot: line.productCodeSnapshot || "",
        productNameSnapshot: line.productNameSnapshot || "",
        unitSnapshot: line.unitSnapshot || "",
        openingQuantity: Number(line.openingQuantity || 0),
        systemQuantityBeforeAdjustment: Number(
            line.systemQuantityBeforeAdjustment || 0
        ),
        issuedQuantity: Number(line.issuedQuantity || 0),
        closingQuantity: Number(line.closingQuantity || 0),
        note: line.note || "",
    };
}

function buildMeaningfulLines(lines = []) {
    return lines
        .map((line) => ({
            productId: String(line.productId || "").trim(),
            issuedQuantity: Number(line.issuedQuantity || 0),
            note: String(line.note || "").trim(),
        }))
        .filter(
            (line) =>
                mongoose.Types.ObjectId.isValid(line.productId) &&
                line.issuedQuantity > 0
        );
}

function sumIssued(lines = []) {
    return Number(
        lines
            .reduce((sum, line) => sum + Number(line.issuedQuantity || 0), 0)
            .toFixed(6)
    );
}

function countChangedLines(previousLines = [], nextLines = []) {
    const previousMap = new Map(
        previousLines.map((line) => [String(line.productId), line])
    );
    const nextMap = new Map(nextLines.map((line) => [String(line.productId), line]));
    const productIds = new Set([...previousMap.keys(), ...nextMap.keys()]);
    let count = 0;

    for (const productId of productIds) {
        const previousLine = previousMap.get(productId);
        const nextLine = nextMap.get(productId);

        const previousIssued = Number(previousLine?.issuedQuantity || 0);
        const nextIssued = Number(nextLine?.issuedQuantity || 0);
        const previousNote = String(previousLine?.note || "").trim();
        const nextNote = String(nextLine?.note || "").trim();

        if (previousIssued !== nextIssued || previousNote !== nextNote) {
            count += 1;
        }
    }

    return count;
}

function formatControl(control) {
    return {
        _id: control._id,
        controlNumber: control.controlNumber || "",
        controlDate: control.controlDate,
        location: control.location,
        locationLabel: getLocationLabel(control.location, "Ubicacion"),
        notes: control.notes || "",
        previousControlId: control.previousControlId || null,
        summary: {
            productsCount: Number(control.summary?.productsCount || 0),
            totalIssuedQuantity: Number(
                control.summary?.totalIssuedQuantity || 0
            ),
            totalClosingQuantity: Number(
                control.summary?.totalClosingQuantity || 0
            ),
        },
        lines: Array.isArray(control.lines)
            ? control.lines.map(formatLine)
            : [],
        registeredBy: control.registeredBy || null,
        lastEditedBy: control.lastEditedBy || null,
        correctionsCount: Array.isArray(control.editHistory)
            ? control.editHistory.length
            : 0,
        editHistory: Array.isArray(control.editHistory)
            ? control.editHistory.map((entry) => ({
                  _id: entry._id,
                  editedBy: entry.editedBy || null,
                  editedAt: entry.editedAt || null,
                  previousNotes: entry.previousNotes || "",
                  newNotes: entry.newNotes || "",
                  totalIssuedBefore: Number(entry.totalIssuedBefore || 0),
                  totalIssuedAfter: Number(entry.totalIssuedAfter || 0),
                  changesCount: Number(entry.changesCount || 0),
              }))
            : [],
        createdAt: control.createdAt,
        updatedAt: control.updatedAt,
    };
}

async function buildContext({ location, controlDate }) {
    const existingControl = await DailyInventoryControl.findOne({
        location,
        controlDate: {
            $gte: startOfUtcDay(controlDate),
            $lte: endOfUtcDay(controlDate),
        },
    })
        .populate("registeredBy", "firstName lastName username role")
        .populate("lastEditedBy", "firstName lastName username role")
        .populate("editHistory.editedBy", "firstName lastName username role")
        .lean();

    const currentStocks = await InventoryStock.find({
        location,
        quantity: { $gt: 0 },
    }).lean();

    const trackedProductIds = [
        ...new Set([
            ...currentStocks.map((stock) => String(stock.productId)),
            ...(existingControl?.lines || []).map((line) => String(line.productId)),
        ]),
    ];

    const trackedProducts = await Product.find({
        _id: { $in: trackedProductIds },
        isActive: true,
        tracksStock: true,
        requiresDailyControl: true,
    })
        .populate({
            path: "categoryId",
            model: Category,
            select: "name familyId",
            populate: {
                path: "familyId",
                select: "name",
            },
        })
        .lean();

    const previousControl = await DailyInventoryControl.findOne({
        location,
        controlDate: { $lt: startOfUtcDay(controlDate) },
    })
        .sort({ controlDate: -1, createdAt: -1 })
        .lean();

    const previousClosingMap = new Map(
        (previousControl?.lines || []).map((line) => [
            String(line.productId),
            Number(line.closingQuantity || 0),
        ])
    );

    const currentStockMap = new Map(
        currentStocks.map((stock) => [String(stock.productId), Number(stock.quantity || 0)])
    );
    const existingLineMap = new Map(
        (existingControl?.lines || []).map((line) => [String(line.productId), line])
    );
    const trackedProductMap = new Map(
        trackedProducts.map((product) => [String(product._id), product])
    );

    const products = trackedProductIds
        .map((productId) => {
            const product = trackedProductMap.get(String(productId));
            if (!product) return null;

            const stockQuantity = Number(currentStockMap.get(String(productId)) || 0);
            const existingLine = existingLineMap.get(String(productId));
            const systemQuantityBeforeAdjustment = existingLine
                ? Number(existingLine.systemQuantityBeforeAdjustment || stockQuantity)
                : stockQuantity;
            const issuedQuantity = Number(existingLine?.issuedQuantity || 0);
            const closingQuantity = existingLine
                ? Number(existingLine.closingQuantity || 0)
                : stockQuantity;

            return {
                productId: product._id,
                productCodeSnapshot: product.code || "",
                productNameSnapshot: product.name || "Producto",
                unitSnapshot: product.unit || "",
                familyNameSnapshot:
                    product.categoryId?.familyId?.name || "Sin familia",
                categoryNameSnapshot: product.categoryId?.name || "Sin categoria",
                openingQuantity: resolveOpeningQuantity(
                    previousClosingMap,
                    product._id,
                    systemQuantityBeforeAdjustment
                ),
                systemQuantityBeforeAdjustment,
                issuedQuantity,
                closingQuantity,
                note: existingLine?.note || "",
            };
        })
        .filter(Boolean)
        .sort((a, b) => {
            const familyCompare = a.familyNameSnapshot.localeCompare(
                b.familyNameSnapshot,
                "es",
                { sensitivity: "base" }
            );

            if (familyCompare !== 0) return familyCompare;

            const categoryCompare = a.categoryNameSnapshot.localeCompare(
                b.categoryNameSnapshot,
                "es",
                { sensitivity: "base" }
            );

            if (categoryCompare !== 0) return categoryCompare;

            return a.productNameSnapshot.localeCompare(
                b.productNameSnapshot,
                "es",
                { sensitivity: "base" }
            );
        });

    return {
        location,
        locationLabel: getLocationLabel(location, "Ubicacion"),
        controlDate,
        previousControl: previousControl
            ? {
                  _id: previousControl._id,
                  controlNumber: previousControl.controlNumber || "",
                  controlDate: previousControl.controlDate,
              }
            : null,
        existingControl: existingControl ? formatControl(existingControl) : null,
        products,
    };
}

async function generateControlNumber(controlDate, location) {
    const datePart = controlDate.toISOString().slice(0, 10).replace(/-/g, "");
    const prefix = location === "kitchen" ? "CDC" : "CDS";

    const count = await DailyInventoryControl.countDocuments({
        location,
        controlDate: {
            $gte: startOfUtcDay(controlDate),
            $lte: endOfUtcDay(controlDate),
        },
    });

    return `${prefix}-${datePart}-${String(count + 1).padStart(2, "0")}`;
}

export async function GET(request) {
    try {
        const { user, response } = await requireUserRole([
            "admin",
            "kitchen",
            "loung",
        ]);
        if (response) return response;

        await dbConnect();

        const { searchParams } = new URL(request.url);
        const mode = String(searchParams.get("mode") || "").trim().toLowerCase();
        const requestedLocation = normalizeLocation(searchParams.get("location"));
        const currentDate =
            normalizeDateOnly(searchParams.get("date")) || startOfUtcDay(new Date());

        const effectiveLocation =
            user.role === "admin"
                ? requestedLocation || "kitchen"
                : user.role === "kitchen"
                  ? "kitchen"
                  : "lounge";

        if (mode === "context") {
            const context = await buildContext({
                location: effectiveLocation,
                controlDate: currentDate,
            });

            return NextResponse.json(
                {
                    success: true,
                    data: context,
                },
                { status: 200 }
            );
        }

        const page = Math.max(Number(searchParams.get("page") || 1), 1);
        const limit = Math.min(
            Math.max(Number(searchParams.get("limit") || 10), 1),
            50
        );
        const registeredBy = String(searchParams.get("registeredBy") || "").trim();

        const query = {};

        if (user.role !== "admin") {
            query.location = effectiveLocation;
        } else if (requestedLocation) {
            query.location = requestedLocation;
        }

        if (registeredBy && mongoose.Types.ObjectId.isValid(registeredBy)) {
            query.registeredBy = registeredBy;
        }

        const dateFrom = normalizeDateOnly(searchParams.get("dateFrom"));
        const dateTo = normalizeDateOnly(searchParams.get("dateTo"));

        if (dateFrom || dateTo) {
            query.controlDate = {};
            if (dateFrom) query.controlDate.$gte = startOfUtcDay(dateFrom);
            if (dateTo) query.controlDate.$lte = endOfUtcDay(dateTo);
        }

        const skip = (page - 1) * limit;

        const [controls, total] = await Promise.all([
            DailyInventoryControl.find(query)
                .populate("registeredBy", "firstName lastName username role")
                .populate("lastEditedBy", "firstName lastName username role")
                .populate("editHistory.editedBy", "firstName lastName username role")
                .sort({ controlDate: -1, createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            DailyInventoryControl.countDocuments(query),
        ]);

        const formatted = controls.map(formatControl);

        return NextResponse.json(
            {
                success: true,
                data: formatted,
                meta: {
                    page,
                    limit,
                    total,
                    pages: Math.max(Math.ceil(total / limit), 1),
                },
                summary: {
                    total,
                    kitchen: formatted.filter(
                        (control) => control.location === "kitchen"
                    ).length,
                    lounge: formatted.filter(
                        (control) => control.location === "lounge"
                    ).length,
                },
            },
            { status: 200 }
        );
    } catch (error) {
        console.error("GET /api/inventory/daily-controls error:", error);

        return NextResponse.json(
            {
                success: false,
                message: "No se pudo obtener el control diario.",
            },
            { status: 500 }
        );
    }
}

export async function POST(request) {
    const session = await mongoose.startSession();

    try {
        const { user, response } = await requireUserRole(["kitchen", "loung"]);
        if (response) return response;

        await dbConnect();

        const body = await request.json();
        const normalizedDate = normalizeDateOnly(body.date);
        const notes = String(body.notes || "").trim();
        const lines = Array.isArray(body.lines) ? body.lines : [];

        const location = user.role === "kitchen" ? "kitchen" : "lounge";

        if (!location) {
            return NextResponse.json(
                {
                    success: false,
                    message: "La ubicacion del control diario no es valida.",
                },
                { status: 400 }
            );
        }

        if (!normalizedDate) {
            return NextResponse.json(
                {
                    success: false,
                    message: "La fecha del control diario no es válida.",
                },
                { status: 400 }
            );
        }

        const existingControl = await DailyInventoryControl.findOne({
            location,
            controlDate: {
                $gte: startOfUtcDay(normalizedDate),
                $lte: endOfUtcDay(normalizedDate),
            },
        }).lean();

        if (existingControl) {
            return NextResponse.json(
                {
                    success: false,
                    message: "Ya existe un control diario registrado para esta ubicacion y fecha.",
                },
                { status: 409 }
            );
        }

        const meaningfulLines = buildMeaningfulLines(lines);

        if (meaningfulLines.length === 0) {
            return NextResponse.json(
                {
                    success: false,
                    message: "Debes registrar al menos una salida.",
                },
                { status: 400 }
            );
        }

        const previousControl = await DailyInventoryControl.findOne({
            location,
            controlDate: { $lt: normalizedDate },
        })
            .sort({ controlDate: -1, createdAt: -1 })
            .lean();

        const previousClosingMap = new Map(
            (previousControl?.lines || []).map((line) => [
                String(line.productId),
                Number(line.closingQuantity || 0),
            ])
        );

        const productIds = meaningfulLines.map((line) => line.productId);
        const [products, stocks] = await Promise.all([
            Product.find({
                _id: { $in: productIds },
                isActive: true,
                tracksStock: true,
                requiresDailyControl: true,
            }).lean(),
            InventoryStock.find({
                productId: { $in: productIds },
                location,
            }).session(session),
        ]);

        const productMap = new Map(
            products.map((product) => [String(product._id), product])
        );
        const stockMap = new Map(
            stocks.map((stock) => [String(stock.productId), stock])
        );

        const preparedLines = [];

        for (const line of meaningfulLines) {
            const product = productMap.get(line.productId);
            const stock = stockMap.get(line.productId);

            if (!product || !stock) {
                throw new Error(
                    "Uno de los productos del control diario no existe o no tiene stock en la ubicacion."
                );
            }

            const systemQuantityBeforeAdjustment = Number(stock.quantity || 0);
            const totalOut = Number(line.issuedQuantity || 0);

            if (systemQuantityBeforeAdjustment < totalOut) {
                throw new Error(
                    `No hay stock suficiente para registrar la salida de "${product.name}".`
                );
            }

            preparedLines.push({
                productId: product._id,
                productCodeSnapshot: product.code || "",
                productNameSnapshot: product.name,
                unitSnapshot: product.unit,
                systemQuantityBeforeAdjustment,
                openingQuantity: resolveOpeningQuantity(
                    previousClosingMap,
                    product._id,
                    systemQuantityBeforeAdjustment
                ),
                issuedQuantity: Number(line.issuedQuantity || 0),
                closingQuantity: Number(
                    (systemQuantityBeforeAdjustment - totalOut).toFixed(6)
                ),
                note: line.note || "",
            });
        }

        const controlNumber = await generateControlNumber(normalizedDate, location);

        session.startTransaction();

        const [createdControl] = await DailyInventoryControl.create(
            [
                {
                    controlNumber,
                    controlDate: normalizedDate,
                    location,
                    previousControlId: previousControl?._id || null,
                    notes,
                    lines: preparedLines,
                    summary: {
                        productsCount: preparedLines.length,
                        totalIssuedQuantity: Number(
                            preparedLines
                                .reduce(
                                    (sum, line) => sum + Number(line.issuedQuantity || 0),
                                    0
                                )
                                .toFixed(6)
                        ),
                        totalClosingQuantity: Number(
                            preparedLines
                                .reduce(
                                    (sum, line) => sum + Number(line.closingQuantity || 0),
                                    0
                                )
                                .toFixed(6)
                        ),
                    },
                    registeredBy: user.id,
                },
            ],
            { session }
        );

        const movementDate = new Date();
        const movementDocs = [];

        for (const line of preparedLines) {
            const stock = stockMap.get(String(line.productId));
            const totalOut = Number(line.issuedQuantity || 0);

            stock.quantity = Number(
                (Number(stock.quantity || 0) - totalOut).toFixed(6)
            );
            stock.lastMovementAt = movementDate;
            await stock.save({ session });

            if (line.issuedQuantity > 0) {
                movementDocs.push({
                    productId: line.productId,
                    movementType: "adjustment_out",
                    quantity: line.issuedQuantity,
                    unitSnapshot: line.unitSnapshot,
                    fromLocation: location,
                    referenceType: "daily_control",
                    referenceId: createdControl._id,
                    notes:
                        line.note ||
                        `Salida registrada en control diario ${controlNumber}`,
                    performedBy: user.id,
                    movementDate,
                });
            }
        }

        if (movementDocs.length > 0) {
            await InventoryMovement.insertMany(movementDocs, { session });
        }

        await session.commitTransaction();
        session.endSession();

        const savedControl = await DailyInventoryControl.findById(createdControl._id)
            .populate("registeredBy", "firstName lastName username role")
            .populate("lastEditedBy", "firstName lastName username role")
            .populate("editHistory.editedBy", "firstName lastName username role")
            .lean();

        const alertEntries = preparedLines.map((line) => ({
            productId: line.productId,
            product: productMap.get(String(line.productId)) || {},
            deltaQuantity: -Number(line.issuedQuantity || 0),
        }));

        await Promise.all([
            createStockAlertNotifications(alertEntries, {
                excludeUserIds: [user.id],
            }),
        ]).catch((notificationError) => {
            console.error("daily control notification error:", notificationError);
        });

        return NextResponse.json(
            {
                success: true,
                message: "Control diario registrado correctamente.",
                data: formatControl(savedControl),
            },
            { status: 201 }
        );
    } catch (error) {
        await session.abortTransaction().catch(() => {});
        session.endSession();

        console.error("POST /api/inventory/daily-controls error:", error);

        return NextResponse.json(
            {
                success: false,
                message:
                    error.message || "No se pudo registrar el control diario.",
            },
            { status: 500 }
        );
    }
}

export async function PATCH(request) {
    const session = await mongoose.startSession();

    try {
        const { user, response } = await requireUserRole(["kitchen", "loung"]);
        if (response) return response;

        await dbConnect();

        const body = await request.json();
        const notes = String(body.notes || "").trim();
        const lines = Array.isArray(body.lines) ? body.lines : [];
        const location = user.role === "kitchen" ? "kitchen" : "lounge";
        const normalizedDate = normalizeDateOnly(body.date);

        if (!normalizedDate) {
            return NextResponse.json(
                {
                    success: false,
                    message: "La fecha del control diario no es válida.",
                },
                { status: 400 }
            );
        }

        const existingControl = await DailyInventoryControl.findOne({
            location,
            controlDate: {
                $gte: startOfUtcDay(normalizedDate),
                $lte: endOfUtcDay(normalizedDate),
            },
        }).session(session);

        if (!existingControl) {
            return NextResponse.json(
                {
                    success: false,
                    message: "No existe un cierre diario registrado para corregir hoy.",
                },
                { status: 404 }
            );
        }

        const meaningfulLines = buildMeaningfulLines(lines);

        if (meaningfulLines.length === 0) {
            return NextResponse.json(
                {
                    success: false,
                    message: "Debes registrar al menos una salida.",
                },
                { status: 400 }
            );
        }

        const previousControl = await DailyInventoryControl.findOne({
            location,
            controlDate: { $lt: normalizedDate },
        })
            .sort({ controlDate: -1, createdAt: -1 })
            .lean();

        const previousClosingMap = new Map(
            (previousControl?.lines || []).map((line) => [
                String(line.productId),
                Number(line.closingQuantity || 0),
            ])
        );

        const existingLineMap = new Map(
            (existingControl.lines || []).map((line) => [String(line.productId), line])
        );
        const previousIssuedMap = new Map(
            (existingControl.lines || []).map((line) => [
                String(line.productId),
                Number(line.issuedQuantity || 0),
            ])
        );
        const allProductIds = [
            ...new Set([
                ...meaningfulLines.map((line) => line.productId),
                ...Array.from(existingLineMap.keys()),
            ]),
        ];

        const [products, stocks] = await Promise.all([
            Product.find({
                _id: { $in: allProductIds },
                tracksStock: true,
            }).lean(),
            InventoryStock.find({
                productId: { $in: allProductIds },
                location,
            }).session(session),
        ]);

        const productMap = new Map(
            products.map((product) => [String(product._id), product])
        );
        const stockMap = new Map(
            stocks.map((stock) => [String(stock.productId), stock])
        );

        session.startTransaction();

        for (const productId of allProductIds) {
            if (!stockMap.has(String(productId))) {
                const createdStock = new InventoryStock({
                    productId,
                    location,
                    quantity: 0,
                    reservedQuantity: 0,
                    availableQuantity: 0,
                });
                await createdStock.save({ session });
                stockMap.set(String(productId), createdStock);
            }
        }

        const preparedLines = [];
        const movementDate = new Date();

        for (const line of meaningfulLines) {
            const product = productMap.get(line.productId);
            const stock = stockMap.get(line.productId);

            if (!product || !stock) {
                throw new Error(
                    "Uno de los productos del control diario no existe o no tiene stock en la ubicacion."
                );
            }

            const previousLine = existingLineMap.get(line.productId);
            const previousIssued = Number(previousLine?.issuedQuantity || 0);
            const currentStockQuantity = Number(stock.quantity || 0);
            const adjustedSystemQuantity = previousLine
                ? Number(previousLine.systemQuantityBeforeAdjustment || 0)
                : Number((currentStockQuantity + Number(line.issuedQuantity || 0)).toFixed(6));
            const deltaIssued = Number(
                (Number(line.issuedQuantity || 0) - previousIssued).toFixed(6)
            );

            if (deltaIssued > 0 && currentStockQuantity < deltaIssued) {
                throw new Error(
                    `No hay stock suficiente para corregir la salida de "${product.name}".`
                );
            }

            preparedLines.push({
                productId: product._id,
                productCodeSnapshot: product.code || "",
                productNameSnapshot: product.name,
                unitSnapshot: product.unit,
                openingQuantity: resolveOpeningQuantity(
                    previousClosingMap,
                    product._id,
                    adjustedSystemQuantity
                ),
                systemQuantityBeforeAdjustment: adjustedSystemQuantity,
                issuedQuantity: Number(line.issuedQuantity || 0),
                closingQuantity: Number(
                    (adjustedSystemQuantity - Number(line.issuedQuantity || 0)).toFixed(6)
                ),
                note: line.note || "",
            });
        }

        for (const productId of allProductIds) {
            const stock = stockMap.get(String(productId));
            const previousIssued = Number(previousIssuedMap.get(String(productId)) || 0);
            const nextLine = preparedLines.find(
                (line) => String(line.productId) === String(productId)
            );
            const nextIssued = Number(nextLine?.issuedQuantity || 0);
            const deltaIssued = Number((nextIssued - previousIssued).toFixed(6));

            if (deltaIssued === 0) continue;

            stock.quantity = Number((Number(stock.quantity || 0) - deltaIssued).toFixed(6));
            stock.lastMovementAt = movementDate;
            await stock.save({ session });
        }

        await InventoryMovement.deleteMany({
            referenceType: "daily_control",
            referenceId: existingControl._id,
        }).session(session);

        const movementDocs = preparedLines.map((line) => ({
            productId: line.productId,
            movementType: "adjustment_out",
            quantity: line.issuedQuantity,
            unitSnapshot: line.unitSnapshot,
            fromLocation: location,
            referenceType: "daily_control",
            referenceId: existingControl._id,
            notes:
                line.note ||
                `Salida corregida en control diario ${existingControl.controlNumber}`,
            performedBy: user.id,
            movementDate,
        }));

        if (movementDocs.length > 0) {
            await InventoryMovement.insertMany(movementDocs, { session });
        }

        const previousNotes = existingControl.notes || "";
        const previousLines = Array.isArray(existingControl.lines)
            ? existingControl.lines.map((line) => ({
                  productId: line.productId,
                  issuedQuantity: Number(line.issuedQuantity || 0),
                  note: line.note || "",
              }))
            : [];
        const totalIssuedBefore = sumIssued(previousLines);
        const totalIssuedAfter = sumIssued(preparedLines);

        existingControl.notes = notes;
        existingControl.lines = preparedLines;
        existingControl.summary = {
            productsCount: preparedLines.length,
            totalIssuedQuantity: totalIssuedAfter,
            totalClosingQuantity: Number(
                preparedLines
                    .reduce((sum, line) => sum + Number(line.closingQuantity || 0), 0)
                    .toFixed(6)
            ),
        };
        existingControl.lastEditedBy = user.id;
        existingControl.editHistory.push({
            editedBy: user.id,
            previousNotes,
            newNotes: notes,
            totalIssuedBefore,
            totalIssuedAfter,
            changesCount: countChangedLines(previousLines, preparedLines),
            editedAt: movementDate,
        });

        await existingControl.save({ session });

        await session.commitTransaction();
        session.endSession();

        const savedControl = await DailyInventoryControl.findById(existingControl._id)
            .populate("registeredBy", "firstName lastName username role")
            .populate("lastEditedBy", "firstName lastName username role")
            .populate("editHistory.editedBy", "firstName lastName username role")
            .lean();

        const alertEntries = [];
        for (const productId of allProductIds) {
            const previousIssued = Number(previousIssuedMap.get(String(productId)) || 0);
            const nextLine = preparedLines.find(
                (line) => String(line.productId) === String(productId)
            );
            const nextIssued = Number(nextLine?.issuedQuantity || 0);
            const deltaIssued = Number((nextIssued - previousIssued).toFixed(6));

            if (deltaIssued <= 0) continue;

            alertEntries.push({
                productId,
                product: productMap.get(String(productId)) || {},
                deltaQuantity: -deltaIssued,
            });
        }

        if (alertEntries.length > 0) {
            await createStockAlertNotifications(alertEntries, {
                excludeUserIds: [user.id],
            }).catch((notificationError) => {
                console.error("daily control correction notification error:", notificationError);
            });
        }

        return NextResponse.json(
            {
                success: true,
                message: "Control diario corregido correctamente.",
                data: formatControl(savedControl),
            },
            { status: 200 }
        );
    } catch (error) {
        await session.abortTransaction().catch(() => {});
        session.endSession();

        console.error("PATCH /api/inventory/daily-controls error:", error);

        return NextResponse.json(
            {
                success: false,
                message: error.message || "No se pudo corregir el control diario.",
            },
            { status: 500 }
        );
    }
}
