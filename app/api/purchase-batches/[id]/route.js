import mongoose from "mongoose";
import { NextResponse } from "next/server";

import { requireUserRole } from "@libs/apiAuth";
import { isValidObjectId } from "@libs/purchaseRequests";
import dbConnect from "@libs/mongodb";
import PurchaseBatch from "@models/PurchaseBatch";

export async function DELETE(_, { params }) {
    try {
        const { response, user } = await requireUserRole(["admin"]);
        if (response) return response;

        await dbConnect();
        const { id } = await params;

        if (!isValidObjectId(id)) {
            return NextResponse.json(
                { success: false, message: "La compra no es valida." },
                { status: 400 }
            );
        }

        const batch = await PurchaseBatch.findById(id);

        if (!batch) {
            return NextResponse.json(
                { success: false, message: "El borrador no existe." },
                { status: 404 }
            );
        }

        if (batch.status !== "draft") {
            return NextResponse.json(
                { success: false, message: "Solo se pueden eliminar compras en borrador." },
                { status: 409 }
            );
        }

        batch.addActivity({
            type: "purchase_deleted_draft",
            performedBy: user.id,
            title: "Borrador eliminado",
            description: "El borrador de compra fue eliminado.",
            performedAt: new Date(),
        });

        await PurchaseBatch.findByIdAndDelete(id);

        return NextResponse.json(
            {
                success: true,
                message: "Borrador eliminado correctamente.",
            },
            { status: 200 }
        );
    } catch (error) {
        console.error("DELETE /api/purchase-batches/[id] error:", error);
        return NextResponse.json(
            { success: false, message: error.message || "No se pudo eliminar el borrador." },
            { status: 500 }
        );
    }
}
