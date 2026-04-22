"use client";

import Link from "next/link";
import { ArrowUpRight, ClipboardList, PackageSearch, Sofa } from "lucide-react";

import styles from "../KitchenDashboard/kitchen-dashboard.module.scss";
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

function InventoryMiniList({ items = [] }) {
    if (!items.length) {
        return <EmptyState text="No hay productos con stock en salon." />;
    }

    return (
        <div className={styles.listStack}>
            {items.map((item) => (
                <article key={item._id} className={styles.listItem}>
                    <div className={styles.listMain}>
                        <p className={styles.listTitle}>{item.name}</p>
                        <p className={styles.listMeta}>
                            {item.code || "Sin codigo"} • {item.categoryName || "Sin categoria"}
                        </p>
                    </div>

                    <div className={styles.listAside}>
                        <strong className={styles.listValue}>
                            {formatQuantity(item.inventory?.lounge || 0)}
                        </strong>
                        <span className={styles.listMeta}>Salon</span>
                    </div>
                </article>
            ))}
        </div>
    );
}

function RequestList({ items = [] }) {
    if (!items.length) {
        return <EmptyState text="No hay solicitudes pendientes para salon." />;
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

export default function LoungeDashboard({ inventoryItems = [], requests = [] }) {
    const loungeInventory = [...inventoryItems]
        .filter((item) => Number(item.inventory?.lounge || 0) > 0)
        .sort((a, b) => Number(b.inventory?.lounge || 0) - Number(a.inventory?.lounge || 0))
        .slice(0, 6);

    const activeRequests = [...requests]
        .filter((request) => ["pending", "processing", "partially_fulfilled"].includes(request.status))
        .sort((a, b) => new Date(getRequestDate(b) || 0) - new Date(getRequestDate(a) || 0))
        .slice(0, 4);

    const loungeUnits = loungeInventory.reduce(
        (sum, item) => sum + Number(item.inventory?.lounge || 0),
        0
    );

    return (
        <>
            <div className={styles.hero}>
                <div className={styles.heroCopy}>
                    <div className={styles.kicker}>
                        <Sofa size={15} />
                        <span>Panel de salon</span>
                    </div>

                    <div className={styles.heroHeader}>
                        <h2 className={styles.title}>Lo importante para operar hoy</h2>
                        <p className={styles.description}>
                            Inventario disponible en salon y solicitudes activas con bodega.
                        </p>
                    </div>

                    <div className={styles.quickActions}>
                        <QuickAction
                            href="/dashboard/requests"
                            icon={ClipboardList}
                            title="Solicitudes"
                            caption="Crear y revisar"
                        />
                        <QuickAction
                            href="/dashboard/requests?requestType=return"
                            icon={PackageSearch}
                            title="Retornos"
                            caption="Enviar a bodega"
                        />
                    </div>
                </div>

                <div className={styles.heroMetrics}>
                    <HeroMetric
                        label="Stock en salon"
                        value={formatQuantity(loungeUnits)}
                        caption={`${loungeInventory.length} productos visibles`}
                    />
                    <HeroMetric
                        label="Solicitudes activas"
                        value={activeRequests.length}
                        caption="Pendientes o en curso"
                    />
                </div>
            </div>

            <div className={styles.dashboardGrid}>
                <section className={styles.panel}>
                    <SectionHeader
                        title="Inventario en salon"
                        description="Productos con stock disponible en salon."
                        href="/dashboard/lounge"
                        hrefLabel="Abrir inventario"
                    />
                    <InventoryMiniList items={loungeInventory} />
                </section>

                <section className={styles.panel}>
                    <SectionHeader
                        title="Ultimas o pendientes"
                        description="Solicitudes que requieren seguimiento desde lounge."
                        href="/dashboard/requests"
                        hrefLabel="Ver solicitudes"
                    />
                    <RequestList items={activeRequests} />
                </section>
            </div>
        </>
    );
}
