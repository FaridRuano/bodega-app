"use client";

import Link from "next/link";
import { ArrowUpRight, ChefHat, ClipboardList, Factory, PackageSearch } from "lucide-react";

import styles from "./kitchen-dashboard.module.scss";
import {
    formatDate,
    formatQuantity,
    getProductionSummaryLabel,
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

function InventoryMiniList({ items = [] }) {
    if (!items.length) {
        return <EmptyState text="No hay productos con stock en cocina." />;
    }

    return (
        <div className={styles.listStack}>
            {items.map((item) => (
                <article key={item._id} className={styles.listItem}>
                    <div className={styles.listMain}>
                        <p className={styles.listTitle}>{item.name}</p>
                        <p className={styles.listMeta}>
                            {item.code || "Sin código"} • {item.categoryName || "Sin categoría"}
                        </p>
                    </div>

                    <div className={styles.listAside}>
                        <strong className={styles.listValue}>
                            {formatQuantity(item.inventory?.kitchen || 0)}
                        </strong>
                        <span className={styles.listMeta}>Cocina</span>
                    </div>
                </article>
            ))}
        </div>
    );
}

function RequestList({ items = [] }) {
    if (!items.length) {
        return <EmptyState text="No hay solicitudes pendientes para cocina." />;
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
        return <EmptyState text="No hay producciones en proceso en este momento." />;
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
                        <p className={styles.listTitle}>
                            {production.productionNumber || "Producción"}
                        </p>
                        <p className={styles.listMeta}>{getProductionSummaryLabel(production)}</p>
                    </div>

                    <div className={styles.listAside}>
                        <strong className={styles.listValue}>
                            {formatQuantity(production.targetQuantity)}
                        </strong>
                        <span className={styles.listMeta}>
                            {formatDate(production.startedAt || production.createdAt)}
                        </span>
                    </div>
                </Link>
            ))}
        </div>
    );
}

export default function KitchenDashboard({ inventoryItems = [], requests = [], productions = [] }) {
    const kitchenInventory = [...inventoryItems]
        .filter((item) => Number(item.inventory?.kitchen || 0) > 0)
        .sort((a, b) => Number(b.inventory?.kitchen || 0) - Number(a.inventory?.kitchen || 0))
        .slice(0, 6);

    const activeRequests = [...requests]
        .filter((request) => ["pending", "approved", "processing", "partially_fulfilled"].includes(request.status))
        .sort((a, b) => new Date(getRequestDate(b) || 0) - new Date(getRequestDate(a) || 0))
        .slice(0, 4);

    const activeProductions = [...productions]
        .filter((production) => production.status === "in_progress")
        .sort((a, b) => new Date(b.startedAt || b.createdAt || 0) - new Date(a.startedAt || a.createdAt || 0))
        .slice(0, 3);

    const kitchenUnits = kitchenInventory.reduce(
        (sum, item) => sum + Number(item.inventory?.kitchen || 0),
        0
    );

    return (
        <>
            <div className={styles.hero}>
                <div className={styles.heroCopy}>
                    <div className={styles.kicker}>
                        <ChefHat size={15} />
                        <span>Panel de cocina</span>
                    </div>

                    <div className={styles.heroHeader}>
                        <h2 className={styles.title}>Lo importante para operar hoy</h2>
                        <p className={styles.description}>
                            Inventario disponible en cocina, solicitudes activas y producciones en
                            curso.
                        </p>
                    </div>

                    <div className={styles.quickActions}>
                        <QuickAction
                            href="/dashboard/requests"
                            icon={ClipboardList}
                            title="Solicitudes"
                            caption="Crear, editar y recibir"
                        />
                        <QuickAction
                            href="/dashboard/requests?requestType=return"
                            icon={PackageSearch}
                            title="Transferencias"
                            caption="Devolver a bodega"
                        />
                        <QuickAction
                            href="/dashboard/production?status=in_progress"
                            icon={Factory}
                            title="Producción"
                            caption="Continuar procesos activos"
                        />
                        <QuickAction
                            href="/dashboard/history"
                            icon={PackageSearch}
                            title="Historial"
                            caption="Revisar lo reciente"
                        />
                    </div>
                </div>

                <div className={styles.heroMetrics}>
                    <HeroMetric
                        label="Stock en cocina"
                        value={formatQuantity(kitchenUnits)}
                        caption={`${kitchenInventory.length} productos visibles`}
                    />
                    <HeroMetric
                        label="Solicitudes activas"
                        value={activeRequests.length}
                        caption="Pendientes o en curso"
                    />
                    <HeroMetric
                        label="Producciones activas"
                        value={activeProductions.length}
                        caption="Máximo 3 recientes"
                    />
                </div>
            </div>

            <div className={styles.dashboardGrid}>
                <section className={styles.panel}>
                    <SectionHeader
                        title="Inventario en cocina"
                        description="Productos con stock disponible en cocina."
                        href="/dashboard/kitchen"
                        hrefLabel="Abrir inventario"
                    />
                    <InventoryMiniList items={kitchenInventory} />
                </section>

                <section className={styles.panel}>
                    <SectionHeader
                        title="Últimas o pendientes"
                        description="Solicitudes que requieren seguimiento desde cocina."
                        href="/dashboard/requests?status=pending"
                        hrefLabel="Ver solicitudes"
                    />
                    <RequestList items={activeRequests} />
                </section>
            </div>

            <section className={styles.panel}>
                <SectionHeader
                    title="Producción en progreso"
                    description="Solo las 3 producciones activas ms recientes."
                    href="/dashboard/production?status=in_progress"
                    hrefLabel="Ver producción"
                />
                <ProductionList items={activeProductions} />
            </section>
        </>
    );
}
