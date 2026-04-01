import { NextResponse } from "next/server";
import dbConnect from "@libs/mongodb";
import Product from "@models/Product";

function parseBoolean(value) {
    if (value === "true") return true;
    if (value === "false") return false;
    return undefined;
}

export async function GET(req) {
    try {
        await dbConnect();

        const { searchParams } = new URL(req.url);
        const query = searchParams.get("q") || "";
        const allowsProduction = parseBoolean(searchParams.get("allowsProduction"));

        const filters = {
            isActive: true,
            $or: [
                { name: { $regex: query, $options: "i" } },
                { code: { $regex: query, $options: "i" } },
            ],
        };

        if (typeof allowsProduction === "boolean") {
            filters.allowsProduction = allowsProduction;
        }

        const products = await Product.find(filters)
            .select("_id name code unit allowsProduction")
            .limit(20)
            .lean();

        return NextResponse.json({
            ok: true,
            data: products,
        });
    } catch (error) {
        console.error(error);

        return NextResponse.json(
            { ok: false, message: "Error buscando productos" },
            { status: 500 }
        );
    }
}