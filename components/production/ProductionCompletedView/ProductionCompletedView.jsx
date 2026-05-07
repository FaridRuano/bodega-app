"use client";

import { useEffect, useState } from "react";
import {
    ArrowLeft,
    CheckCircle2,
    Package,
    Sparkles,
    Trash2,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { getUnitLabel } from "@libs/constants/units";
import { getProductionTypeLabel } from "@libs/constants/productionTypes";
import styles from "./production-completed-view.module.scss";
import {
    getLocationLabel,
    MOVEMENT_TYPE_LABELS,
} from "@libs/constants/domainLabels";

function formatNumber(value) {
    return new Intl.NumberFormat("es-EC", {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
    }).format(Number(value || 0));
}

function formatDate(value) {
    if (!value) return "Sin fecha";
    return new Intl.DateTimeFormat("es-EC", {
        dateStyle: "medium",
        timeStyle: "short",
    }).format(new Date(value));
}

function getMovementMeta(movementType) {
    switch (movementType) {
        case "production_consumption":
            return {
                label: "Consumo",
                tone: styles.movementConsumption,
                helper: "Salida de insumos usados durante la producción.",
            };
        case "production_output":
            return {
                label: "Salida de producción",
                tone: styles.movementOutput,
                helper: "Ingreso del resultado final o subproducto al inventario.",
            };
        case "waste":
            return {
                label: "Desperdicio",
                tone: styles.movementWaste,
                helper: "Registro informativo de merma; no vuelve al inventario.",
            };
        default:
            return {
                label: MOVEMENT_TYPE_LABELS[movementType] || "Movimiento",
                tone: "",
                helper: "Movimiento asociado a la producción.",
            };
    }
}

function getMovementRouteLabel(movement) {
    if (movement.movementType === "waste") {
        return `${getLocationLabel(movement.fromLocation)} -> Basura`;
    }

    if (movement.fromLocation && movement.toLocation) {
        return `${getLocationLabel(movement.fromLocation)} -> ${getLocationLabel(
            movement.toLocation
        )}`;
    }

    if (movement.toLocation) {
        return `Ingreso en ${getLocationLabel(movement.toLocation)}`;
    }

    if (movement.fromLocation) {
        return `Salida de ${getLocationLabel(movement.fromLocation)}`;
    }

    return "Sin ubicación";
}

function getMovementSortOrder(movementType) {
    switch (movementType) {
        case "production_consumption":
            return 0;
        case "waste":
            return 1;
        case "production_output":
            return 2;
        default:
            return 3;
    }
}

export default function ProductionCompletedView({ production }) {
    const router = useRouter();
    const [movements, setMovements] = useState([]);
    const orderedMovements = [...movements].sort((left, right) => {
        return (
            getMovementSortOrder(left.movementType) -
            getMovementSortOrder(right.movementType)
        );
    });
    const hasByproducts = (production?.byproducts?.length || 0) > 0;
    const hasWaste = (production?.waste?.length || 0) > 0;

    useEffect(() => {
        let ignore = false;

        async function loadMovements() {
            try {
                const response = await fetch(
                    `/api/productions/${production._id}/movements?limit=20`,
                    { cache: "no-store" }
                );
                const result = await response.json();

                if (!ignore) {
                    setMovements(result?.data?.items || []);
                }
            } catch (error) {
                console.error("[PRODUCTION_COMPLETED_MOVEMENTS_ERROR]", error);
            }
        }

        if (production?._id) {
            loadMovements();
        }

        return () => {
            ignore = true;
        };
    }, [production?._id]);

    return (
        <div className="page">
            <div className={styles.header}>
                <div>
                    <button
                        type="button"
                        className={`btn btn-secondary ${styles.backButton}`}
                        onClick={() => router.push("/dashboard/production")}
                    >
                        <ArrowLeft size={16} />
                        Volver
                    </button>

                    <h1 className={styles.title}>{production.productionNumber}</h1>
                    <p className={styles.subtitle}>
                        {getProductionTypeLabel(
                            production?.templateSnapshot?.type || production?.productionType
                        )} · Completada el {formatDate(production?.completedAt)}
                    </p>
                </div>

                <div className={styles.statusBox}>
                    <CheckCircle2 size={18} />
                    Producción completada
                </div>
            </div>

            <div className={styles.summaryGrid}>
                <div className={styles.summaryCard}>
                    <span className={styles.summaryLabel}>Resultados principales</span>
                    <strong>{production?.outputs?.length || 0}</strong>
                </div>
                <div className={styles.summaryCard}>
                    <span className={styles.summaryLabel}>Subproductos</span>
                    <strong>{production?.byproducts?.length || 0}</strong>
                </div>
                <div className={styles.summaryCard}>
                    <span className={styles.summaryLabel}>Desperdicio total</span>
                    <strong>
                        {formatNumber(
                            (production?.waste || []).reduce(
                                (sum, item) => sum + Number(item.quantity || 0),
                                0
                            )
                        )}{" "}
                        kg
                    </strong>
                </div>
            </div>

            <div className={styles.grid}>
                <section className={styles.card}>
                    <h2 className={styles.sectionTitle}>Resultados principales</h2>
                    <div className={styles.list}>
                        {(production?.outputs || []).map((item, index) => (
                            <div key={`output-${index}`} className={styles.detailCard}>
                                <div className={styles.detailTop}>
                                    <div>
                                        <strong>{item.productNameSnapshot}</strong>
                                        <p>
                                            {getLocationLabel(item.destinationLocation)}
                                        </p>
                                    </div>
                                    <span className={styles.mainBadge}>Principal</span>
                                </div>

                                <div className={styles.metricRow}>
                                    <div className={styles.metricPill}>
                                        <span>Cantidad</span>
                                        <strong>
                                            {formatNumber(item.quantity)}{" "}
                                            {getUnitLabel(item.unitSnapshot)}
                                        </strong>
                                    </div>

                                    {item.recordedWeight != null ? (
                                        <div className={styles.metricPill}>
                                            <span>Peso registrado</span>
                                            <strong>
                                                {formatNumber(item.recordedWeight)} kg
                                            </strong>
                                        </div>
                                    ) : null}
                                </div>
                            </div>
                        ))}
                    </div>
                </section>

                {hasByproducts ? (
                    <section className={styles.card}>
                        <h2 className={styles.sectionTitle}>Subproductos</h2>
                        <div className={styles.detailSection}>
                            {(production?.byproducts || []).map((item, index) => (
                                <div key={`by-${index}`} className={styles.detailCard}>
                                    <div className={styles.detailTop}>
                                        <div>
                                            <strong>{item.productNameSnapshot}</strong>
                                            <p>Generado durante la producción</p>
                                        </div>
                                    </div>

                                    <div className={styles.metricRow}>
                                        <div className={styles.metricPill}>
                                            <span>Cantidad</span>
                                            <strong>
                                                {formatNumber(item.quantity)}{" "}
                                                {getUnitLabel(item.unitSnapshot)}
                                            </strong>
                                        </div>

                                        {item.recordedWeight != null ? (
                                            <div className={styles.metricPill}>
                                                <span>Peso registrado</span>
                                                <strong>
                                                    {formatNumber(item.recordedWeight)} kg
                                                </strong>
                                            </div>
                                        ) : null}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </section>
                ) : null}

                {hasWaste ? (
                    <section className={styles.card}>
                        <h2 className={styles.sectionTitle}>Desperdicio</h2>

                        <div className={styles.detailSection}>
                            {(production?.waste || []).map((item, index) => (
                                <div
                                    key={`waste-${index}`}
                                    className={`${styles.detailCard} ${styles.detailCardDanger}`}
                                >
                                    <div className={styles.detailTop}>
                                        <div>
                                            <strong>
                                                {item.originNameSnapshot || "Desperdicio registrado"}
                                            </strong>
                                            <p>No regresa al inventario</p>
                                        </div>
                                        <span className={styles.wasteBadge}>Merma</span>
                                    </div>

                                    <div className={styles.metricRow}>
                                        <div className={styles.metricPill}>
                                            <span>Cantidad</span>
                                            <strong>
                                                {formatNumber(item.quantity)}{" "}
                                                {getUnitLabel(item.unitSnapshot)}
                                            </strong>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </section>
                ) : null}
            </div>

            <section className={styles.card}>
                <h2 className={styles.sectionTitle}>Movimientos generados</h2>
                <div className={styles.list}>
                    {movements.length === 0 ? (
                        <div className={styles.emptyState}>
                            <Package size={16} />
                            No hay movimientos registrados.
                        </div>
                    ) : (
                        orderedMovements.map((movement) => (
                            <div key={movement._id} className={styles.movementCard}>
                                <div className={styles.detailTop}>
                                    <div>
                                        <strong>{movement.productId?.name || "Producto"}</strong>
                                        <p>{getMovementRouteLabel(movement)}</p>
                                    </div>
                                    <span
                                        className={`${styles.movementBadge} ${
                                            getMovementMeta(movement.movementType).tone
                                        }`}
                                    >
                                        {getMovementMeta(movement.movementType).label}
                                    </span>
                                </div>

                                <div className={styles.metricRow}>
                                    <div className={styles.metricPill}>
                                        <span>Cantidad</span>
                                        <strong>
                                            {formatNumber(movement.quantity)}{" "}
                                            {getUnitLabel(movement.unitSnapshot)}
                                        </strong>
                                    </div>
                                </div>

                                <p className={styles.movementHelper}>
                                    {getMovementMeta(movement.movementType).helper}
                                </p>
                            </div>
                        ))
                    )}
                </div>
            </section>
        </div>
    );
}
