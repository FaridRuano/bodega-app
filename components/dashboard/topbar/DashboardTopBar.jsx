"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Bell, BellRing, CheckCheck, Menu } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import styles from "./dashboard-topbar.module.scss";

const routeTitles = {
  "/dashboard": { eyebrow: "Panel de control", title: "Resumen" },
  "/dashboard/products": { eyebrow: "Inventario", title: "Productos" },
  "/dashboard/inventory": { eyebrow: "Modulo", title: "Inventario general" },
  "/dashboard/movements": { eyebrow: "Auditoria", title: "Movimientos" },
  "/dashboard/config": { eyebrow: "Sistema", title: "Configuracion" },
  "/dashboard/config/users": { eyebrow: "Sistema", title: "Usuarios" },
  "/dashboard/config/productionsheets": { eyebrow: "Sistema", title: "Fichas de produccion" },
  "/dashboard/config/categories": { eyebrow: "Sistema", title: "Jerarquia" },
  "/dashboard/config/hierarchy": { eyebrow: "Sistema", title: "Jerarquia" },
  "/dashboard/requests": { eyebrow: "Modulo", title: "Solicitudes" },
  "/dashboard/purchase-requests": { eyebrow: "Compras", title: "Compras" },
  "/dashboard/purchases": { eyebrow: "Compras", title: "Compras" },
  "/dashboard/purchases/history": { eyebrow: "Compras", title: "Historial" },
  "/dashboard/notifications": { eyebrow: "Actividad", title: "Notificaciones" },
  "/dashboard/receiving": { eyebrow: "Operacion", title: "Pendientes de recibir" },
  "/dashboard/daily-control": { eyebrow: "Operacion", title: "Control diario" },
  "/dashboard/production": { eyebrow: "Modulo", title: "Produccion" },
  "/dashboard/kitchen": { eyebrow: "Inventario", title: "Cocina" },
  "/dashboard/lounge": { eyebrow: "Inventario", title: "Salon" },
};

function getRouteInfo(pathname) {
  if (routeTitles[pathname]) {
    return routeTitles[pathname];
  }

  const match = Object.keys(routeTitles).find((route) => pathname.startsWith(route));

  return routeTitles[match] || {
    eyebrow: "Panel",
    title: "Dashboard",
  };
}

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

const DROPDOWN_FILTERS = [
  { value: "", label: "Todo" },
  { value: "purchase", label: "Compras" },
  { value: "request", label: "Solicitudes" },
  { value: "production", label: "Produccion" },
  { value: "inventory", label: "Inventario" },
];

const NOTIFICATION_TYPE_GROUPS = {
  purchase: new Set([
    "purchase_request_created",
    "purchase_request_approved",
    "purchase_request_cancelled",
    "purchase_request_rejected",
    "purchase_request_received",
    "purchase_batch_dispatched",
  ]),
  request: new Set([
    "internal_request_created",
    "internal_request_approved",
    "internal_request_rejected",
    "internal_request_dispatched",
    "internal_request_received",
  ]),
  production: new Set(["production_started", "production_completed"]),
  inventory: new Set(["daily_control_closed", "stock_alert"]),
};

function formatNotificationDate(value) {
  if (!value) return "Ahora";

  try {
    return new Intl.DateTimeFormat("es-EC", {
      dateStyle: "short",
      timeStyle: "short",
    }).format(new Date(value));
  } catch {
    return "Ahora";
  }
}

