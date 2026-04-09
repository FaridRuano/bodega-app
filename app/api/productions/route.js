import mongoose from "mongoose";
import dbConnect from "@libs/mongodb";
import Production from "@models/Production";
import ProductionTemplate from "@models/ProductionTemplate";
import Product from "@models/Product";
import InventoryStock from "@models/InventoryStock";
import InventoryMovement from "@models/InventoryMovement";
import { PRODUCT_UNITS } from "@libs/constants/units";

import { requireAuthenticatedUser, requireUserRole } from "@libs/apiAuth";
import {
    badRequest,
    notFound,
    okResponse,
    serverError,
    unauthorized,
} from "@libs/apiResponses";
import {
    isValidObjectId,
    normalizeNumber,
    normalizeText,
    parsePositiveNumber,
} from "@libs/apiUtils";
import {
    buildProductionSearchFilter,
    buildProductionItemSnapshot,
    generateProductionNumber,
    scaleProductionQuantity,
} from "@libs/productionUtils";

export async function GET(request) {
    try {
        const { response } = await requireAuthenticatedUser();
        if (response) return response;

        await dbConnect();

        const { searchParams } = new URL(request.url);

        const hasPagination = searchParams.has("page") || searchParams.has("limit");
        const page = parsePositiveNumber(searchParams.get("page"), 1);
        const limit = parsePositiveNumber(searchParams.get("limit"), 10);

        const status = searchParams.get("status");
        const productionType = searchParams.get("productionType");
        const performedBy = searchParams.get("performedBy");
        const dateFrom = searchParams.get("dateFrom");
        const dateTo = searchParams.get("dateTo");
        const search = searchParams.get("search");

        const filter = {};

        if (status) filter.status = status;
        if (productionType) filter.productionType = productionType;

        if (performedBy && isValidObjectId(performedBy)) {
            filter.performedBy = performedBy;
        }

        if (dateFrom || dateTo) {
            filter.createdAt = {};

            if (dateFrom) {
                const from = new Date(dateFrom);
                if (!Number.isNaN(from.getTime())) {
                    filter.createdAt.$gte = from;
                }
            }

            if (dateTo) {
                const to = new Date(dateTo);
                if (!Number.isNaN(to.getTime())) {
                    to.setHours(23, 59, 59, 999);
                    filter.createdAt.$lte = to;
                }
            }

            if (Object.keys(filter.createdAt).length === 0) {
                delete filter.createdAt;
            }
        }

        const searchFilter = buildProductionSearchFilter(search);

        const finalFilter = searchFilter
            ? { $and: [filter, searchFilter] }
            : filter;

        const skip = (page - 1) * limit;

        const [items, total, draft, inProgress, completed, cancelled] = await Promise.all([
            Production.find(finalFilter)
                .populate("performedBy", "firstName lastName username role")
                .populate("productionTemplateId", "name code type")
                .sort({ createdAt: -1 })
                .skip(hasPagination ? skip : 0)
                .limit(hasPagination ? limit : 1000)
                .lean(),
            Production.countDocuments(finalFilter),
            Production.countDocuments({ ...(searchFilter ? { $and: [{ status: "draft" }, searchFilter] } : { status: "draft" }), ...(!searchFilter ? filter : {}) }),
            Production.countDocuments({ ...(searchFilter ? { $and: [{ status: "in_progress" }, searchFilter] } : { status: "in_progress" }), ...(!searchFilter ? filter : {}) }),
            Production.countDocuments({ ...(searchFilter ? { $and: [{ status: "completed" }, searchFilter] } : { status: "completed" }), ...(!searchFilter ? filter : {}) }),
            Production.countDocuments({ ...(searchFilter ? { $and: [{ status: "cancelled" }, searchFilter] } : { status: "cancelled" }), ...(!searchFilter ? filter : {}) }),
        ]);

        return okResponse(
            {
                items,
                meta: {
                    page,
                    limit: hasPagination ? limit : items.length,
                    total,
                    pages: hasPagination ? Math.max(Math.ceil(total / limit), 1) : 1,
                },
                summary: {
                    total,
                    draft,
                    inProgress,
                    completed,
                    cancelled,
                },
            },
            "Producciones obtenidas correctamente."
        );
    } catch (error) {
        return serverError(error, "[PRODUCTIONS_GET_ROUTE_ERROR]");
    }
}

