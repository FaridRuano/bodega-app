import mongoose from "mongoose";

import {
    getInventoryStatusLabel,
    getLocationLabel,
} from "@libs/constants/domainLabels";
import InventoryStock from "@models/InventoryStock";
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

export async function createNotificationsForRoles(roles = [], payload = {}, options = {}) {
    const normalizedRoles = Array.from(
        new Set((roles || []).map((value) => String(value || "").trim()).filter(Boolean))
    );
    const excludedUserIds = new Set(
        (options.excludeUserIds || [])
            .map((value) => String(value || "").trim())
            .filter(Boolean)
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
        users
            .filter((user) => !excludedUserIds.has(String(user._id)))
            .map((user) => ({
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

function getInventoryAlertRank(status) {
    switch (status) {
        case "warning":
            return 1;
        case "low":
            return 2;
        case "out":
            return 3;
        default:
            return 0;
    }
}

export async function createStockAlertNotifications(entries = [], options = {}) {
    const normalizedEntries = (entries || [])
        .map((entry) => {
            const productId = toObjectId(entry.productId);
            if (!productId) return null;

            const product = entry.product || {};
            const deltaQuantity = Number(entry.deltaQuantity || 0);
            if (!Number.isFinite(deltaQuantity) || deltaQuantity >= 0) return null;

            return {
                productId,
                product,
                deltaQuantity,
            };
        })
        .filter(Boolean);

    if (!normalizedEntries.length) return [];

    const groupedEntries = Array.from(
        normalizedEntries.reduce((map, entry) => {
            const key = String(entry.productId);
            const current = map.get(key) || {
                productId: entry.productId,
                product: entry.product || {},
                deltaQuantity: 0,
            };

            current.deltaQuantity += Number(entry.deltaQuantity || 0);
            if (!current.product?.name && entry.product) {
                current.product = entry.product;
            }

            map.set(key, current);
            return map;
        }, new Map()).values()
    ).filter((entry) => Number(entry.deltaQuantity || 0) < 0);

    if (!groupedEntries.length) return [];

    const productIds = groupedEntries.map((entry) => entry.productId);
    const stocks = await InventoryStock.find({
        productId: { $in: productIds },
    })
        .select("productId quantity")
        .lean();

    const totalsByProductId = new Map();

    for (const stock of stocks) {
        const key = String(stock.productId);
        totalsByProductId.set(
            key,
            Number((Number(totalsByProductId.get(key) || 0) + Number(stock.quantity || 0)).toFixed(6))
        );
    }

    const alertableEntries = groupedEntries
        .map((entry) => {
            const currentTotal = Number(totalsByProductId.get(String(entry.productId)) || 0);
            const previousTotal = Number(
                (currentTotal - Number(entry.deltaQuantity || 0)).toFixed(6)
            );
            const currentStatus = getInventoryAlertStatus(entry.product, currentTotal);
            const previousStatus = getInventoryAlertStatus(entry.product, previousTotal);

            if (!["low", "warning", "out"].includes(currentStatus)) return null;

            const currentRank = getInventoryAlertRank(currentStatus);
            const previousRank = getInventoryAlertRank(previousStatus);

            if (currentRank <= previousRank) return null;

            return {
                ...entry,
                currentTotal,
                currentStatus,
            };
        })
        .filter(Boolean);

    if (!alertableEntries.length) return [];

    const excludedUserIds = new Set(
        (options.excludeUserIds || [])
            .map((value) => String(value || "").trim())
            .filter(Boolean)
    );

    const users = await User.find({
        role: { $in: ["admin"] },
        isActive: true,
    })
        .select("_id role")
        .lean();

    if (!users.length) return [];

    const notificationItems = [];

    for (const entry of alertableEntries) {
        for (const user of users) {
            if (excludedUserIds.has(String(user._id))) continue;

            const statusMessage =
                entry.currentStatus === "warning"
                    ? "entró en el punto de reposición"
                    : entry.currentStatus === "low"
                        ? "quedó en stock bajo"
                        : "quedó sin stock";

            notificationItems.push({
                userId: user._id,
                role: user.role,
                type: NOTIFICATION_TYPES.stock_alert,
                title: "Alerta de stock",
                message: `${entry.product.name || "Producto"} ${statusMessage} en el sistema.`,
                href: "/dashboard/inventory",
                entityType: "product",
                entityId: entry.productId,
                priority: entry.currentStatus === "out" ? "high" : "normal",
                dedupeKey: "",
                metadata: {
                    quantity: entry.currentTotal,
                    status: entry.currentStatus,
                    scope: "system",
                },
            });
        }
    }

    return createNotifications(notificationItems);
}
