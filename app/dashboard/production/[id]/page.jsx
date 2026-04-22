"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, ArrowLeft, LoaderCircle } from "lucide-react";
import { useParams, useRouter } from "next/navigation";

import styles from "./page.module.scss";
import ProductionDraftView from "@components/production/ProductionDraftView/ProductionDraftView";
import ProductionInProgressView from "@components/production/ProductionInProgressView/ProductionInProgressView";
import ProductionCompletedView from "@components/production/ProductionCompletedView/ProductionCompletedView";
import ProductionCancelledView from "@components/production/ProductionCancelledView/ProductionCancelledView";

export default function ProductionDetailPage() {
    const router = useRouter();
    const params = useParams();
    const id = params?.id;

    const [production, setProduction] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [errorMessage, setErrorMessage] = useState("");

    async function loadProduction() {
        if (!id) return;

        try {
            setIsLoading(true);
            setErrorMessage("");

            const response = await fetch(`/api/productions/${id}`, {
                cache: "no-store",
            });

            const result = await response.json();

            if (!response.ok || !result?.ok) {
                throw new Error(
                    result?.message || "No se pudo cargar la producción."
                );
            }

            setProduction(result.data || null);
        } catch (error) {
            console.error("[PRODUCTION_DETAIL_PAGE_LOAD_ERROR]", error);
            setProduction(null);
            setErrorMessage(
                error?.message || "No se pudo cargar la producción."
            );
        } finally {
            setIsLoading(false);
        }
    }

  useEffect(() => {
    loadProduction();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

    if (isLoading) {
        return (
            <div className="page">
                <div className={`${styles.centerState} fadeScaleIn`}>
                    <LoaderCircle className={`${styles.stateIcon} ${styles.spin}`} />
                    <p className={styles.stateTitle}>Cargando producción...</p>
                    <p className={styles.stateDescription}>
                        Estamos obteniendo el detalle de la producción.
                    </p>
                </div>
            </div>
        );
    }

    if (!production) {
        return (
            <div className="page">
                <div className={`${styles.centerState} fadeScaleIn`}>
                    <AlertTriangle className={styles.stateIcon} />
                    <p className={styles.stateTitle}>
                        No se pudo cargar la producción
                    </p>

                    {errorMessage ? (
                        <p className={styles.stateDescription}>{errorMessage}</p>
                    ) : null}

                    <button
                        type="button"
                        className={`btn btn-secondary ${styles.backButton}`}
                        onClick={() => router.push("/dashboard/production")}
                    >
                        <ArrowLeft size={16} />
                        Volver
                    </button>
                </div>
            </div>
        );
    }

    if (production.status === "draft") {
        return (
            <ProductionDraftView
                production={production}
                refreshProduction={loadProduction}
            />
        );
    }

    if (production.status === "in_progress") {
        return (
            <ProductionInProgressView
                production={production}
                refreshProduction={loadProduction}
            />
        );
    }

    if (production.status === "completed") {
        return (
            <ProductionCompletedView
                production={production}
                refreshProduction={loadProduction}
            />
        );
    }

    if (production.status === "cancelled") {
        return (
            <ProductionCancelledView
                production={production}
                refreshProduction={loadProduction}
            />
        );
    }

    return (
        <div className="page">
            <div className={`${styles.centerState} fadeScaleIn`}>
                <AlertTriangle className={styles.stateIcon} />
                <p className={styles.stateTitle}>Estado de producción no soportado</p>
                <p className={styles.stateDescription}>
                    El estado recibido fue: <strong>{production.status || "sin estado"}</strong>
                </p>

                <button
                    type="button"
                    className={`btn btn-secondary ${styles.backButton}`}
                    onClick={() => router.push("/dashboard/production")}
                >
                    <ArrowLeft size={16} />
                    Volver
                </button>
            </div>
        </div>
    );
}
