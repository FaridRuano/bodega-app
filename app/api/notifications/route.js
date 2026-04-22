import { NextResponse } from "next/server";

import { requireAuthenticatedUser } from "@libs/apiAuth";
import { parsePositiveNumber } from "@libs/apiUtils";
import { mapNotificationDocument } from "@libs/notifications";
import dbConnect from "@libs/mongodb";
import Notification from "@models/Notification";

export async function GET(request) {
    try {
        const { user, response } = await requireAuthenticatedUser();
        if (response) return response;

        await dbConnect();

        const { searchParams } = new URL(request.url);
        const page = parsePositiveNumber(searchParams.get("page"), 1);
        const limit = Math.min(parsePositiveNumber(searchParams.get("limit"), 12), 50);
        const unreadOnly = searchParams.get("unreadOnly") === "true";
        const typeFilter = String(searchParams.get("type") || "").trim().toLowerCase();
        const skip = (page - 1) * limit;

        const query = { userId: user.id };
        if (unreadOnly) {
            query.readAt = null;
        }

        if (typeFilter === "purchase") {
            query.type = {
                $in: [
                    "purchase_request_created",
                    "purchase_request_approved",
                    "purchase_request_cancelled",
                    "purchase_request_rejected",
                    "purchase_request_received",
                    "purchase_batch_dispatched",
                ],
            };
        } else if (typeFilter === "request") {
            query.type = {
                $in: [
                    "internal_request_created",
                    "internal_request_approved",
                    "internal_request_rejected",
                    "internal_request_dispatched",
                    "internal_request_received",
                ],
            };
        } else if (typeFilter === "production") {
            query.type = {
                $in: ["production_started", "production_completed"],
            };
        } else if (typeFilter === "inventory") {
            query.type = {
                $in: ["daily_control_closed", "stock_alert"],
            };
        }

        const [notifications, total, unreadCount, unseenCount] = await Promise.all([
            Notification.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
            Notification.countDocuments(query),
            Notification.countDocuments({ userId: user.id, readAt: null }),
            Notification.countDocuments({ userId: user.id, seenAt: null }),
        ]);

        return NextResponse.json(
            {
                success: true,
                data: notifications.map(mapNotificationDocument),
                meta: {
                    page,
                    limit,
                    total,
                    pages: Math.max(Math.ceil(total / limit), 1),
                },
                summary: {
                    unread: unreadCount,
                    unseen: unseenCount,
                },
            },
            { status: 200 }
        );
    } catch (error) {
        console.error("GET /api/notifications error:", error);
        return NextResponse.json(
            { success: false, message: "No se pudieron obtener las notificaciones." },
            { status: 500 }
        );
    }
}

export async function PATCH(request) {
    try {
        const { user, response } = await requireAuthenticatedUser();
        if (response) return response;

        await dbConnect();

        const body = await request.json();
        const action = String(body.action || "").trim();
        const ids = Array.isArray(body.ids)
            ? body.ids.map((value) => String(value || "").trim()).filter(Boolean)
            : [];
        const now = new Date();

        let update = null;
        let query = { userId: user.id };

        if (action === "markSeen") {
            update = { $set: { seenAt: now } };
            query = { ...query, _id: { $in: ids }, seenAt: null };
        } else if (action === "markRead") {
            update = {
                $set: {
                    seenAt: now,
                    readAt: now,
                },
            };
            query = { ...query, _id: { $in: ids }, readAt: null };
        } else if (action === "markAllSeen") {
            update = { $set: { seenAt: now } };
            query = { ...query, seenAt: null };
        } else if (action === "markAllRead") {
            update = { $set: { seenAt: now, readAt: now } };
            query = { ...query, readAt: null };
        } else {
            return NextResponse.json(
                { success: false, message: "La acción de notificación no es válida." },
                { status: 400 }
            );
        }

        if ((action === "markSeen" || action === "markRead") && !ids.length) {
            return NextResponse.json(
                { success: false, message: "Debes enviar al menos una notificación." },
                { status: 400 }
            );
        }

        await Notification.updateMany(query, update);

        const [unreadCount, unseenCount] = await Promise.all([
            Notification.countDocuments({ userId: user.id, readAt: null }),
            Notification.countDocuments({ userId: user.id, seenAt: null }),
        ]);

        return NextResponse.json(
            {
                success: true,
                message: "Notificaciones actualizadas.",
                summary: {
                    unread: unreadCount,
                    unseen: unseenCount,
                },
            },
            { status: 200 }
        );
    } catch (error) {
        console.error("PATCH /api/notifications error:", error);
        return NextResponse.json(
            { success: false, message: "No se pudieron actualizar las notificaciones." },
            { status: 500 }
        );
    }
}
