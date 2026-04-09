import mongoose from "mongoose";

import dbConnect from "@libs/mongodb";

import Production from "@models/Production";
import InventoryStock from "@models/InventoryStock";
import InventoryMovement from "@models/InventoryMovement";

import { requireUserRole } from "@libs/apiAuth";
import {
    badRequest,
    notFound,
    okResponse,
    serverError,
} from "@libs/apiResponses";
import { isValidObjectId } from "@libs/apiUtils";

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

export async function POST(_request, { params }) {
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
        const outputRows =
            Array.isArray(production.outputs) && production.outputs.length > 0
                ? production.outputs
                : buildFallbackRows(
                    production.expectedOutputs,
                    (item) => !item.isByProduct
                );

        const byproductRows =
            Array.isArray(production.byproducts) && production.byproducts.length > 0
                ? production.byproducts
                : buildFallbackRows(
                    production.expectedOutputs,
                    (item) => item.isByProduct
                );

        if (!Array.isArray(outputRows) || outputRows.length === 0) {
            await session.abortTransaction();
            session.endSession();
            return badRequest(
                "Debes registrar al menos un resultado para completar."
            );
        }

        if (
            production.templateSnapshot?.requiresWasteRecord &&
            (!Array.isArray(production.waste) || production.waste.length === 0)
        ) {
            await session.abortTransaction();
            session.endSession();
            return badRequest(
                "Esta producción requiere registrar merma o desperdicio."
            );
        }

        const groupedOutputs = groupItemsByProductAndLocation(
            outputRows,
            (item) => item.destinationLocation || "warehouse"
        );

        const groupedByproducts = groupItemsByProductAndLocation(
            byproductRows,
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
                            `Registro de ${wasteItem.type} en producción ${production.productionNumber}`,
                        performedBy: user.id,
                        movementDate,
                    },
                ],
                { session }
            );
        }

        production.status = "completed";
        production.completedAt = movementDate;
        production.outputs = outputRows;
        production.byproducts = byproductRows;
        production.outputs = outputRows;
        production.byproducts = byproductRows;
        production.outputs = outputRows;
        production.byproducts = byproductRows;

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