export async function POST(request) {
    let session = null;

    try {
        const { user, response } = await requireUserRole(["admin", "kitchen"]);
        if (response) return response;

        await dbConnect();

        const body = await request.json();

        const {
            productionTemplateId,
            targetQuantity,
            targetUnit,
            notes = "",
            relatedRequestId = null,
            status = "draft",
        } = body || {};

        if (!productionTemplateId) {
            return badRequest("productionTemplateId es requerido.");
        }

        if (!isValidObjectId(productionTemplateId)) {
            return badRequest("productionTemplateId no es válido.");
        }

        const allowedCreationStatuses = ["draft", "in_progress"];

        if (!allowedCreationStatuses.includes(status)) {
            return badRequest("status no es válido para crear una producción.");
        }

        const parsedTargetQuantity = normalizeNumber(targetQuantity);

        if (!Number.isFinite(parsedTargetQuantity) || parsedTargetQuantity <= 0) {
            return badRequest("targetQuantity debe ser un número mayor a 0.");
        }

        if (!targetUnit || !PRODUCT_UNITS.includes(targetUnit)) {
            return badRequest("targetUnit no es válido.");
        }

        const template = await ProductionTemplate.findOne({
            _id: productionTemplateId,
            isActive: true,
        }).lean();

        if (!template) {
            return notFound("La ficha de producción no existe o está inactiva.");
        }

        if (template.baseUnit !== targetUnit) {
            return badRequest(
                `La unidad objetivo debe coincidir con la unidad base de la ficha (${template.baseUnit}).`
            );
        }

        const allProductIds = [
            ...template.inputs.map((item) => String(item.productId)),
            ...template.outputs.map((item) => String(item.productId)),
        ];

        const uniqueProductIds = [...new Set(allProductIds)];

        const products = await Product.find({
            _id: { $in: uniqueProductIds },
            isActive: true,
        }).lean();

        const productMap = new Map(
            products.map((product) => [String(product._id), product])
        );

        for (const input of template.inputs) {
            const product = productMap.get(String(input.productId));

            if (!product) {
                return badRequest(
                    "Uno de los productos de entrada no existe o está inactivo."
                );
            }

            if (!product.tracksStock) {
                return badRequest(
                    `El producto de entrada "${product.name}" no maneja stock.`
                );
            }
        }

        for (const output of template.outputs) {
            const product = productMap.get(String(output.productId));

            if (!product) {
                return badRequest(
                    "Uno de los productos de salida no existe o está inactivo."
                );
            }
        }

        const factor = parsedTargetQuantity;

        const expectedInputs = template.inputs.map((item) => {
            const product = productMap.get(String(item.productId));

            return buildProductionItemSnapshot(
                product,
                {
                    ...item,
                    quantity: scaleProductionQuantity(item.quantity, factor),
                }
            );
        });

        const expectedOutputs = template.outputs
            .filter((item) => !item.isWaste)
            .map((item) => {
                const quantity =
                    item.quantity == null
                        ? null
                        : scaleProductionQuantity(item.quantity, factor);

                if (!Number.isFinite(quantity) || quantity <= 0) {
                    return null;
                }

                const product = productMap.get(String(item.productId));

                return buildProductionItemSnapshot(
                    product,
                    {
                        ...item,
                        quantity,
                    },
                    {
                        destinationLocation:
                            template.defaultDestination === "none"
                                ? "kitchen"
                                : template.defaultDestination,
                        isMain: Boolean(item.isMain),
                        isByProduct: Boolean(item.isByProduct),
                    }
                );
            })
            .filter(Boolean);

        if (status === "in_progress") {
            const inputProductIds = [
                ...new Set(expectedInputs.map((item) => String(item.productId))),
            ];

            const kitchenStocks = await InventoryStock.find({
                productId: { $in: inputProductIds },
                location: "kitchen",
            }).lean();

            const stockMap = new Map(
                kitchenStocks.map((stock) => [String(stock.productId), stock])
            );

            const insufficientInputs = expectedInputs
                .map((input) => {
                    const stock = stockMap.get(String(input.productId));
                    const requiredQuantity = Number(input.quantity || 0);
                    const availableQuantity = Number(stock?.availableQuantity || 0);

                    if (availableQuantity >= requiredQuantity) {
                        return null;
                    }

                    return `${input.productNameSnapshot} (${availableQuantity}/${requiredQuantity})`;
                })
                .filter(Boolean);

            if (insufficientInputs.length > 0) {
                return badRequest(
                    `No es posible iniciar la producción porque cocina no tiene inventario suficiente para: ${insufficientInputs.join(", ")}.`
                );
            }
        }

        session = await mongoose.startSession();

        let created = null;

        await session.withTransaction(async () => {
            const movementDate = new Date();

            const createdDocs = await Production.create(
                [
                    {
                        productionNumber: generateProductionNumber(),
                        productionTemplateId: template._id,

                        templateSnapshot: {
                            code: template.code || "",
                            name: template.name,
                            type: template.type,
                            baseUnit: template.baseUnit,
                            expectedYield: template.expectedYield ?? null,
                            expectedWaste: template.expectedWaste ?? null,
                            defaultDestination: template.defaultDestination || "kitchen",
                            allowsMultipleOutputs: Boolean(template.allowsMultipleOutputs),
                            requiresWasteRecord: Boolean(template.requiresWasteRecord),
                            allowRealOutputAdjustment: Boolean(template.allowRealOutputAdjustment),
                        },

                        productionType: template.type || "generic",
                        status,
                        location: "kitchen",

                        targetQuantity: parsedTargetQuantity,
                        targetUnit,

                        performedBy: user.id,
                        relatedRequestId:
                            relatedRequestId && isValidObjectId(relatedRequestId)
                                ? relatedRequestId
                                : null,

                        expectedInputs,
                        expectedOutputs,

                        inputs:
                            status === "in_progress"
                                ? expectedInputs.map((item) => ({
                                    productId: item.productId,
                                    productCodeSnapshot: item.productCodeSnapshot || "",
                                    productNameSnapshot: item.productNameSnapshot || "Producto",
                                    productTypeSnapshot: item.productTypeSnapshot || "",
                                    unitSnapshot: item.unitSnapshot,
                                    quantity: Number(item.quantity || 0),
                                    notes: item.notes || "",
                                }))
                                : [],
                        outputs: [],
                        byproducts: [],
                        waste: [],

                        notes: normalizeText(notes, 500),
                        startedAt: status === "in_progress" ? movementDate : null,
                        completedAt: null,
                        cancelledAt: null,
                    },
                ],
                { session }
            );

            const productionDoc = createdDocs[0];

            if (status === "in_progress") {
                for (const input of expectedInputs) {
                    const stock = await InventoryStock.findOne({
                        productId: input.productId,
                        location: "kitchen",
                    }).session(session);

                    if (!stock) {
                        throw new Error("__STOCK_NOT_FOUND__");
                    }

                    if (Number(stock.availableQuantity || 0) < Number(input.quantity || 0)) {
                        throw new Error("__INSUFFICIENT_STOCK_AT_COMMIT__");
                    }

                    stock.quantity = Number(
                        (Number(stock.quantity || 0) - Number(input.quantity || 0)).toFixed(6)
                    );
                    stock.lastMovementAt = movementDate;

                    await stock.save({ session });
                }

                const movementDocs = expectedInputs.map((input) => ({
                    productId: input.productId,
                    movementType: "production_consumption",
                    quantity: Number(input.quantity || 0),
                    unitSnapshot: input.unitSnapshot,
                    fromLocation: "kitchen",
                    toLocation: undefined,
                    referenceType: "production",
                    referenceId: productionDoc._id,
                    notes: normalizeText(
                        `Consumo automático al iniciar la producción ${productionDoc.productionNumber}`.trim(),
                        500
                    ),
                    performedBy: user.id,
                    movementDate,
                }));

                if (movementDocs.length > 0) {
                    await InventoryMovement.insertMany(movementDocs, { session });
                }
            }

            created = await Production.findById(productionDoc._id)
                .populate("performedBy", "firstName lastName username role")
                .populate("productionTemplateId", "name code type")
                .session(session)
                .lean();
        });

        return okResponse(
            created,
            status === "draft"
                ? "Producción creada correctamente en borrador."
                : "Producción iniciada correctamente.",
            201
        );
    } catch (error) {
        if (error?.message === "__STOCK_NOT_FOUND__") {
            return badRequest(
                "No es posible iniciar la producción porque cocina no tiene inventario suficiente para los insumos requeridos."
            );
        }

        if (error?.message === "__INSUFFICIENT_STOCK_AT_COMMIT__") {
            return badRequest(
                "No es posible iniciar la producción porque el inventario de cocina cambió y ya no alcanza para los insumos requeridos."
            );
        }

        return serverError(error, "[PRODUCTIONS_POST_ROUTE_ERROR]");
    } finally {
        if (session) {
            await session.endSession();
        }
    }
}
