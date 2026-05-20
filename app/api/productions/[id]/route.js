import dbConnect from "@libs/mongodb";

import Production from "@models/Production";
import { PRODUCT_UNITS } from "@libs/constants/units";
import Product from "@models/Product";
import Request from "@models/Request";
import ProductionTemplate from "@models/ProductionTemplate";

import {
    buildValidatedProductionItems,
    validateStatusForProductionEdit,
    buildProductionItemSnapshot,
    scaleProductionQuantity,
} from "@libs/productionUtils";

import { getAuthenticatedUser } from "@libs/apiAuth";
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
} from "@libs/apiUtils";
import { isValidQuantityForUnit } from "@libs/unitQuantities";

function buildExpectedOutputsFromTemplate(production) {
    const templateOutputs = production?.productionTemplateId?.outputs || [];
    const factor = Number(production?.targetQuantity || 0);

    if (!templateOutputs.length || factor <= 0) {
        return Array.isArray(production?.expectedOutputs) ? production.expectedOutputs : [];
    }

    return templateOutputs
        .filter((item) => !item.isWaste)
        .map((item) => {
            const quantity =
                item.quantity == null
                    ? null
                    : scaleProductionQuantity(item.quantity, factor);

            return {
                productId: item.productId?._id || item.productId || null,
                productCodeSnapshot: item.productCodeSnapshot || item.productId?.code || "",
                productNameSnapshot: item.productNameSnapshot || item.productId?.name || "",
                productTypeSnapshot: item.productTypeSnapshot || item.productId?.productType || "",
                unitSnapshot: item.unitSnapshot || item.unit || item.productId?.unit || "",
                quantity,
                destinationLocation: "kitchen",
                isMain: Boolean(item.isMain),
                isByProduct: Boolean(item.isByProduct),
                notes: item.notes || "",
            };
        });
}

function shouldRefreshExpectedOutputs(production) {
    const current = Array.isArray(production?.expectedOutputs) ? production.expectedOutputs : [];
    const templateOutputs = production?.productionTemplateId?.outputs || [];

    if (!templateOutputs.length) return false;
    if (!current.length) return true;

    const currentByproducts = current.filter((item) => Boolean(item?.isByProduct));
    const templateByproducts = templateOutputs.filter((item) => !item?.isWaste && Boolean(item?.isByProduct));

    if (templateByproducts.length > 0 && currentByproducts.length === 0) {
        return true;
    }

    return current.every((item) => Number(item?.quantity || 0) <= 0);
}

function normalizeExecutionRows(rows = []) {
    if (!Array.isArray(rows) || rows.length === 0) return [];

    if (rows.length === 1) {
        return [
            {
                ...rows[0],
                isMain: true,
                isByProduct: false,
            },
        ];
    }

    let mainIndex = rows.findIndex(
        (item) => Boolean(item?.isMain) && !Boolean(item?.isByProduct)
    );

    if (mainIndex === -1) {
        mainIndex = rows.findIndex((item) => !Boolean(item?.isByProduct));
    }

    if (mainIndex === -1) {
        mainIndex = 0;
    }

    return rows.map((item, index) => ({
        ...item,
        isMain: index === mainIndex,
        isByProduct: index !== mainIndex,
    }));
}

