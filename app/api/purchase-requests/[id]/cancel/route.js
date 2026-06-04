import { NextResponse } from "next/server";

import { requireAuthenticatedUser } from "@libs/apiAuth";
import dbConnect from "@libs/mongodb";
import { createNotificationsForRoles, NOTIFICATION_TYPES } from "@libs/notifications";
import PurchaseRequest from "@models/PurchaseRequest";
import { isValidObjectId, normalizeNullableText } from "@libs/purchaseRequests";
import { isPrivilegedUserRole } from "@libs/userRoles";

export async function POST(request, { params }) {
    try {
        const { user, response } = await requireAuthenticatedUser();
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

        const isOwner = String(purchaseRequest.requestedBy) === user.id;
        const canCancel =
            isPrivilegedUserRole(user.role) ||
            (isOwner && purchaseRequest.status === "pending");

        if (!canCancel) {
            return NextResponse.json(
                { success: false, message: "No puedes cancelar esta solicitud." },
                { status: 403 }
            );
        }

        const body = await request.json();

        purchaseRequest.status = "cancelled";
        purchaseRequest.cancelledBy = user.id;
        purchaseRequest.cancelledAt = new Date();
        purchaseRequest.statusReason = normalizeNullableText(body.statusReason || body.reason || body.notes);
        purchaseRequest.addActivity({
            type: "request_cancelled",
            performedBy: user.id,
            title: "Solicitud cancelada",
            description: purchaseRequest.statusReason || "La solicitud fue cancelada.",
        });

        await purchaseRequest.save();

        if (String(user.role) !== "admin") {
            await createNotificationsForRoles(["admin"], {
                type: NOTIFICATION_TYPES.purchase_request_cancelled,
                title: "Solicitud de compra cancelada",
                message: `${purchaseRequest.requestNumber} fue cancelada.`,
                href: "/dashboard/purchases?tab=requests",
                entityType: "purchase_request",
                entityId: purchaseRequest._id,
                priority: "normal",
            }, {
                excludeUserIds: [user.id],
            }).catch((notificationError) => {
                console.error("purchase request cancelled notification error:", notificationError);
            });
        }

        return NextResponse.json(
            {
                success: true,
                message: "Solicitud cancelada correctamente.",
            },
            { status: 200 }
        );
    } catch (error) {
        console.error("POST /api/purchase-requests/[id]/cancel error:", error);
        return NextResponse.json(
            { success: false, message: error.message || "No se pudo cancelar la solicitud." },
            { status: 500 }
        );
    }
}
