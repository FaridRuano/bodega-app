"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
    AlertTriangle,
    ArrowRight,
    Box,
    ChefHat,
    ClipboardCheck,
    ClipboardList,
    Factory,
    PackageCheck,
    PackageSearch,
    RefreshCcw,
    ShoppingBag,
    Sofa,
    Sparkles,
    Warehouse,
} from "lucide-react";

import styles from "./page.module.scss";
import { useDashboardUser } from "@context/dashboard-user-context";
import { getLocationLabel } from "@libs/constants/domainLabels";
import { getRequestStatusLabel } from "@libs/constants/domainLabels";
import { PRODUCTION_STATUS_LABELS } from "@libs/constants/productionStatus";
import { getUserDisplayName } from "@libs/userDisplay";

const PURCHASE_REQUEST_STATUS_LABELS = {
    pending: "Pendiente",
    approved: "Aprobada",
    in_progress: "En proceso",
    partially_purchased: "Parcialmente atendida",
    completed: "Completada",
    rejected: "Rechazada",
    cancelled: "Cancelada",
};

function getTodayValue() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

function formatNumber(value) {
    return new Intl.NumberFormat("es-EC", {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
    }).format(Number(value || 0));
}

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

function getRequestDate(request) {
    return request?.requestedAt || request?.updatedAt || request?.createdAt || null;
}

function getScopedInventoryTotal(item, role) {
    if (role === "warehouse") return Number(item.inventory?.warehouse || 0);
    if (role === "kitchen") return Number(item.inventory?.kitchen || 0);
    if (role === "lounge") return Number(item.inventory?.lounge || 0);
    return Number(item.inventory?.total || 0);
}

function hasPendingInternalReceipt(request) {
    return (request.items || []).some(
        (item) =>
            Number(item.dispatchedQuantity || 0) > Number(item.receivedQuantity || 0)
    );
}

function hasPendingPurchaseReceipt(request) {
    return (request.items || []).some(
        (item) =>
            Number(item.dispatchedQuantity || 0) > Number(item.receivedQuantity || 0)
    );
}

function getPurchaseRequestStatusLabel(status) {
    return PURCHASE_REQUEST_STATUS_LABELS[status] || status || "Pendiente";
}

function sortByRecent(items = [], getDate) {
    return [...items].sort(
        (a, b) => new Date(getDate(b) || 0).getTime() - new Date(getDate(a) || 0).getTime()
    );
}

function QuickLink({ href, icon: Icon, title, caption }) {
    return (
        <Link href={href} className={styles.quickLink}>
            <div className={styles.quickLinkTop}>
                <Icon size={15} />
                <ArrowRight size={14} />
            </div>
            <strong className={styles.quickLinkTitle}>{title}</strong>
            <span className={styles.quickLinkCaption}>{caption}</span>
        </Link>
    );
}

function AttentionCard({ href, icon: Icon, label, value, caption, tone = "default" }) {
    return (
        <Link href={href} className={`${styles.attentionCard} ${styles[`attention${tone}`] || ""}`}>
            <div className={styles.attentionIcon}>
                <Icon size={16} />
            </div>
            <div className={styles.attentionCopy}>
                <span className={styles.attentionLabel}>{label}</span>
                <strong className={styles.attentionValue}>{value}</strong>
                <span className={styles.attentionCaption}>{caption}</span>
            </div>
        </Link>
    );
}

function SectionHeader({ title, description, href, hrefLabel = "Ver todo" }) {
    return (
        <div className={styles.sectionHeader}>
            <div>
                <h2 className={styles.sectionTitle}>{title}</h2>
                {description ? (
                    <p className={styles.sectionDescription}>{description}</p>
                ) : null}
            </div>

            {href ? (
                <Link href={href} className="miniAction">
                    {hrefLabel}
                </Link>
            ) : null}
        </div>
    );
}

