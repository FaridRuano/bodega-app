import { NextResponse } from "next/server";

import dbConnect from "@libs/mongodb";
import Product from "@models/Product";
import Category from "@models/Category";
import InventoryStock from "@models/InventoryStock";
import { parsePositiveNumber } from "@libs/apiUtils";
import { STOCK_LOCATIONS } from "@models/InventoryStock";

function getDefaultInventory() {
    return {
        total: 0,
        available: 0,
        reserved: 0,
        warehouse: 0,
        kitchen: 0,
    };
}

async function buildInventoryMap(productIds = []) {
    if (!productIds.length) return new Map();

    const stocks = await InventoryStock.find({
        productId: { $in: productIds },
    }).lean();

    const inventoryMap = new Map();

    for (const stock of stocks) {
        const key = String(stock.productId);

        if (!inventoryMap.has(key)) {
            inventoryMap.set(key, getDefaultInventory());
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

function getInventoryStatus(product, inventory) {
    if (!product.isActive) {
        return "inactive";
    }

    if (!product.tracksStock) {
        return "no_tracking";
    }

    if (inventory.total <= 0) {
        return "out";
    }

    if (Number(product.minStock || 0) > 0 && inventory.total <= Number(product.minStock || 0)) {
        return "low";
    }

    if (
        Number(product.reorderPoint || 0) > 0 &&
        inventory.total <= Number(product.reorderPoint || 0)
    ) {
        return "warning";
    }

    return "ok";
}

function normalizeProduct(product, inventoryMap) {
    const id = String(product._id);
    const inventory = inventoryMap.get(id) || getDefaultInventory();
    const category = product.categoryId || null;

    return {
        _id: product._id,
        code: product.code,
        name: product.name,
        slug: product.slug,
        description: product.description,
        unit: product.unit,
        productType: product.productType,
        storageType: product.storageType,
        tracksStock: product.tracksStock,
        allowsProduction: product.allowsProduction,
        minStock: Number(product.minStock || 0),
        reorderPoint: Number(product.reorderPoint || 0),
        isActive: product.isActive,
        notes: product.notes || "",

        category,
        categoryName: category?.name || "",

        inventory,
        status: getInventoryStatus(product, inventory),
        hasStock: inventory.total > 0,
        isBelowMinStock:
            Number(product.minStock || 0) > 0 &&
            inventory.total <= Number(product.minStock || 0),
        isBelowReorderPoint:
            Number(product.reorderPoint || 0) > 0 &&
            inventory.total <= Number(product.reorderPoint || 0),
    };
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

function normalizeLocation(value) {
    const normalized = String(value || "").trim().toLowerCase();
    if (!normalized) return null;
    return STOCK_LOCATIONS.includes(normalized) ? normalized : null;
}

export async function GET(request) {
    try {
        await dbConnect();

        const { searchParams } = new URL(request.url);
        const hasPagination = searchParams.has("page") || searchParams.has("limit");
        const page = parsePositiveNumber(searchParams.get("page"), 1);
        const limit = Math.min(parsePositiveNumber(searchParams.get("limit"), 10), 100);
        const search = searchParams.get("search") || "";
        const location = normalizeLocation(searchParams.get("location"));

        const query = buildSearchFilter(search) || {};
        const skip = (page - 1) * limit;

        const [products, total] = await Promise.all([
            Product.find(query)
                .populate({
                    path: "categoryId",
                    model: Category,
                    select: "name slug isActive",
                })
                .sort({ name: 1 })
                .skip(hasPagination ? skip : 0)
                .limit(hasPagination ? limit : 1000)
                .lean(),
            Product.countDocuments(query),
        ]);

        const inventoryMap = await buildInventoryMap(
            products.map((product) => product._id)
        );

        const data = products.map((product) =>
            normalizeProduct(product, inventoryMap)
        );

        const summary = {
            totalProducts: data.length,
            activeProducts: data.filter((product) => product.isActive).length,
            trackedProducts: data.filter((product) => product.tracksStock).length,
            outOfStockProducts: data.filter((product) => {
                const quantity = location
                    ? Number(product.inventory?.[location] || 0)
                    : Number(product.inventory?.total || 0);
                return quantity <= 0;
            }).length,
            lowStockProducts: data.filter((product) => product.status === "low").length,
            warningStockProducts: data.filter((product) => product.status === "warning").length,
            selectedLocation: location,
        };

        return NextResponse.json(
            {
                success: true,
                data,
                summary,
                meta: {
                    page,
                    limit: hasPagination ? limit : data.length,
                    total,
                    pages: hasPagination ? Math.max(Math.ceil(total / limit), 1) : 1,
                },
            },
            { status: 200 }
        );
    } catch (error) {
        console.error("GET /api/inventory error:", error);

        return NextResponse.json(
            {
                success: false,
                message: "No se pudo obtener el inventario.",
            },
            { status: 500 }
        );
    }
}
