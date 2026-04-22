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

    const families = await ProductFamily.find({}).sort({ name: 1 }).lean();

    const categoriesPerFamily = await Category.aggregate([
      {
        $match: {
          familyId: { $ne: null },
        },
      },
      {
        $group: {
          _id: "$familyId",
          count: { $sum: 1 },
        },
      },
    ]);

    const counts = new Map(
      categoriesPerFamily.map((item) => [String(item._id), item.count])
    );

    const data = families.map((family) => ({
      ...family,
      categoriesCount: counts.get(String(family._id)) || 0,
    }));

    return NextResponse.json(
      {
        success: true,
        data,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("GET /api/families error:", error);

    return NextResponse.json(
      {
        success: false,
        message: "No se pudieron obtener las familias.",
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
    const normalizedSlug = slugify(name);

    if (!name) {
      return NextResponse.json(
        {
          success: false,
          message: "El nombre de la familia es obligatorio.",
        },
        { status: 400 }
      );
    }

    const existingFamily = await ProductFamily.findOne({ slug: normalizedSlug }).lean();

    if (existingFamily) {
      return NextResponse.json(
        {
          success: false,
          message: "Ya existe una familia con ese nombre.",
        },
        { status: 409 }
      );
    }

    const family = await ProductFamily.create({
      name,
      description,
    });

    return NextResponse.json(
      {
        success: true,
        message: "Familia creada correctamente.",
        data: {
          ...family.toObject(),
          categoriesCount: 0,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("POST /api/families error:", error);

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
        message: "No se pudo crear la familia.",
      },
      { status: 500 }
    );
  }
}
