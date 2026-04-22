import mongoose from "mongoose";
import { NextResponse } from "next/server";

import { requireAuthenticatedUser, requireUserRole } from "@libs/apiAuth";
import { slugify } from "@libs/slugify";
import dbConnect from "@libs/mongodb";
import Category from "@models/Category";
import Product from "@models/Product";
import ProductFamily from "@models/ProductFamily";

function isValidObjectId(id) {
    return mongoose.Types.ObjectId.isValid(id);
}

export async function GET(_, context) {
    try {
        const { response } = await requireAuthenticatedUser();
        if (response) return response;

        await dbConnect();

        const { id } = await context.params;

        if (!isValidObjectId(id)) {
            return NextResponse.json(
                {
                    success: false,
                    message: "ID de categorí­a inválido.",
                },
                { status: 400 }
            );
        }

        const category = await Category.findById(id)
            .populate("familyId", "name slug description")
            .lean();

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
        const { response } = await requireUserRole(["admin"]);
        if (response) return response;

        await dbConnect();

        const { id } = await context.params;

        if (!isValidObjectId(id)) {
            return NextResponse.json(
                {
                    success: false,
                    message: "ID de categorí­a inválido.",
                },
                { status: 400 }
            );
        }

        const body = await request.json();
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

        if (typeof body?.name === "string") {
            const trimmedName = body.name.trim();

            if (!trimmedName) {
                return NextResponse.json(
                    {
                        success: false,
                        message: "El nombre de la categoría es obligatorio.",
                    },
                    { status: 400 }
                );
            }

            const duplicatedCategory = await Category.findOne({
                slug: slugify(trimmedName),
                _id: { $ne: id },
            }).lean();

            if (duplicatedCategory) {
                return NextResponse.json(
                    {
                        success: false,
                        message: "Ya existe una categoría con ese nombre.",
                    },
                    { status: 409 }
                );
            }

            category.name = trimmedName;
            category.slug = undefined;
        }

        if (typeof body?.description === "string") {
            category.description = body.description.trim();
        }

        if (typeof body?.sortOrder !== "undefined") {
            category.sortOrder = Number(body.sortOrder) || 0;
        }

        if (typeof body?.isActive === "boolean") {
            category.isActive = body.isActive;
        }

        if (Object.prototype.hasOwnProperty.call(body, "familyId")) {
            const familyId =
                typeof body.familyId === "string" ? body.familyId.trim() : body.familyId;

            if (!familyId) {
                category.familyId = null;
            } else {
                const family = await ProductFamily.findById(familyId).lean();

                if (!family) {
                    return NextResponse.json(
                        {
                            success: false,
                            message: "La familia seleccionada no existe.",
                        },
                        { status: 404 }
                    );
                }

                category.familyId = family._id;
            }
        }

        await category.save();
        await category.populate("familyId", "name slug description");

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
                    message: "Ya existe una categoría con ese nombre.",
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
        const { response } = await requireUserRole(["admin"]);
        if (response) return response;

        await dbConnect();

        const { id } = await context.params;

        if (!isValidObjectId(id)) {
            return NextResponse.json(
                {
                    success: false,
                    message: "ID de categorí­a inválido.",
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
