import mongoose from "mongoose";

import {
    getInventoryStatusLabel,
    getLocationLabel,
} from "@libs/constants/domainLabels";
import Notification from "@models/Notification";
import User from "@models/User";

export const NOTIFICATION_TYPES = {
    purchase_request_created: "purchase_request_created",
    purchase_request_approved: "purchase_request_approved",
    purchase_request_cancelled: "purchase_request_cancelled",
    purchase_request_rejected: "purchase_request_rejected",
    purchase_request_received: "purchase_request_received",
    internal_request_created: "internal_request_created",
    internal_request_approved: "internal_request_approved",
    internal_request_rejected: "internal_request_rejected",
    internal_request_dispatched: "internal_request_dispatched",
    internal_request_received: "internal_request_received",
    purchase_batch_dispatched: "purchase_batch_dispatched",
    production_started: "production_started",
    production_completed: "production_completed",
    daily_control_closed: "daily_control_closed",
    stock_alert: "stock_alert",
};

function toObjectId(value) {
    if (!value || !mongoose.Types.ObjectId.isValid(value)) return null;
    return new mongoose.Types.ObjectId(value);
}

export function mapNotificationDocument(notification) {
    return {
        _id: notification._id,
        userId: notification.userId?._id || notification.userId,
        role: notification.role || "",
        type: notification.type || "",
        title: notification.title || "",
        message: notification.message || "",
        href: notification.href || "",
        entityType: notification.entityType || "",
        entityId: notification.entityId || null,
        priority: notification.priority || "normal",
        dedupeKey: notification.dedupeKey || "",
        seenAt: notification.seenAt || null,
        readAt: notification.readAt || null,
        metadata: notification.metadata || null,
        createdAt: notification.createdAt || null,
        updatedAt: notification.updatedAt || null,
    };
}

export async function createNotifications(items = []) {
    const normalizedItems = (items || [])
        .map((item) => {
            const userId = toObjectId(item.userId);
            if (!userId) return null;

            return {
                userId,
                role: item.role || null,
                type: String(item.type || "").trim() || "system",
                title: String(item.title || "").trim() || "Notificación",
                message: String(item.message || "").trim(),
                href: String(item.href || "").trim(),
                entityType: String(item.entityType || "").trim(),
                entityId: toObjectId(item.entityId) || null,
                priority: ["low", "normal", "high"].includes(item.priority)
                    ? item.priority
                    : "normal",
                dedupeKey: String(item.dedupeKey || "").trim(),
                metadata: item.metadata || null,
            };
        })
        .filter(Boolean);

    if (!normalizedItems.length) return [];

    const dedupeKeys = Array.from(
        new Set(
            normalizedItems
                .map((item) => String(item.dedupeKey || "").trim())
                .filter(Boolean)
        )
    );

    let existingUnreadByKey = new Set();

    if (dedupeKeys.length) {
        const existingUnread = await Notification.find({
            readAt: null,
            $or: normalizedItems
                .filter((item) => item.dedupeKey)
                .map((item) => ({
                    userId: item.userId,
                    dedupeKey: item.dedupeKey,
                })),
        })
            .select("userId dedupeKey")
            .lean();

        existingUnreadByKey = new Set(
            existingUnread.map(
                (item) => `${String(item.userId)}::${String(item.dedupeKey || "").trim()}`
            )
        );
    }

    const filteredItems = normalizedItems.filter((item) => {
        if (!item.dedupeKey) return true;

        return !existingUnreadByKey.has(
            `${String(item.userId)}::${String(item.dedupeKey || "").trim()}`
        );
    });

    if (!filteredItems.length) return [];

    return Notification.insertMany(filteredItems, { ordered: false });
}

export async function createNotificationsForUsers(userIds = [], payload = {}) {
    const uniqueUserIds = Array.from(
        new Set((userIds || []).map((value) => String(value || "")).filter(Boolean))
    );

    if (!uniqueUserIds.length) return [];

    const users = await User.find({
        _id: { $in: uniqueUserIds },
        isActive: true,
    })
        .select("_id role")
        .lean();

    if (!users.length) return [];

    return createNotifications(
        users.map((user) => ({
            ...payload,
            userId: user._id,
            role: payload.role || user.role,
        }))
    );
}

export async function createNotificationsForRoles(roles = [], payload = {}) {
    const normalizedRoles = Array.from(
        new Set((roles || []).map((value) => String(value || "").trim()).filter(Boolean))
    );

    if (!normalizedRoles.length) return [];

    const users = await User.find({
        role: { $in: normalizedRoles },
        isActive: true,
    })
        .select("_id role")
        .lean();

    if (!users.length) return [];

    return createNotifications(
        users.map((user) => ({
            ...payload,
            userId: user._id,
            role: user.role,
        }))
    );
}

export function getInventoryAlertStatus(product = {}, quantity = 0) {
    const totalQuantity = Number(quantity || 0);

    if (totalQuantity <= 0) {
        return "out";
    }

    if (Number(product.minStock || 0) > 0 && totalQuantity <= Number(product.minStock || 0)) {
        return "low";
    }

    if (
        Number(product.reorderPoint || 0) > 0 &&
        totalQuantity <= Number(product.reorderPoint || 0)
    ) {
        return "warning";
    }

    return "ok";
}

export async function createStockAlertNotifications(entries = []) {
    const normalizedEntries = (entries || [])
        .map((entry) => {
            const productId = toObjectId(entry.productId);
            if (!productId) return null;

            const location = String(entry.location || "").trim().toLowerCase();
            if (!location) return null;

            const product = entry.product || {};
            const quantity = Number(entry.quantity || 0);
            const status = getInventoryAlertStatus(product, quantity);

            if (!["low", "warning", "out"].includes(status)) return null;

            return {
                productId,
                product,
                location,
                quantity,
                status,
            };
        })
        .filter(Boolean);

    if (!normalizedEntries.length) return [];

    const users = await User.find({
        role: { $in: ["admin", ...new Set(normalizedEntries.map((entry) => entry.location))] },
        isActive: true,
    })
        .select("_id role")
        .lean();

    if (!users.length) return [];

    const notificationItems = [];

    for (const entry of normalizedEntries) {
        for (const user of users) {
            if (user.role !== "admin" && user.role !== entry.location) continue;

            notificationItems.push({
                userId: user._id,
                role: user.role,
                type: NOTIFICATION_TYPES.stock_alert,
                title: "Alerta de stock",
                message: `${entry.product.name || "Producto"} quedo en ${getInventoryStatusLabel(
                    entry.status,
                    "alerta"
                ).toLowerCase()} en ${getLocationLabel(entry.location)}.`,
                href: `/dashboard/inventory?scope=${entry.location}`,
                entityType: "product",
                entityId: entry.productId,
                priority: entry.status === "out" ? "high" : "normal",
                dedupeKey: `stock:${String(entry.productId)}:${entry.location}:${entry.status}`,
                metadata: {
                    location: entry.location,
                    quantity: entry.quantity,
                    status: entry.status,
                },
            });
        }
    }

    return createNotifications(notificationItems);
}
