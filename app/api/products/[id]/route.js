import mongoose from "mongoose";
import { NextResponse } from "next/server";

import { requireAuthenticatedUser, requireUserRole } from "@libs/apiAuth";
import dbConnect from "@libs/mongodb";
import Product from "@models/Product";
import Category from "@models/Category";
import InventoryStock from "@models/InventoryStock";
import InventoryMovement from "@models/InventoryMovement";

function isValidObjectId(id) {
    return mongoose.Types.ObjectId.isValid(id);
}

async function buildInventorySummary(productId) {
    const stocks = await InventoryStock.find({ productId }).lean();

    const summary = {
        total: 0,
        available: 0,
        reserved: 0,
        warehouse: 0,
        kitchen: 0,
        lounge: 0,
    };

    for (const stock of stocks) {
        const quantity = Number(stock.quantity || 0);
        const reservedQuantity = Number(stock.reservedQuantity || 0);
        const availableQuantity =
            typeof stock.availableQuantity !== "undefined"
                ? Number(stock.availableQuantity || 0)
                : Math.max(quantity - reservedQuantity, 0);

        summary.total += quantity;
        summary.available += availableQuantity;
        summary.reserved += reservedQuantity;

        if (stock.location === "warehouse") {
            summary.warehouse += quantity;
        }

        if (stock.location === "kitchen") {
            summary.kitchen += quantity;
        }

        if (stock.location === "lounge") {
            summary.lounge += quantity;
        }
    }

    return summary;
}

function normalizeProduct(product, inventory) {
    return {
        ...product,
        category: product.categoryId || null,
        categoryName: product.categoryId?.name || "",
        inventory,
    };
}

function hasInvalidStockThresholds(minStock, reorderPoint) {
    const normalizedMinStock = Number(minStock) || 0;
    const normalizedReorderPoint = Number(reorderPoint) || 0;

    return (
        normalizedMinStock === normalizedReorderPoint &&
        normalizedMinStock !== 0
    );
}

export async function GET(_, { params }) {
    try {
        const { response } = await requireAuthenticatedUser();
        if (response) return response;

        await dbConnect();

        const { id } = await params;

        if (!isValidObjectId(id)) {
            return NextResponse.json(
                {
                    success: false,
                    message: "ID de producto inválido.",
                },
                { status: 400 }
            );
        }

        const product = await Product.findById(id)
            .populate({
                path: "categoryId",
                model: Category,
                select: "name slug isActive",
            })
            .lean();

        if (!product) {
            return NextResponse.json(
                {
                    success: false,
                    message: "Producto no encontrado.",
                },
                { status: 404 }
            );
        }

        const inventory = await buildInventorySummary(id);

        return NextResponse.json(
            {
                success: true,
                data: normalizeProduct(product, inventory),
            },
            { status: 200 }
        );
    } catch (error) {
        console.error("GET /api/products/[id] error:", error);

        return NextResponse.json(
            {
                success: false,
                message: "No se pudo obtener el producto.",
            },
            { status: 500 }
        );
    }
}

