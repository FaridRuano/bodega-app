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
            .populate("productionTemplateId", "name code type baseUnit")
            .populate("relatedRequestId", "requestNumber status")
            .lean();

        if (!production) {
            return notFound("Producción no encontrada.");
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

        if (typeof outputs !== "undefined") {
            if (
                production.templateSnapshot?.allowRealOutputAdjustment === false &&
                Array.isArray(outputs) &&
                outputs.length > 0
            ) {
                return badRequest(
                    "La ficha de producción no permite ajustar los resultados reales."
                );
            }

            const validatedOutputs = await buildValidatedProductionItems(outputs, {
                allowDestination: true,
            });

            production.outputs = validatedOutputs;
        }

        if (typeof byproducts !== "undefined") {
            const validatedByproducts = await buildValidatedProductionItems(
                byproducts,
                {
                    allowDestination: true,
                }
            );

            production.byproducts = validatedByproducts.map((item) => ({
                ...item,
                isByProduct: true,
            }));
        }

        if (typeof waste !== "undefined") {
            const sanitizedWaste = Array.isArray(waste)
                ? waste.filter(
                    (item) =>
                        item &&
                        item.type &&
                        item.unitSnapshot &&
                        item.quantity !== "" &&
                        item.quantity != null &&
                        Number(item.quantity) > 0
                )
                : [];

            production.waste = sanitizedWaste.map((item) => ({
                type: item.type,
                quantity: normalizeNumber(item.quantity),
                unitSnapshot: item.unitSnapshot,
                originKind: item.originKind || "process",
                originProductId:
                    item.originProductId && isValidObjectId(item.originProductId)
                        ? item.originProductId
                        : null,
                originCodeSnapshot: "",
                originNameSnapshot: normalizeText(item.originNameSnapshot, 120),
                originUnitSnapshot: item.originUnitSnapshot || null,
                sourceLocation: item.sourceLocation || "kitchen",
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
                    const product = productMap.get(String(item.productId));

                    if (!product) {
                        throw new Error("Uno de los productos de salida no existe o está inactivo.");
                    }

                    return buildProductionItemSnapshot(
                        product,
                        {
                            ...item,
                            quantity:
                                item.quantity == null
                                    ? 0
                                    : scaleProductionQuantity(item.quantity, factor),
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
                });
        }

        await production.save();

        const updated = await Production.findById(production._id)
            .populate("performedBy", "firstName lastName username role")
            .populate("productionTemplateId", "name code type baseUnit")
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