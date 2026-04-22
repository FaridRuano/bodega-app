"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, CheckCheck } from "lucide-react";

import styles from "./page.module.scss";
import PaginationBar from "@components/shared/PaginationBar/PaginationBar";

const PAGE_SIZE = 12;

const NOTIFICATION_TYPE_LABELS = {
    purchase_request_created: "Nueva solicitud de compra",
    purchase_request_approved: "Solicitud de compra aprobada",
    purchase_request_cancelled: "Solicitud de compra cancelada",
    purchase_request_rejected: "Solicitud de compra rechazada",
    purchase_request_received: "Compra confirmada",
    internal_request_created: "Nueva transferencia",
    internal_request_approved: "Transferencia aprobada",
    internal_request_rejected: "Transferencia rechazada",
    internal_request_dispatched: "Transferencia despachada",
    internal_request_received: "Transferencia confirmada",
    purchase_batch_dispatched: "Compra despachada",
    production_started: "Produccion iniciada",
    production_completed: "Produccion completada",
    daily_control_closed: "Control diario cerrado",
    stock_alert: "Alerta de stock",
};

const TYPE_FILTERS = [
    { value: "", label: "Todo" },
    { value: "purchase", label: "Compras" },
    { value: "request", label: "Solicitudes" },
    { value: "production", label: "Produccion" },
    { value: "inventory", label: "Inventario" },
];

function formatDate(value) {
    if (!value) return "Sin fecha";

    try {
        return new Intl.DateTimeFormat("es-EC", {
            dateStyle: "medium",
            timeStyle: "short",
        }).format(new Date(value));
    } catch {
        return "Sin fecha";
    }
}

