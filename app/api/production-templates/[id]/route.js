import { NextResponse } from "next/server";
import mongoose from "mongoose";

import { auth } from "@auth";
import dbConnect from "@libs/mongodb";
import ProductionTemplate from "@models/ProductionTemplate";

async function getCurrentUserId() {
    const session = await auth();
    return session?.user?.id || session?.user?._id || null;
}

function isValidObjectId(id) {
    return mongoose.Types.ObjectId.isValid(id);
}

function sanitizeTemplatePayload(payload = {}) {
    return {
        code: payload.code?.trim()?.toUpperCase() || "",
        name: payload.name?.trim() || "",
        description: payload.description?.trim() || "",
        category:
            typeof payload.category === "string"
                ? payload.category.trim()
                : payload.category?._id || "",
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
                    item.quantity === "" ||
                        item.quantity === undefined ||
                        item.quantity === null
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
                    item.quantity === "" ||
                        item.quantity === undefined ||
                        item.quantity === null
                        ? null
                        : Number(item.quantity),
                unit: item.unit,
                isMain: Boolean(item.isMain),
                isByProduct: Boolean(item.isByProduct),
                notes: item.notes?.trim() || "",
            }))
            : [],
    };
}

function formatProductionTemplateDetail(template) {
    if (!template) return null;

    return {
        ...template,
        category: template.category
            ? {
                _id: template.category._id?.toString?.() || template.category._id,
                name: template.category.name || "",
            }
            : null,
        createdBy: template.createdBy?.username || "",
        updatedBy: template.updatedBy?.username || "",
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

export async function GET(request, context) {
    try {
        await dbConnect();

        const { id } = await context.params;

        if (!isValidObjectId(id)) {
            return NextResponse.json(
                {
                    success: false,
                    message: "El id de la ficha no es válido.",
                },
                { status: 400 }
            );
        }

        const productionTemplate = await ProductionTemplate.findById(id)
            .select(
                "code name description category type baseUnit expectedYield expectedWaste defaultDestination allowsMultipleOutputs requiresWasteRecord allowRealOutputAdjustment notes isActive inputs outputs createdBy updatedBy createdAt updatedAt"
            )
            .populate("category", "name")
            .populate("createdBy", "username")
            .populate("updatedBy", "username")
            .populate("inputs.productId", "name code baseUnit unit")
            .populate("outputs.productId", "name code baseUnit unit")
            .lean();

        if (!productionTemplate) {
            return NextResponse.json(
                {
                    success: false,
                    message: "Ficha de producción no encontrada.",
                },
                { status: 404 }
            );
        }

        return NextResponse.json(
            {
                success: true,
                data: formatProductionTemplateDetail(productionTemplate),
            },
            { status: 200 }
        );
    } catch (error) {
        console.error("GET /api/production-templates/[id] error:", error);

        return NextResponse.json(
            {
                success: false,
                message: "No se pudo obtener la ficha de producción.",
                error: error.message,
            },
            { status: 500 }
        );
    }
}

export async function PUT(request, context) {
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

        const { id } = await context.params;

        if (!isValidObjectId(id)) {
            return NextResponse.json(
                {
                    success: false,
                    message: "El id de la ficha no es válido.",
                },
                { status: 400 }
            );
        }

        const existingTemplate = await ProductionTemplate.findById(id);

        if (!existingTemplate) {
            return NextResponse.json(
                {
                    success: false,
                    message: "Ficha de producción no encontrada.",
                },
                { status: 404 }
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

        if (payload.code) {
            const duplicatedCode = await ProductionTemplate.findOne({
                code: payload.code,
                _id: { $ne: id },
            }).lean();

            if (duplicatedCode) {
                return NextResponse.json(
                    {
                        success: false,
                        message: "Ya existe otra ficha con ese código.",
                    },
                    { status: 409 }
                );
            }
        }

        existingTemplate.code = payload.code;
        existingTemplate.name = payload.name;
        existingTemplate.description = payload.description;
        existingTemplate.category = payload.category;
        existingTemplate.type = payload.type;
        existingTemplate.baseUnit = payload.baseUnit;
        existingTemplate.expectedYield = payload.expectedYield;
        existingTemplate.expectedWaste = payload.expectedWaste;
        existingTemplate.defaultDestination = payload.defaultDestination;
        existingTemplate.allowsMultipleOutputs = payload.allowsMultipleOutputs;
        existingTemplate.requiresWasteRecord = payload.requiresWasteRecord;
        existingTemplate.allowRealOutputAdjustment = payload.allowRealOutputAdjustment;
        existingTemplate.notes = payload.notes;
        existingTemplate.isActive = payload.isActive;
        existingTemplate.inputs = payload.inputs.map((item) => ({
            productId: item.productId,
            quantity: item.quantity,
            unit: item.unit,
            isPrimary: Boolean(item.isPrimary),
            notes: item.notes || "",
        }));
        existingTemplate.outputs = payload.outputs.map((item) => ({
            productId: item.productId,
            quantity: item.quantity === null ? null : item.quantity,
            unit: item.unit,
            isMain: Boolean(item.isMain),
            isByProduct: Boolean(item.isByProduct),
            notes: item.notes || "",
        }));
        existingTemplate.updatedBy = userId;

        await existingTemplate.save();

        const updatedTemplate = await ProductionTemplate.findById(id)
            .select(
                "code name description category type baseUnit expectedYield expectedWaste defaultDestination allowsMultipleOutputs requiresWasteRecord allowRealOutputAdjustment notes isActive inputs outputs createdBy updatedBy createdAt updatedAt"
            )
            .populate("category", "name")
            .populate("createdBy", "username")
            .populate("updatedBy", "username")
            .populate("inputs.productId", "name code baseUnit unit")
            .populate("outputs.productId", "name code baseUnit unit")
            .lean();

        return NextResponse.json(
            {
                success: true,
                message: "Ficha de producción actualizada correctamente.",
                data: formatProductionTemplateDetail(updatedTemplate),
            },
            { status: 200 }
        );
    } catch (error) {
        console.error("PUT /api/production-templates/[id] error:", error);

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
                message: "No se pudo actualizar la ficha de producción.",
                error: error.message,
            },
            { status: 500 }
        );
    }
}

export async function DELETE(_request, { params }) {
    try {
        await dbConnect();

        const { id } = await params;

        if (!id || !mongoose.Types.ObjectId.isValid(id)) {
            return NextResponse.json(
                {
                    success: false,
                    message: "El id de la ficha de producción no es válido.",
                },
                { status: 400 }
            );
        }

        const template = await ProductionTemplate.findById(id);

        if (!template) {
            return NextResponse.json(
                {
                    success: false,
                    message: "La ficha de producción no fue encontrada.",
                },
                { status: 404 }
            );
        }

        await ProductionTemplate.findByIdAndDelete(id);

        return NextResponse.json(
            {
                success: true,
                message: "La ficha de producción fue eliminada correctamente.",
            },
            { status: 200 }
        );
    } catch (error) {
        console.error("DELETE /api/production-templates/[id] error:", error);

        return NextResponse.json(
            {
                success: false,
                message: "No se pudo eliminar la ficha de producción.",
                error: error.message,
            },
            { status: 500 }
        );
    }
}