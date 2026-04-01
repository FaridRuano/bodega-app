import mongoose from "mongoose";
import { NextResponse } from "next/server";

import dbConnect from "@libs/mongodb";
import Product from "@models/Product";
import InventoryStock from "@models/InventoryStock";
import InventoryMovement from "@models/InventoryMovement";

function normalizeLocation(value) {
    const location = String(value || "").trim().toLowerCase();

    const allowed = ["warehouse", "kitchen"];
    return allowed.includes(location) ? location : null;
}

function normalizeMovementType(value) {
    const type = String(value || "").trim().toLowerCase();

    const allowed = [
        "adjustment_in",
        "adjustment_out",
        "waste",
        "transfer",
    ];

    return allowed.includes(type) ? type : null;
}

export async function POST(request) {
    const session = await mongoose.startSession();

    try {
        await dbConnect();

        const body = await request.json();

        const productId = body.productId?.trim?.();
        const movementType = normalizeMovementType(body.movementType);
        const quantity = Number(body.quantity);
        const notes = body.notes?.trim?.() || "";
        const performedBy = body.performedBy?.trim?.();

        const location = normalizeLocation(body.location);
        const fromLocation = normalizeLocation(body.fromLocation);
        const toLocation = normalizeLocation(body.toLocation);

        if (!productId) {
            return NextResponse.json(
                { success: false, message: "El producto es obligatorio." },
                { status: 400 }
            );
        }

        if (!movementType) {
            return NextResponse.json(
                { success: false, message: "Tipo de movimiento inválido." },
                { status: 400 }
            );
        }

        if (!Number.isFinite(quantity) || quantity <= 0) {
            return NextResponse.json(
                { success: false, message: "Cantidad inválida." },
                { status: 400 }
            );
        }

        if (!performedBy || !mongoose.Types.ObjectId.isValid(performedBy)) {
            return NextResponse.json(
                { success: false, message: "Usuario inválido para registrar el movimiento." },
                { status: 400 }
            );
        }

        const product = await Product.findById(productId);

        if (!product) {
            return NextResponse.json(
                { success: false, message: "Producto no encontrado." },
                { status: 404 }
            );
        }

        session.startTransaction();

        async function getOrCreateStock(productId, location) {
            let stock = await InventoryStock.findOne({
                productId,
                location,
            }).session(session);

            if (!stock) {
                const created = await InventoryStock.create(
                    [
                        {
                            productId,
                            location,
                            quantity: 0,
                            reservedQuantity: 0,
                        },
                    ],
                    { session }
                );

                stock = created[0];
            }

            return stock;
        }

        const movementPayload = {
            productId,
            movementType,
            quantity,
            unitSnapshot: product.unit,
            notes,
            performedBy,
            referenceType: "manual_adjustment",
        };

        if (movementType === "adjustment_in") {
            if (!location) {
                throw new Error("Ubicación requerida.");
            }

            const stock = await getOrCreateStock(productId, location);

            stock.quantity += quantity;
            stock.lastMovementAt = new Date();

            await stock.save({ session });

            movementPayload.toLocation = location;
        }

        if (movementType === "adjustment_out" || movementType === "waste") {
            if (!location) {
                throw new Error("Ubicación requerida.");
            }

            const stock = await getOrCreateStock(productId, location);

            if (stock.quantity < quantity) {
                throw new Error("Stock insuficiente.");
            }

            stock.quantity -= quantity;
            stock.lastMovementAt = new Date();

            await stock.save({ session });

            movementPayload.fromLocation = location;
        }

        if (movementType === "transfer") {
            if (!fromLocation || !toLocation) {
                throw new Error("Ubicaciones requeridas para transferencia.");
            }

            if (fromLocation === toLocation) {
                throw new Error("Las ubicaciones no pueden ser iguales.");
            }

            const fromStock = await getOrCreateStock(productId, fromLocation);
            const toStock = await getOrCreateStock(productId, toLocation);

            if (fromStock.quantity < quantity) {
                throw new Error("Stock insuficiente para transferencia.");
            }

            fromStock.quantity -= quantity;
            toStock.quantity += quantity;

            fromStock.lastMovementAt = new Date();
            toStock.lastMovementAt = new Date();

            await fromStock.save({ session });
            await toStock.save({ session });

            movementPayload.fromLocation = fromLocation;
            movementPayload.toLocation = toLocation;
        }

        const [movement] = await InventoryMovement.create(
            [movementPayload],
            { session }
        );

        await session.commitTransaction();
        session.endSession();

        return NextResponse.json(
            {
                success: true,
                message: "Movimiento registrado correctamente.",
                data: movement,
            },
            { status: 201 }
        );
    } catch (error) {
        await session.abortTransaction();
        session.endSession();

        console.error("POST /api/inventory/movements error:", error);

        return NextResponse.json(
            {
                success: false,
                message: error.message || "Error al registrar el movimiento.",
            },
            { status: 500 }
        );
    }
}