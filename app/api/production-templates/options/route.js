import { NextResponse } from "next/server";

import dbConnect from "@libs/mongodb";
import ProductionTemplate from "@models/ProductionTemplate";

function parseBoolean(value) {
    if (value === "true") return true;
    if (value === "false") return false;
    return undefined;
}

function buildSearchFilter(search) {
    if (!search?.trim()) return null;

    const safeSearch = search.trim();

    return {
        $or: [
            { name: { $regex: safeSearch, $options: "i" } },
            { code: { $regex: safeSearch, $options: "i" } },
            { category: { $regex: safeSearch, $options: "i" } },
        ],
    };
}

export async function GET(request) {
    try {
        await dbConnect();

        const { searchParams } = new URL(request.url);

        const search = searchParams.get("search") || "";
        const type = searchParams.get("type") || "";
        const isActive = parseBoolean(searchParams.get("isActive"));

        const filters = {};

        const searchFilter = buildSearchFilter(search);
        if (searchFilter) {
            Object.assign(filters, searchFilter);
        }

        if (type) {
            filters.type = type;
        }

        if (typeof isActive === "boolean") {
            filters.isActive = isActive;
        }

        const templates = await ProductionTemplate.find(filters)
            .select("code name type category baseUnit defaultDestination isActive")
            .sort({ name: 1 })
            .lean();

        const options = templates.map((template) => ({
            value: template._id,
            label: template.code
                ? `${template.code} - ${template.name}`
                : template.name,
            code: template.code,
            name: template.name,
            type: template.type,
            category: template.category,
            baseUnit: template.baseUnit,
            defaultDestination: template.defaultDestination,
            isActive: template.isActive,
        }));

        return NextResponse.json(
            {
                success: true,
                data: options,
            },
            { status: 200 }
        );
    } catch (error) {
        console.error("GET /api/production-templates/options error:", error);

        return NextResponse.json(
            {
                success: false,
                message: "No se pudieron obtener las opciones de fichas de producción.",
                error: error.message,
            },
            { status: 500 }
        );
    }
}