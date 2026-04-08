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

function groupInputs(items = []) {
    const grouped = new Map();

    for (const item of items) {
        const key = String(item.productId);

        if (!grouped.has(key)) {
            grouped.set(key, {
                productId: item.productId,
                quantity: 0,
                unitSnapshot: item.unitSnapshot,
                productNameSnapshot: item.productNameSnapshot || "Producto",
            });
        }

        const current = grouped.get(key);
        current.quantity += Number(item.quantity || 0);
    }

    return Array.from(grouped.values()).map((entry) => ({
        ...entry,
        quantity: Number(entry.quantity.toFixed(6)),
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

        if (production.status === "completed") {
            await session.abortTransaction();
            session.endSession();
            return badRequest(
                "No se puede cancelar una producción completada."
            );
        }

        if (production.status === "cancelled") {
            await session.abortTransaction();
            session.endSession();
            return badRequest(
                "La producción ya se encuentra cancelada."
            );
        }

        const movementDate = new Date();

        if (production.status === "in_progress") {
            const grouped = groupInputs(production.inputs || []);

            for (const input of grouped) {
                let stock = await InventoryStock.findOne({
                    productId: input.productId,
                    location: "kitchen",
                }).session(session);

                if (!stock) {
                    const createdStocks = await InventoryStock.create(
                        [
                            {
                                productId: input.productId,
                                location: "kitchen",
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
                    (Number(stock.quantity || 0) + input.quantity).toFixed(6)
                );
                stock.lastMovementAt = movementDate;

                await stock.save({ session });

                await InventoryMovement.create(
                    [
                        {
                            productId: input.productId,
                            movementType: "adjustment_in",
                            quantity: input.quantity,
                            unitSnapshot: input.unitSnapshot,
                            fromLocation: undefined,
                            toLocation: "kitchen",
                            referenceType: "production",
                            referenceId: production._id,
                            notes: `Devolución de insumos por cancelación de producción ${production.productionNumber}`,
                            performedBy: user.id,
                            movementDate,
                        },
                    ],
                    { session }
                );
            }
        }

        production.status = "cancelled";
        production.cancelledAt = movementDate;

        await production.save({ session });

        await session.commitTransaction();
        session.endSession();

        const updated = await Production.findById(production._id)
            .populate("performedBy", "firstName lastName username role")
            .populate("productionTemplateId", "name code type baseUnit")
            .populate("relatedRequestId", "requestNumber status")
            .lean();

        return okResponse(
            updated,
            "Producción cancelada correctamente."
        );
    } catch (error) {
        await session.abortTransaction();
        session.endSession();
        return serverError(error, "[PRODUCTION_CANCEL_ROUTE_ERROR]");
    }
}