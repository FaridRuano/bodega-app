import mongoose from "mongoose";
import { NextResponse } from "next/server";

import { requireAuthenticatedUser, requireUserRole } from "@libs/apiAuth";
import { slugify } from "@libs/slugify";
import dbConnect from "@libs/mongodb";
import Category from "@models/Category";
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
          message: "ID de familia invÃ¡lido.",
        },
        { status: 400 }
      );
    }

    const family = await ProductFamily.findById(id).lean();

    if (!family) {
      return NextResponse.json(
        {
          success: false,
          message: "Familia no encontrada.",
        },
        { status: 404 }
      );
    }

    const categoriesCount = await Category.countDocuments({ familyId: id });

    return NextResponse.json(
      {
        success: true,
        data: {
          ...family,
          categoriesCount,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("GET /api/families/[id] error:", error);

    return NextResponse.json(
      {
        success: false,
        message: "No se pudo obtener la familia.",
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
          message: "ID de familia invÃ¡lido.",
        },
        { status: 400 }
      );
    }

    const body = await request.json();
    const family = await ProductFamily.findById(id);

    if (!family) {
      return NextResponse.json(
        {
          success: false,
          message: "Familia no encontrada.",
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
            message: "El nombre de la familia es obligatorio.",
          },
          { status: 400 }
        );
      }

      const duplicatedFamily = await ProductFamily.findOne({
        slug: slugify(trimmedName),
        _id: { $ne: id },
      }).lean();

      if (duplicatedFamily) {
        return NextResponse.json(
          {
            success: false,
            message: "Ya existe una familia con ese nombre.",
          },
          { status: 409 }
        );
      }

      family.name = trimmedName;
      family.slug = undefined;
    }

    if (typeof body?.description === "string") {
      family.description = body.description.trim();
    }

    await family.save();

    const categoriesCount = await Category.countDocuments({ familyId: id });

    return NextResponse.json(
      {
        success: true,
        message: "Familia actualizada correctamente.",
        data: {
          ...family.toObject(),
          categoriesCount,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("PATCH /api/families/[id] error:", error);

    if (error?.code === 11000) {
      return NextResponse.json(
        {
          success: false,
          message: "Ya existe una familia con ese nombre.",
        },
        { status: 409 }
      );
    }

    return NextResponse.json(
      {
        success: false,
        message: "No se pudo actualizar la familia.",
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
          message: "ID de familia invÃ¡lido.",
        },
        { status: 400 }
      );
    }

    const family = await ProductFamily.findById(id);

    if (!family) {
      return NextResponse.json(
        {
          success: false,
          message: "Familia no encontrada.",
        },
        { status: 404 }
      );
    }

    const relatedCategories = await Category.countDocuments({ familyId: id });

    if (relatedCategories > 0) {
      return NextResponse.json(
        {
          success: false,
          message:
            "No se puede eliminar la familia porque tiene categor­as asociadas. Reasígnalas o quita la relación antes de eliminarla.",
        },
        { status: 409 }
      );
    }

    await ProductFamily.findByIdAndDelete(id);

    return NextResponse.json(
      {
        success: true,
        message: "Familia eliminada correctamente.",
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("DELETE /api/families/[id] error:", error);

    return NextResponse.json(
      {
        success: false,
        message: "No se pudo eliminar la familia.",
      },
      { status: 500 }
    );
  }
}