export default function NotificationsPage() {
    const router = useRouter();
    const [notifications, setNotifications] = useState([]);
    const [summary, setSummary] = useState({ unread: 0, unseen: 0 });
    const [meta, setMeta] = useState({ page: 1, limit: PAGE_SIZE, total: 0, pages: 1 });
    const [page, setPage] = useState(1);
    const [unreadOnly, setUnreadOnly] = useState(false);
    const [typeFilter, setTypeFilter] = useState("");
    const [isLoading, setIsLoading] = useState(true);
    const [isUpdating, setIsUpdating] = useState(false);

    async function loadNotifications() {
        try {
            setIsLoading(true);

            const params = new URLSearchParams({
                page: String(page),
                limit: String(PAGE_SIZE),
            });

            if (unreadOnly) params.set("unreadOnly", "true");
            if (typeFilter) params.set("type", typeFilter);

            const response = await fetch(`/api/notifications?${params.toString()}`, {
                cache: "no-store",
            });
            const result = await response.json();

            if (!response.ok || !result.success) {
                throw new Error(result.message || "No se pudieron cargar las notificaciones.");
            }

            setNotifications(Array.isArray(result.data) ? result.data : []);
            setSummary(result.summary || { unread: 0, unseen: 0 });
            setMeta(result.meta || { page: 1, limit: PAGE_SIZE, total: 0, pages: 1 });
        } catch (error) {
            console.error(error);
            setNotifications([]);
        } finally {
            setIsLoading(false);
        }
    }

    useEffect(() => {
        loadNotifications();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [page, unreadOnly, typeFilter]);

    useEffect(() => {
        setPage(1);
    }, [unreadOnly, typeFilter]);

    async function markAllRead() {
        try {
            setIsUpdating(true);
            const response = await fetch("/api/notifications", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "markAllRead" }),
            });
            const result = await response.json();

            if (!response.ok || !result.success) {
                throw new Error(result.message || "No se pudieron marcar como leídas.");
            }

            await loadNotifications();
        } catch (error) {
            console.error(error);
        } finally {
            setIsUpdating(false);
        }
    }

    async function handleNotificationClick(notification) {
        try {
            if (!notification?.readAt) {
                const response = await fetch("/api/notifications", {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        action: "markRead",
                        ids: [notification._id],
                    }),
                });
                const result = await response.json();

                if (!response.ok || !result.success) {
                    throw new Error(result.message || "No se pudo actualizar la notificacion.");
                }
            }
        } catch (error) {
            console.error(error);
        } finally {
            router.push(notification?.href || "/dashboard");
        }
    }

    const hasNotifications = notifications.length > 0;
    const fromItem =
        meta.total === 0 ? 0 : (meta.page - 1) * meta.limit + 1;
    const toItem =
        meta.total === 0 ? 0 : Math.min(meta.page * meta.limit, meta.total);

    const heroStats = useMemo(
        () => [
            { label: "Sin leer", value: summary.unread, tone: "heroStatWarning" },
            { label: "Nuevas", value: summary.unseen, tone: "heroStatInfo" },
        ],
        [summary]
    );

    return (
        <div className="page">
            <section className={`hero fadeScaleIn ${styles.heroShell}`}>
                <div className="heroCopy">
                    <span className="eyebrow">Actividad</span>
                    <h1 className="title">Notificaciones</h1>
                    <p className="description">
                        Revisa avisos recientes, marca lo atendido y entra directo a cada módulo.
                    </p>
                </div>

                <div className={styles.heroStats}>
                    {heroStats.map((stat) => (
                        <span key={stat.label} className={`compactStat ${stat.tone}`}>
                            <span>
                                {stat.label} <strong>{stat.value}</strong>
                            </span>
                        </span>
                    ))}
                </div>
            </section>

            <div className={`${styles.toolbar} fadeSlideIn delayOne`}>
                <div className={styles.filterGroup}>
                    <button
                        type="button"
                        className={`miniAction ${!unreadOnly ? "miniActionPrimary" : ""}`}
                        onClick={() => setUnreadOnly(false)}
                    >
                        Todas
                    </button>
                    <button
                        type="button"
                        className={`miniAction ${unreadOnly ? "miniActionPrimary" : ""}`}
                        onClick={() => setUnreadOnly(true)}
                    >
                        Sin leer
                    </button>
                    <div className="selectWrap">
                        <select
                            className="filterSelect"
                            value={typeFilter}
                            onChange={(event) => setTypeFilter(event.target.value)}
                        >
                            {TYPE_FILTERS.map((option) => (
                                <option key={option.value || "all"} value={option.value}>
                                    {option.label}
                                </option>
                            ))}
                        </select>
                    </div>
                </div>

                <button
                    type="button"
                    className="miniAction"
                    onClick={markAllRead}
                    disabled={isUpdating || summary.unread === 0}
                >
                    <CheckCheck size={14} />
                    Marcar todo
                </button>
            </div>

            {isLoading ? (
                <div className={styles.emptyState}>Cargando notificaciones...</div>
            ) : !hasNotifications ? (
                <div className={styles.emptyState}>
                    <p className={styles.emptyTitle}>No hay notificaciones</p>
                    <p className={styles.emptyDescription}>
                        Cuando el sistema tenga algo importante que avisarte, aparecerá aquí.
                    </p>
                </div>
            ) : (
                <>
                    <div className={`${styles.list} fadeSlideIn delayTwo`}>
                        {notifications.map((notification, index) => (
                            <button
                                key={notification._id}
                                type="button"
                                className={`${styles.card} ${!notification.readAt ? styles.cardUnread : ""} fadeScaleIn`}
                                style={{ animationDelay: `${Math.min(index, 8) * 0.03}s` }}
                                onClick={() => handleNotificationClick(notification)}
                            >
                                <div className={styles.cardIcon}>
                                    <Bell size={16} />
                                </div>

                                <div className={styles.cardBody}>
                                    <div className={styles.cardTop}>
                                        <h2 className={styles.cardTitle}>{notification.title}</h2>
                                        {!notification.readAt ? (
                                            <span className={styles.unreadBadge}>Nueva</span>
                                        ) : null}
                                    </div>
                                    <p className={styles.cardMessage}>{notification.message}</p>
                                    <div className={styles.cardMeta}>
                                        <span>{formatDate(notification.createdAt)}</span>
                                        <span>{NOTIFICATION_TYPE_LABELS[notification.type] || notification.type}</span>
                                    </div>
                                </div>
                            </button>
                        ))}
                    </div>

                    <PaginationBar
                        page={meta.page}
                        totalPages={meta.pages}
                        totalItems={meta.total}
                        fromItem={fromItem}
                        toItem={toItem}
                        itemLabel="notificaciones"
                        onPageChange={setPage}
                    />
                </>
            )}
        </div>
    );
}
