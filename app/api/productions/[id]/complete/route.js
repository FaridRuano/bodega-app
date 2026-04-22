import mongoose from "mongoose";

import dbConnect from "@libs/mongodb";

import Production from "@models/Production";
import Product from "@models/Product";
import InventoryStock from "@models/InventoryStock";
import InventoryMovement from "@models/InventoryMovement";
import { buildValidatedProductionItems } from "@libs/productionUtils";

import { requireUserRole } from "@libs/apiAuth";
import {
    createNotificationsForRoles,
    createStockAlertNotifications,
    NOTIFICATION_TYPES,
} from "@libs/notifications";
import {
    badRequest,
    notFound,
    okResponse,
    serverError,
} from "@libs/apiResponses";
import { isValidObjectId, normalizeNumber, normalizeText } from "@libs/apiUtils";

function groupItemsByProductAndLocation(items = [], getLocation) {
    const grouped = new Map();

    for (const item of items) {
        const location = getLocation(item);
        const key = `${String(item.productId)}::${location}`;

        if (!grouped.has(key)) {
            grouped.set(key, {
                productId: item.productId,
                location,
                quantity: 0,
                unitSnapshot: item.unitSnapshot,
                items: [],
            });
        }

        const current = grouped.get(key);
        current.quantity += Number(item.quantity || 0);
        current.items.push(item);
    }

    return Array.from(grouped.values()).map((entry) => ({
        ...entry,
        quantity: Number(entry.quantity.toFixed(6)),
    }));
}

function buildFallbackRows(items = [], predicate = () => true) {
    return (items || [])
        .filter((item) => predicate(item) && Number(item.quantity || 0) > 0)
        .map((item) => ({
            productId: item.productId,
            unitSnapshot: item.unitSnapshot,
            quantity: Number(item.quantity || 0),
            destinationLocation: item.destinationLocation || "warehouse",
            isMain: Boolean(item.isMain),
            isByProduct: Boolean(item.isByProduct),
            notes: item.notes || "",
        }));
}

function partitionProductionResults(production) {
    const expectedOutputs = Array.isArray(production.expectedOutputs)
        ? production.expectedOutputs
        : [];

    const explicitOutputs = Array.isArray(production.outputs) ? production.outputs : [];
    const explicitByproducts = Array.isArray(production.byproducts)
        ? production.byproducts
        : [];

    const explicitResults = [...explicitOutputs, ...explicitByproducts];

    const baseResults =
        explicitResults.length > 0
            ? explicitResults
            : buildFallbackRows(expectedOutputs, () => true);

    const normalizedResults = (baseResults || []).map((item) => ({
        ...item,
        destinationLocation: "kitchen",
        isMain: Boolean(item.isMain) && !Boolean(item.isByProduct),
        isByProduct: Boolean(item.isByProduct),
    }));

    return {
        outputRows: normalizedResults.filter((item) => !item.isByProduct),
        byproductRows: normalizedResults.filter((item) => item.isByProduct),
    };
}

