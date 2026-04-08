import { dbConnect } from "@libs/mongodb";

import Production from "@models/Production";
import InventoryMovement from "@models/InventoryMovement";

import { getAuthenticatedUser } from "@libs/apiAuth";
import {
    badRequest,
    notFound,
    okResponse,
    serverError,
    unauthorized,
} from "@libs/apiResponses";
import { isValidObjectId, parsePositiveNumber } from "@libs/apiUtils";

export async function GET(request, { params }) {
    try {
        await dbConnect();

        const user = await getAuthenticatedUser();
        if (!user?.id) {
            return unauthorized();
        }

        const { id } = await params;

        if (!isValidObjectId(id)) {
            return badRequest("El id de producción no es válido.");
        }

        const production = await Production.findById(id)
            .select("_id productionNumber status")
            .lean();

        if (!production) {
            return notFound("Producción no encontrada.");
        }

        const { searchParams } = new URL(request.url);

        const page = parsePositiveNumber(searchParams.get("page"), 1);
        const limit = parsePositiveNumber(searchParams.get("limit"), 20);

        const movementType = searchParams.get("movementType");
        const location = searchParams.get("location");
        const productId = searchParams.get("productId");
        const dateFrom = searchParams.get("dateFrom");
        const dateTo = searchParams.get("dateTo");

        const filter = {
            referenceType: "production",
            referenceId: production._id,
        };

        if (movementType) {
            filter.movementType = movementType;
        }

        if (productId) {
            if (!isValidObjectId(productId)) {
                return badRequest("productId no es válido.");
            }

            filter.productId = productId;
        }

        if (location) {
            filter.$or = [
                { fromLocation: location },
                { toLocation: location },
            ];
        }

        if (dateFrom || dateTo) {
            filter.movementDate = {};

            if (dateFrom) {
                const from = new Date(dateFrom);
                if (!Number.isNaN(from.getTime())) {
                    filter.movementDate.$gte = from;
                }
            }

            if (dateTo) {
                const to = new Date(dateTo);
                if (!Number.isNaN(to.getTime())) {
                    to.setHours(23, 59, 59, 999);
                    filter.movementDate.$lte = to;
                }
            }

            if (Object.keys(filter.movementDate).length === 0) {
                delete filter.movementDate;
            }
        }

        const skip = (page - 1) * limit;

        const [items, total] = await Promise.all([
            InventoryMovement.find(filter)
                .populate("productId", "code name unit productType")
                .populate("performedBy", "firstName lastName username role")
                .sort({ movementDate: -1, createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            InventoryMovement.countDocuments(filter),
        ]);

        return okResponse(
            {
                items,
                meta: {
                    page,
                    limit,
                    total,
                    pages: Math.ceil(total / limit),
                },
                production: {
                    _id: production._id,
                    productionNumber: production.productionNumber,
                    status: production.status,
                },
            },
            "Movimientos de la producción obtenidos correctamente."
        );
    } catch (error) {
        return serverError(error, "[PRODUCTION_MOVEMENTS_GET_ERROR]");
    }
}