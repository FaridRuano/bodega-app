import mongoose from "mongoose";
import { NextResponse } from "next/server";

import { requireAuthenticatedUser, requireUserRole } from "@libs/apiAuth";
import dbConnect from "@libs/mongodb";
import Product from "@models/Product";
import InventoryStock from "@models/InventoryStock";
import InventoryMovement from "@models/InventoryMovement";
import { parsePositiveNumber } from "@libs/apiUtils";
import {
    getLocationLabel,
    getMovementTypeLabel,
    getReferenceTypeLabel,
} from "@libs/constants/domainLabels";

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
        "request_dispatch",
        "request_return",
        "production_consumption",
        "production_output",
        "purchase_entry",
    ];

    return allowed.includes(type) ? type : null;
}

function getPerformedByLabel(user) {
    if (!user) return "Sistema";

    const fullName = [user.firstName, user.lastName].filter(Boolean).join(" ").trim();
    return fullName || user.username || user.email || "Usuario";
}

function getMovementRouteLabels(movement) {
    const fromLocation = movement.fromLocation || null;
    const toLocation = movement.toLocation || null;
    const referenceType = movement.referenceType || "system";

    if (movement.movementType === "production_output") {
        return {
            fromLocationLabel: "Producción",
            toLocationLabel: getLocationLabel(toLocation, "Cocina"),
        };
    }

    if (movement.movementType === "production_consumption") {
        return {
            fromLocationLabel: getLocationLabel(fromLocation, "Cocina"),
            toLocationLabel: "Producción",
        };
    }

    if (movement.movementType === "request_dispatch") {
        return {
            fromLocationLabel: getLocationLabel(fromLocation, "Bodega"),
            toLocationLabel: getLocationLabel(toLocation, "Cocina"),
        };
    }

    if (movement.movementType === "request_return") {
        return {
            fromLocationLabel: getLocationLabel(fromLocation, "Cocina"),
            toLocationLabel: getLocationLabel(toLocation, "Bodega"),
        };
    }

    if (movement.movementType === "adjustment_in") {
        return {
            fromLocationLabel: getReferenceTypeLabel(referenceType),
            toLocationLabel: getLocationLabel(toLocation, "Bodega"),
        };
    }

    if (movement.movementType === "adjustment_out" || movement.movementType === "waste") {
        return {
            fromLocationLabel:
                movement.movementType === "waste"
                    ? "Producción"
                    : getLocationLabel(fromLocation, "Bodega"),
            toLocationLabel:
                movement.movementType === "waste"
                    ? "Merma"
                    : getReferenceTypeLabel(referenceType),
        };
    }

    return {
        fromLocationLabel: getLocationLabel(fromLocation, getReferenceTypeLabel(referenceType)),
        toLocationLabel: getLocationLabel(toLocation, "Sin destino"),
    };
}

export async function POST(request) {
    const session = await mongoose.startSession();

    try {
        const { user, response } = await requireUserRole(["admin", "warehouse", "kitchen"]);
        if (response) return response;

        await dbConnect();

        const body = await request.json();

        const productId = body.productId?.trim?.();
        const movementType = normalizeMovementType(body.movementType);
        const quantity = Number(body.quantity);
        const notes = body.notes?.trim?.() || "";
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

        const isKitchenUser = user.role === "kitchen";

        if (isKitchenUser) {
            const isAllowedMovement =
                ["adjustment_in", "adjustment_out"].includes(movementType) &&
                location === "kitchen";

            if (!isAllowedMovement) {
                return NextResponse.json(
                    {
                        success: false,
                        message: "Cocina solo puede registrar ajustes manuales dentro de su inventario.",
                    },
                    { status: 403 }
                );
            }
        }

        const product = await Product.findById(productId);

        if (!product) {
            return NextResponse.json(
                { success: false, message: "Producto no encontrado." },
                { status: 404 }
            );
        }

        session.startTransaction();

        async function getOrCreateStock(targetProductId, targetLocation) {
            let stock = await InventoryStock.findOne({
                productId: targetProductId,
                location: targetLocation,
            }).session(session);

            if (!stock) {
                const created = await InventoryStock.create(
                    [
                        {
                            productId: targetProductId,
                            location: targetLocation,
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
            performedBy: user.id,
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

        const [movement] = await InventoryMovement.create([movementPayload], { session });

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
        await session.abortTransaction().catch(() => {});
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

export async function GET(request) {
    try {
        const { response } = await requireAuthenticatedUser();
        if (response) return response;

        await dbConnect();

        const { searchParams } = new URL(request.url);
        const page = parsePositiveNumber(searchParams.get("page"), 1);
        const limit = Math.min(parsePositiveNumber(searchParams.get("limit"), 50), 200);
        const productId = String(searchParams.get("productId") || "").trim();
        const movementType = normalizeMovementType(searchParams.get("movementType"));
        const location = normalizeLocation(searchParams.get("location"));

        const query = {};

        if (productId && mongoose.Types.ObjectId.isValid(productId)) {
            query.productId = productId;
        }

        if (movementType) {
            query.movementType = movementType;
        }

        if (location) {
            query.$or = [{ fromLocation: location }, { toLocation: location }];
        }

        const skip = (page - 1) * limit;

        const [movements, total, transfers, outputs, inputs] = await Promise.all([
            InventoryMovement.find(query)
                .populate("productId", "code name unit")
                .populate("performedBy", "firstName lastName username role")
                .sort({ movementDate: -1, createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            InventoryMovement.countDocuments(query),
            InventoryMovement.countDocuments({ ...query, movementType: "transfer" }),
            InventoryMovement.countDocuments({ ...query, toLocation: "kitchen" }),
            InventoryMovement.countDocuments({ ...query, fromLocation: "kitchen" }),
        ]);

        const data = movements.map((movement) => ({
            ...movement,
            ...getMovementRouteLabels(movement),
            movementTypeLabel: getMovementTypeLabel(movement.movementType),
            referenceTypeLabel: getReferenceTypeLabel(movement.referenceType),
            performedByLabel: getPerformedByLabel(movement.performedBy),
        }));

        return NextResponse.json(
            {
                success: true,
                data,
                summary: {
                    total,
                    transfers,
                    outputs,
                    inputs,
                },
                meta: {
                    page,
                    limit,
                    total,
                    pages: Math.max(Math.ceil(total / limit), 1),
                },
            },
            { status: 200 }
        );
    } catch (error) {
        console.error("GET /api/inventory/movements error:", error);

        return NextResponse.json(
            {
                success: false,
                message: "No se pudieron obtener los movimientos.",
            },
            { status: 500 }
        );
    }
}