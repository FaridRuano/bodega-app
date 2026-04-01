// src/app/api/products/options/route.js
import { NextResponse } from "next/server";
import dbConnect from "@libs/mongodb";
import Product from "@models/Product";

export async function GET() {
    try {
        await dbConnect();

        const products = await Product.find(
            { isActive: true },
            { _id: 1, name: 1, code: 1, unit: 1 }
        )
            .sort({ name: 1 })
            .lean();

        return NextResponse.json({
            ok: true,
            data: products,
        });
    } catch (error) {
        console.error("Error loading product options:", error);

        return NextResponse.json(
            {
                ok: false,
                message: "No se pudieron cargar los productos",
            },
            { status: 500 }
        );
    }
}