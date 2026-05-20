import { NextResponse } from "next/server";
import * as XLSX from "xlsx";

import { requireUserRole } from "@libs/apiAuth";
import { slugify } from "@libs/slugify";
import dbConnect from "@libs/mongodb";
import Category from "@models/Category";
import Product from "@models/Product";
import ProductFamily from "@models/ProductFamily";

export const runtime = "nodejs";

const DEFAULT_PRODUCT_VALUES = {
    unit: "unit",
    productType: "raw_material",
    storageType: "ambient",
    tracksStock: true,
    allowsProduction: false,
    requiresWeightControl: false,
    requiresDailyControl: false,
    minStock: 0,
    reorderPoint: 0,
    isActive: true,
    notes: "",
    description: "",
};

function normalizeCell(value) {
    return String(value ?? "")
        .replace(/\s+/g, " ")
        .trim();
}

function formatCatalogName(value) {
    const normalized = normalizeCell(value);

    if (!normalized) {
        return "";
    }

    return normalized
        .toLocaleLowerCase("es")
        .split(" ")
        .filter(Boolean)
        .map((word) => word.charAt(0).toLocaleUpperCase("es") + word.slice(1))
        .join(" ");
}

function buildProductCodeGenerator() {
    return async function generateProductCode() {
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
    };
}

function findHeaderIndex(headers, aliases) {
    const normalizedAliases = aliases.map((alias) => slugify(alias));
    return headers.findIndex((header) => normalizedAliases.includes(slugify(header)));
}

function parseBooleanValue(value, fallback) {
    const normalized = normalizeCell(value).toLocaleLowerCase("es");

    if (!normalized) {
        return fallback;
    }

    if (["1", "true", "si", "sí", "yes", "x"].includes(normalized)) {
        return true;
    }

    if (["0", "false", "no", "n"].includes(normalized)) {
        return false;
    }

    return fallback;
}

function parseNumberValue(value, fallback = 0) {
    const normalized = normalizeCell(value).replace(",", ".");

    if (!normalized) {
        return fallback;
    }

    const parsed = Number(normalized);
    if (Number.isNaN(parsed)) {
        return fallback;
    }

    return Math.max(0, parsed);
}

function parseUnitValue(value) {
    const normalized = normalizeCell(value).toLocaleLowerCase("es");

    if (!normalized) {
        return DEFAULT_PRODUCT_VALUES.unit;
    }

    if (["un", "und", "unidad", "unit"].includes(normalized)) {
        return "unit";
    }

    if (["kg", "kilo", "kilogramo", "kilogram"].includes(normalized)) {
        return "kg";
    }

    if (["g", "gramo", "gram"].includes(normalized)) {
        return "g";
    }

    if (["l", "lt", "litro", "liter"].includes(normalized)) {
        return "l";
    }

    if (["ml", "mililitro", "milliliter"].includes(normalized)) {
        return "ml";
    }

    return DEFAULT_PRODUCT_VALUES.unit;
}

function parseProductTypeValue(value) {
    const normalized = normalizeCell(value).toLocaleLowerCase("es");

    if (!normalized) {
        return DEFAULT_PRODUCT_VALUES.productType;
    }

    if (["raw_material", "materia prima", "materia_prima"].includes(normalized)) {
        return "raw_material";
    }

    if (["prepared", "preparado"].includes(normalized)) {
        return "prepared";
    }

    if (["finished", "terminado", "producto terminado", "producto_terminado"].includes(normalized)) {
        return "finished";
    }

    return DEFAULT_PRODUCT_VALUES.productType;
}

function parseStorageTypeValue(value) {
    const normalized = normalizeCell(value).toLocaleLowerCase("es");

    if (!normalized) {
        return DEFAULT_PRODUCT_VALUES.storageType;
    }

    if (["ambiente", "ambient"].includes(normalized)) {
        return "ambient";
    }

    if (["refrigerado", "refrigerated"].includes(normalized)) {
        return "refrigerated";
    }

    if (["congelado", "frozen"].includes(normalized)) {
        return "frozen";
    }

    return DEFAULT_PRODUCT_VALUES.storageType;
}

