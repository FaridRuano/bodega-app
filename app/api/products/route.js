import { NextResponse } from "next/server";

import dbConnect from "@libs/mongodb";
import Product from "@models/Product";
import Category from "@models/Category";
import InventoryStock from "@models/InventoryStock";

async function buildInventoryMap(productIds = []) {
    if (!productIds.length) return new Map();

    const stocks = await InventoryStock.find({
        productId: { $in: productIds },
    }).lean();

    const inventoryMap = new Map();

    for (const stock of stocks) {
        const key = String(stock.productId);

        if (!inventoryMap.has(key)) {
            inventoryMap.set(key, {
                total: 0,
                available: 0,
                reserved: 0,
                warehouse: 0,
                kitchen: 0,
            });
        }

        const current = inventoryMap.get(key);

        const quantity = Number(stock.quantity || 0);
        const reservedQuantity = Number(stock.reservedQuantity || 0);
        const availableQuantity =
            typeof stock.availableQuantity !== "undefined"
                ? Number(stock.availableQuantity || 0)
                : Math.max(quantity - reservedQuantity, 0);

        current.total += quantity;
        current.available += availableQuantity;
        current.reserved += reservedQuantity;

        if (stock.location === "warehouse") {
            current.warehouse += quantity;
        }

        if (stock.location === "kitchen") {
            current.kitchen += quantity;
        }
    }

    return inventoryMap;
}

function normalizeProduct(product, inventoryMap) {
    const id = String(product._id);

    return {
        ...product,
        categoryName: product.category?.name || "",
        inventory: inventoryMap.get(id) || {
            total: 0,
            available: 0,
            reserved: 0,
            warehouse: 0,
            kitchen: 0,
        },
    };
}

async function generateProductCode() {
    let attempts = 0;

    while (attempts < 20) {
        const randomPart = Math.floor(100000 + Math.random() * 900000);
        const generatedCode = `PRD-${randomPart}`;

        const existingProduct = await Product.exists({ code: generatedCode });

        if (!existingProduct) {
            return generatedCode;
        }

        attempts += 1;
    }

    throw new Error("No se pudo generar un código único para el producto.");
}

export async function GET() {
    try {
        await dbConnect();

        const products = await Product.find({})
            .populate({
                path: "categoryId",
                model: Category,
                select: "name slug isActive",
            })
            .sort({ createdAt: -1 })
            .lean();

        const normalizedProducts = products.map((product) => ({
            ...product,
            category: product.categoryId || null,
        }));

        const inventoryMap = await buildInventoryMap(
            normalizedProducts.map((product) => product._id)
        );

        const data = normalizedProducts.map((product) =>
            normalizeProduct(product, inventoryMap)
        );

        return NextResponse.json(
            {
                success: true,
                data,
            },
            { status: 200 }
        );
    } catch (error) {
        console.error("GET /api/products error:", error);

        return NextResponse.json(
            {
                success: false,
                message: "No se pudieron obtener los productos.",
            },
            { status: 500 }
        );
    }
}

export async function POST(request) {
    try {
        await dbConnect();

        const body = await request.json();

        const {
            code = "",
            name,
            description = "",
            categoryId,
            unit = "unit",
            productType = "raw_material",
            storageType = "ambient",
            tracksStock = true,
            allowsProduction = false,
            minStock = 0,
            reorderPoint = 0,
            isActive = true,
            notes = "",
        } = body;

        const normalizedName = name?.trim();
        const normalizedCategoryId = categoryId?.trim?.();
        const normalizedCode = code?.trim?.()?.toUpperCase?.() || "";

        if (!normalizedName) {
            return NextResponse.json(
                {
                    success: false,
                    message: "El nombre del producto es obligatorio.",
                },
                { status: 400 }
            );
        }

        if (!normalizedCategoryId) {
            return NextResponse.json(
                {
                    success: false,
                    message: "La categoría es obligatoria.",
                },
                { status: 400 }
            );
        }

        const category = await Category.findById(normalizedCategoryId);

        if (!category) {
            return NextResponse.json(
                {
                    success: false,
                    message: "La categoría seleccionada no existe.",
                },
                { status: 404 }
            );
        }

        let finalCode = normalizedCode;

        if (finalCode) {
            const existingProductWithCode = await Product.exists({
                code: finalCode,
            });

            if (existingProductWithCode) {
                return NextResponse.json(
                    {
                        success: false,
                        message: "Ya existe un producto con ese código.",
                    },
                    { status: 409 }
                );
            }
        } else {
            finalCode = await generateProductCode();
        }

        const product = await Product.create({
            code: finalCode,
            name: normalizedName,
            description: description?.trim?.() || "",
            categoryId: normalizedCategoryId,
            unit,
            productType,
            storageType,
            tracksStock: Boolean(tracksStock),
            allowsProduction: Boolean(allowsProduction),
            minStock: Number(minStock) || 0,
            reorderPoint: Number(reorderPoint) || 0,
            isActive: Boolean(isActive),
            notes: notes?.trim?.() || "",
        });

        const populatedProduct = await Product.findById(product._id)
            .populate({
                path: "categoryId",
                model: Category,
                select: "name slug isActive",
            })
            .lean();

        const normalizedProduct = {
            ...populatedProduct,
            category: populatedProduct.categoryId || null,
            categoryName: populatedProduct.categoryId?.name || "",
            inventory: {
                total: 0,
                available: 0,
                reserved: 0,
                warehouse: 0,
                kitchen: 0,
            },
        };

        return NextResponse.json(
            {
                success: true,
                message: "Producto creado correctamente.",
                data: normalizedProduct,
            },
            { status: 201 }
        );
    } catch (error) {
        console.error("POST /api/products error:", error);

        if (error?.code === 11000) {
            const duplicatedField = Object.keys(error?.keyPattern || {})[0];

            if (duplicatedField === "code") {
                return NextResponse.json(
                    {
                        success: false,
                        message: "Ya existe un producto con ese código.",
                    },
                    { status: 409 }
                );
            }

            if (duplicatedField === "slug") {
                return NextResponse.json(
                    {
                        success: false,
                        message: "Ya existe un producto con ese slug.",
                    },
                    { status: 409 }
                );
            }

            return NextResponse.json(
                {
                    success: false,
                    message: "Ya existe un producto con un valor único duplicado.",
                },
                { status: 409 }
            );
        }

        return NextResponse.json(
            {
                success: false,
                message: "No se pudo crear el producto.",
            },
            { status: 500 }
        );
    }
}