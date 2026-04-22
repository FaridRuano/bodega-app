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

        if (!["pending", "approved"].includes(purchaseRequest.status)) {
            return NextResponse.json(
                { success: false, message: "La solicitud no puede rechazarse en su estado actual." },
                { status: 400 }
            );
        }

        const body = await request.json();

        purchaseRequest.status = "rejected";
        purchaseRequest.rejectedBy = user.id;
        purchaseRequest.rejectedAt = new Date();
        purchaseRequest.statusReason = normalizeNullableText(body.statusReason || body.reason || body.notes);
        purchaseRequest.addActivity({
            type: "request_rejected",
            performedBy: user.id,
            title: "Solicitud rechazada",
            description: purchaseRequest.statusReason || "La solicitud fue rechazada por administracion.",
        });

        await purchaseRequest.save();

        await createNotificationsForUsers([purchaseRequest.requestedBy], {
            type: NOTIFICATION_TYPES.purchase_request_rejected,
            title: "Solicitud de compra rechazada",
            message: `${purchaseRequest.requestNumber} fue rechazada por administracion.`,
            href: "/dashboard/purchases?tab=requests",
            entityType: "purchase_request",
            entityId: purchaseRequest._id,
            priority: "normal",
        }).catch((notificationError) => {
            console.error("purchase request rejected notification error:", notificationError);
        });

        return NextResponse.json(
            {
                success: true,
                message: "Solicitud rechazada correctamente.",
            },
            { status: 200 }
        );
    } catch (error) {
        console.error("POST /api/purchase-requests/[id]/reject error:", error);
        return NextResponse.json(
            { success: false, message: error.message || "No se pudo rechazar la solicitud." },
            { status: 500 }
        );
    }
}
