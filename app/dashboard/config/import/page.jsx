"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, FileSpreadsheet, Upload } from "lucide-react";

import styles from "./page.module.scss";

const ACCEPTED_FILE_TYPES = ".xlsx,.xls";

function formatNumber(value) {
    return new Intl.NumberFormat("es-EC").format(Number(value || 0));
}

export default function ImportCatalogPage() {
    const [file, setFile] = useState(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [progress, setProgress] = useState(0);
    const [progressStatus, setProgressStatus] = useState("");
    const [error, setError] = useState("");
    const [result, setResult] = useState(null);

    const totals = result?.data?.totals || null;
    const issues = useMemo(() => result?.data?.issues || [], [result]);
    const hasSuccess = Boolean(result?.success);

    function submitCatalogFile(formData, onUploadProgress) {
        return new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.open("POST", "/api/import/catalog");
            xhr.responseType = "json";

            xhr.upload.onprogress = (event) => {
                if (!event.lengthComputable) return;
                onUploadProgress(event.loaded, event.total);
            };

            xhr.onload = () => {
                const payload = xhr.response;
                resolve({
                    ok: xhr.status >= 200 && xhr.status < 300,
                    payload,
                });
            };

            xhr.onerror = () => {
                reject(new Error("No se pudo subir el archivo. Revisa tu conexión."));
            };

            xhr.send(formData);
        });
    }

    async function handleSubmit(event) {
        event.preventDefault();

        if (!file) {
            setError("Selecciona un archivo Excel antes de importar.");
            return;
        }

        try {
            setIsSubmitting(true);
            setError("");
            setResult(null);
            setProgress(0);
            setProgressStatus("Subiendo archivo...");

            const formData = new FormData();
            formData.append("file", file);

            const { ok, payload } = await submitCatalogFile(formData, (loaded, total) => {
                const uploadPercent = Math.min(95, Math.round((loaded / total) * 95));
                setProgress(uploadPercent);
            });

            setProgress(96);
            setProgressStatus("Procesando productos...");

            if (!ok || !payload?.success) {
                setError(payload.message || "No se pudo importar el catálogo.");
                setResult(payload || null);
                setProgress(0);
                setProgressStatus("");
                return;
            }

            setResult(payload);
            setProgress(100);
            setProgressStatus("Importación completada.");
        } catch (submitError) {
            console.error(submitError);
            setError("Ocurrio un error al procesar la importacion.");
            setProgress(0);
            setProgressStatus("");
        } finally {
            setIsSubmitting(false);
        }
    }

    return (
        <div className={styles.page}>
            <article className={styles.card}>
                <header className={styles.cardHeader}>
                    <div>
                        <p className={styles.eyebrow}>Catalogo</p>
                        <h2 className={styles.title}>Importacion masiva de productos</h2>
                        <p className={styles.description}>
                            Sube un archivo Excel con columnas `FAMILIA`, `CATEGORIA` y
                            `PRODUCTOS`. El sistema crea familias, categorias y productos si no
                            existen, y reporta conflictos cuando detecta relaciones distintas.
                        </p>
                    </div>

                    <span
                        className={hasSuccess ? styles.headerIconSuccess : styles.headerIcon}
                        aria-hidden="true"
                    >
                        {hasSuccess ? <CheckCircle2 size={20} /> : <FileSpreadsheet size={20} />}
                    </span>
                </header>

                <form className={styles.form} onSubmit={handleSubmit}>
                    <label className={styles.uploadBox} htmlFor="catalog-file">
                        <span className={styles.uploadIcon} aria-hidden="true">
                            <Upload size={18} />
                        </span>

                        <span className={styles.uploadTitle}>
                            {file ? file.name : "Selecciona tu archivo Excel"}
                        </span>

                        <span className={styles.uploadHint}>
                            Formato permitido: {ACCEPTED_FILE_TYPES}. Hoja recomendada: `Matriz
                            compras`.
                        </span>
                    </label>

                    <input
                        id="catalog-file"
                        className={styles.fileInput}
                        type="file"
                        accept={ACCEPTED_FILE_TYPES}
                        onChange={(event) => setFile(event.target.files?.[0] || null)}
                    />

                    <div className={styles.noteBox}>
                        <strong>Valores por defecto para productos nuevos</strong>
                        <div className={styles.defaultGrid}>
                            <div className={styles.defaultCard}>
                                <span className={styles.defaultLabel}>Unidad</span>
                                <span>`unit`</span>
                            </div>
                            <div className={styles.defaultCard}>
                                <span className={styles.defaultLabel}>Tipo</span>
                                <span>`raw_material`</span>
                            </div>
                            <div className={styles.defaultCard}>
                                <span className={styles.defaultLabel}>Almacenamiento</span>
                                <span>`ambient`</span>
                            </div>
                            <div className={styles.defaultCard}>
                                <span className={styles.defaultLabel}>Stock</span>
                                <span>`tracksStock = true`</span>
                            </div>
                        </div>
                    </div>

                    {isSubmitting || progress === 100 ? (
                        <div className={styles.progressWrap} aria-live="polite">
                            <div className={styles.progressMeta}>
                                <span>{progressStatus || "Importando..."}</span>
                                <span>{progress}%</span>
                            </div>
                            <div className={styles.progressTrack}>
                                <div
                                    className={styles.progressBar}
                                    style={{ width: `${progress}%` }}
                                />
                            </div>
                        </div>
                    ) : null}

                    {error ? <p className={styles.uploadHint}>{error}</p> : null}

                    <div className={styles.actions}>
                        <button
                            type="submit"
                            className="miniAction miniActionPrimary miniActionBalanced"
                            disabled={isSubmitting || !file}
                        >
                            <span className="miniActionLabel">
                                {isSubmitting ? "Importando..." : "Importar catalogo"}
                            </span>
                        </button>
                    </div>
                </form>
            </article>

            {isSubmitting && !totals ? (
                <article className={styles.card}>
                    <header className={styles.cardHeader}>
                        <div>
                            <p className={styles.eyebrow}>Resumen</p>
                            <h3 className={styles.title}>Procesando importacion</h3>
                            <p className={styles.description}>
                                Estamos leyendo el archivo y aplicando cambios en el catalogo.
                            </p>
                        </div>
                    </header>

                    <section className={styles.loadingSummary} aria-live="polite">
                        <div className={styles.loadingHead}>
                            <span className={styles.spinner} aria-hidden="true" />
                            <div>
                                <p className={styles.loadingTitle}>
                                    {progressStatus || "Importando productos..."}
                                </p>
                                <p className={styles.loadingCopy}>
                                    Esto puede tardar unos segundos segun el volumen de datos.
                                </p>
                            </div>
                        </div>

                        <div className={styles.loadingStatsGrid}>
                            {Array.from({ length: 6 }).map((_, index) => (
                                <article key={index} className={styles.loadingStatCard}>
                                    <span className={styles.loadingLabel} />
                                    <span className={styles.loadingValue} />
                                </article>
                            ))}
                        </div>
                    </section>
                </article>
            ) : null}

            {totals ? (
                <article className={styles.card}>
                    <header className={styles.cardHeader}>
                        <div>
                            <p className={styles.eyebrow}>Resumen</p>
                            <h3 className={styles.title}>Resultado de importacion</h3>
                        </div>
                    </header>

                    <div className={styles.statsGrid}>
                        <div className={`${styles.statCard} ${styles.statSuccess}`}>
                            <span className={styles.statLabel}>Productos creados</span>
                            <span className={styles.statValue}>
                                {formatNumber(totals.productsCreated)}
                            </span>
                        </div>
                        <div className={styles.statCard}>
                            <span className={styles.statLabel}>Productos existentes</span>
                            <span className={styles.statValue}>
                                {formatNumber(totals.productsExisting)}
                            </span>
                        </div>
                        <div className={styles.statCard}>
                            <span className={styles.statLabel}>Productos actualizados</span>
                            <span className={styles.statValue}>
                                {formatNumber(totals.productsUpdated)}
                            </span>
                        </div>
                        <div className={styles.statCard}>
                            <span className={styles.statLabel}>Categorias creadas</span>
                            <span className={styles.statValue}>
                                {formatNumber(totals.categoriesCreated)}
                            </span>
                        </div>
                        <div className={styles.statCard}>
                            <span className={styles.statLabel}>Familias creadas</span>
                            <span className={styles.statValue}>
                                {formatNumber(totals.familiesCreated)}
                            </span>
                        </div>
                        <div className={styles.statCard}>
                            <span className={styles.statLabel}>Filas leidas</span>
                            <span className={styles.statValue}>
                                {formatNumber(totals.rowsRead)}
                            </span>
                        </div>
                        <div className={`${styles.statCard} ${styles.statWarning}`}>
                            <span className={styles.statLabel}>Filas omitidas</span>
                            <span className={styles.statValue}>
                                {formatNumber(totals.skippedRows)}
                            </span>
                        </div>
                        <div className={`${styles.statCard} ${styles.statWarning}`}>
                            <span className={styles.statLabel}>Conflictos</span>
                            <span className={styles.statValue}>
                                {formatNumber(totals.conflicts)}
                            </span>
                        </div>
                        <div className={`${styles.statCard} ${styles.statWarning}`}>
                            <span className={styles.statLabel}>Observaciones</span>
                            <span className={styles.statValue}>
                                {formatNumber(totals.issueCount)}
                            </span>
                        </div>
                    </div>

                    {issues.length ? (
                        <section className={styles.issuesBlock}>
                            <div className={styles.issuesHeader}>
                                <AlertTriangle size={16} />
                                <span>Detalle de observaciones</span>
                            </div>

                            <div className={styles.issueList}>
                                {issues.slice(0, 40).map((issue, index) => (
                                    <article key={`${issue.row}-${issue.type}-${index}`} className={styles.issueItem}>
                                        <strong>Fila {issue.row || "-"}</strong>
                                        <span>{issue.message || "Se detecto una inconsistencia."}</span>
                                    </article>
                                ))}
                            </div>
                        </section>
                    ) : null}
                </article>
            ) : null}
        </div>
    );
}