function EmptyState({ title, description }) {
    return (
        <div className={styles.emptyState}>
            <p className={styles.emptyTitle}>{title}</p>
            {description ? <p className={styles.emptyDescription}>{description}</p> : null}
        </div>
    );
}

function RecentList({ items = [] }) {
    if (!items.length) {
        return (
            <EmptyState
                title="Sin actividad reciente"
                description="No hay elementos recientes para mostrar en este bloque."
            />
        );
    }

    return (
        <div className={styles.recentList}>
            {items.map((item) => (
                <Link key={item.id} href={item.href} className={styles.recentItem}>
                    <div className={styles.recentMain}>
                        <p className={styles.recentTitle}>{item.title}</p>
                        <p className={styles.recentMeta}>{item.meta}</p>
                    </div>
                    <div className={styles.recentAside}>
                        <strong className={styles.recentValue}>{item.value}</strong>
                        <span className={styles.recentMeta}>{item.date}</span>
                    </div>
                </Link>
            ))}
        </div>
    );
}

export default function DashboardPage() {
    const user = useDashboardUser();
    const [data, setData] = useState({
        inventoryItems: [],
        requests: [],
        purchaseRequests: [],
        productions: [],
        purchaseBatches: [],
        dailyControlContext: null,
        dailyControlsToday: [],
    });
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        if (!user?.role) return;

        let ignore = false;

        async function loadData() {
            try {
                setIsLoading(true);

                const currentUserId = String(user.id || user._id || "");
                const today = getTodayValue();
                const requestParams = new URLSearchParams();
                const purchaseRequestParams = new URLSearchParams();
                const productionParams = new URLSearchParams();

                if (["kitchen", "lounge"].includes(user.role)) {
                    requestParams.set("requestedBy", currentUserId);
                    purchaseRequestParams.set("mine", "true");
                }

                if (user.role === "warehouse") {
                    requestParams.set("sourceLocation", "warehouse");
                }

                if (user.role === "kitchen") {
                    productionParams.set("location", "kitchen");
                }

                const tasks = [
                    fetch("/api/inventory", { cache: "no-store" }),
                    fetch(
                        `/api/requests${requestParams.toString() ? `?${requestParams.toString()}` : ""}`,
                        { cache: "no-store" }
                    ),
                    fetch(
                        `/api/purchase-requests${purchaseRequestParams.toString() ? `?${purchaseRequestParams.toString()}` : ""}`,
                        { cache: "no-store" }
                    ),
                ];

                if (user.role === "admin" || user.role === "kitchen") {
                    tasks.push(
                        fetch(
                            `/api/productions${productionParams.toString() ? `?${productionParams.toString()}` : ""}`,
                            { cache: "no-store" }
                        )
                    );
                } else {
                    tasks.push(Promise.resolve({ ok: true, json: async () => ({ success: true, data: { items: [] } }) }));
                }

                if (user.role === "admin") {
                    tasks.push(fetch("/api/purchase-batches", { cache: "no-store" }));
                    tasks.push(
                        fetch(
                            `/api/inventory/daily-controls?dateFrom=${today}&dateTo=${today}&limit=20`,
                            { cache: "no-store" }
                        )
                    );
                } else {
                    tasks.push(Promise.resolve({ ok: true, json: async () => ({ success: true, data: [] }) }));

                    if (["kitchen", "lounge"].includes(user.role)) {
                        tasks.push(
                            fetch(
                                `/api/inventory/daily-controls?mode=context&location=${user.role}&date=${today}`,
                                { cache: "no-store" }
                            )
                        );
                    } else {
                        tasks.push(Promise.resolve({ ok: true, json: async () => ({ success: true, data: null }) }));
                    }
                }

                const responses = await Promise.all(tasks);
                const results = await Promise.all(responses.map((response) => response.json()));

                const [
                    inventoryResult,
                    requestsResult,
                    purchaseRequestsResult,
                    productionsResult,
                    purchaseBatchesResult,
                    dailyControlResult,
                ] = results;

                if (!ignore) {
                    setData({
                        inventoryItems: Array.isArray(inventoryResult?.data) ? inventoryResult.data : [],
                        requests: Array.isArray(requestsResult?.data) ? requestsResult.data : [],
                        purchaseRequests: Array.isArray(purchaseRequestsResult?.data) ? purchaseRequestsResult.data : [],
                        productions: Array.isArray(productionsResult?.data?.items)
                            ? productionsResult.data.items
                            : [],
                        purchaseBatches: Array.isArray(purchaseBatchesResult?.data)
                            ? purchaseBatchesResult.data
                            : [],
                        dailyControlContext:
                            user.role === "admin" ? null : dailyControlResult?.data || null,
                        dailyControlsToday:
                            user.role === "admin" && Array.isArray(dailyControlResult?.data)
                                ? dailyControlResult.data
                                : [],
                    });
                }
            } catch (error) {
                console.error("[DASHBOARD_PAGE_LOAD_ERROR]", error);

                if (!ignore) {
                    setData({
                        inventoryItems: [],
                        requests: [],
                        purchaseRequests: [],
                        productions: [],
                        purchaseBatches: [],
                        dailyControlContext: null,
                        dailyControlsToday: [],
                    });
                }
            } finally {
                if (!ignore) {
                    setIsLoading(false);
                }
            }
        }

        loadData();

        return () => {
            ignore = true;
        };
    }, [user]);

    const dashboard = useMemo(() => {
        const role = user?.role || "";
        const userId = String(user?.id || user?._id || "");
        const locationRole = ["warehouse", "kitchen", "lounge"].includes(role) ? role : null;
        const inventoryItems = data.inventoryItems || [];
        const requests = data.requests || [];
        const purchaseRequests = data.purchaseRequests || [];
        const productions = data.productions || [];
        const purchaseBatches = data.purchaseBatches || [];

        const scopedInventory = inventoryItems.filter((item) => {
            if (!locationRole || role === "admin") return true;
            return getScopedInventoryTotal(item, role) > 0;
        });

        const stockAlerts = inventoryItems.filter((item) => {
            if (role === "admin") {
                return ["low", "warning", "out"].includes(item.status);
            }

            const scopedQuantity = getScopedInventoryTotal(item, role);
            const minStock = Number(item.minStock || 0);
            return scopedQuantity > 0 && minStock > 0 && scopedQuantity <= minStock;
        });

        const pendingApprovals = requests.filter((item) => item.status === "pending");
        const pendingDispatches = requests.filter((item) =>
            ["approved", "processing", "partially_fulfilled"].includes(item.status)
        );
        const pendingInternalReceipts = requests.filter((item) => {
            if (!locationRole) return false;
            return item.destinationLocation === locationRole && hasPendingInternalReceipt(item);
        });

        const pendingPurchaseApprovals = purchaseRequests.filter(
            (item) => item.status === "pending"
        );
        const purchaseExecution = purchaseRequests.filter((item) =>
            ["approved", "in_progress", "partially_purchased"].includes(item.status)
        );
        const pendingPurchaseReceipts = purchaseRequests.filter((item) => {
            if (!locationRole || role === "admin") return false;
            return (
                item.destinationLocation === locationRole &&
                hasPendingPurchaseReceipt(item)
            );
        });

        const activeProductions = productions.filter((item) => item.status === "in_progress");
        const draftProductions = productions.filter((item) => item.status === "draft");
        const draftPurchases = purchaseBatches.filter((item) => item.baseStatus === "draft" || item.status === "draft");
        const dispatchablePurchases = purchaseBatches.filter(
            (item) =>
                (item.baseStatus || item.status) === "purchased" ||
                (item.baseStatus || item.status) === "Compra realizada"
        );

        const localInventoryTotal = scopedInventory.reduce(
            (sum, item) => sum + getScopedInventoryTotal(item, role),
            0
        );

        const heroTitleMap = {
            admin: "Centro de control",
            warehouse: "Panel de bodega",
            kitchen: "Panel de cocina",
            lounge: "Panel de salon",
        };

        const heroDescriptionMap = {
            admin: "Consulta todo lo que requiere atención inmediata en compras, solicitudes, producción, inventario y cierres diarios.",
            warehouse: "Aprueba, despacha y controla lo pendiente en bodega desde una sola vista operativa.",
            kitchen: "Revisa lo pendiente de cocina, lo que debes recibir, producir o cerrar hoy.",
            lounge: "Mantén a mano lo pendiente de salon: solicitudes, recepciones, stock y cierre diario.",
        };

        const todayClosed =
            role === "admin"
                ? null
                : Boolean(data.dailyControlContext?.existingControl);

        const recentRequests = sortByRecent(
            role === "admin" || role === "warehouse"
                ? requests
                : requests.filter((item) => String(item.requestedBy?._id || item.requestedBy?.id || "") === userId),
            getRequestDate
        ).slice(0, 4);

        const recentPurchaseRequests = sortByRecent(
            purchaseRequests,
            (item) => item.requestedAt || item.createdAt
        ).slice(0, 4);

        const recentProductions = sortByRecent(
            productions,
            (item) => item.startedAt || item.createdAt
        ).slice(0, 4);

        const quickLinksByRole = {
            admin: [
                {
                    href: "/dashboard/requests?status=pending",
                    icon: ClipboardList,
                    title: "Solicitudes internas",
                    caption: "Auditar y atender pendientes",
                },
                {
                    href: "/dashboard/purchases?tab=execution",
                    icon: ShoppingBag,
                    title: "Compras",
                    caption: "Aprobar, ejecutar y despachar",
                },
                {
                    href: "/dashboard/production?status=in_progress",
                    icon: Factory,
                    title: "Produccion",
                    caption: "Supervisar procesos activos",
                },
            ],
            warehouse: [
                {
                    href: "/dashboard/requests?status=pending",
                    icon: ClipboardList,
                    title: "Solicitudes",
                    caption: "Aprobar o rechazar",
                },
                {
                    href: "/dashboard/receiving",
                    icon: PackageCheck,
                    title: "Recibir",
                    caption: "Confirmar recepciones",
                },
                {
                    href: "/dashboard/inventory?scope=warehouse&view=compact",
                    icon: Warehouse,
                    title: "Inventario",
                    caption: "Ver stock en bodega",
                },
            ],
            kitchen: [
                {
                    href: "/dashboard/requests",
                    icon: ClipboardList,
                    title: "Solicitudes",
                    caption: "Pedir, revisar y seguir",
                },
                {
                    href: "/dashboard/receiving",
                    icon: PackageCheck,
                    title: "Recibir",
                    caption: "Confirmar lo despachado",
                },
                {
                    href: "/dashboard/production?status=in_progress",
                    icon: ChefHat,
                    title: "Produccion",
                    caption: "Continuar procesos activos",
                },
            ],
            lounge: [
                {
                    href: "/dashboard/requests",
                    icon: ClipboardList,
                    title: "Solicitudes",
                    caption: "Pedir y dar seguimiento",
                },
                {
                    href: "/dashboard/receiving",
                    icon: PackageCheck,
                    title: "Recibir",
                    caption: "Confirmar entregas pendientes",
                },
                {
                    href: "/dashboard/inventory?scope=lounge&view=compact",
                    icon: Sofa,
                    title: "Inventario",
                    caption: "Controlar stock del salon",
                },
            ],
        };

        const attentionCardsByRole = {
            admin: [
                {
                    href: "/dashboard/requests?status=pending",
                    icon: ClipboardList,
                    label: "Solicitudes por aprobar",
                    value: pendingApprovals.length,
                    caption: "Transferencias internas nuevas",
                    tone: pendingApprovals.length ? "warning" : "default",
                },
                {
                    href: "/dashboard/purchases?tab=requests",
                    icon: ShoppingBag,
                    label: "Compras por aprobar",
                    value: pendingPurchaseApprovals.length,
                    caption: "Solicitudes de compra pendientes",
                    tone: pendingPurchaseApprovals.length ? "warning" : "default",
                },
                {
                    href: "/dashboard/purchases?tab=execution",
                    icon: PackageSearch,
                    label: "Compras por despachar",
                    value: dispatchablePurchases.length,
                    caption: "Compras ya registradas",
                    tone: dispatchablePurchases.length ? "info" : "default",
                },
                {
                    href: "/dashboard/production?status=in_progress",
                    icon: Factory,
                    label: "Producciones activas",
                    value: activeProductions.length,
                    caption: "Procesos corriendo ahora",
                    tone: activeProductions.length ? "success" : "default",
                },
                {
                    href: "/dashboard/inventory",
                    icon: AlertTriangle,
                    label: "Alertas de stock",
                    value: stockAlerts.length,
                    caption: "Productos con atención requerida",
                    tone: stockAlerts.length ? "danger" : "default",
                },
                {
                    href: "/dashboard/daily-control",
                    icon: ClipboardCheck,
                    label: "Cierres de hoy",
                    value: data.dailyControlsToday.length,
                    caption: "Registros auditados del día",
                    tone: data.dailyControlsToday.length ? "success" : "default",
                },
            ],
            warehouse: [
                {
                    href: "/dashboard/requests?status=pending",
                    icon: ClipboardList,
                    label: "Por aprobar",
                    value: pendingApprovals.length,
                    caption: "Solicitudes nuevas a revisar",
                    tone: pendingApprovals.length ? "warning" : "default",
                },
                {
                    href: "/dashboard/requests?status=processing",
                    icon: PackageSearch,
                    label: "Por despachar",
                    value: pendingDispatches.length,
                    caption: "Transferencias listas para salida",
                    tone: pendingDispatches.length ? "info" : "default",
                },
                {
                    href: "/dashboard/receiving",
                    icon: PackageCheck,
                    label: "Por recibir",
                    value:
                        pendingInternalReceipts.length +
                        pendingPurchaseReceipts.length,
                    caption: "Confirmaciones pendientes",
                    tone:
                        pendingInternalReceipts.length + pendingPurchaseReceipts.length
                            ? "success"
                            : "default",
                },
                {
                    href: "/dashboard/inventory?scope=warehouse",
                    icon: AlertTriangle,
                    label: "Alertas de stock",
                    value: stockAlerts.length,
                    caption: "Productos bajo mínimo en bodega",
                    tone: stockAlerts.length ? "danger" : "default",
                },
            ],
            kitchen: [
                {
                    href: "/dashboard/requests",
                    icon: ClipboardList,
                    label: "Solicitudes activas",
                    value: requests.filter((item) =>
                        ["pending", "approved", "processing", "partially_fulfilled"].includes(item.status)
                    ).length,
                    caption: "Transferencias abiertas de cocina",
                    tone: requests.length ? "warning" : "default",
                },
                {
                    href: "/dashboard/receiving",
                    icon: PackageCheck,
                    label: "Pendientes de recibir",
                    value:
                        pendingInternalReceipts.length +
                        pendingPurchaseReceipts.length,
                    caption: "Compras y transferencias por confirmar",
                    tone:
                        pendingInternalReceipts.length + pendingPurchaseReceipts.length
                            ? "success"
                            : "default",
                },
                {
                    href: "/dashboard/production?status=in_progress",
                    icon: Factory,
                    label: "Producciones en proceso",
                    value: activeProductions.length,
                    caption: "Procesos activos en cocina",
                    tone: activeProductions.length ? "info" : "default",
                },
                {
                    href: "/dashboard/daily-control",
                    icon: ClipboardCheck,
                    label: todayClosed ? "Dia cerrado" : "Dia sin cerrar",
                    value: todayClosed ? "OK" : "Pendiente",
                    caption: "Control diario del turno",
                    tone: todayClosed ? "success" : "warning",
                },
                {
                    href: "/dashboard/inventory?scope=kitchen",
                    icon: AlertTriangle,
                    label: "Alertas de stock",
                    value: stockAlerts.length,
                    caption: "Productos bajo mínimo en cocina",
                    tone: stockAlerts.length ? "danger" : "default",
                },
            ],
            lounge: [
                {
                    href: "/dashboard/requests",
                    icon: ClipboardList,
                    label: "Solicitudes activas",
                    value: requests.filter((item) =>
                        ["pending", "approved", "processing", "partially_fulfilled"].includes(item.status)
                    ).length,
                    caption: "Transferencias abiertas del salon",
                    tone: requests.length ? "warning" : "default",
                },
                {
                    href: "/dashboard/receiving",
                    icon: PackageCheck,
                    label: "Pendientes de recibir",
                    value:
                        pendingInternalReceipts.length +
                        pendingPurchaseReceipts.length,
                    caption: "Compras y transferencias por confirmar",
                    tone:
                        pendingInternalReceipts.length + pendingPurchaseReceipts.length
                            ? "success"
                            : "default",
                },
                {
                    href: "/dashboard/daily-control",
                    icon: ClipboardCheck,
                    label: todayClosed ? "Dia cerrado" : "Dia sin cerrar",
                    value: todayClosed ? "OK" : "Pendiente",
                    caption: "Control diario del turno",
                    tone: todayClosed ? "success" : "warning",
                },
                {
                    href: "/dashboard/inventory?scope=lounge",
                    icon: AlertTriangle,
                    label: "Alertas de stock",
                    value: stockAlerts.length,
                    caption: "Productos bajo mínimo en salon",
                    tone: stockAlerts.length ? "danger" : "default",
                },
            ],
        };

        const recentPrimaryByRole = {
            admin: recentRequests.map((item) => ({
                id: item._id,
                href: `/dashboard/requests?search=${encodeURIComponent(item.requestNumber || "")}`,
                title: item.requestNumber || "Solicitud",
                meta: item.justification || "Solicitud interna",
                value: getRequestStatusLabel(item.status),
                date: formatDate(getRequestDate(item)),
            })),
            warehouse: recentRequests.map((item) => ({
                id: item._id,
                href: `/dashboard/requests?search=${encodeURIComponent(item.requestNumber || "")}`,
                title: item.requestNumber || "Solicitud",
                meta: `${getLocationLabel(item.sourceLocation)} → ${getLocationLabel(item.destinationLocation)}`,
                value: getRequestStatusLabel(item.status),
                date: formatDate(getRequestDate(item)),
            })),
            kitchen: recentRequests.map((item) => ({
                id: item._id,
                href: `/dashboard/requests?search=${encodeURIComponent(item.requestNumber || "")}`,
                title: item.requestNumber || "Solicitud",
                meta: item.justification || "Solicitud interna",
                value: getRequestStatusLabel(item.status),
                date: formatDate(getRequestDate(item)),
            })),
            lounge: recentRequests.map((item) => ({
                id: item._id,
                href: `/dashboard/requests?search=${encodeURIComponent(item.requestNumber || "")}`,
                title: item.requestNumber || "Solicitud",
                meta: item.justification || "Solicitud interna",
                value: getRequestStatusLabel(item.status),
                date: formatDate(getRequestDate(item)),
            })),
        };

        const recentSecondaryByRole = {
            admin: recentPurchaseRequests.map((item) => ({
                id: item._id,
                href: `/dashboard/purchases?tab=requests&search=${encodeURIComponent(item.requestNumber || "")}`,
                title: item.requestNumber || "Solicitud de compra",
                meta: getUserDisplayName(item.requestedBy, "Sin responsable"),
                value: getPurchaseRequestStatusLabel(item.status),
                date: formatDate(item.requestedAt || item.createdAt),
            })),
            warehouse: stockAlerts.slice(0, 4).map((item) => ({
                id: item._id,
                href: `/dashboard/inventory?search=${encodeURIComponent(item.name || item.code || "")}&scope=warehouse`,
                title: item.name,
                meta: item.code || "Sin código",
                value: formatNumber(getScopedInventoryTotal(item, "warehouse")),
                date: "Stock actual",
            })),
            kitchen: recentProductions.map((item) => ({
                id: item._id,
                href: `/dashboard/production/${item._id}`,
                title: item.productionNumber || "Producción",
                meta: item.templateSnapshot?.name || "Sin ficha",
                value: PRODUCTION_STATUS_LABELS[item.status] || item.status,
                date: formatDate(item.startedAt || item.createdAt),
            })),
            lounge: recentPurchaseRequests.map((item) => ({
                id: item._id,
                href: `/dashboard/purchases?tab=requests&search=${encodeURIComponent(item.requestNumber || "")}`,
                title: item.requestNumber || "Solicitud de compra",
                meta: getLocationLabel(item.destinationLocation),
                value: getPurchaseRequestStatusLabel(item.status),
                date: formatDate(item.requestedAt || item.createdAt),
            })),
        };

        const heroStatsByRole = {
            admin: [
                { label: "Alertas", value: stockAlerts.length, tone: "" },
                { label: "Solicitudes", value: pendingApprovals.length, tone: "heroStatWarning" },
                { label: "Producción", value: activeProductions.length, tone: "heroStatInfo" },
            ],
            warehouse: [
                { label: "Bodega", value: formatNumber(localInventoryTotal), tone: "" },
                { label: "Despachos", value: pendingDispatches.length, tone: "heroStatInfo" },
                { label: "Recepciones", value: pendingInternalReceipts.length + pendingPurchaseReceipts.length, tone: "heroStatSuccess" },
            ],
            kitchen: [
                { label: "Cocina", value: formatNumber(localInventoryTotal), tone: "" },
                { label: "Recibir", value: pendingInternalReceipts.length + pendingPurchaseReceipts.length, tone: "heroStatSuccess" },
                { label: "Producir", value: activeProductions.length + draftProductions.length, tone: "heroStatInfo" },
            ],
            lounge: [
                { label: "Salon", value: formatNumber(localInventoryTotal), tone: "" },
                { label: "Recibir", value: pendingInternalReceipts.length + pendingPurchaseReceipts.length, tone: "heroStatSuccess" },
                { label: "Alertas", value: stockAlerts.length, tone: "heroStatWarning" },
            ],
        };

        return {
            role,
            title: heroTitleMap[role] || "Resumen",
            description: heroDescriptionMap[role] || "Resumen operativo",
            eyebrow:
                role === "admin"
                    ? "Vista global"
                    : `Operacion · ${getLocationLabel(role, "Usuario")}`,
            heroStats: heroStatsByRole[role] || [],
            quickLinks: quickLinksByRole[role] || [],
            attentionCards: attentionCardsByRole[role] || [],
            recentPrimary: recentPrimaryByRole[role] || [],
            recentSecondary: recentSecondaryByRole[role] || [],
            recentPrimaryTitle:
                role === "admin" || role === "warehouse"
                    ? "Solicitudes recientes"
                    : "Tus solicitudes recientes",
            recentSecondaryTitle:
                role === "admin"
                    ? "Compras recientes"
                    : role === "warehouse"
                      ? "Alertas recientes"
                      : role === "kitchen"
                        ? "Producción reciente"
                        : "Compras recientes",
            recentPrimaryHref:
                role === "admin" || role === "warehouse"
                    ? "/dashboard/requests"
                    : "/dashboard/requests",
            recentSecondaryHref:
                role === "admin"
                    ? "/dashboard/purchases?tab=requests"
                    : role === "warehouse"
                      ? "/dashboard/inventory?scope=warehouse"
                      : role === "kitchen"
                        ? "/dashboard/production"
                        : "/dashboard/purchases?tab=requests",
            todayInfo:
                role === "admin"
                    ? `${data.dailyControlsToday.length} cierres registrados hoy`
                    : role === "warehouse"
                      ? "Bodega opera con control por solicitudes, despachos y stock."
                    : todayClosed
                      ? "El control diario ya fue registrado hoy"
                      : "Todavia falta cerrar el dia",
            draftsCount: draftPurchases.length,
        };
    }, [data, user]);

    if (isLoading) {
        return (
            <section className={`${styles.loadingState} fadeScaleIn`}>
                Cargando dashboard...
            </section>
        );
    }

    if (!user?.role) {
        return (
            <section className={`${styles.loadingState} fadeScaleIn`}>
                No se pudo cargar el rol del usuario.
            </section>
        );
    }

    return (
        <section className={`${styles.wrapper} fadeScaleIn`}>
            <section className={`hero ${styles.heroShell} fadeScaleIn`}>
                <div className="heroCopy">
                    <span className="eyebrow">{dashboard.eyebrow}</span>
                    <h1 className="title">{dashboard.title}</h1>
                    <p className="description">{dashboard.description}</p>
                </div>

                <div className={styles.heroStats}>
                    {dashboard.heroStats.map((stat) => (
                        <span
                            key={stat.label}
                            className={`compactStat ${stat.tone || ""}`}
                        >
                            <span>
                                {stat.label} <strong>{stat.value}</strong>
                            </span>
                        </span>
                    ))}
                </div>
            </section>

            <div className={`${styles.toolbar} fadeSlideIn delayOne`}>
                <div className={styles.quickLinks}>
                    {dashboard.quickLinks.map((item) => (
                        <QuickLink key={item.title} {...item} />
                    ))}
                </div>

                <button
                    type="button"
                    className="miniAction"
                    onClick={() => window.location.reload()}
                >
                    <RefreshCcw size={14} />
                    Recargar
                </button>
            </div>

            <section className={`${styles.statusStrip} fadeSlideIn delayOne`}>
                <div className={styles.statusText}>
                    <Sparkles size={15} />
                    <span>{dashboard.todayInfo}</span>
                </div>

                {dashboard.role === "admin" && dashboard.draftsCount ? (
                    <Link href="/dashboard/purchases?tab=execution" className="miniAction">
                        Borradores de compra: {dashboard.draftsCount}
                    </Link>
                ) : null}
            </section>

            <section className={`${styles.section} fadeSlideIn delayTwo`}>
                <SectionHeader
                    title="Atender ahora"
                    description="Accesos directos a lo que realmente requiere seguimiento inmediato."
                />

                <div className={styles.attentionGrid}>
                    {dashboard.attentionCards.map((item) => (
                        <AttentionCard key={item.label} {...item} />
                    ))}
                </div>
            </section>

            <div className={`${styles.contentGrid} fadeSlideIn delayThree`}>
                <section className={styles.panel}>
                    <SectionHeader
                        title={dashboard.recentPrimaryTitle}
                        description="Lo más reciente para que no pierdas el hilo de trabajo."
                        href={dashboard.recentPrimaryHref}
                    />
                    <RecentList items={dashboard.recentPrimary} />
                </section>

                <section className={styles.panel}>
                    <SectionHeader
                        title={dashboard.recentSecondaryTitle}
                        description="Otro foco útil según tu rol y tu operación actual."
                        href={dashboard.recentSecondaryHref}
                    />
                    <RecentList items={dashboard.recentSecondary} />
                </section>
            </div>
        </section>
    );
}
