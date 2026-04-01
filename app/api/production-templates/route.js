import { NextResponse } from "next/server";
import mongoose from "mongoose";

import { auth } from "@/auth";
import dbConnect from "@libs/mongodb";
import ProductionTemplate from "@models/ProductionTemplate";

function buildSearchFilter(search) {
    if (!search?.trim()) return null;

    const safeSearch = search.trim();

    return {
        $or: [
            { name: { $regex: safeSearch, $options: "i" } },
            { code: { $regex: safeSearch, $options: "i" } },
            { description: { $regex: safeSearch, $options: "i" } },
            { category: { $regex: safeSearch, $options: "i" } },
        ],
    };
}

function parseBoolean(value) {
    if (value === "true") return true;
    if (value === "false") return false;
    return undefined;
}

function parsePositiveNumber(value, fallback) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

async function getCurrentUserId() {
    const session = await auth();
    return session?.user?.id || session?.user?._id || null;
}

function sanitizeTemplatePayload(payload = {}) {
    return {
        code: payload.code?.trim()?.toUpperCase() || "",
        name: payload.name?.trim() || "",
        description: payload.description?.trim() || "",
        category: payload.category || null,
        type: payload.type,
        baseUnit: payload.baseUnit,
        expectedYield:
            payload.expectedYield === "" ||
                payload.expectedYield === undefined ||
                payload.expectedYield === null
                ? null
                : Number(payload.expectedYield),
        expectedWaste:
            payload.expectedWaste === "" ||
                payload.expectedWaste === undefined ||
                payload.expectedWaste === null
                ? null
                : Number(payload.expectedWaste),
        defaultDestination: payload.defaultDestination,
        allowsMultipleOutputs: Boolean(payload.allowsMultipleOutputs),
        requiresWasteRecord: Boolean(payload.requiresWasteRecord),
        allowRealOutputAdjustment:
            payload.allowRealOutputAdjustment === undefined
                ? true
                : Boolean(payload.allowRealOutputAdjustment),
        notes: payload.notes?.trim() || "",
        isActive: payload.isActive === undefined ? true : Boolean(payload.isActive),
        inputs: Array.isArray(payload.inputs)
            ? payload.inputs.map((item) => ({
                productId: item.productId,
                quantity:
                    item.quantity === "" || item.quantity === undefined || item.quantity === null
                        ? null
                        : Number(item.quantity),
                unit: item.unit,
                isPrimary: Boolean(item.isPrimary),
                notes: item.notes?.trim() || "",
            }))
            : [],
        outputs: Array.isArray(payload.outputs)
            ? payload.outputs.map((item) => ({
                productId: item.productId,
                quantity:
                    item.quantity === "" || item.quantity === undefined || item.quantity === null
                        ? null
                        : Number(item.quantity),
                unit: item.unit,
                isMain: Boolean(item.isMain),
                isWaste: Boolean(item.isWaste),
                isByProduct: Boolean(item.isByProduct),
                notes: item.notes?.trim() || "",
            }))
            : [],
    };
}

function validateObjectIds(items = [], fieldName) {
    for (const item of items) {
        if (!mongoose.Types.ObjectId.isValid(item.productId)) {
            return `Uno de los productos en ${fieldName} no es válido.`;
        }
    }

    return null;
}

function validateNumericFields(payload) {
    if (
        payload.expectedYield !== null &&
        payload.expectedYield !== undefined &&
        Number.isNaN(payload.expectedYield)
    ) {
        return "El rendimiento esperado no es válido.";
    }

    if (
        payload.expectedWaste !== null &&
        payload.expectedWaste !== undefined &&
        Number.isNaN(payload.expectedWaste)
    ) {
        return "La merma esperada no es válida.";
    }

    for (const input of payload.inputs || []) {
        if (
            input.quantity === null ||
            input.quantity === undefined ||
            Number.isNaN(input.quantity) ||
            input.quantity <= 0
        ) {
            return "La cantidad de uno de los insumos no es válida.";
        }
    }

    for (const output of payload.outputs || []) {
        if (
            output.quantity !== null &&
            output.quantity !== undefined &&
            (Number.isNaN(output.quantity) || output.quantity <= 0)
        ) {
            return "La cantidad estimada de uno de los resultados no es válida.";
        }
    }

    return null;
}

function formatTemplateListItem(template) {
    return {
        _id: template._id,
        code: template.code || "",
        name: template.name || "",
        description: template.description || "",
        category: template.category?.name || "",
        type: template.type || "",
        baseUnit: template.baseUnit || "",
        expectedYield: template.expectedYield ?? null,
        expectedWaste: template.expectedWaste ?? null,
        defaultDestination: template.defaultDestination || "",
        allowsMultipleOutputs: Boolean(template.allowsMultipleOutputs),
        requiresWasteRecord: Boolean(template.requiresWasteRecord),
        allowRealOutputAdjustment: Boolean(template.allowRealOutputAdjustment),
        notes: template.notes || "",
        isActive: Boolean(template.isActive),
        inputs: template.inputs || [],
        outputs: template.outputs || [],
        createdBy: template.createdBy?.username || "",
        updatedBy: template.updatedBy?.username || "",
        createdAt: template.createdAt,
        updatedAt: template.updatedAt,
    };
}

async function generateProductionTemplateCode() {
    const latestTemplate = await ProductionTemplate.findOne({
        code: { $regex: /^FDP-\d+$/ },
    })
        .sort({ createdAt: -1, code: -1 })
        .select("code")
        .lean();

    if (!latestTemplate?.code) {
        return "FDP-001";
    }

    const numericPart = Number(latestTemplate.code.split("-")[1] || 0);
    const nextNumber = numericPart + 1;

    return `FDP-${String(nextNumber).padStart(3, "0")}`;
}

