import { NextResponse } from "next/server";

import { requireUserRole } from "@libs/apiAuth";
import dbConnect from "@libs/mongodb";
import { createNotificationsForUsers, NOTIFICATION_TYPES } from "@libs/notifications";
import PurchaseRequest from "@models/PurchaseRequest";
import { isValidObjectId, normalizeNullableText } from "@libs/purchaseRequests";

export async function POST(request, { params }) {
    try {
        const { user, response } = await requireUserRole(["admin"]);
        if (response) return response;

        await dbConnect();
        const { id } = await params;

        if (!isValidObjectId(id)) {
            return NextResponse.json(
                { success: false, message: "La solicitud no es valida." },
                { status: 400 }
            );
        }

        const purchaseRequest = await PurchaseRequest.findById(id);

        if (!purchaseRequest) {
            return NextResponse.json(
                { success: false, message: "La solicitud no existe." },
                { status: 404 }
            );
        }

        if (!["pending", "approved", "in_progress", "partially_purchased"].includes(purchaseRequest.status)) {
            return NextResponse.json(
                { success: false, message: "La solicitud no puede aprobarse en su estado actual." },
                { status: 400 }
            );
        }

        const body = await request.json();
        const itemMap = new Map((Array.isArray(body.items) ? body.items : []).map((item) => [String(item.itemId), item]));

        purchaseRequest.items = purchaseRequest.items.map((item) => {
            const override = itemMap.get(String(item._id));
            const approvedQuantity = override
                ? Number(override.approvedQuantity)
                : Number(item.requestedQuantity || 0);

            if (!Number.isFinite(approvedQuantity) || approvedQuantity < 0) {
                throw new Error("Las cantidades aprobadas no son validas.");
            }

            item.approvedQuantity = approvedQuantity;
            item.adminNote = override?.adminNote ? normalizeNullableText(override.adminNote) : item.adminNote;
            return item;
        });

        purchaseRequest.approvedBy = user.id;
        purchaseRequest.approvedAt = new Date();
        purchaseRequest.adminNote = normalizeNullableText(body.adminNote || body.notes);
        purchaseRequest.statusReason = "";
        purchaseRequest.recalculateStatus();
        purchaseRequest.addActivity({
            type: "request_approved",
            performedBy: user.id,
            title: "Solicitud aprobada",
            description: "La solicitud quedo disponible para el flujo de compras.",
        });

        await purchaseRequest.save();

        await createNotificationsForUsers([purchaseRequest.requestedBy], {
            type: NOTIFICATION_TYPES.purchase_request_approved,
            title: "Solicitud de compra aprobada",
            message: `${purchaseRequest.requestNumber} fue aprobada y ya entra al flujo de compra.`,
            href: "/dashboard/purchases?tab=requests",
            entityType: "purchase_request",
            entityId: purchaseRequest._id,
            priority: "normal",
        }).catch((notificationError) => {
            console.error("purchase request approved notification error:", notificationError);
        });

        return NextResponse.json(
            {
                success: true,
                message: "Solicitud aprobada correctamente.",
            },
            { status: 200 }
        );
    } catch (error) {
        console.error("POST /api/purchase-requests/[id]/approve error:", error);
        return NextResponse.json(
            { success: false, message: error.message || "No se pudo aprobar la solicitud." },
            { status: 500 }
        );
    }
}
