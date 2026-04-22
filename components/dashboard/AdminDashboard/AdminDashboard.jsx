"use client";

import Link from "next/link";
import { ArrowUpRight, ClipboardList, Factory, PackageSearch, Sparkles } from "lucide-react";

import styles from "./admin-dashboard.module.scss";
import {
    formatDate,
    formatQuantity,
    getProductionSummaryLabel,
    getRequestDate,
    getRequestSummaryLabel,
} from "../dashboardHelpers";

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

function SectionHeader({ title, description, href }) {
    return (
        <div className={styles.sectionHeader}>
            <div>
                <h3 className={styles.sectionTitle}>{title}</h3>
                {description ? <p className={styles.sectionDescription}>{description}</p> : null}
            </div>

            {href ? (
                <Link href={href} className={styles.sectionLink}>
                    <span>Ver todo</span>
                    <ArrowUpRight size={14} />
                </Link>
            ) : null}
        </div>
    );
}

function EmptyState({ text }) {
    return <div className={styles.emptyState}>{text}</div>;
}

function RequestList({ items = [] }) {
    if (!items.length) {
        return <EmptyState text="No hay solicitudes activas." />;
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

function ProductionList({ items = [] }) {
    if (!items.length) {
        return <EmptyState text="No hay producciones registradas." />;
    }

    return (
        <div className={styles.listStack}>
            {items.map((production) => (
                <Link
                    key={production._id}
                    href={`/dashboard/production/${production._id}`}
                    className={`${styles.listItem} ${styles.listItemLink}`}
                >
                    <div className={styles.listMain}>
                        <p className={styles.listTitle}>{production.productionNumber || "Producción"}</p>
                        <p className={styles.listMeta}>{getProductionSummaryLabel(production)}</p>
                    </div>

                    <div className={styles.listAside}>
                        <strong className={styles.listValue}>{formatQuantity(production.targetQuantity)}</strong>
                        <span className={styles.listMeta}>{formatDate(production.startedAt || production.createdAt)}</span>
                    </div>
                </Link>
            ))}
        </div>
    );
}

export default function AdminDashboard({ inventoryItems = [], requests = [], productions = [] }) {
    const totalInventory = inventoryItems.reduce((sum, item) => sum + Number(item.inventory?.total || 0), 0);
    const lowStock = inventoryItems.filter((item) => ["low", "warning", "out"].includes(item.status)).length;
    const pendingApprovals = requests.filter((item) => item.status === "pending").length;
    const pendingDispatches = requests.filter((item) => ["approved", "processing", "partially_fulfilled"].includes(item.status)).length;
    const activeRequests = requests
        .filter((item) => ["pending", "approved", "processing", "partially_fulfilled"].includes(item.status))
        .sort((a, b) => new Date(getRequestDate(b) || 0) - new Date(getRequestDate(a) || 0))
        .slice(0, 5);

    const recentProductions = [...productions]
        .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
        .slice(0, 3);

    const activeProductions = productions.filter((item) => item.status === "in_progress").length;

    return (
        <>
            <div className={styles.hero}>
                <div className={styles.heroCopy}>
                    <div className={styles.kicker}>
                        <Sparkles size={15} />
                        <span>Resumen general</span>
                    </div>

                    <div className={styles.heroHeader}>
                        <h2 className={styles.title}>Vista ejecutiva de la operación</h2>
                        <p className={styles.description}>
                            Solicitudes activas, producción en curso y alertas de inventario en un solo lugar.
                        </p>
                    </div>

                    <div className={styles.quickActions}>
                        <QuickAction
                            href="/dashboard/requests?status=pending"
                            icon={ClipboardList}
                            title="Solicitudes"
                            caption="Aprobaciones y seguimiento"
                        />
                        <QuickAction
                            href="/dashboard/production?status=in_progress"
                            icon={Factory}
                            title="Producción"
                            caption="Procesos en curso"
                        />
                        <QuickAction
                            href="/dashboard/config"
                            icon={PackageSearch}
                            title="Configuración"
                            caption="Usuarios y catálogos"
                        />
                    </div>
                </div>

                <div className={styles.heroMetrics}>
                    <HeroMetric
                        label="Inventario total"
                        value={formatQuantity(totalInventory)}
                        caption="Unidades visibles"
                    />
                    <HeroMetric
                        label="Solicitudes activas"
                        value={activeRequests.length}
                        caption="Pendientes o en curso"
                    />
                    <HeroMetric
                        label="Producción activa"
                        value={activeProductions}
                        caption="En progreso"
                    />
                </div>
            </div>

            <div className={styles.metricsRow}>
                <article className={styles.metricCard}>
                    <span className={styles.metricLabel}>Alertas de stock</span>
                    <strong className={styles.metricValue}>{lowStock}</strong>
                    <span className={styles.metricMeta}>Productos con atención requerida</span>
                </article>

                <article className={styles.metricCard}>
                    <span className={styles.metricLabel}>Pendientes por aprobar</span>
                    <strong className={styles.metricValue}>{pendingApprovals}</strong>
                    <span className={styles.metricMeta}>Solicitudes nuevas</span>
                </article>

                <article className={styles.metricCard}>
                    <span className={styles.metricLabel}>Pendientes por despachar</span>
                    <strong className={styles.metricValue}>{pendingDispatches}</strong>
                    <span className={styles.metricMeta}>Aprobadas y parciales</span>
                </article>
            </div>

            <div className={styles.dashboardGrid}>
                <section className={styles.panel}>
                    <SectionHeader
                        title="Solicitudes activas"
                        description="Lo más reciente que sigue abierto en operación."
                        href="/dashboard/requests"
                    />
                    <RequestList items={activeRequests} />
                </section>

                <section className={styles.panel}>
                    <SectionHeader
                        title="Producciones recientes"
                        description="Últimas producciones creadas o en curso."
                        href="/dashboard/production"
                    />
                    <ProductionList items={recentProductions} />
                </section>
            </div>
        </>
    );
}