export async function GET(request) {
    try {
        await dbConnect();

        const { searchParams } = new URL(request.url);

        const search = searchParams.get("search") || "";
        const type = searchParams.get("type") || "";
        const category = searchParams.get("category") || "";
        const isActive = parseBoolean(searchParams.get("isActive"));
        const page = parsePositiveNumber(searchParams.get("page"), 1);
        const limit = parsePositiveNumber(searchParams.get("limit"), 10);
        const sortBy = searchParams.get("sortBy") || "updatedAt";
        const sortOrder = searchParams.get("sortOrder") === "asc" ? 1 : -1;

        const allowedSortFields = [
            "name",
            "code",
            "type",
            "category",
            "isActive",
            "createdAt",
            "updatedAt",
        ];

        const finalSortBy = allowedSortFields.includes(sortBy) ? sortBy : "updatedAt";

        const filters = {};

        const searchFilter = buildSearchFilter(search);
        if (searchFilter) {
            Object.assign(filters, searchFilter);
        }

        if (type) {
            filters.type = type;
        }

        if (category) {
            filters.category = category;
        }

        if (typeof isActive === "boolean") {
            filters.isActive = isActive;
        }

        const skip = (page - 1) * limit;

        const [templates, total] = await Promise.all([
            ProductionTemplate.find(filters)
                .select(
                    "code name description category type baseUnit expectedYield expectedWaste defaultDestination allowsMultipleOutputs requiresWasteRecord allowRealOutputAdjustment notes isActive inputs outputs createdBy updatedBy createdAt updatedAt"
                )
                .sort({ [finalSortBy]: sortOrder })
                .skip(skip)
                .limit(limit)
                .populate("category", "name")
                .populate("createdBy", "username email")
                .populate("updatedBy", "username email")
                .lean(),
            ProductionTemplate.countDocuments(filters),
        ]);


        return NextResponse.json(
            {
                success: true,
                data: templates.map(formatTemplateListItem),
                pagination: {
                    page,
                    limit,
                    total,
                    pages: Math.ceil(total / limit),
                },
            },
            { status: 200 }
        );
    } catch (error) {
        console.error("GET /api/production-templates error:", error);

        return NextResponse.json(
            {
                success: false,
                message: "No se pudieron obtener las fichas de producción.",
                error: error.message,
            },
            { status: 500 }
        );
    }
}

export async function POST(request) {
    try {
        await dbConnect();

        const userId = await getCurrentUserId();

        if (!userId) {
            return NextResponse.json(
                {
                    success: false,
                    message: "No autorizado.",
                },
                { status: 401 }
            );
        }

        const body = await request.json();
        const payload = sanitizeTemplatePayload(body);

        if (!payload.name) {
            return NextResponse.json(
                {
                    success: false,
                    message: "El nombre es obligatorio.",
                },
                { status: 400 }
            );
        }

        if (!payload.type) {
            return NextResponse.json(
                {
                    success: false,
                    message: "El tipo de ficha es obligatorio.",
                },
                { status: 400 }
            );
        }

        if (!payload.baseUnit) {
            return NextResponse.json(
                {
                    success: false,
                    message: "La unidad base es obligatoria.",
                },
                { status: 400 }
            );
        }

        if (!Array.isArray(payload.inputs) || payload.inputs.length === 0) {
            return NextResponse.json(
                {
                    success: false,
                    message: "La ficha debe incluir al menos un insumo.",
                },
                { status: 400 }
            );
        }

        if (!Array.isArray(payload.outputs) || payload.outputs.length === 0) {
            return NextResponse.json(
                {
                    success: false,
                    message: "La ficha debe incluir al menos un resultado.",
                },
                { status: 400 }
            );
        }

        const numericValidationError = validateNumericFields(payload);
        if (numericValidationError) {
            return NextResponse.json(
                {
                    success: false,
                    message: numericValidationError,
                },
                { status: 400 }
            );
        }

        const invalidInputProduct = validateObjectIds(payload.inputs, "insumos");
        if (invalidInputProduct) {
            return NextResponse.json(
                {
                    success: false,
                    message: invalidInputProduct,
                },
                { status: 400 }
            );
        }

        const invalidOutputProduct = validateObjectIds(payload.outputs, "resultados");
        if (invalidOutputProduct) {
            return NextResponse.json(
                {
                    success: false,
                    message: invalidOutputProduct,
                },
                { status: 400 }
            );
        }

        if (!payload.code) {
            payload.code = await generateProductionTemplateCode();
        }

        const existingCode = await ProductionTemplate.findOne({
            code: payload.code,
        }).lean();

        if (existingCode) {
            return NextResponse.json(
                {
                    success: false,
                    message: "Ya existe una ficha con ese código.",
                },
                { status: 409 }
            );
        }

        const productionTemplate = await ProductionTemplate.create({
            ...payload,
            createdBy: userId,
            updatedBy: userId,
        });

        const createdTemplate = await ProductionTemplate.findById(productionTemplate._id)
            .populate("createdBy", "name email")
            .populate("updatedBy", "name email")
            .lean();

        return NextResponse.json(
            {
                success: true,
                message: "Ficha de producción creada correctamente.",
                data: createdTemplate,
            },
            { status: 201 }
        );
    } catch (error) {
        console.error("POST /api/production-templates error:", error);

        if (error.name === "ValidationError") {
            const firstError =
                Object.values(error.errors)[0]?.message ||
                "Los datos enviados no son válidos.";

            return NextResponse.json(
                {
                    success: false,
                    message: firstError,
                    error: error.message,
                },
                { status: 400 }
            );
        }

        return NextResponse.json(
            {
                success: false,
                message: "No se pudo crear la ficha de producción.",
                error: error.message,
            },
            { status: 500 }
        );
    }
}