export async function PATCH(request, { params }) {
    try {
        const { response } = await requireUserRole(["admin"]);
        if (response) return response;

        await dbConnect();

        const { id } = await params;

        if (!isValidObjectId(id)) {
            return NextResponse.json(
                {
                    success: false,
                    message: "ID de producto inválido.",
                },
                { status: 400 }
            );
        }

        const body = await request.json();

        const {
            code,
            name,
            description,
            categoryId,
            unit,
            productType,
            storageType,
            tracksStock,
            allowsProduction,
            requiresWeightControl,
            requiresDailyControl,
            minStock,
            reorderPoint,
            isActive,
            notes,
        } = body;

        const product = await Product.findById(id);

        if (!product) {
            return NextResponse.json(
                {
                    success: false,
                    message: "Producto no encontrado.",
                },
                { status: 404 }
            );
        }

        if (typeof name === "string") {
            if (!name.trim()) {
                return NextResponse.json(
                    {
                        success: false,
                        message: "El nombre del producto es obligatorio.",
                    },
                    { status: 400 }
                );
            }

            product.name = name.trim();
            product.slug = undefined;
        }

        if (typeof code === "string" || code === null) {
            product.code = code?.trim?.()?.toUpperCase?.() || null;
        }

        if (typeof description === "string") {
            product.description = description.trim();
        }

        if (typeof categoryId === "string") {
            if (!categoryId.trim()) {
                return NextResponse.json(
                    {
                        success: false,
                        message: "La categoría es obligatoria.",
                    },
                    { status: 400 }
                );
            }

            const category = await Category.findById(categoryId);

            if (!category) {
                return NextResponse.json(
                    {
                        success: false,
                        message: "La categoría seleccionada no existe.",
                    },
                    { status: 404 }
                );
            }

            product.categoryId = categoryId;
        }

        if (typeof unit === "string") {
            product.unit = unit;
        }

        if (typeof productType === "string") {
            product.productType = productType;
        }

        if (typeof storageType === "string") {
            product.storageType = storageType;
        }

        if (typeof tracksStock === "boolean") {
            product.tracksStock = tracksStock;
        }

        if (typeof allowsProduction === "boolean") {
            product.allowsProduction = allowsProduction;
        }

        if (typeof requiresWeightControl === "boolean") {
            product.requiresWeightControl = requiresWeightControl;
        }

        if (typeof requiresDailyControl === "boolean") {
            product.requiresDailyControl = requiresDailyControl;
        }

        if (typeof minStock !== "undefined") {
            product.minStock = Number(minStock) || 0;
        }

        if (typeof reorderPoint !== "undefined") {
            product.reorderPoint = Number(reorderPoint) || 0;
        }

        if (
            typeof minStock !== "undefined" ||
            typeof reorderPoint !== "undefined"
        ) {
            if (
                hasInvalidStockThresholds(
                    product.minStock,
                    product.reorderPoint
                )
            ) {
                return NextResponse.json(
                    {
                        success: false,
                        message:
                            "El punto de reposicion no puede ser igual a la alerta de stock bajo, salvo que ambos sean 0.",
                    },
                    { status: 400 }
                );
            }
        }

        if (typeof isActive === "boolean") {
            product.isActive = isActive;
        }

        if (typeof notes === "string") {
            product.notes = notes.trim();
        }

        await product.save();

        const populatedProduct = await Product.findById(id)
            .populate({
                path: "categoryId",
                model: Category,
                select: "name slug isActive",
            })
            .lean();

        const inventory = await buildInventorySummary(id);

        return NextResponse.json(
            {
                success: true,
                message: "Producto actualizado correctamente.",
                data: normalizeProduct(populatedProduct, inventory),
            },
            { status: 200 }
        );
    } catch (error) {
        console.error("PATCH /api/products/[id] error:", error);

        if (error?.code === 11000) {
            return NextResponse.json(
                {
                    success: false,
                    message: "Ya existe un producto con ese código o slug.",
                },
                { status: 409 }
            );
        }

        return NextResponse.json(
            {
                success: false,
                message: "No se pudo actualizar el producto.",
            },
            { status: 500 }
        );
    }
}

export async function DELETE(_, { params }) {
    try {
        const { response } = await requireUserRole(["admin"]);
        if (response) return response;

        await dbConnect();

        const { id } = await params;

        if (!isValidObjectId(id)) {
            return NextResponse.json(
                {
                    success: false,
                    message: "ID de producto inválido.",
                },
                { status: 400 }
            );
        }

        const product = await Product.findById(id);

        if (!product) {
            return NextResponse.json(
                {
                    success: false,
                    message: "Producto no encontrado.",
                },
                { status: 404 }
            );
        }

        const hasStock = await InventoryStock.exists({
            productId: id,
            quantity: { $gt: 0 },
        });

        if (hasStock) {
            return NextResponse.json(
                {
                    success: false,
                    message:
                        "No se puede eliminar el producto porque tiene inventario registrado. Puedes desactivarlo en su lugar.",
                },
                { status: 409 }
            );
        }

        const hasMovements = await InventoryMovement.exists({
            productId: id,
        });

        if (hasMovements) {
            return NextResponse.json(
                {
                    success: false,
                    message:
                        "No se puede eliminar el producto porque ya tiene movimientos registrados. Puedes desactivarlo en su lugar.",
                },
                { status: 409 }
            );
        }

        await Product.findByIdAndDelete(id);

        return NextResponse.json(
            {
                success: true,
                message: "Producto eliminado correctamente.",
            },
            { status: 200 }
        );
    } catch (error) {
        console.error("DELETE /api/products/[id] error:", error);

        return NextResponse.json(
            {
                success: false,
                message: "No se pudo eliminar el producto.",
            },
            { status: 500 }
        );
    }
}