function mergeExecutionResultsWithExpected(
    production,
    incomingResults = []
) {
    const expectedOutputs = Array.isArray(production?.expectedOutputs)
        ? production.expectedOutputs.filter((item) => !item?.isWaste)
        : [];
    const normalizedIncomingResults = Array.isArray(incomingResults)
        ? incomingResults.map((item) => ({
              ...item,
              destinationLocation: "kitchen",
              isMain: Boolean(item.isMain) && !Boolean(item.isByProduct),
              isByProduct: Boolean(item.isByProduct),
          }))
        : [];

    if (!expectedOutputs.length) {
        return {
            outputRows: normalizedIncomingResults
                .filter((item) => !item.isByProduct)
                .map((item) => ({
                    ...item,
                    destinationLocation: "kitchen",
                })),
            byproductRows: normalizedIncomingResults
                .filter((item) => item.isByProduct)
                .map((item) => ({
                    ...item,
                    destinationLocation: "kitchen",
                    isMain: false,
                    isByProduct: true,
                })),
        };
    }

    const mergedResults = expectedOutputs.map((expectedItem) => {
        const expectedId = String(expectedItem.productId);
        const expectedIsByProduct = Boolean(expectedItem.isByProduct);
        const matched = normalizedIncomingResults.find(
            (item) =>
                String(item.productId) === expectedId &&
                Boolean(item.isByProduct) === expectedIsByProduct
        );

        return {
            productId: expectedItem.productId,
            productCodeSnapshot: expectedItem.productCodeSnapshot || "",
            productNameSnapshot: expectedItem.productNameSnapshot || "",
            productTypeSnapshot: expectedItem.productTypeSnapshot || "",
            unitSnapshot: expectedItem.unitSnapshot,
            quantity:
                matched?.quantity === null || matched?.quantity === undefined
                    ? 0
                    : Number(matched.quantity),
            recordedWeight:
                matched?.recordedWeight === null ||
                matched?.recordedWeight === undefined
                    ? null
                    : Number(matched.recordedWeight),
            destinationLocation: "kitchen",
            isMain: Boolean(expectedItem.isMain) && !expectedIsByProduct,
            isByProduct: expectedIsByProduct,
            notes: matched?.notes || expectedItem.notes || "",
        };
    });

    const mergedKeys = new Set(
        mergedResults.map(
            (item) => `${String(item.productId)}::${Boolean(item.isByProduct)}`
        )
    );

    const unmatchedIncomingResults = normalizedIncomingResults.filter((item) => {
        const key = `${String(item.productId)}::${Boolean(item.isByProduct)}`;
        return !mergedKeys.has(key);
    });

    return {
        outputRows: [...mergedResults, ...unmatchedIncomingResults].filter(
            (item) => !item.isByProduct
        ),
        byproductRows: [...mergedResults, ...unmatchedIncomingResults]
            .filter((item) => item.isByProduct)
            .map((item) => ({
                ...item,
                isMain: false,
                isByProduct: true,
            })),
    };
}