function parseWorksheetRows(workbook) {
    const preferredSheetName = workbook.SheetNames.find(
        (sheetName) => normalizeCell(sheetName).toLocaleLowerCase("es") === "matriz compras"
    );
    const sheetName = preferredSheetName || workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];

    if (!worksheet) {
        throw new Error("No se encontró una hoja válida para importar.");
    }

    const rows = XLSX.utils.sheet_to_json(worksheet, {
        header: 1,
        raw: false,
        defval: "",
        blankrows: false,
    });

    if (rows.length < 2) {
        throw new Error("El archivo no contiene filas suficientes para importar.");
    }

    const headers = rows[0].map((cell) => normalizeCell(cell));
    const familyIndex = findHeaderIndex(headers, ["familia", "family"]);
    const categoryIndex = findHeaderIndex(headers, ["categoria", "category"]);
    const productIndex = findHeaderIndex(headers, ["productos", "producto", "product"]);
    const descriptionIndex = findHeaderIndex(headers, ["descripcion", "description"]);
    const unitIndex = findHeaderIndex(headers, ["unidad", "unit"]);
    const productTypeIndex = findHeaderIndex(headers, [
        "tipo_producto",
        "tipo producto",
        "product_type",
        "product type",
    ]);
    const storageTypeIndex = findHeaderIndex(headers, [
        "almacenamiento",
        "storage",
        "storage_type",
        "storage type",
    ]);
    const tracksStockIndex = findHeaderIndex(headers, [
        "controla_stock",
        "controla stock",
        "tracks_stock",
        "tracks stock",
    ]);
    const allowsProductionIndex = findHeaderIndex(headers, [
        "permite_produccion",
        "permite produccion",
        "allows_production",
        "allows production",
    ]);
    const requiresWeightControlIndex = findHeaderIndex(headers, [
        "controlar_peso",
        "controlar peso",
        "requires_weight_control",
        "requires weight control",
    ]);
    const requiresDailyControlIndex = findHeaderIndex(headers, [
        "control_diario",
        "control diario",
        "requires_daily_control",
        "requires daily control",
    ]);
    const minStockIndex = findHeaderIndex(headers, [
        "stock_minimo",
        "stock minimo",
        "min_stock",
        "minimum stock",
    ]);
    const reorderPointIndex = findHeaderIndex(headers, [
        "stock_minimo2",
        "stock minimo2",
        "stock_minimo_2",
        "stock minimo 2",
        "punto_reposicion",
        "punto reposicion",
        "reorder_point",
        "reorder point",
        "alerta_stock",
        "alerta stock",
        "stock_alert",
        "stock alert",
    ]);
    const notesIndex = findHeaderIndex(headers, ["notas", "notes"]);

    if (familyIndex === -1 || categoryIndex === -1 || productIndex === -1) {
        throw new Error(
            "La hoja debe incluir las columnas FAMILIA, CATEGORIA y PRODUCTOS."
        );
    }

    return {
        sheetName,
        rows: rows.slice(1).map((row, index) => ({
            rowNumber: index + 2,
            familyName: formatCatalogName(row[familyIndex]),
            categoryName: formatCatalogName(row[categoryIndex]),
            productName: formatCatalogName(row[productIndex]),
            productData: {
                description:
                    descriptionIndex === -1
                        ? DEFAULT_PRODUCT_VALUES.description
                        : normalizeCell(row[descriptionIndex]),
                unit:
                    unitIndex === -1
                        ? DEFAULT_PRODUCT_VALUES.unit
                        : parseUnitValue(row[unitIndex]),
                productType:
                    productTypeIndex === -1
                        ? DEFAULT_PRODUCT_VALUES.productType
                        : parseProductTypeValue(row[productTypeIndex]),
                storageType:
                    storageTypeIndex === -1
                        ? DEFAULT_PRODUCT_VALUES.storageType
                        : parseStorageTypeValue(row[storageTypeIndex]),
                tracksStock:
                    tracksStockIndex === -1
                        ? DEFAULT_PRODUCT_VALUES.tracksStock
                        : parseBooleanValue(
                              row[tracksStockIndex],
                              DEFAULT_PRODUCT_VALUES.tracksStock
                          ),
                allowsProduction:
                    allowsProductionIndex === -1
                        ? DEFAULT_PRODUCT_VALUES.allowsProduction
                        : parseBooleanValue(
                              row[allowsProductionIndex],
                              DEFAULT_PRODUCT_VALUES.allowsProduction
                          ),
                requiresWeightControl:
                    requiresWeightControlIndex === -1
                        ? DEFAULT_PRODUCT_VALUES.requiresWeightControl
                        : parseBooleanValue(
                              row[requiresWeightControlIndex],
                              DEFAULT_PRODUCT_VALUES.requiresWeightControl
                          ),
                requiresDailyControl:
                    requiresDailyControlIndex === -1
                        ? DEFAULT_PRODUCT_VALUES.requiresDailyControl
                        : parseBooleanValue(
                              row[requiresDailyControlIndex],
                              DEFAULT_PRODUCT_VALUES.requiresDailyControl
                          ),
                minStock:
                    minStockIndex === -1
                        ? DEFAULT_PRODUCT_VALUES.minStock
                        : parseNumberValue(row[minStockIndex], DEFAULT_PRODUCT_VALUES.minStock),
                reorderPoint:
                    reorderPointIndex === -1
                        ? DEFAULT_PRODUCT_VALUES.reorderPoint
                        : parseNumberValue(
                              row[reorderPointIndex],
                              DEFAULT_PRODUCT_VALUES.reorderPoint
                          ),
                notes:
                    notesIndex === -1
                        ? DEFAULT_PRODUCT_VALUES.notes
                        : normalizeCell(row[notesIndex]),
            },
        })),
    };
}

