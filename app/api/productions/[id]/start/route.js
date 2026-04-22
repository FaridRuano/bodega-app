import mongoose from "mongoose";

import dbConnect from "@libs/mongodb";

import Production from "@models/Production";
import Product from "@models/Product";
import InventoryStock from "@models/InventoryStock";
import InventoryMovement from "@models/InventoryMovement";

import { requireUserRole } from "@libs/apiAuth";
import {
    createNotificationsForRoles,
    createStockAlertNotifications,
    NOTIFICATION_TYPES,
} from "@libs/notifications";
import {
    badRequest,
    notFound,
    okResponse,
    serverError,
    unauthorized,
} from "@libs/apiResponses";
import { isValidObjectId, normalizeText } from "@libs/apiUtils";

export async function POST(_request, { params }) {
    let session = null;

    try {
        await dbConnect();

        const { user, response } = await requireUserRole(["admin", "kitchen"]);
        if (response) return response;

        const { id } = await params;

        if (!isValidObjectId(id)) {
            return badRequest("El id de producción no es válido.");
        }

        session = await mongoose.startSession();

        let responsePayload = null;

        await session.withTransaction(async () => {
            const production = await Production.findById(id).session(session);

            if (!production) {
                throw new Error("__PRODUCTION_NOT_FOUND__");
            }

            if (production.status !== "draft") {
                throw new Error("__INVALID_STATUS__");
            }

            if (
                !Array.isArray(production.expectedInputs) ||
                production.expectedInputs.length === 0
            ) {
                throw new Error("__NO_EXPECTED_INPUTS__");
            }

            if (
                !production.targetQuantity ||
                Number(production.targetQuantity) <= 0
            ) {
                throw new Error("__INVALID_TARGET_QUANTITY__");
            }

            const inputProductIds = [
                ...new Set(
                    production.expectedInputs.map((item) => String(item.productId))
                ),
            ];

            const [products, kitchenStocks] = await Promise.all([
                Product.find({
                    _id: { $in: inputProductIds },
                    isActive: true,
                })
                    .session(session)
                    .lean(),
                InventoryStock.find({
                    productId: { $in: inputProductIds },
                    location: "kitchen",
                })
                    .session(session)
                    .lean(),
            ]);

            const productMap = new Map(
                products.map((product) => [String(product._id), product])
            );

            const stockMap = new Map(
                kitchenStocks.map((stock) => [String(stock.productId), stock])
            );

            for (const input of production.expectedInputs) {
                const productId = String(input.productId);
                const product = productMap.get(productId);
                const stock = stockMap.get(productId);

                if (!product) {
                    throw new Error(
                        `__MISSING_PRODUCT__${productId}`
                    );
                }

                if (!product.tracksStock) {
                    throw new Error(
                        `__PRODUCT_WITHOUT_STOCK__${product.name}`
                    );
                }

                const requiredQuantity = Number(input.quantity || 0);
                const availableQuantity = Number(stock?.availableQuantity || 0);

                if (!stock || availableQuantity < requiredQuantity) {
                    throw new Error(
                        `__INSUFFICIENT_STOCK__${product.name}__${requiredQuantity}__${availableQuantity}`
                    );
                }
            }

            for (const input of production.expectedInputs) {
                const productId = String(input.productId);
                const stock = await InventoryStock.findOne({
                    productId: input.productId,
                    location: "kitchen",
                }).session(session);

                if (!stock) {
                    throw new Error(`__STOCK_NOT_FOUND__${productId}`);
                }

                stock.quantity = Number(stock.quantity || 0) - Number(input.quantity || 0);
                stock.lastMovementAt = new Date();

                await stock.save({ session });
            }

            const movementDocs = production.expectedInputs.map((input) => ({
                productId: input.productId,
                movementType: "production_consumption",
                quantity: Number(input.quantity || 0),
                unitSnapshot: input.unitSnapshot,
                fromLocation: "kitchen",
                toLocation: undefined,
                referenceType: "production",
                referenceId: production._id,
                notes: normalizeText(
                    `Consumo automático al iniciar la producción ${production.productionNumber || ""}`.trim(),
                    500
                ),
                performedBy: user.id,
                movementDate: new Date(),
            }));

            if (movementDocs.length > 0) {
                await InventoryMovement.insertMany(movementDocs, { session });
            }

            production.status = "in_progress";
            production.startedAt = new Date();

            // Los insumos reales quedan fijados automáticamente
            // al iniciar la producción.
            production.inputs = production.expectedInputs.map((item) => ({
                productId: item.productId,
                productCodeSnapshot: item.productCodeSnapshot || "",
                productNameSnapshot: item.productNameSnapshot || "Producto",
                productTypeSnapshot: item.productTypeSnapshot || "",
                unitSnapshot: item.unitSnapshot,
                quantity: Number(item.quantity || 0),
                notes: item.notes || "",
            }));

            await production.save({ session });

            const updatedProduction = await Production.findById(production._id)
                .populate("performedBy", "firstName lastName username role")
                .populate("productionTemplateId", "name code type baseUnit")
                .populate("relatedRequestId", "requestNumber status")
                .session(session)
                .lean();

            responsePayload = updatedProduction;
        });

        const consumedProductIds = Array.from(
            new Set((responsePayload?.expectedInputs || []).map((item) => String(item.productId)))
        );
        const [consumedProducts, consumedStocks] = await Promise.all([
            Product.find({ _id: { $in: consumedProductIds } })
                .select("name minStock reorderPoint")
                .lean(),
            InventoryStock.find({
                productId: { $in: consumedProductIds },
                location: "kitchen",
            }).lean(),
        ]);

        const consumedProductMap = new Map(
            consumedProducts.map((product) => [String(product._id), product])
        );

        const alertEntries = consumedStocks.map((stock) => ({
            productId: stock.productId,
            product: consumedProductMap.get(String(stock.productId)) || {},
            location: stock.location,
            quantity: Number(stock.quantity || 0),
        }));

        await Promise.all([
            createNotificationsForRoles(["admin"], {
                type: NOTIFICATION_TYPES.production_started,
                title: "Produccion iniciada",
                message: `${responsePayload?.productionNumber || "Una produccion"} ya esta en proceso en cocina.`,
                href: "/dashboard/production?status=in_progress",
                entityType: "production",
                entityId: responsePayload?._id,
                priority: "normal",
            }),
            createStockAlertNotifications(alertEntries),
        ]).catch((notificationError) => {
            console.error("production started notification error:", notificationError);
        });

        return okResponse(
            responsePayload,
            "Producción iniciada correctamente. Los insumos fueron descontados del inventario de cocina."
        );
    } catch (error) {
        if (error?.message === "__PRODUCTION_NOT_FOUND__") {
            return notFound("Producción no encontrada.");
        }

        if (error?.message === "__INVALID_STATUS__") {
            return badRequest(
                "Solo se puede iniciar una producción en estado draft."
            );
        }

        if (error?.message === "__NO_EXPECTED_INPUTS__") {
            return badRequest(
                "La producción no tiene insumos esperados para iniciar."
            );
        }

        if (error?.message === "__INVALID_TARGET_QUANTITY__") {
            return badRequest(
                "La producción no tiene una cantidad objetivo válida."
            );
        }

        if (error?.message?.startsWith("__MISSING_PRODUCT__")) {
            return badRequest(
                "Uno de los productos requeridos por la producción no existe o está inactivo."
            );
        }

        if (error?.message?.startsWith("__PRODUCT_WITHOUT_STOCK__")) {
            const [, productName] = error.message.split("__");
            return badRequest(
                `El producto "${productName}" no maneja stock y no puede consumirse automáticamente.`
            );
        }

        if (error?.message?.startsWith("__STOCK_NOT_FOUND__")) {
            return badRequest(
                "No existe registro de inventario en cocina para uno de los insumos requeridos."
            );
        }

        if (error?.message?.startsWith("__INSUFFICIENT_STOCK__")) {
            const [, , productName] = error.message.split("__");

            return badRequest(
                productName
                    ? `Stock insuficiente en cocina para ${productName}.`
                    : "Stock insuficiente en cocina para iniciar la producción."
            );
        }

        return serverError(error, "[PRODUCTION_START_POST_ERROR]");
    } finally {
        if (session) {
            await session.endSession();
        }
    }
}
