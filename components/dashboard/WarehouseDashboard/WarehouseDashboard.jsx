"use client";

import Link from "next/link";
import { ArrowUpRight, ClipboardList, Package, Warehouse } from "lucide-react";

import styles from "./warehouse-dashboard.module.scss";
import {
    formatDate,
    formatQuantity,
    getRequestDate,
    getRequestSummaryLabel,
} from "../dashboardHelpers";

function SectionHeader({ title, description, href, hrefLabel = "Ver todo" }) {
    return (
        <div className={styles.sectionHeader}>
            <div>
                <h3 className={styles.sectionTitle}>{title}</h3>
                {description ? <p className={styles.sectionDescription}>{description}</p> : null}
            </div>

            {href ? (
                <Link href={href} className={styles.sectionLink}>
                    <span>{hrefLabel}</span>
                    <ArrowUpRight size={14} />
                </Link>
            ) : null}
        </div>
    );
}

function QuickAction({ href, icon: Icon, title, caption }) {
    return (
        <Link href={href} className={styles.quickAction}>
            <div className={styles.quickActionTop}>
                <Icon size={16} />
                <ArrowUpRight size={14} />
            </div>

            <strong className={styles.quickActionTitle}>{title}</strong>
            <span className={styles.quickActionCaption}>{caption}</span>
        </Link>
    );
}

function HeroMetric({ label, value, caption }) {
    return (
        <div className={styles.heroMetric}>
            <span className={styles.heroMetricLabel}>{label}</span>
            <strong className={styles.heroMetricValue}>{value}</strong>
            <span className={styles.heroMetricCaption}>{caption}</span>
        </div>
    );
}

function EmptyState({ text }) {
    return <div className={styles.emptyState}>{text}</div>;
}

function RequestList({ items = [], emptyText }) {
    if (!items.length) {
        return <EmptyState text={emptyText} />;
    }

    return (
        <div className={styles.listStack}>
            {items.map((request) => (
                <Link
                    key={request._id}
                    href={`/dashboard/requests?search=${encodeURIComponent(request.requestNumber || "")}`}
                    className={`${styles.listItem} ${styles.listItemLink}`}
                >
                    <div className={styles.listMain}>
                        <p className={styles.listTitle}>{request.requestNumber || "Solicitud"}</p>
                        <p className={styles.listMeta}>{getRequestSummaryLabel(request)}</p>
                    </div>

                    <div className={styles.listAside}>
                        <strong className={styles.listValue}>{request.items?.length || 0} Items</strong>
                        <span className={styles.listMeta}>{formatDate(getRequestDate(request))}</span>
                    </div>
                </Link>
            ))}
        </div>
    );
}

function AlertList({ items = [] }) {
    if (!items.length) {
        return <EmptyState text="No hay productos con alertas de stock." />;
    }

    return (
        <div className={styles.listStack}>
            {items.map((item) => (
                <Link
                    key={item._id}
                    href={`/dashboard/products?search=${encodeURIComponent(item.name || item.code || "")}`}
                    className={`${styles.listItem} ${styles.listItemLink}`}
                >
                    <div className={styles.listMain}>
                        <p className={styles.listTitle}>{item.name}</p>
                        <p className={styles.listMeta}>
                            {item.code || "Sin código"} • Stock total {formatQuantity(item.inventory?.total || 0)}
                        </p>
                    </div>

                    <div className={`${styles.alertBadge} ${item.status === "out" ? styles.alertDanger : styles.alertWarning}`}>
                        {item.status === "out" ? "Sin stock" : "Stock bajo"}
                    </div>
                </Link>
            ))}
        </div>
    );
}

export default function WarehouseDashboard({ inventoryItems = [], requests = [] }) {
    const lowStockProducts = [...inventoryItems]
        .filter((item) => ["low", "warning", "out"].includes(item.status))
        .sort((a, b) => Number(a.inventory?.total || 0) - Number(b.inventory?.total || 0))
        .slice(0, 6);

    const pendingApprovals = [...requests]
        .filter((request) => request.status === "pending")
        .sort((a, b) => new Date(getRequestDate(b) || 0) - new Date(getRequestDate(a) || 0))
        .slice(0, 5);

    const pendingDispatches = [...requests]
        .filter((request) => ["approved", "partially_fulfilled"].includes(request.status))
        .sort((a, b) => new Date(getRequestDate(b) || 0) - new Date(getRequestDate(a) || 0))
        .slice(0, 5);

    const warehouseUnits = inventoryItems.reduce(
        (sum, item) => sum + Number(item.inventory?.warehouse || 0),
        0
    );

    return (
        <>
            <div className={styles.hero}>
                <div className={styles.heroCopy}>
                    <div className={styles.kicker}>
                        <Warehouse size={15} />
                        <span>Panel de bodega</span>
                    </div>

                    <div className={styles.heroHeader}>
                        <h2 className={styles.title}>Prioridades de almacenamiento y despacho</h2>
                        <p className={styles.description}>
                            Revisa solicitudes por aprobar, despachos pendientes y alertas de stock bajo.
                        </p>
                    </div>

                    <div className={styles.quickActions}>
                        <QuickAction
                            href="/dashboard/requests?status=pending"
                            icon={ClipboardList}
                            title="Por aprobar"
                            caption="Revisar solicitudes nuevas"
                        />
                        <QuickAction
                            href="/dashboard/requests?status=approved"
                            icon={Package}
                            title="Por despachar"
                            caption="Continuar entregas"
                        />
                        <QuickAction
                            href="/dashboard/movements?location=warehouse"
                            icon={Warehouse}
                            title="Movimientos"
                            caption="Control de salidas y entradas"
                        />
                    </div>
                </div>

                <div className={styles.heroMetrics}>
                    <HeroMetric
                        label="Stock en bodega"
                        value={formatQuantity(warehouseUnits)}
                        caption="Total visible en bodega"
                    />
                    <HeroMetric
                        label="Pendientes por aprobar"
                        value={pendingApprovals.length}
                        caption="Solicitudes nuevas"
                    />
                    <HeroMetric
                        label="Pendientes por despachar"
                        value={pendingDispatches.length}
                        caption="Aprobadas o parciales"
                    />
                </div>
            </div>

            <div className={styles.dashboardGrid}>
                <section className={styles.panel}>
                    <SectionHeader
                        title="Solicitudes por aprobar"
                        description="Revisa y decide que solicitudes avanzan."
                        href="/dashboard/requests?status=pending"
                        hrefLabel="Abrir pendientes"
                    />
                    <RequestList
                        items={pendingApprovals}
                        emptyText="No hay solicitudes pendientes por aprobar."
                    />
                </section>

                <section className={styles.panel}>
                    <SectionHeader
                        title="Pendientes por despachar"
                        description="Solicitudes aprobadas listas para salida."
                        href="/dashboard/requests?status=approved"
                        hrefLabel="Ver despachos"
                    />
                    <RequestList
                        items={pendingDispatches}
                        emptyText="No hay despachos pendientes en este momento."
                    />
                </section>
            </div>

            <section className={styles.panel}>
                <SectionHeader
                    title="Alertas de stock"
                    description="Productos con stock bajo, reposición o sin stock."
                    href="/dashboard/inventory"
                    hrefLabel="Ir a inventario"
                />
                <AlertList items={lowStockProducts} />
            </section>
        </>
    );
}
