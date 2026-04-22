import { NextResponse } from "next/server";

import { requireAuthenticatedUser, requireUserRole } from "@libs/apiAuth";
import { slugify } from "@libs/slugify";
import dbConnect from "@libs/mongodb";
import Category from "@models/Category";
import ProductFamily from "@models/ProductFamily";

export async function GET() {
  try {
    const { response } = await requireAuthenticatedUser();
    if (response) return response;

    await dbConnect();

    const categories = await Category.find({})
      .populate("familyId", "name slug description")
      .sort({ sortOrder: 1, name: 1 })
      .lean();

    return NextResponse.json(
      {
        success: true,
        data: categories,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("GET /api/categories error:", error);

    return NextResponse.json(
      {
        success: false,
        message: "No se pudieron obtener las categorí­as.",
      },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  try {
    const { response } = await requireUserRole(["admin"]);
    if (response) return response;

    await dbConnect();

    const body = await request.json();
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    const description = body?.description?.trim?.() || "";
    const sortOrder = Number(body?.sortOrder) || 0;
    const isActive =
      typeof body?.isActive === "boolean" ? body.isActive : true;
    const familyId =
      typeof body?.familyId === "string" ? body.familyId.trim() : body?.familyId;

    if (!name) {
      return NextResponse.json(
        {
          success: false,
          message: "El nombre de la categorí­a es obligatorio.",
        },
        { status: 400 }
      );
    }

    const duplicatedCategory = await Category.findOne({ slug: slugify(name) }).lean();

    if (duplicatedCategory) {
      return NextResponse.json(
        {
          success: false,
          message: "Ya existe una categorí­a con ese nombre.",
        },
        { status: 409 }
      );
    }

    let family = null;

    if (familyId) {
      family = await ProductFamily.findById(familyId).lean();

      if (!family) {
        return NextResponse.json(
          {
            success: false,
            message: "La familia seleccionada no existe.",
          },
          { status: 404 }
        );
      }
    }

    const category = await Category.create({
      name,
      description,
      familyId: family?._id || null,
      sortOrder,
      isActive,
    });

    await category.populate("familyId", "name slug description");

    return NextResponse.json(
      {
        success: true,
        message: "Categorí­a creada correctamente.",
        data: category,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("POST /api/categories error:", error);

    if (error?.code === 11000) {
      return NextResponse.json(
        {
          success: false,
          message: "Ya existe una categorí­a con ese nombre.",
        },
        { status: 409 }
      );
    }

    return NextResponse.json(
      {
        success: false,
        message: "No se pudo crear la categorí­a.",
      },
      { status: 500 }
    );
  }
}
