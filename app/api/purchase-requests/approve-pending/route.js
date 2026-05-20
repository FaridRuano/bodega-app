import { NextResponse } from "next/server";

import { requireUserRole } from "@libs/apiAuth";
import dbConnect from "@libs/mongodb";
import { createNotificationsForUsers, NOTIFICATION_TYPES } from "@libs/notifications";
import PurchaseRequest from "@models/PurchaseRequest";
import {
    buildPurchaseSearchFilter,
    normalizePurchaseRequestStatus,
} from "@libs/purchaseRequests";

function buildBulkApprovalQuery({ search, status }) {
    const filters = [{ status: "pending" }];
    const searchFilter = buildPurchaseSearchFilter(search);
    const normalizedStatus = normalizePurchaseRequestStatus(status);

    if (searchFilter) {
        filters.push(searchFilter);
    }

    if (normalizedStatus && normalizedStatus !== "pending") {
        filters.push({ _id: null });
    }

    return filters.length > 1 ? { $and: filters } : filters[0];
}

export async function POST(request) {
    try {
        const { user, response } = await requireUserRole(["admin"]);
        if (response) return response;

        await dbConnect();

        const body = await request.json().catch(() => ({}));
        const query = buildBulkApprovalQuery({
            search: body.search,
            status: body.status,
        });

        const pendingRequests = await PurchaseRequest.find(query);

        if (!pendingRequests.length) {
            return NextResponse.json(
                {
                    success: true,
                    message: "No hay solicitudes pendientes por aprobar.",
                    data: {
                        approvedCount: 0,
                    },
                },
                { status: 200 }
            );
        }

        for (const purchaseRequest of pendingRequests) {
            purchaseRequest.items = purchaseRequest.items.map((item) => {
                item.approvedQuantity = Number(item.requestedQuantity || 0);
                return item;
            });

            purchaseRequest.approvedBy = user.id;
            purchaseRequest.approvedAt = new Date();
            purchaseRequest.adminNote = purchaseRequest.adminNote || "";
            purchaseRequest.statusReason = "";
            purchaseRequest.recalculateStatus();
            purchaseRequest.addActivity({
                type: "request_approved",
                performedBy: user.id,
                title: "Solicitud aprobada",
                description: "La solicitud fue aprobada junto con otras solicitudes pendientes.",
            });
        }

        await Promise.all(pendingRequests.map((purchaseRequest) => purchaseRequest.save()));

        await Promise.all(
            pendingRequests.map((purchaseRequest) =>
                createNotificationsForUsers([purchaseRequest.requestedBy], {
                    type: NOTIFICATION_TYPES.purchase_request_approved,
                    title: "Solicitud de compra aprobada",
                    message: "Se aprobó tu solicitud y ya está pendiente de compra.",
                    href: "/dashboard/purchases?tab=requests",
                    entityType: "purchase_request",
                    entityId: purchaseRequest._id,
                    priority: "normal",
                }).catch((notificationError) => {
                    console.error("bulk purchase request approved notification error:", notificationError);
                })
            )
        );

        return NextResponse.json(
            {
                success: true,
                message: "Solicitudes aprobadas correctamente.",
                data: {
                    approvedCount: pendingRequests.length,
                },
            },
            { status: 200 }
        );
    } catch (error) {
        console.error("POST /api/purchase-requests/approve-pending error:", error);
        return NextResponse.json(
            { success: false, message: error.message || "No se pudieron aprobar las solicitudes." },
            { status: 500 }
        );
    }
}
