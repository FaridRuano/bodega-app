"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, CheckCircle2, Package } from "lucide-react";
import { useRouter } from "next/navigation";
import { getUnitLabel } from "@libs/constants/units";
import { getProductionTypeLabel } from "@libs/constants/productionTypes";
import styles from "./production-completed-view.module.scss";
import { MOVEMENT_TYPE_LABELS } from "@libs/constants/domainLabels";

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

export default function ProductionCompletedView({ production }) {
    const router = useRouter();
    const [movements, setMovements] = useState([]);

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

            <div className={styles.grid}>
                <section className={styles.card}>
                    <h2 className={styles.sectionTitle}>Resultados</h2>
                    <div className={styles.list}>
                        {(production?.outputs || []).map((item, index) => (
                            <div key={`output-${index}`} className={styles.row}>
                                <div>
                                    <strong>{item.productNameSnapshot}</strong>
                                    <p>
                                        {item.destinationLocation === "kitchen"
                                            ? "Cocina"
                                            : "Bodega"}
                                    </p>
                                </div>
                                <strong>
                                    {formatNumber(item.quantity)} {getUnitLabel(item.unitSnapshot)}
                                </strong>
                            </div>
                        ))}
                    </div>
                </section>

                <section className={styles.card}>
                    <h2 className={styles.sectionTitle}>Merma y subproductos</h2>
                    <div className={styles.list}>
                        {(production?.byproducts || []).map((item, index) => (
                            <div key={`by-${index}`} className={styles.row}>
                                <div>
                                    <strong>{item.productNameSnapshot}</strong>
                                    <p>Subproducto</p>
                                </div>
                                <strong>
                                    {formatNumber(item.quantity)} {getUnitLabel(item.unitSnapshot)}
                                </strong>
                            </div>
                        ))}

                        {(production?.waste || []).map((item, index) => (
                            <div key={`waste-${index}`} className={styles.row}>
                                <div>
                                    <strong>{item.productNameSnapshot}</strong>
                                    <p>{item.type}</p>
                                </div>
                                <strong>
                                    {formatNumber(item.quantity)} {getUnitLabel(item.unitSnapshot)}
                                </strong>
                            </div>
                        ))}
                    </div>
                </section>
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
                        movements.map((movement) => (
                            <div key={movement._id} className={styles.row}>
                                <div>
                                    <strong>{movement.productId?.name || "Producto"}</strong>
                                    <p>{MOVEMENT_TYPE_LABELS[movement.movementType]}</p>
                                </div>
                                <strong>
                                    {formatNumber(movement.quantity)} {getUnitLabel(movement.unitSnapshot)}
                                </strong>
                            </div>
                        ))
                    )}
                </div>
            </section>
        </div>
    );
}
