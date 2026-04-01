import { NextResponse } from "next/server";

import dbConnect from "@libs/mongodb";
import Category from "@models/Category";

export async function GET() {
  try {
    await dbConnect();

    const categories = await Category.find({})
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
        message: "No se pudieron obtener las categorías.",
      },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  try {
    await dbConnect();

    const body = await request.json();

    const {
      name,
      description = "",
      sortOrder = 0,
      isActive = true,
    } = body;

    if (!name || !name.trim()) {
      return NextResponse.json(
        {
          success: false,
          message: "El nombre de la categoría es obligatorio.",
        },
        { status: 400 }
      );
    }

    const category = await Category.create({
      name: name.trim(),
      description: description?.trim?.() || "",
      sortOrder: Number(sortOrder) || 0,
      isActive: Boolean(isActive),
    });

    return NextResponse.json(
      {
        success: true,
        message: "Categoría creada correctamente.",
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
          message: "Ya existe una categoría con ese nombre o slug.",
        },
        { status: 409 }
      );
    }

    return NextResponse.json(
      {
        success: false,
        message: "No se pudo crear la categoría.",
      },
      { status: 500 }
    );
  }
}