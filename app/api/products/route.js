import { NextResponse } from "next/server";

import { requireAuthenticatedUser, requireUserRole } from "@libs/apiAuth";
import dbConnect from "@libs/mongodb";
import Product from "@models/Product";
import Category from "@models/Category";
import InventoryStock from "@models/InventoryStock";
import { parsePositiveNumber } from "@libs/apiUtils";

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
                    lounge: 0,
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

        if (stock.location === "lounge") {
            current.lounge += quantity;
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
            lounge: 0,
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

function buildSearchFilter(search) {
    const normalized = String(search || "").trim();
    if (!normalized) return null;

    const regex = new RegExp(normalized, "i");

    return {
        $or: [
            { name: regex },
            { code: regex },
            { description: regex },
        ],
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

export async function GET(request) {
    try {
        const { response } = await requireAuthenticatedUser();
        if (response) return response;

        await dbConnect();

        const { searchParams } = new URL(request.url);
        const hasPagination = searchParams.has("page") || searchParams.has("limit");
        const page = parsePositiveNumber(searchParams.get("page"), 1);
        const limit = Math.min(parsePositiveNumber(searchParams.get("limit"), 10), 100);
        const search = searchParams.get("search") || "";
        const categoryId = String(searchParams.get("categoryId") || "").trim();
        const status = String(searchParams.get("status") || "").trim();
        const productType = String(searchParams.get("productType") || "").trim();

        const filters = [];
        const searchFilter = buildSearchFilter(search);

        if (searchFilter) {
            filters.push(searchFilter);
        }

        if (categoryId) {
            filters.push({ categoryId });
        }

        if (status === "active") {
            filters.push({ isActive: true });
        }

        if (status === "inactive") {
            filters.push({ isActive: false });
        }

        if (productType) {
            filters.push({ productType });
        }

        const query = filters.length ? { $and: filters } : {};
        const skip = (page - 1) * limit;

        const [products, total, activeProducts] = await Promise.all([
            Product.find(query)
                .populate({
                    path: "categoryId",
                    model: Category,
                    select: "name slug isActive",
                })
                .sort({ createdAt: -1 })
                .skip(hasPagination ? skip : 0)
                .limit(hasPagination ? limit : 1000)
                .lean(),
            Product.countDocuments(query),
            Product.countDocuments({
                ...(filters.length ? { $and: [...filters.filter((item) => !("isActive" in item)), { isActive: true }] } : { isActive: true }),
            }),
        ]);

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
                meta: {
                    page,
                    limit: hasPagination ? limit : data.length,
                    total,
                    pages: hasPagination ? Math.max(Math.ceil(total / limit), 1) : 1,
                },
                summary: {
                    totalProducts: total,
                    activeProducts,
                },
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
        const { response } = await requireUserRole(["admin"]);
        if (response) return response;

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
            requiresWeightControl = false,
            requiresDailyControl = false,
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

        if (hasInvalidStockThresholds(minStock, reorderPoint)) {
            return NextResponse.json(
                {
                    success: false,
                    message:
                        "El punto de reposicion no puede ser igual a la alerta de stock bajo, salvo que ambos sean 0.",
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
            requiresWeightControl: Boolean(requiresWeightControl),
            requiresDailyControl: Boolean(requiresDailyControl),
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
                lounge: 0,
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