function mergeExecutionResultsWithExpected(
    production,
    incomingResults = []
) {
    const expectedOutputs = Array.isArray(production?.expectedOutputs)
        ? production.expectedOutputs.filter(
              (item) => !item?.isWaste && isValidObjectId(item?.productId)
          )
        : [];
    const normalizedIncomingResults = Array.isArray(incomingResults)
        ? normalizeExecutionRows(
              incomingResults.map((item) => ({
                  ...item,
                  destinationLocation: "kitchen",
                  isMain: Boolean(item.isMain) && !Boolean(item.isByProduct),
                  isByProduct: Boolean(item.isByProduct),
              }))
          )
        : [];

    if (!expectedOutputs.length) {
        return {
            outputs: normalizedIncomingResults
                .filter((item) => !item.isByProduct)
                .map((item) => ({
                    ...item,
                    destinationLocation: "kitchen",
                })),
            byproducts: normalizedIncomingResults
                .filter((item) => item.isByProduct)
                .map((item) => ({
                    ...item,
                    destinationLocation: "kitchen",
                    isMain: false,
                    isByProduct: true,
                })),
        };
    }

    const normalizedExpectedOutputs = normalizeExecutionRows(
        expectedOutputs.map((item) => ({
            ...item,
            destinationLocation: "kitchen",
            isMain: Boolean(item.isMain) && !Boolean(item.isByProduct),
            isByProduct: Boolean(item.isByProduct),
        }))
    );

    const mergedResults = normalizedExpectedOutputs.map((expectedItem) => {
        const expectedId = String(expectedItem.productId);
        const expectedIsByProduct = Boolean(expectedItem.isByProduct);
        const matched = normalizedIncomingResults.find(
            (item) =>
                String(item.productId) === expectedId &&
                Boolean(item.isByProduct) === expectedIsByProduct
        );

        return {
            productId: expectedItem.productId || matched?.productId || null,
            productCodeSnapshot:
                expectedItem.productCodeSnapshot || matched?.productCodeSnapshot || "",
            productNameSnapshot:
                expectedItem.productNameSnapshot || matched?.productNameSnapshot || "",
            productTypeSnapshot:
                expectedItem.productTypeSnapshot || matched?.productTypeSnapshot || "",
            unitSnapshot: expectedItem.unitSnapshot || matched?.unitSnapshot,
            quantity:
                matched?.quantity === null || matched?.quantity === undefined
                    ? Number(expectedItem.quantity || 0)
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
        outputs: [...mergedResults, ...unmatchedIncomingResults].filter(
            (item) => !item.isByProduct
        ),
        byproducts: [...mergedResults, ...unmatchedIncomingResults]
            .filter((item) => item.isByProduct)
            .map((item) => ({
                ...item,
                isMain: false,
                isByProduct: true,
            })),
    };
}

function partitionExecutionResultsFromProduction(production) {
    const explicitOutputs = Array.isArray(production?.outputs) ? production.outputs : [];
    const explicitByproducts = Array.isArray(production?.byproducts)
        ? production.byproducts
        : [];
    const explicitResults = [...explicitOutputs, ...explicitByproducts];

    const normalizedResults = normalizeExecutionRows(
        explicitResults.map((item) => ({
            ...item,
            destinationLocation: "kitchen",
            isMain: Boolean(item.isMain) && !Boolean(item.isByProduct),
            isByProduct: Boolean(item.isByProduct),
        }))
    );

    return {
        outputs: normalizedResults.filter((item) => !item.isByProduct),
        byproducts: normalizedResults
            .filter((item) => item.isByProduct)
            .map((item) => ({
                ...item,
                isMain: false,
                isByProduct: true,
            })),
    };
}

function sanitizePersistableProductionOutputs(rows = []) {
    return (rows || []).filter(
        (item) =>
            item &&
            isValidObjectId(item.productId) &&
            normalizeText(item.productNameSnapshot, 120) &&
            normalizeText(item.unitSnapshot, 40)
    );
}

function partitionValidatedResultsForPersistence(rows = []) {
    const normalizedRows = normalizeExecutionRows(
        (rows || []).map((item) => ({
            ...item,
            destinationLocation: "kitchen",
            isMain: Boolean(item.isMain) && !Boolean(item.isByProduct),
            isByProduct: Boolean(item.isByProduct),
        }))
    );

    return {
        outputs: sanitizePersistableProductionOutputs(
            normalizedRows.filter((item) => !item.isByProduct)
        ),
        byproducts: sanitizePersistableProductionOutputs(
            normalizedRows
                .filter((item) => item.isByProduct)
                .map((item) => ({
                    ...item,
                    isMain: false,
                    isByProduct: true,
                }))
        ),
    };
}

export async function GET(_request, { params }) {
    try {
        await dbConnect();

        const user = await getAuthenticatedUser();
        if (!user?.id) {
            return unauthorized();
        }

        const { id } = await params;

        if (!isValidObjectId(id)) {
            return badRequest("El id de producción no es válido.");
        }

        const production = await Production.findById(id)
            .populate("performedBy", "firstName lastName username role")
            .populate({
                path: "productionTemplateId",
                select: "name code type baseUnit outputs requiresWasteRecord requiresWeightControl defaultDestination",
                populate: {
                    path: "outputs.productId",
                    select: "name code unit",
                },
            })
            .populate("relatedRequestId", "requestNumber status")
            .lean();

        if (!production) {
            return notFound("Producción no encontrada.");
        }

        if (shouldRefreshExpectedOutputs(production)) {
            production.expectedOutputs = buildExpectedOutputsFromTemplate(production);
        }

        return okResponse(production, "Producción obtenida correctamente.");
    } catch (error) {
        return serverError(error, "[PRODUCTION_BY_ID_GET_ERROR]");
    }
}

export async function PATCH(request, { params }) {
    try {
        await dbConnect();

        const user = await getAuthenticatedUser();
        if (!user?.id) {
            return unauthorized();
        }

        const { id } = await params;

        if (!isValidObjectId(id)) {
            return badRequest("El id de producción no es válido.");
        }

        const production = await Production.findById(id);

        if (!production) {
            return notFound("Producción no encontrada.");
        }

        if (!validateStatusForProductionEdit(production.status)) {
            return badRequest(
                "Solo se pueden editar producciones en estado draft o in_progress."
            );
        }

        const body = await request.json();

        const {
            notes,
            targetQuantity,
            targetUnit,
            relatedRequestId,
            inputs,
            results,
            outputs,
            byproducts,
            waste,
        } = body || {};

        if (typeof notes !== "undefined") {
            production.notes = normalizeText(notes, 500);
        }

        let shouldRecalculateExpected = false;
        const effectiveTargetUnit =
            typeof targetUnit !== "undefined" ? targetUnit : production.targetUnit;

        if (typeof targetQuantity !== "undefined") {
            if (production.status !== "draft") {
                return badRequest(
                    "La cantidad objetivo solo puede modificarse mientras la producción esté en borrador."
                );
            }

            const parsedTargetQuantity = normalizeNumber(targetQuantity);

            if (!Number.isFinite(parsedTargetQuantity) || parsedTargetQuantity <= 0) {
                return badRequest("targetQuantity debe ser mayor a 0.");
            }

            if (!isValidQuantityForUnit(parsedTargetQuantity, effectiveTargetUnit)) {
                return badRequest("targetQuantity no cumple la regla de cantidad para esta unidad.");
            }

            production.targetQuantity = parsedTargetQuantity;
            shouldRecalculateExpected = true;
        }

        if (typeof targetUnit !== "undefined") {
            if (!PRODUCT_UNITS.includes(targetUnit)) {
                return badRequest("targetUnit no es válido.");
            }

            if (
                typeof targetQuantity === "undefined" &&
                !isValidQuantityForUnit(production.targetQuantity, effectiveTargetUnit)
            ) {
                return badRequest("targetQuantity no cumple la regla de cantidad para esta unidad.");
            }

            production.targetUnit = targetUnit;
        }

        if (typeof relatedRequestId !== "undefined") {
            if (relatedRequestId === null || relatedRequestId === "") {
                production.relatedRequestId = null;
            } else if (!isValidObjectId(relatedRequestId)) {
                return badRequest("relatedRequestId no es válido.");
            } else {
                production.relatedRequestId = relatedRequestId;
            }
        }

        if (typeof inputs !== "undefined") {
            if (production.status !== "draft") {
                return badRequest(
                    "Los insumos solo pueden modificarse mientras la producción esté en borrador."
                );
            }

            const validatedInputs = await buildValidatedProductionItems(inputs, {
                allowDestination: false,
            });

            production.inputs = validatedInputs;
        }

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

            const persistedResults =
                partitionValidatedResultsForPersistence(validatedResults);
            production.outputs = persistedResults.outputs;
            production.byproducts = persistedResults.byproducts;
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

            const invalidWaste = production.waste.find(
                (item) => !isValidQuantityForUnit(item.quantity, item.unitSnapshot)
            );

            if (invalidWaste) {
                return badRequest("La cantidad de merma/desperdicio debe ser entera para esa unidad.");
            }
        }

        if (shouldRecalculateExpected) {
            const hasRealRecords =
                (production.inputs?.length || 0) > 0 ||
                (production.outputs?.length || 0) > 0 ||
                (production.byproducts?.length || 0) > 0 ||
                (production.waste?.length || 0) > 0;

            if (production.status === "in_progress" && hasRealRecords) {
                return badRequest(
                    "No puedes cambiar la cantidad objetivo después de registrar movimientos reales."
                );
            }

            const template = await ProductionTemplate.findById(
                production.productionTemplateId
            ).lean();

            if (!template) {
                return notFound("La ficha de producción asociada no existe.");
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

            const factor = production.targetQuantity;

            production.expectedInputs = template.inputs.map((item) => {
                const product = productMap.get(String(item.productId));

                if (!product) {
                    throw new Error("Uno de los productos de entrada no existe o está inactivo.");
                }

                return buildProductionItemSnapshot(
                    product,
                    {
                        ...item,
                        quantity: scaleProductionQuantity(item.quantity, factor),
                    }
                );
            });

            production.expectedOutputs = template.outputs
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

                    if (!product) {
                        throw new Error("Uno de los productos de salida no existe o est? inactivo.");
                    }

                    return buildProductionItemSnapshot(
                        product,
                        {
                            ...item,
                            quantity,
                        },
                        {
                            destinationLocation: "kitchen",
                            isMain: Boolean(item.isMain),
                            isByProduct: Boolean(item.isByProduct),
                        }
                    );
                })
                .filter(Boolean);

        }

        await production.save();

        const updated = await Production.findById(production._id)
            .populate("performedBy", "firstName lastName username role")
            .populate({
                path: "productionTemplateId",
                select: "name code type baseUnit outputs requiresWasteRecord requiresWeightControl defaultDestination",
                populate: {
                    path: "outputs.productId",
                    select: "name code unit",
                },
            })
            .populate("relatedRequestId", "requestNumber status")
            .lean();

        return okResponse(updated, "Producción actualizada correctamente.");
    } catch (error) {
        return serverError(error, "[PRODUCTION_BY_ID_PATCH_ERROR]");
    }
}

export async function DELETE(_request, { params }) {
    try {
        await dbConnect();

        const user = await getAuthenticatedUser();
        if (!user?.id) {
            return unauthorized();
        }

        const { id } = await params;

        if (!isValidObjectId(id)) {
            return badRequest("El id de producción no es válido.");
        }

        const production = await Production.findById(id);

        if (!production) {
            return notFound("Producción no encontrada.");
        }

        if (production.status !== "draft") {
            return badRequest(
                "Solo se pueden eliminar producciones en estado draft."
            );
        }

        await Production.findByIdAndDelete(id);

        return okResponse(
            { _id: id },
            "Borrador de producción eliminado correctamente."
        );
    } catch (error) {
        return serverError(error, "[PRODUCTION_BY_ID_DELETE_ERROR]");
    }
}
