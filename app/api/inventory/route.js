import { NextResponse } from "next/server";
import mongoose from "mongoose";

import dbConnect from "@libs/mongodb";
import Product from "@models/Product";
import Category from "@models/Category";
import InventoryStock from "@models/InventoryStock";
import InventoryMovement from "@models/InventoryMovement";
import { parsePositiveNumber } from "@libs/apiUtils";
import { STOCK_LOCATIONS } from "@models/InventoryStock";
import {
    PURCHASE_PRODUCT_TYPES,
    isPurchaseEligibleProductType,
} from "@libs/constants/productTypes";

function getDefaultInventory() {
    return {
        total: 0,
        available: 0,
        reserved: 0,
        warehouse: 0,
        kitchen: 0,
        lounge: 0,
        locations: [],
    };
}

function roundInventoryQuantity(value) {
    const quantity = Number(value || 0);
    if (!Number.isFinite(quantity)) return 0;

    const rounded = Math.round(quantity * 1000000) / 1000000;
    return Math.abs(rounded) < 0.000001 ? 0 : rounded;
}

function normalizeAsOfDate(value) {
    const normalized = String(value || "").trim();

    if (!normalized) return null;

    if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
        throw new Error("La fecha historica debe tener formato YYYY-MM-DD.");
    }

    const endOfDay = new Date(`${normalized}T23:59:59.999-05:00`);

    if (Number.isNaN(endOfDay.getTime())) {
        throw new Error("La fecha historica no es valida.");
    }

    return {
        value: normalized,
        endOfDay,
    };
}

function ensureInventoryEntry(inventoryMap, productId) {
    const key = String(productId);

    if (!inventoryMap.has(key)) {
        inventoryMap.set(key, getDefaultInventory());
    }

    return inventoryMap.get(key);
}

function recomputeInventoryTotals(inventory) {
    inventory.warehouse = roundInventoryQuantity(inventory.warehouse);
    inventory.kitchen = roundInventoryQuantity(inventory.kitchen);
    inventory.lounge = roundInventoryQuantity(inventory.lounge);
    inventory.total = roundInventoryQuantity(
        inventory.warehouse + inventory.kitchen + inventory.lounge
    );
    inventory.reserved = roundInventoryQuantity(inventory.reserved);
    inventory.available = roundInventoryQuantity(
        Math.max(inventory.total - inventory.reserved, 0)
    );

    return inventory;
}