export async function POST(request, { params }) {
    const session = await mongoose.startSession();

    try {
        await dbConnect();

        const { user, response } = await requireUserRole(["admin", "kitchen"]);
        if (response) return response;

        const { id } = await params;

        if (!isValidObjectId(id)) {
            return badRequest("El id de producción no es válido.");
        }

        session.startTransaction();

        const production = await Production.findById(id).session(session);

        if (!production) {
            await session.abortTransaction();
            session.endSession();
            return notFound("Producción no encontrada.");
        }

        if (production.status !== "in_progress") {
            await session.abortTransaction();
            session.endSession();
            return badRequest(
                "Solo se pueden completar producciones en estado in_progress."
            );
        }

        if (!Array.isArray(production.inputs) || production.inputs.length === 0) {
            await session.abortTransaction();
            session.endSession();
            return badRequest(
                "La producción debe tener insumos consumidos antes de completarse."
            );
        }
        let body = {};

        try {
            body = await request.json();
        } catch {
            body = {};
        }

        const { results, outputs, byproducts, waste } = body || {};

        if (
            typeof results !== "undefined" ||
            typeof outputs !== "undefined" ||
            typeof byproducts !== "undefined"
        ) {
            const rawResults =
                typeof results !== "undefined"
                    ? results
                    : [
                          ...(Array.isArray(outputs)
                              ? outputs.map((item) => ({
                                    ...item,
                                    isByProduct: false,
                                }))
                              : []),
                          ...(Array.isArray(byproducts)
                              ? byproducts.map((item) => ({
                                    ...item,
                                    isMain: false,
                                    isByProduct: true,
                                }))
                              : []),
                      ];

            const validatedResults = await buildValidatedProductionItems(rawResults, {
                allowDestination: true,
            });

            const mergedResults = mergeExecutionResultsWithExpected(
                production,
                validatedResults
            );

            production.outputs =
                mergedResults.outputRows || mergedResults.outputs || [];
            production.byproducts =
                mergedResults.byproductRows || mergedResults.byproducts || [];
        }

        if (typeof waste !== "undefined") {
            const sanitizedWaste = Array.isArray(waste)
                ? waste.filter(
                    (item) =>
                        item &&
                        item.quantity !== "" &&
                        item.quantity != null &&
                        Number(item.quantity) > 0
                )
                : [];

            production.waste = sanitizedWaste.map((item) => ({
                type: item.type || "desperdicio",
                quantity: normalizeNumber(item.quantity),
                unitSnapshot: item.unitSnapshot || "kg",
                originKind: item.originKind || "process",
                originProductId:
                    item.originProductId && isValidObjectId(item.originProductId)
                        ? item.originProductId
                        : null,
                originCodeSnapshot: "",
                originNameSnapshot: normalizeText(item.originNameSnapshot, 120),
                originUnitSnapshot: item.originUnitSnapshot || null,
                sourceLocation: item.sourceLocation || production.location || "kitchen",
                notes: normalizeText(item.notes, 250),
            }));
        }

        const {
            outputRows: fixedOutputRows,
            byproductRows: fixedByproductRows,
        } = partitionProductionResults(production);

        const positiveOutputRows = fixedOutputRows.filter(
            (item) => Number(item.quantity || 0) > 0
        );
        const positiveByproductRows = fixedByproductRows.filter(
            (item) => Number(item.quantity || 0) > 0
        );
        if (
            (!Array.isArray(fixedOutputRows) && !Array.isArray(fixedByproductRows)) ||
            positiveOutputRows.length === 0
        ) {
            await session.abortTransaction();
            session.endSession();
            return badRequest(
                "Debes registrar una cantidad mayor a 0 para el resultado principal."
            );
        }

        if (
            production.templateSnapshot?.requiresWasteRecord &&
            (!Array.isArray(production.waste) || production.waste.length === 0)
        ) {
            await session.abortTransaction();
            session.endSession();
            return badRequest(
                "Esta producción requiere registrar el desperdicio total."
            );
        }

        const groupedOutputs = groupItemsByProductAndLocation(
            positiveOutputRows,
            (item) => item.destinationLocation || "warehouse"
        );

        const groupedByproducts = groupItemsByProductAndLocation(
            positiveByproductRows,
            (item) => item.destinationLocation || "warehouse"
        );

        const movementDate = new Date();

        for (const output of groupedOutputs) {
            let stock = await InventoryStock.findOne({
                productId: output.productId,
                location: output.location,
            }).session(session);

            if (!stock) {
                const createdStocks = await InventoryStock.create(
                    [
                        {
                            productId: output.productId,
                            location: output.location,
                            quantity: 0,
                            reservedQuantity: 0,
                            availableQuantity: 0,
                            lastMovementAt: null,
                        },
                    ],
                    { session }
                );

                stock = createdStocks[0];
            }

            stock.quantity = Number(
                (Number(stock.quantity || 0) + output.quantity).toFixed(6)
            );
            stock.lastMovementAt = movementDate;

            await stock.save({ session });

            await InventoryMovement.create(
                [
                    {
                        productId: output.productId,
                        movementType: "production_output",
                        quantity: output.quantity,
                        unitSnapshot: output.unitSnapshot,
                        fromLocation: undefined,
                        toLocation: output.location,
                        referenceType: "production",
                        referenceId: production._id,
                        notes: `Resultado de producción ${production.productionNumber}`,
                        performedBy: user.id,
                        movementDate,
                    },
                ],
                { session }
            );
        }

        for (const byproduct of groupedByproducts) {
            let stock = await InventoryStock.findOne({
                productId: byproduct.productId,
                location: byproduct.location,
            }).session(session);

            if (!stock) {
                const createdStocks = await InventoryStock.create(
                    [
                        {
                            productId: byproduct.productId,
                            location: byproduct.location,
                            quantity: 0,
                            reservedQuantity: 0,
                            availableQuantity: 0,
                            lastMovementAt: null,
                        },
                    ],
                    { session }
                );

                stock = createdStocks[0];
            }

            stock.quantity = Number(
                (Number(stock.quantity || 0) + byproduct.quantity).toFixed(6)
            );
            stock.lastMovementAt = movementDate;

            await stock.save({ session });

            await InventoryMovement.create(
                [
                    {
                        productId: byproduct.productId,
                        movementType: "production_output",
                        quantity: byproduct.quantity,
                        unitSnapshot: byproduct.unitSnapshot,
                        fromLocation: undefined,
                        toLocation: byproduct.location,
                        referenceType: "production",
                        referenceId: production._id,
                        notes: `Subproducto generado por producción ${production.productionNumber}`,
                        performedBy: user.id,
                        movementDate,
                    },
                ],
                { session }
            );
        }

        // Registrar merma/desperdicio como movimiento, sin afectar stock adicional
        for (const wasteItem of production.waste || []) {
            await InventoryMovement.create(
                [
                    {
                        productId: wasteItem.originProductId || production.inputs?.[0]?.productId,
                        movementType: "waste",
                        quantity: Number(wasteItem.quantity || 0),
                        unitSnapshot: wasteItem.unitSnapshot,
                        fromLocation: wasteItem.sourceLocation || "kitchen",
                        toLocation: undefined,
                        referenceType: "production",
                        referenceId: production._id,
                        notes:
                            wasteItem.notes ||
                            `Registro de desperdicio en producción ${production.productionNumber}`,
                        performedBy: user.id,
                        movementDate,
                    },
                ],
                { session }
            );
        }

        production.status = "completed";
        production.completedAt = movementDate;
        production.outputs = fixedOutputRows;
        production.byproducts = fixedByproductRows;

        if (!production.startedAt) {
            production.startedAt = movementDate;
        }

        await production.save({ session });

        await session.commitTransaction();
        session.endSession();

        const completed = await Production.findById(production._id)
            .populate("performedBy", "firstName lastName username role")
            .populate("productionTemplateId", "name code type baseUnit")
            .populate("relatedRequestId", "requestNumber status")
            .lean();

        const affectedEntries = [...groupedOutputs, ...groupedByproducts].filter(
            (entry) => entry.location
        );
        const affectedProductIds = Array.from(
            new Set(affectedEntries.map((entry) => String(entry.productId)))
        );
        const affectedLocations = Array.from(
            new Set(affectedEntries.map((entry) => String(entry.location)))
        );

        const [affectedProducts, affectedStocks] = await Promise.all([
            Product.find({ _id: { $in: affectedProductIds } })
                .select("name minStock reorderPoint")
                .lean(),
            InventoryStock.find({
                productId: { $in: affectedProductIds },
                location: { $in: affectedLocations },
            }).lean(),
        ]);

        const affectedProductMap = new Map(
            affectedProducts.map((product) => [String(product._id), product])
        );
        const affectedStockMap = new Map(
            affectedStocks.map((stock) => [
                `${String(stock.productId)}::${String(stock.location)}`,
                stock,
            ])
        );

        const alertEntries = affectedEntries.map((entry) => {
            const stock = affectedStockMap.get(
                `${String(entry.productId)}::${String(entry.location)}`
            );

            return {
                productId: entry.productId,
                product: affectedProductMap.get(String(entry.productId)) || {},
                location: entry.location,
                quantity: Number(stock?.quantity || 0),
            };
        });

        await Promise.all([
            createNotificationsForRoles(["admin"], {
                type: NOTIFICATION_TYPES.production_completed,
                title: "Produccion completada",
                message: `${completed?.productionNumber || "Una produccion"} ya fue completada.`,
                href: "/dashboard/production?status=completed",
                entityType: "production",
                entityId: completed?._id,
                priority: "normal",
            }),
            createStockAlertNotifications(alertEntries),
        ]).catch((notificationError) => {
            console.error("production completed notification error:", notificationError);
        });

        return okResponse(
            completed,
            "Producción completada correctamente."
        );
    } catch (error) {
        await session.abortTransaction();
        session.endSession();
        return serverError(error, "[PRODUCTION_COMPLETE_ROUTE_ERROR]");
    }
}
