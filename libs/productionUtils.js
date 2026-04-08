import Product from "@models/Product";
import { PRODUCT_UNITS } from "@libs/constants/units";
import {
    isValidObjectId,
    normalizeNumber,
    normalizeText,
} from "@libs/apiUtils";

export async function validateProductionWasteItems(items = []) {
    if (!Array.isArray(items)) {
        throw new Error("waste debe ser un arreglo.");
    }

    if (items.length === 0) return [];

    const ids = items.map((item) => item?.productId).filter(Boolean);

    for (const id of ids) {
        if (!isValidObjectId(id)) {
            throw new Error("Uno de los productId enviados en waste no es válido.");
        }
    }

    const products = await Product.find({
        _id: { $in: ids },
        isActive: true,
    }).lean();

    const productMap = new Map(
        products.map((product) => [String(product._id), product])
    );

    return items.map((item) => {
        const product = productMap.get(String(item.productId));

        if (!product) {
            throw new Error("Uno de los productos enviados en waste no existe o está inactivo.");
        }

        const quantity = normalizeNumber(item.quantity);
        if (!Number.isFinite(quantity) || quantity <= 0) {
            throw new Error(`La cantidad de merma para "${product.name}" no es válida.`);
        }

        const unitSnapshot = item.unitSnapshot || product.unit;
        if (!PRODUCT_UNITS.includes(unitSnapshot)) {
            throw new Error(`La unidad de merma para "${product.name}" no es válida.`);
        }

        if (!["merma", "desperdicio"].includes(item.type)) {
            throw new Error("El tipo de waste debe ser 'merma' o 'desperdicio'.");
        }

        return {
            productId: product._id,
            productCodeSnapshot: product.code || "",
            productNameSnapshot: product.name,
            productTypeSnapshot: product.productType || "",
            type: item.type,
            quantity,
            unitSnapshot,
            sourceLocation: item.sourceLocation || "kitchen",
            notes: normalizeText(item.notes, 250),
        };
    });
}

export function validateStatusForProductionEdit(status) {
    return ["draft", "in_progress"].includes(status);
}

export function buildProductionSearchFilter(search) {
    if (!search?.trim()) return null;

    const regex = new RegExp(search.trim(), "i");

    return {
        $or: [
            { productionNumber: regex },
            { "templateSnapshot.name": regex },
            { "templateSnapshot.code": regex },
            { notes: regex },
        ],
    };
}

export function scaleProductionQuantity(quantity, factor) {
    return Number((quantity * factor).toFixed(6));
}

export function buildProductionItemSnapshot(product, item, extra = {}) {
    return {
        productId: product._id,
        productCodeSnapshot: product.code || "",
        productNameSnapshot: product.name,
        productTypeSnapshot: product.productType || "",
        unitSnapshot: item.unit,
        quantity: item.quantity,
        ...extra,
    };
}

export function generateProductionNumber() {
    const now = new Date();

    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const dd = String(now.getDate()).padStart(2, "0");

    const random = Math.random().toString(36).slice(2, 6).toUpperCase();

    return `PROD-${yyyy}${mm}${dd}-${random}`;
}

export function canCancelProduction(status) {
    return ["draft", "in_progress"].includes(status);
}

export async function buildValidatedProductionItems(
    items = [],
    { allowDestination = false } = {}
) {
    if (!Array.isArray(items)) {
        throw new Error("Los items enviados deben ser un arreglo.");
    }

    if (items.length === 0) return [];

    const ids = items.map((item) => item?.productId).filter(Boolean);

    for (const id of ids) {
        if (!isValidObjectId(id)) {
            throw new Error("Uno de los productId enviados no es válido.");
        }
    }

    const products = await Product.find({
        _id: { $in: ids },
        isActive: true,
    }).lean();

    const productMap = new Map(
        products.map((product) => [String(product._id), product])
    );

    return items.map((item) => {
        const product = productMap.get(String(item.productId));

        if (!product) {
            throw new Error("Uno de los productos enviados no existe o está inactivo.");
        }

        const quantity = normalizeNumber(item.quantity);
        if (!Number.isFinite(quantity) || quantity < 0) {
            throw new Error(`La cantidad del producto "${product.name}" no es válida.`);
        }

        const unitSnapshot = item.unitSnapshot || product.unit;
        if (!PRODUCT_UNITS.includes(unitSnapshot)) {
            throw new Error(`La unidad del producto "${product.name}" no es válida.`);
        }

        const normalized = {
            productId: product._id,
            productCodeSnapshot: product.code || "",
            productNameSnapshot: product.name,
            productTypeSnapshot: product.productType || "",
            unitSnapshot,
            quantity,
            notes: normalizeText(item.notes, 300),
        };

        if (allowDestination) {
            normalized.destinationLocation = item.destinationLocation || "warehouse";
            normalized.isMain = Boolean(item.isMain);
            normalized.isByProduct = Boolean(item.isByProduct);
        }

        return normalized;
    });
}