async function buildInventoryMap(productIds = [], options = {}) {
    if (!productIds.length) return new Map();

    const stocks = await InventoryStock.find({
        productId: { $in: productIds },
    }).lean();

    const inventoryMap = new Map();

    for (const stock of stocks) {
        const key = String(stock.productId);

        const current = ensureInventoryEntry(inventoryMap, key);
        const locationKey = String(stock.location || "");

        if (STOCK_LOCATIONS.includes(locationKey) && !current.locations.includes(locationKey)) {
            current.locations.push(locationKey);
        }

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

    if (options.asOfDate?.endOfDay) {
        const futureMovements = await InventoryMovement.find({
            productId: { $in: productIds },
            movementDate: { $gt: options.asOfDate.endOfDay },
        })
            .select("productId quantity fromLocation toLocation")
            .lean();

        for (const movement of futureMovements) {
            const current = ensureInventoryEntry(inventoryMap, movement.productId);
            const quantity = Number(movement.quantity || 0);

            if (!Number.isFinite(quantity) || quantity <= 0) continue;

            if (movement.toLocation && STOCK_LOCATIONS.includes(movement.toLocation)) {
                current[movement.toLocation] = roundInventoryQuantity(
                    Number(current[movement.toLocation] || 0) - quantity
                );
            }

            if (movement.fromLocation && STOCK_LOCATIONS.includes(movement.fromLocation)) {
                current[movement.fromLocation] = roundInventoryQuantity(
                    Number(current[movement.fromLocation] || 0) + quantity
                );
            }
        }

        for (const inventory of inventoryMap.values()) {
            inventory.reserved = 0;
            recomputeInventoryTotals(inventory);
        }
    } else {
        for (const inventory of inventoryMap.values()) {
            recomputeInventoryTotals(inventory);
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
        requiresWeightControl: product.requiresWeightControl,
        requiresDailyControl: product.requiresDailyControl,
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

function normalizeLocations(value) {
    const locations = String(value || "")
        .split(",")
        .map((entry) => normalizeLocation(entry))
        .filter(Boolean);

    return Array.from(new Set(locations));
}

function normalizeAlertFilter(value) {
    const normalized = String(value || "").trim().toLowerCase();

    if (["low", "warning", "out", "attention"].includes(normalized)) {
        return normalized;
    }

    return null;
}

function normalizeProductTypeFilter(value) {
    const normalized = String(value || "").trim().toLowerCase();
    return normalized || null;
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
        const locations = normalizeLocations(searchParams.get("locations"));
        const alert = normalizeAlertFilter(searchParams.get("alert"));
        const inStockOnly = searchParams.get("inStockOnly") === "true";
        const locationOnly = searchParams.get("locationOnly") === "true";
        const activeOnly = searchParams.get("activeOnly") === "true";
        const purchaseEligibleOnly = searchParams.get("purchaseEligible") === "true";
        const categoryId = String(searchParams.get("categoryId") || "").trim();
        const familyId = String(searchParams.get("familyId") || "").trim();
        const productType = normalizeProductTypeFilter(searchParams.get("productType"));
        let asOfDate = null;

        try {
            asOfDate = normalizeAsOfDate(searchParams.get("asOfDate"));
        } catch (dateError) {
            return NextResponse.json(
                {
                    success: false,
                    message: dateError.message,
                },
                { status: 400 }
            );
        }

        const query = buildSearchFilter(search) || {};

        if (activeOnly) {
            query.isActive = true;
        }

        if (purchaseEligibleOnly) {
            query.productType = { $in: PURCHASE_PRODUCT_TYPES };
        } else if (productType) {
            query.productType = productType;
        }

        if (categoryId && mongoose.Types.ObjectId.isValid(categoryId)) {
            query.categoryId = categoryId;
        } else if (familyId && mongoose.Types.ObjectId.isValid(familyId)) {
            const familyCategories = await Category.find({ familyId })
                .select("_id")
                .lean();

            query.categoryId = {
                $in: familyCategories.map((category) => category._id),
            };
        }

        const skip = (page - 1) * limit;

        const products = await Product.find(query)
            .populate({
                path: "categoryId",
                model: Category,
                select: "name slug isActive",
            })
            .sort({ createdAt: -1 })
            .lean();

        const inventoryMap = await buildInventoryMap(
            products.map((product) => product._id),
            { asOfDate }
        );

        const normalizedProducts = products.map((product) =>
            normalizeProduct(product, inventoryMap)
        );
        const getScopedQuantity = (product) => {
            if (locations.length) {
                return locations.reduce(
                    (sum, currentLocation) => sum + Number(product.inventory?.[currentLocation] || 0),
                    0
                );
            }

            if (location) {
                return Number(product.inventory?.[location] || 0);
            }

            return Number(product.inventory?.total || 0);
        };

        const filteredData = normalizedProducts.filter((product) => {
            if (purchaseEligibleOnly && !isPurchaseEligibleProductType(product.productType)) {
                return false;
            }

            if (inStockOnly && locations.length) {
                const quantity = locations.reduce(
                    (sum, currentLocation) => sum + Number(product.inventory?.[currentLocation] || 0),
                    0
                );
                if (quantity <= 0) {
                    return false;
                }
            } else if (location && inStockOnly) {
                const quantity = Number(product.inventory?.[location] || 0);
                if (quantity <= 0) {
                    return false;
                }
            }

            if (locationOnly && locations.length) {
                const productLocations = product.inventory?.locations || [];
                if (!locations.some((currentLocation) => productLocations.includes(currentLocation))) {
                    return false;
                }
            } else if (location && locationOnly) {
                const productLocations = product.inventory?.locations || [];
                if (!productLocations.includes(location)) {
                    return false;
                }
            }

            if (alert === "low") {
                return product.status === "low";
            }

            if (alert === "warning") {
                return product.status === "warning";
            }

            if (alert === "out") {
                return getScopedQuantity(product) <= 0;
            }

            if (alert === "attention") {
                return ["low", "warning"].includes(product.status);
            }

            return true;
        });

        const paginatedData = hasPagination
            ? filteredData.slice(skip, skip + limit)
            : filteredData;

        const summary = {
            totalProducts: normalizedProducts.length,
            selectedStockProducts: normalizedProducts.filter((product) => getScopedQuantity(product) > 0).length,
            activeProducts: normalizedProducts.filter((product) => product.isActive).length,
            trackedProducts: normalizedProducts.filter((product) => product.tracksStock).length,
            outOfStockProducts: normalizedProducts.filter((product) => getScopedQuantity(product) <= 0).length,
            totalOutOfStockProducts: normalizedProducts.filter((product) => Number(product.inventory?.total || 0) <= 0).length,
            warehouseStockProducts: normalizedProducts.filter((product) => product.inventory?.locations?.includes("warehouse")).length,
            kitchenStockProducts: normalizedProducts.filter((product) => product.inventory?.locations?.includes("kitchen")).length,
            loungeStockProducts: normalizedProducts.filter((product) => product.inventory?.locations?.includes("lounge")).length,
            lowStockProducts: normalizedProducts.filter((product) => product.status === "low").length,
            warningStockProducts: normalizedProducts.filter((product) => product.status === "warning").length,
            selectedLocation: location,
            selectedLocations: locations,
            selectedAlert: alert,
            asOfDate: asOfDate?.value || null,
            isHistorical: Boolean(asOfDate),
        };

        return NextResponse.json(
            {
                success: true,
                data: paginatedData,
                summary,
                meta: {
                    page,
                    limit: hasPagination ? limit : filteredData.length,
                    total: filteredData.length,
                    pages: hasPagination ? Math.max(Math.ceil(filteredData.length / limit), 1) : 1,
                    asOfDate: asOfDate?.value || null,
                    isHistorical: Boolean(asOfDate),
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
