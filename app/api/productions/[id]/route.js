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

            production.targetQuantity = parsedTargetQuantity;
            shouldRecalculateExpected = true;
        }

        if (typeof targetUnit !== "undefined") {
            if (!PRODUCT_UNITS.includes(targetUnit)) {
                return badRequest("targetUnit no es válido.");
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

            const mergedResults = mergeExecutionResultsWithExpected(
                production,
                validatedResults
            );

            production.outputs = mergedResults.outputs;
            production.byproducts = mergedResults.byproducts;
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