export default function DashboardTopbar({ user, onOpenSidebar }) {
  const router = useRouter();
  const pathname = usePathname();
  const { eyebrow, title } = getRouteInfo(pathname);
  const dropdownRef = useRef(null);
  const announcedIdsRef = useRef(new Set());
  const hasLoadedRef = useRef(false);
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [summary, setSummary] = useState({ unread: 0, unseen: 0 });
  const [isLoadingNotifications, setIsLoadingNotifications] = useState(true);
  const [isUpdatingNotifications, setIsUpdatingNotifications] = useState(false);
  const [dropdownFilter, setDropdownFilter] = useState("");
  const [notificationPermission, setNotificationPermission] = useState(
    typeof window !== "undefined" && "Notification" in window
      ? window.Notification.permission
      : "default"
  );

  const unseenIds = useMemo(
    () =>
      notifications
        .filter((notification) => !notification.seenAt)
        .map((notification) => notification._id),
    [notifications]
  );

  const notificationCountsByFilter = useMemo(() => {
    return DROPDOWN_FILTERS.reduce((accumulator, filter) => {
      if (!filter.value) {
        accumulator[filter.value] = notifications.filter((notification) => !notification.readAt).length;
        return accumulator;
      }

      const group = NOTIFICATION_TYPE_GROUPS[filter.value];
      accumulator[filter.value] = notifications.filter(
        (notification) => !notification.readAt && group?.has(notification.type)
      ).length;
      return accumulator;
    }, {});
  }, [notifications]);

  const filteredNotifications = useMemo(() => {
    if (!dropdownFilter) return notifications;

    const group = NOTIFICATION_TYPE_GROUPS[dropdownFilter];
    return notifications.filter((notification) => group?.has(notification.type));
  }, [dropdownFilter, notifications]);

  const unreadPreview = useMemo(
    () => filteredNotifications.filter((notification) => !notification.readAt),
    [filteredNotifications]
  );

  const readPreview = useMemo(
    () => filteredNotifications.filter((notification) => notification.readAt),
    [filteredNotifications]
  );

  async function loadNotifications({ silent = false } = {}) {
    try {
      if (!silent) setIsLoadingNotifications(true);

      const response = await fetch("/api/notifications?limit=16", {
        cache: "no-store",
      });
      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.message || "No se pudieron cargar las notificaciones.");
      }

      const nextNotifications = Array.isArray(result.data) ? result.data : [];
      const nextSummary = result.summary || { unread: 0, unseen: 0 };

      setNotifications(nextNotifications);
      setSummary(nextSummary);

      const nextIds = nextNotifications.map((notification) => notification._id);
      const unseenNewNotifications = nextNotifications.filter(
        (notification) =>
          !announcedIdsRef.current.has(notification._id) && !notification.seenAt
      );

      if (
        hasLoadedRef.current &&
        typeof window !== "undefined" &&
        "Notification" in window &&
        window.Notification.permission === "granted"
      ) {
        unseenNewNotifications.slice(0, 3).forEach((notification) => {
          try {
            const desktopNotification = new window.Notification(notification.title, {
              body: notification.message,
              tag: notification._id,
            });

            desktopNotification.onclick = () => {
              window.focus();
              router.push(notification.href || "/dashboard/notifications");
              desktopNotification.close();
            };
          } catch (error) {
            console.error("Notification API error:", error);
          }
        });
      }

      announcedIdsRef.current = new Set(nextIds);
      hasLoadedRef.current = true;
    } catch (error) {
      console.error(error);
      if (!silent) {
        setNotifications([]);
        setSummary({ unread: 0, unseen: 0 });
      }
    } finally {
      if (!silent) setIsLoadingNotifications(false);
    }
  }

  async function updateNotifications(action, ids = []) {
    try {
      setIsUpdatingNotifications(true);

      const response = await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ids }),
      });
      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.message || "No se pudieron actualizar las notificaciones.");
      }

      setSummary(result.summary || { unread: 0, unseen: 0 });
      await loadNotifications({ silent: true });
    } catch (error) {
      console.error(error);
    } finally {
      setIsUpdatingNotifications(false);
    }
  }

  async function handleBellClick() {
    const nextOpen = !isOpen;
    setIsOpen(nextOpen);

    if (nextOpen && unseenIds.length) {
      await updateNotifications("markSeen", unseenIds);
    }
  }

  async function handleNotificationClick(notification) {
    if (!notification?.readAt) {
      await updateNotifications("markRead", [notification._id]);
    }

    setIsOpen(false);
    router.push(notification?.href || "/dashboard/notifications");
  }

  async function handleRequestNotificationPermission() {
    if (typeof window === "undefined" || !("Notification" in window)) return;

    const permission = await window.Notification.requestPermission();
    setNotificationPermission(permission);
  }

  useEffect(() => {
    loadNotifications();
  }, []);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      loadNotifications({ silent: true });
    }, 30000);

    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    function handleClickOutside(event) {
      if (!dropdownRef.current?.contains(event.target)) {
        setIsOpen(false);
      }
    }

    function handleEscape(event) {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  return (
    <div className={styles.topbarCard}>
      <div className={styles.leftGroup}>
        <button
          type="button"
          className={styles.menuButton}
          onClick={onOpenSidebar}
          aria-label="Abrir menu"
        >
          <Menu size={20} />
        </button>

        <div>
          <p className={styles.eyebrow}>{eyebrow}</p>
          <h1 className={styles.title}>{title}</h1>
        </div>
      </div>

      <div className={styles.rightGroup}>
        <div className={styles.notificationsWrap} ref={dropdownRef}>
          <button
            type="button"
            className={styles.iconButton}
            aria-label="Notificaciones"
            aria-expanded={isOpen}
            onClick={handleBellClick}
          >
            {summary.unseen > 0 ? <BellRing size={18} /> : <Bell size={18} />}
            {summary.unseen > 0 ? (
              <span className={styles.notificationBadge}>{summary.unseen}</span>
            ) : null}
          </button>

          {isOpen ? (
            <div className={styles.notificationsDropdown}>
              <div className={styles.dropdownHeader}>
                <div>
                  <p className={styles.dropdownEyebrow}>Actividad</p>
                  <h2 className={styles.dropdownTitle}>Notificaciones</h2>
                </div>

                <button
                  type="button"
                  className="miniAction"
                  onClick={() => updateNotifications("markAllRead")}
                  disabled={isUpdatingNotifications || summary.unread === 0}
                >
                  <CheckCheck size={14} />
                  Marcar todo
                </button>
              </div>

              {notificationPermission !== "granted" && typeof window !== "undefined" && "Notification" in window ? (
                <div className={styles.permissionCard}>
                  <div>
                    <p className={styles.permissionTitle}>Avisos del navegador</p>
                    <p className={styles.permissionText}>
                      Activa permisos para recibir notificaciones cuando llegue algo importante.
                    </p>
                  </div>

                  <button
                    type="button"
                    className="miniAction miniActionPrimary"
                    onClick={handleRequestNotificationPermission}
                  >
                    Activar
                  </button>
                </div>
              ) : null}

              <div className={styles.filterStrip}>
                {DROPDOWN_FILTERS.map((filter) => (
                  <button
                    key={filter.value || "all"}
                    type="button"
                    className={`${styles.filterChip} ${dropdownFilter === filter.value ? styles.filterChipActive : ""}`}
                    onClick={() => setDropdownFilter(filter.value)}
                  >
                    <span>{filter.label}</span>
                    {notificationCountsByFilter[filter.value] ? (
                      <strong>{notificationCountsByFilter[filter.value]}</strong>
                    ) : null}
                  </button>
                ))}
              </div>

              <div className={styles.dropdownList}>
                {isLoadingNotifications ? (
                  <div className={styles.dropdownEmpty}>Cargando notificaciones...</div>
                ) : filteredNotifications.length === 0 ? (
                  <div className={styles.dropdownEmpty}>
                    No hay notificaciones para ese filtro.
                  </div>
                ) : (
                  <>
                    {unreadPreview.length ? (
                      <div className={styles.dropdownSection}>
                        <div className={styles.dropdownSectionHeader}>
                          <span>Nuevas</span>
                          <strong>{unreadPreview.length}</strong>
                        </div>

                        <div className={styles.dropdownSectionList}>
                          {unreadPreview.slice(0, 6).map((notification) => (
                            <button
                              key={notification._id}
                              type="button"
                              className={`${styles.dropdownItem} ${styles.dropdownItemUnread}`}
                              onClick={() => handleNotificationClick(notification)}
                            >
                              <div className={styles.dropdownItemTop}>
                                <span className={styles.dropdownItemTitle}>{notification.title}</span>
                                <span className={styles.dropdownItemBadge}>Nueva</span>
                              </div>
                              <p className={styles.dropdownItemMessage}>{notification.message}</p>
                              <div className={styles.dropdownItemMeta}>
                                <span>
                                  {NOTIFICATION_TYPE_LABELS[notification.type] || notification.type}
                                </span>
                                <span>{formatNotificationDate(notification.createdAt)}</span>
                              </div>
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : null}

                    {readPreview.length ? (
                      <div className={styles.dropdownSection}>
                        <div className={styles.dropdownSectionHeader}>
                          <span>Recientes</span>
                          <strong>{readPreview.length}</strong>
                        </div>

                        <div className={styles.dropdownSectionList}>
                          {readPreview.slice(0, 4).map((notification) => (
                            <button
                              key={notification._id}
                              type="button"
                              className={styles.dropdownItem}
                              onClick={() => handleNotificationClick(notification)}
                            >
                              <div className={styles.dropdownItemTop}>
                                <span className={styles.dropdownItemTitle}>{notification.title}</span>
                              </div>
                              <p className={styles.dropdownItemMessage}>{notification.message}</p>
                              <div className={styles.dropdownItemMeta}>
                                <span>
                                  {NOTIFICATION_TYPE_LABELS[notification.type] || notification.type}
                                </span>
                                <span>{formatNotificationDate(notification.createdAt)}</span>
                              </div>
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </>
                )}
              </div>

              <div className={styles.dropdownFooter}>
                <Link
                  href="/dashboard/notifications"
                  className="miniAction miniActionPrimary"
                  onClick={() => setIsOpen(false)}
                >
                  Ver todas
                </Link>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
