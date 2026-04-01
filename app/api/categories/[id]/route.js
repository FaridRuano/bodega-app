import mongoose from "mongoose";
import { NextResponse } from "next/server";

import dbConnect from "@libs/mongodb";
import Category from "@models/Category";
import Product from "@models/Product";

function isValidObjectId(id) {
    return mongoose.Types.ObjectId.isValid(id);
}

export async function GET(_, context) {
    try {
        await dbConnect();

        const { id } = await context.params;

        if (!isValidObjectId(id)) {
            return NextResponse.json(
                {
                    success: false,
                    message: "ID de categoría inválido.",
                },
                { status: 400 }
            );
        }

        const category = await Category.findById(id).lean();

        if (!category) {
            return NextResponse.json(
                {
                    success: false,
                    message: "Categoría no encontrada.",
                },
                { status: 404 }
            );
        }

        return NextResponse.json(
            {
                success: true,
                data: category,
            },
            { status: 200 }
        );
    } catch (error) {
        console.error("GET /api/categories/[id] error:", error);

        return NextResponse.json(
            {
                success: false,
                message: "No se pudo obtener la categoría.",
            },
            { status: 500 }
        );
    }
}

export async function PATCH(request, context) {
    try {
        await dbConnect();

        const { id } = await context.params;

        if (!isValidObjectId(id)) {
            return NextResponse.json(
                {
                    success: false,
                    message: "ID de categoría inválido.",
                },
                { status: 400 }
            );
        }

        const body = await request.json();

        const {
            name,
            description,
            sortOrder,
            isActive,
        } = body;

        const category = await Category.findById(id);

        if (!category) {
            return NextResponse.json(
                {
                    success: false,
                    message: "Categoría no encontrada.",
                },
                { status: 404 }
            );
        }

        if (typeof name === "string") {
            if (!name.trim()) {
                return NextResponse.json(
                    {
                        success: false,
                        message: "El nombre de la categoría es obligatorio.",
                    },
                    { status: 400 }
                );
            }

            category.name = name.trim();
            category.slug = undefined;
        }

        if (typeof description === "string") {
            category.description = description.trim();
        }

        if (typeof sortOrder !== "undefined") {
            category.sortOrder = Number(sortOrder) || 0;
        }

        if (typeof isActive === "boolean") {
            category.isActive = isActive;
        }

        await category.save();

        return NextResponse.json(
            {
                success: true,
                message: "Categoría actualizada correctamente.",
                data: category,
            },
            { status: 200 }
        );
    } catch (error) {
        console.error("PATCH /api/categories/[id] error:", error);

        if (error?.code === 11000) {
            return NextResponse.json(
                {
                    success: false,
                    message: "Ya existe una categoría con ese nombre o slug.",
                },
                { status: 409 }
            );
        }

        return NextResponse.json(
            {
                success: false,
                message: "No se pudo actualizar la categoría.",
            },
            { status: 500 }
        );
    }
}

export async function DELETE(_, context) {
    try {
        await dbConnect();

        const { id } = await context.params;

        if (!isValidObjectId(id)) {
            return NextResponse.json(
                {
                    success: false,
                    message: "ID de categoría inválido.",
                },
                { status: 400 }
            );
        }

        const category = await Category.findById(id);

        if (!category) {
            return NextResponse.json(
                {
                    success: false,
                    message: "Categoría no encontrada.",
                },
                { status: 404 }
            );
        }

        const productsUsingCategory = await Product.countDocuments({
            categoryId: id,
        });

        if (productsUsingCategory > 0) {
            return NextResponse.json(
                {
                    success: false,
                    message:
                        "No se puede eliminar la categoría porque tiene productos asociados. Puedes desactivarla en su lugar.",
                },
                { status: 409 }
            );
        }

        await Category.findByIdAndDelete(id);

        return NextResponse.json(
            {
                success: true,
                message: "Categoría eliminada correctamente.",
            },
            { status: 200 }
        );
    } catch (error) {
        console.error("DELETE /api/categories/[id] error:", error);

        return NextResponse.json(
            {
                success: false,
                message: "No se pudo eliminar la categoría.",
            },
            { status: 500 }
        );
    }
}