export async function POST(request) {
    try {
        const { response } = await requireUserRole(["admin"]);
        if (response) return response;

        await dbConnect();

        const formData = await request.formData();
        const file = formData.get("file");

        if (!(file instanceof File)) {
            return NextResponse.json(
                {
                    success: false,
                    message: "Debes seleccionar un archivo Excel para importar.",
                },
                { status: 400 }
            );
        }

        const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
        const { sheetName, rows } = parseWorksheetRows(workbook);
        const issues = [];
        let preflightSkippedRows = 0;
        const seenRowKeys = new Set();
        const validRows = [];

        for (const row of rows) {
            const { familyName, categoryName, productName, rowNumber } = row;

            if (!familyName || !categoryName || !productName) {
                preflightSkippedRows += 1;
                issues.push({
                    row: rowNumber,
                    type: "missing_data",
                    message: "La fila no tiene familia, categoría y producto completos.",
                });
                continue;
            }

            const dedupeKey = [
                slugify(familyName),
                slugify(categoryName),
                slugify(productName),
            ].join("|");

            if (seenRowKeys.has(dedupeKey)) {
                preflightSkippedRows += 1;
                issues.push({
                    row: rowNumber,
                    type: "duplicate_row",
                    message: "La fila está duplicada dentro del Excel y se omitió.",
                });
                continue;
            }

            seenRowKeys.add(dedupeKey);
            validRows.push(row);
        }

        if (validRows.length === 0) {
            return NextResponse.json(
                {
                    success: false,
                    message: "No se encontraron filas válidas para importar.",
                    data: {
                        sheetName,
                        totals: {
                            rowsRead: rows.length,
                            validRows: 0,
                            skippedRows: preflightSkippedRows,
                            preflightSkippedRows,
                            issueCount: issues.length,
                        },
                        issues,
                    },
                },
                { status: 400 }
            );
        }

        const familySlugSet = new Set(validRows.map((row) => slugify(row.familyName)));
        const categorySlugSet = new Set(validRows.map((row) => slugify(row.categoryName)));
        const productSlugSet = new Set(validRows.map((row) => slugify(row.productName)));

        const [existingFamilies, existingCategories, existingProducts] = await Promise.all([
            ProductFamily.find({ slug: { $in: [...familySlugSet] } }),
            Category.find({ slug: { $in: [...categorySlugSet] } }),
            Product.find({ slug: { $in: [...productSlugSet] } }),
        ]);

        const familyMap = new Map(existingFamilies.map((item) => [item.slug, item]));
        const categoryMap = new Map(existingCategories.map((item) => [item.slug, item]));
        const productMap = new Map(existingProducts.map((item) => [item.slug, item]));
        const generateProductCode = buildProductCodeGenerator();

        const totals = {
            rowsRead: rows.length,
            validRows: validRows.length,
            skippedRows: preflightSkippedRows,
            preflightSkippedRows,
            familiesCreated: 0,
            familiesExisting: 0,
            categoriesCreated: 0,
            categoriesExisting: 0,
            categoriesUpdated: 0,
            productsCreated: 0,
            productsExisting: 0,
            productsUpdated: 0,
            conflicts: 0,
            issueCount: 0,
        };

        for (const row of validRows) {
            const familySlug = slugify(row.familyName);
            let family = familyMap.get(familySlug);

            if (!family) {
                family = await ProductFamily.create({
                    name: row.familyName,
                    description: "",
                });
                familyMap.set(familySlug, family);
                totals.familiesCreated += 1;
            } else {
                totals.familiesExisting += 1;
            }

            const categorySlug = slugify(row.categoryName);
            let category = categoryMap.get(categorySlug);

            if (!category) {
                category = await Category.create({
                    name: row.categoryName,
                    description: "",
                    familyId: family._id,
                    isActive: true,
                    sortOrder: 0,
                });
                categoryMap.set(categorySlug, category);
                totals.categoriesCreated += 1;
            } else {
                totals.categoriesExisting += 1;

                const currentFamilyId = category.familyId ? String(category.familyId) : "";
                const nextFamilyId = String(family._id);

                if (currentFamilyId !== nextFamilyId) {
                    category.familyId = family._id;
                    await category.save();
                    totals.categoriesUpdated += 1;
                }
            }

            const productSlug = slugify(row.productName);
            const existingProduct = productMap.get(productSlug);

            if (existingProduct) {
                totals.productsExisting += 1;
                const hasCategoryChange =
                    String(existingProduct.categoryId) !== String(category._id);
                const nextProductData = row.productData || DEFAULT_PRODUCT_VALUES;
                const hasFieldChanges =
                    existingProduct.name !== row.productName ||
                    (existingProduct.description || "") !== nextProductData.description ||
                    existingProduct.unit !== nextProductData.unit ||
                    existingProduct.productType !== nextProductData.productType ||
                    existingProduct.storageType !== nextProductData.storageType ||
                    existingProduct.tracksStock !== nextProductData.tracksStock ||
                    existingProduct.allowsProduction !== nextProductData.allowsProduction ||
                    existingProduct.requiresWeightControl !==
                        nextProductData.requiresWeightControl ||
                    existingProduct.requiresDailyControl !==
                        nextProductData.requiresDailyControl ||
                    Number(existingProduct.minStock || 0) !== Number(nextProductData.minStock) ||
                    Number(existingProduct.reorderPoint || 0) !==
                        Number(nextProductData.reorderPoint) ||
                    (existingProduct.notes || "") !== nextProductData.notes ||
                    existingProduct.isActive !== true;

                if (hasCategoryChange || hasFieldChanges) {
                    existingProduct.name = row.productName;
                    existingProduct.categoryId = category._id;
                    existingProduct.description = nextProductData.description;
                    existingProduct.unit = nextProductData.unit;
                    existingProduct.productType = nextProductData.productType;
                    existingProduct.storageType = nextProductData.storageType;
                    existingProduct.tracksStock = nextProductData.tracksStock;
                    existingProduct.allowsProduction = nextProductData.allowsProduction;
                    existingProduct.requiresWeightControl =
                        nextProductData.requiresWeightControl;
                    existingProduct.requiresDailyControl =
                        nextProductData.requiresDailyControl;
                    existingProduct.minStock = nextProductData.minStock;
                    existingProduct.reorderPoint = nextProductData.reorderPoint;
                    existingProduct.notes = nextProductData.notes;
                    existingProduct.isActive = true;
                    await existingProduct.save();
                    totals.productsUpdated += 1;
                }

                continue;
            }

            const code = await generateProductCode();
            const nextProductData = row.productData || DEFAULT_PRODUCT_VALUES;
            const product = await Product.create({
                ...DEFAULT_PRODUCT_VALUES,
                ...nextProductData,
                code,
                name: row.productName,
                categoryId: category._id,
            });

            productMap.set(productSlug, product);
            totals.productsCreated += 1;
        }

        return NextResponse.json(
            {
                success: true,
                message: "Importación completada correctamente.",
                data: {
                    sheetName,
                    fileName: file.name,
                    totals: {
                        ...totals,
                        issueCount: issues.length,
                    },
                    issues,
                },
            },
            { status: 200 }
        );
    } catch (error) {
        console.error("POST /api/import/catalog error:", error);

        return NextResponse.json(
            {
                success: false,
                message:
                    error?.message || "No se pudo completar la importación del catálogo.",
            },
            { status: 500 }
        );
    }
}
