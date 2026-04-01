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

export async function PATCH(request, context) {
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

        const body = await request.json();
        const { isActive } = body;

        if (typeof isActive !== "boolean") {
            return NextResponse.json(
                {
                    success: false,
                    message: "El campo isActive es obligatorio y debe ser booleano.",
                },
                { status: 400 }
            );
        }

        const updatedTemplate = await ProductionTemplate.findByIdAndUpdate(
            id,
            {
                isActive,
                updatedBy: userId,
            },
            {
                new: true,
                runValidators: true,
            }
        )
            .select(
                "code name description category type baseUnit expectedYield expectedWaste defaultDestination allowsMultipleOutputs requiresWasteRecord allowRealOutputAdjustment notes isActive inputs outputs createdBy updatedBy createdAt updatedAt"
            )
            .populate("category", "name")
            .populate("createdBy", "username")
            .populate("updatedBy", "username")
            .populate("inputs.productId", "name code baseUnit unit")
            .populate("outputs.productId", "name code baseUnit unit")
            .lean();

        if (!updatedTemplate) {
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
                message: isActive
                    ? "Ficha de producción activada correctamente."
                    : "Ficha de producción desactivada correctamente.",
                data: updatedTemplate,
            },
            { status: 200 }
        );
    } catch (error) {
        console.error("PATCH /api/production-templates/[id]/status error:", error);

        return NextResponse.json(
            {
                success: false,
                message: "No se pudo actualizar el estado de la ficha de producción.",
                error: error.message,
            },
            { status: 500 }
        );
    }
}