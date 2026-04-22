"use client";

import { AlertTriangle, ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";
import { getProductionTypeLabel } from "@libs/constants/productionTypes";
import styles from "./production-cancelled-view.module.scss";

function formatDate(value) {
    if (!value) return "Sin fecha";
    return new Intl.DateTimeFormat("es-EC", {
        dateStyle: "medium",
        timeStyle: "short",
    }).format(new Date(value));
}

export default function ProductionCancelledView({ production }) {
    const router = useRouter();

    return (
        <div className="page">
            <div className={styles.header}>
                <button
                    type="button"
                    className={`btn btn-secondary ${styles.backButton}`}
                    onClick={() => router.push("/dashboard/production")}
                >
                    <ArrowLeft size={16} />
                    Volver
                </button>
            </div>

            <section className={styles.card}>
                <div className={styles.banner}>
                    <AlertTriangle size={18} />
                    Producción cancelada
                </div>

                <h1 className={styles.title}>{production.productionNumber}</h1>
                <p className={styles.subtitle}>
                    {getProductionTypeLabel(
                        production?.templateSnapshot?.type || production?.productionType
                    )} · Cancelada el {formatDate(production?.cancelledAt)}
                </p>

                <div className={styles.details}>
                    <div className={styles.detailItem}>
                        <span>Ficha</span>
                        <strong>{production?.templateSnapshot?.name || "Sin ficha"}</strong>
                    </div>
                    <div className={styles.detailItem}>
                        <span>Objetivo</span>
                        <strong>
                            {production?.targetQuantity || 0} {production?.targetUnit || ""}
                        </strong>
                    </div>
                    <div className={styles.detailItem}>
                        <span>Inicio</span>
                        <strong>{formatDate(production?.startedAt)}</strong>
                    </div>
                    <div className={styles.detailItem}>
                        <span>Notas</span>
                        <strong>{production?.notes || "Sin observaciones."}</strong>
                    </div>
                </div>
            </section>
        </div>
    );
}
