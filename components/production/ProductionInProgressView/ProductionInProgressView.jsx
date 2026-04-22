"use client";

import { useEffect, useMemo, useState } from "react";
import {
    AlertTriangle,
    ArrowLeft,
    CheckCircle2,
    LoaderCircle,
    Save,
    XCircle,
} from "lucide-react";
import { useRouter } from "next/navigation";

import ConfirmModal from "@components/shared/ConfirmModal/ConfirmModal";
import DialogModal from "@components/shared/DialogModal/DialogModal";
import { getUnitLabel } from "@libs/constants/units";
import { getProductionTypeLabel } from "@libs/constants/productionTypes";
import styles from "./production-progress-view.module.scss";

function formatNumber(value, maximumFractionDigits = 2) {
    return new Intl.NumberFormat("es-EC", {
        minimumFractionDigits: 0,
        maximumFractionDigits,
    }).format(Number(value || 0));
}

function formatSignedNumber(value) {
    const numeric = Number(value || 0);
    const prefix = numeric > 0 ? "+" : "";
    return `${prefix}${formatNumber(numeric, 3)}`;
}

function formatDate(value) {
    if (!value) return "Sin fecha";

    return new Intl.DateTimeFormat("es-EC", {
        dateStyle: "medium",
        timeStyle: "short",
    }).format(new Date(value));
}

function createWasteRow() {
    return {
        type: "desperdicio",
        quantity: "",
        unitSnapshot: "kg",
        originKind: "process",
        sourceLocation: "kitchen",
        notes: "",
    };
}

function isByproductItem(item) {
    if (!item || item.isWaste) return false;
    return Boolean(item.isByProduct) || !Boolean(item.isMain);
}

function isMainOutputItem(item) {
    if (!item || item.isWaste) return false;
    return !isByproductItem(item);
}

function mapOutputRows(items = [], fallbackIsByProduct = false) {
    if (!items.length) return [];

    return items.map((item) => ({
        productId: item.productId?._id || item.productId || "",
        productNameSnapshot: item.productNameSnapshot || item.productId?.name || "",
        productCodeSnapshot: item.productCodeSnapshot || item.productId?.code || "",
        unitSnapshot: item.unitSnapshot || item.productId?.unit || "unit",
        quantity:
            item.quantity !== null && item.quantity !== undefined
                ? String(item.quantity)
                : "",
        recordedWeight:
            item.recordedWeight !== null && item.recordedWeight !== undefined
                ? String(item.recordedWeight)
                : "",
        destinationLocation: item.destinationLocation || "kitchen",
        isMain: Boolean(item.isMain),
        isByProduct: fallbackIsByProduct || Boolean(item.isByProduct),
        notes: item.notes || "",
    }));
}

function buildTemplateOutputRows(
    templateOutputs = [],
    byproduct = false,
    defaultDestination = "kitchen"
) {
    return (templateOutputs || [])
        .filter((item) => (byproduct ? isByproductItem(item) : isMainOutputItem(item)))
        .map((item) => ({
            productId: item.productId?._id || item.productId || "",
            productNameSnapshot: item.productNameSnapshot || item.productId?.name || "",
            productCodeSnapshot: item.productCodeSnapshot || item.productId?.code || "",
            unitSnapshot: item.unitSnapshot || item.unit || item.productId?.unit || "unit",
            quantity:
                item.quantity !== null && item.quantity !== undefined
                    ? String(item.quantity)
                    : "",
            recordedWeight:
                item.recordedWeight !== null && item.recordedWeight !== undefined
                    ? String(item.recordedWeight)
                    : "",
            destinationLocation: "kitchen",
            isMain: Boolean(item.isMain),
            isByProduct: byproduct || Boolean(item.isByProduct),
            notes: item.notes || "",
        }));
}

function mapWasteRows(items = []) {
    if (!items.length) return [];

    return items.map((item) => ({
        type: item.type || "desperdicio",
        quantity: String(item.quantity ?? ""),
        unitSnapshot: item.unitSnapshot || "kg",
        originKind: item.originKind || "process",
        sourceLocation: item.sourceLocation || "kitchen",
        notes: item.notes || "",
    }));
}

function normalizePositiveNumber(value) {
    if (value === "" || value === null || value === undefined) return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function normalizeNonNegativeNumber(value) {
    if (value === "" || value === null || value === undefined) return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function normalizeResultRows(rows = []) {
    if (!rows.length) return [];

    if (rows.length === 1) {
        return [
            {
                ...rows[0],
                isMain: true,
                isByProduct: false,
            },
        ];
    }

    let mainIndex = rows.findIndex(
        (item) => Boolean(item.isMain) && !Boolean(item.isByProduct)
    );

    if (mainIndex === -1) {
        mainIndex = rows.findIndex((item) => !Boolean(item.isByProduct));
    }

    if (mainIndex === -1) {
        mainIndex = 0;
    }

    return rows.map((item, index) => ({
        ...item,
        isMain: index === mainIndex,
        isByProduct: index !== mainIndex,
    }));
}

function pickInitialResults({
    persistedResults,
    expectedResults,
    templateResults,
}) {
    if (
        persistedResults.length > 0 &&
        (expectedResults.length === 0 ||
            persistedResults.length === expectedResults.length)
    ) {
        return persistedResults;
    }

    if (expectedResults.length > 0) {
        return expectedResults;
    }

    return templateResults;
}

function buildWeightPreview({
    results,
    waste,
    targetQuantity,
    requiresWeightControl,
}) {
    if (!requiresWeightControl) {
        return {
            targetWeight: null,
            recordedTotalWeight: null,
            differenceWeight: null,
            differencePercent: null,
        };
    }

    const outputWeight = results.reduce((sum, item) => {
        const quantity = normalizePositiveNumber(item.quantity);
        if (!quantity) return sum;

        const weight =
            item.unitSnapshot === "kg"
                ? quantity
                : normalizePositiveNumber(item.recordedWeight);

        return sum + (weight || 0);
    }, 0);

    const wasteWeight = waste.reduce((sum, item) => {
        const quantity = normalizePositiveNumber(item.quantity);
        return sum + (quantity || 0);
    }, 0);

    const targetWeight = Number(targetQuantity || 0);
    const recordedTotalWeight = Number((outputWeight + wasteWeight).toFixed(6));
    const differenceWeight = Number((recordedTotalWeight - targetWeight).toFixed(6));
    const differencePercent =
        targetWeight > 0
            ? Number(((differenceWeight / targetWeight) * 100).toFixed(2))
            : null;

    return {
        targetWeight: targetWeight || null,
        recordedTotalWeight: recordedTotalWeight || null,
        differenceWeight: Number.isFinite(differenceWeight)
            ? differenceWeight
            : null,
        differencePercent,
    };
}

export default function ProductionInProgressView({
    production,
    refreshProduction,
}) {
    const router = useRouter();

    const [notes, setNotes] = useState("");
    const [results, setResults] = useState([]);
    const [waste, setWaste] = useState([]);
    const [isSaving, setIsSaving] = useState(false);
    const [isCompleting, setIsCompleting] = useState(false);
    const [isCancelling, setIsCancelling] = useState(false);
    const [confirmState, setConfirmState] = useState("");
    const [dialogState, setDialogState] = useState({
        open: false,
        title: "",
        message: "",
        variant: "info",
    });

    const requiresWeightControl = Boolean(
        production?.templateSnapshot?.requiresWeightControl
    );

    const weightPreview = useMemo(
        () =>
            buildWeightPreview({
                results,
                waste,
                targetQuantity: production?.targetQuantity,
                requiresWeightControl,
            }),
        [results, waste, production?.targetQuantity, requiresWeightControl]
    );

    useEffect(() => {
        const defaultDestination = "kitchen";

        const persistedResults = normalizeResultRows([
            ...mapOutputRows(production?.outputs || []),
            ...mapOutputRows(production?.byproducts || [], true),
        ]);

        const expectedResults = normalizeResultRows(
            mapOutputRows(production?.expectedOutputs || [])
        );

        const templateResults = normalizeResultRows([
            ...buildTemplateOutputRows(
                production?.productionTemplateId?.outputs || [],
                false,
                defaultDestination
            ),
            ...buildTemplateOutputRows(
                production?.productionTemplateId?.outputs || [],
                true,
                defaultDestination
            ),
        ]);

        const mappedWaste = mapWasteRows(production?.waste || []);

        setNotes(production?.notes || "");
        setResults(
            pickInitialResults({
                persistedResults,
                expectedResults,
                templateResults,
            })
        );
        setWaste(
            production?.templateSnapshot?.requiresWasteRecord
                ? [mappedWaste[0] || createWasteRow()]
                : mappedWaste
        );
    }, [production]);

    const hasMissingWaste =
        production?.templateSnapshot?.requiresWasteRecord &&
        !normalizePositiveNumber(waste[0]?.quantity);

    const hasMissingRecordedWeights = useMemo(() => {
        if (!requiresWeightControl) return false;

        return results.some((item) => {
            const quantity = normalizePositiveNumber(item.quantity);
            if (!quantity) return false;
            if (item.unitSnapshot === "kg") return false;
            return !normalizePositiveNumber(item.recordedWeight);
        });
    }, [results, requiresWeightControl]);

    const canComplete = useMemo(
        () =>
            results.some(
                (item) =>
                    item.productId &&
                    item.isMain &&
                    normalizePositiveNumber(item.quantity)
            ) &&
            !hasMissingWaste &&
            !hasMissingRecordedWeights,
        [results, hasMissingWaste, hasMissingRecordedWeights]
    );

    function openDialog(title, message, variant = "info") {
        setDialogState({
            open: true,
            title,
            message,
            variant,
        });
    }

    function sanitizeResultRows(rows) {
        return normalizeResultRows(
            rows
                .filter((item) => item.productId)
                .map((item) => ({
                    productId: item.productId,
                    unitSnapshot: item.unitSnapshot,
                    quantity: normalizeNonNegativeNumber(item.quantity) ?? 0,
                    recordedWeight: normalizePositiveNumber(item.recordedWeight),
                    destinationLocation: "kitchen",
                    isMain: Boolean(item.isMain),
                    isByProduct: Boolean(item.isByProduct),
                    notes: item.notes || "",
                }))
        );
    }

    function sanitizeWasteRows(rows) {
        const wasteItem = rows[0];
        const quantity = normalizePositiveNumber(wasteItem?.quantity);

        if (!quantity) return [];

        return [
            {
                type: "desperdicio",
                quantity,
                unitSnapshot: "kg",
                originKind: "process",
                originProductId: null,
                originNameSnapshot: "",
                originUnitSnapshot: null,
                sourceLocation: production?.location || "kitchen",
                notes: "",
            },
        ];
    }

    function buildSavePayload() {
        const sanitizedResults = sanitizeResultRows(results);

        return {
            notes,
            results: sanitizedResults,
            waste: sanitizeWasteRows(waste),
        };
    }

    async function persistProgressChanges() {
        const response = await fetch(`/api/productions/${production._id}`, {
            method: "PATCH",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify(buildSavePayload()),
        });

        const result = await response.json();

        if (!response.ok || !result?.ok) {
            throw new Error(result?.message || "No se pudo guardar la produccion.");
        }

        return result;
    }

    async function handleSave() {
        try {
            setIsSaving(true);
            await persistProgressChanges();
            await refreshProduction();
            openDialog(
                "Cambios guardados",
                "La produccion fue actualizada.",
                "success"
            );
        } catch (error) {
            openDialog(
                "No se pudo guardar",
                error?.message || "No se pudieron guardar los cambios.",
                "danger"
            );
        } finally {
            setIsSaving(false);
        }
    }

    async function handleComplete() {
        try {
            setIsCompleting(true);
            const response = await fetch(`/api/productions/${production._id}/complete`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(buildSavePayload()),
            });
            const result = await response.json();

            if (!response.ok || !result?.ok) {
                throw new Error(
                    result?.message || "No se pudo completar la produccion."
                );
            }

            setConfirmState("");
            await refreshProduction();
        } catch (error) {
            setConfirmState("");
            openDialog(
                "No se pudo completar",
                error?.message || "No se pudo completar la produccion.",
                "danger"
            );
        } finally {
            setIsCompleting(false);
        }
    }

    async function handleCancel() {
        try {
            setIsCancelling(true);
            const response = await fetch(`/api/productions/${production._id}/cancel`, {
                method: "POST",
            });
            const result = await response.json();

            if (!response.ok || !result?.ok) {
                throw new Error(
                    result?.message || "No se pudo cancelar la produccion."
                );
            }

            setConfirmState("");
            await refreshProduction();
        } catch (error) {
            setConfirmState("");
            openDialog(
                "No se pudo cancelar",
                error?.message || "No se pudo cancelar la produccion.",
                "danger"
            );
        } finally {
            setIsCancelling(false);
        }
    }

    function updateResultRow(index, patch) {
        setResults((prev) =>
            normalizeResultRows(
                prev.map((row, rowIndex) =>
                    rowIndex === index ? { ...row, ...patch } : row
                )
            )
        );
    }

    function renderResultProduct(item) {
        return (
            <div className={styles.readonlyField}>
                <span>{item.productNameSnapshot || "Producto sin definir"}</span>
            </div>
        );
    }

    function renderOutputSection() {
        return (
            <section className={styles.card}>
                <div className={styles.sectionHeader}>
                    <div>
                        <h2 className={styles.sectionTitle}>Resultados reales</h2>
                        <p className={styles.sectionDescription}>
                            Registra cantidades y pesos de los resultados definidos
                            por la ficha. Todos quedan en cocina.
                        </p>
                    </div>
                </div>

                <div className={styles.rows}>
                    {results.length === 0 ? (
                        <div className={styles.emptyState}>No hay registros cargados.</div>
                    ) : (
                        results.map((item, index) => (
                            <div key={`result-${index}`} className={styles.rowCard}>
                                <div className={styles.rowGrid}>
                                    <div className={styles.field}>
                                        <label className={styles.label}>Producto</label>
                                        {renderResultProduct(item)}
                                    </div>

                                    <div className={styles.field}>
                                        <label className={styles.label}>Cantidad</label>
                                        <div className={styles.fieldShell}>
                                            <input
                                                className="form-input"
                                                type="number"
                                                min="0"
                                                step="0.0001"
                                                value={item.quantity}
                                                onChange={(event) =>
                                                    updateResultRow(index, {
                                                        quantity: event.target.value,
                                                    })
                                                }
                                            />
                                        </div>
                                    </div>

                                    <div className={styles.field}>
                                        <label className={styles.label}>
                                            {requiresWeightControl &&
                                                item.unitSnapshot !== "kg"
                                                ? "Peso real (kg)"
                                                : "Unidad"}
                                        </label>
                                        {requiresWeightControl &&
                                            item.unitSnapshot !== "kg" ? (
                                            <div className={styles.fieldShell}>
                                                <input
                                                    className="form-input"
                                                    type="number"
                                                    min="0"
                                                    step="0.0001"
                                                    value={item.recordedWeight}
                                                    onChange={(event) =>
                                                        updateResultRow(index, {
                                                            recordedWeight: event.target.value,
                                                        })
                                                    }
                                                />
                                            </div>
                                        ) : (
                                            <div className={styles.readonlyField}>
                                                <span>{getUnitLabel(item.unitSnapshot)}</span>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <div className={styles.rowFooter}>
                                    {results.length > 1 ? (
                                        item.isMain ? (
                                            <span
                                                className={`${styles.flagToggle} ${styles.flagToggleActive}`}
                                            >
                                                <span>Principal</span>
                                            </span>
                                        ) : (
                                            <span
                                                className={`${styles.flagToggle} ${styles.flagToggleSecondary}`}
                                            >
                                                <span>Subproducto</span>
                                            </span>
                                        )
                                    ) : (
                                        <span
                                            className={`${styles.flagToggle} ${styles.flagToggleActive}`}
                                        >
                                            <span>Principal</span>
                                        </span>
                                    )}
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </section>
        );
    }

    return (
        <>
            <div className="page">
                <div className={styles.header}>
                    <div>
                        <button
                            type="button"
                            className={`miniAction ${styles.backButton}`}
                            onClick={() => router.push("/dashboard/production")}
                        >
                            <ArrowLeft size={16} />
                            Volver
                        </button>

                        <div className={styles.heading}>
                            <h1 className={styles.title}>{production.productionNumber}</h1>
                            <p className={styles.subtitle}>
                                {getProductionTypeLabel(
                                    production?.templateSnapshot?.type ||
                                    production?.productionType
                                )}{" "}
                                · Iniciada el {formatDate(production?.startedAt)}
                            </p>
                        </div>
                    </div>

                    <div className={styles.headerActions}>
                        <button
                            type="button"
                            className="miniAction"
                            onClick={handleSave}
                            disabled={isSaving || isCompleting || isCancelling}
                        >
                            {isSaving ? (
                                <>
                                    <LoaderCircle size={16} className={styles.spin} />
                                    Guardando...
                                </>
                            ) : (
                                <>
                                    <Save size={16} />
                                    Guardar
                                </>
                            )}
                        </button>

                        <button
                            type="button"
                            className="miniAction miniActionPrimary"
                            onClick={() => setConfirmState("complete")}
                            disabled={
                                !canComplete || isSaving || isCompleting || isCancelling
                            }
                        >
                            <CheckCircle2 size={16} />
                            Completar
                        </button>

                        <button
                            type="button"
                            className="miniAction miniActionDanger"
                            onClick={() => setConfirmState("cancel")}
                            disabled={isSaving || isCompleting || isCancelling}
                        >
                            <XCircle size={16} />
                            Cancelar
                        </button>
                    </div>
                </div>

                <div className={styles.summaryGrid}>
                    <div className={styles.summaryCard}>
                        <span className={styles.summaryLabel}>Ficha</span>
                        <strong>{production?.templateSnapshot?.name || "Sin ficha"}</strong>
                    </div>

                    <div className={styles.summaryCard}>
                        <span className={styles.summaryLabel}>Objetivo</span>
                        <strong>
                            {formatNumber(production?.targetQuantity, 3)}{" "}
                            {getUnitLabel(production?.targetUnit)}
                        </strong>
                    </div>

                    <div className={styles.summaryCard}>
                        <span className={styles.summaryLabel}>Desperdicio requerido</span>
                        <strong>
                            {production?.templateSnapshot?.requiresWasteRecord
                                ? "Si"
                                : "No"}
                        </strong>
                    </div>

                    <div className={styles.summaryCard}>
                        <span className={styles.summaryLabel}>Control de gramaje</span>
                        <strong>{requiresWeightControl ? "Activo" : "No"}</strong>
                    </div>
                </div>

                {requiresWeightControl ? (
                    <div className={styles.summaryGrid}>
                        <div className={styles.summaryCard}>
                            <span className={styles.summaryLabel}>Peso objetivo</span>
                            <strong>{formatNumber(weightPreview.targetWeight, 3)} kg</strong>
                        </div>
                        <div className={styles.summaryCard}>
                            <span className={styles.summaryLabel}>Peso registrado</span>
                            <strong>
                                {formatNumber(weightPreview.recordedTotalWeight, 3)} kg
                            </strong>
                        </div>
                        <div className={styles.summaryCard}>
                            <span className={styles.summaryLabel}>Diferencia</span>
                            <strong>
                                {formatSignedNumber(weightPreview.differenceWeight)} kg
                            </strong>
                        </div>
                        <div className={styles.summaryCard}>
                            <span className={styles.summaryLabel}>Desvio</span>
                            <strong>
                                {weightPreview.differencePercent === null
                                    ? "0"
                                    : formatSignedNumber(weightPreview.differencePercent)}%
                            </strong>
                        </div>
                    </div>
                ) : null}

                <section className={styles.card}>
                    <div className={styles.sectionHeader}>
                        <div>
                            <h2 className={styles.sectionTitle}>Insumos consumidos</h2>
                            <p className={styles.sectionDescription}>
                                Ya descontados de inventario al iniciar la produccion.
                            </p>
                        </div>
                    </div>

                    <div className={styles.rows}>
                        {(production?.inputs || []).map((item, index) => (
                            <div key={`input-${index}`} className={styles.readonlyRow}>
                                <div>
                                    <strong>{item.productNameSnapshot}</strong>
                                    <p className={styles.meta}>
                                        {item.productCodeSnapshot || "Sin codigo"}
                                    </p>
                                </div>
                                <strong>
                                    {formatNumber(item.quantity, 3)}{" "}
                                    {getUnitLabel(item.unitSnapshot)}
                                </strong>
                            </div>
                        ))}
                    </div>
                </section>

                {hasMissingRecordedWeights ? (
                    <div className={styles.warningBox}>
                        <AlertTriangle size={16} />
                        Falta registrar el peso real de los resultados cuando la ficha
                        controla gramaje.
                    </div>
                ) : null}

                {renderOutputSection()}

                {production?.templateSnapshot?.requiresWasteRecord ? (
                    <section className={styles.card}>
                        <div className={styles.sectionHeader}>
                            <div>
                                <h2 className={styles.sectionTitle}>Desperdicio real</h2>
                                <p className={styles.sectionDescription}>
                                    Registra el peso total de lo que ya no se pudo
                                    aprovechar en esta produccion.
                                </p>
                            </div>
                        </div>

                        {hasMissingWaste ? (
                            <div className={styles.warningBox}>
                                <AlertTriangle size={16} />
                                Debes registrar el desperdicio total antes de completar.
                            </div>
                        ) : null}

                        <div className={styles.rows}>
                            <div className={styles.rowCard}>
                                <div className={styles.rowGrid}>
                                    <div className={styles.field}>
                                        <label className={styles.label}>
                                            Cantidad de desperdicio
                                        </label>
                                        <div className={styles.inlineField}>
                                            <div className={styles.fieldShell}>
                                                <input
                                                    className="form-input"
                                                    type="number"
                                                    min="0"
                                                    step="0.0001"
                                                    value={waste[0]?.quantity || ""}
                                                    onChange={(event) =>
                                                        setWaste((prev) => [
                                                            {
                                                                ...(prev[0] || createWasteRow()),
                                                                quantity: event.target.value,
                                                            },
                                                        ])
                                                    }
                                                />
                                            </div>
                                            <span className={styles.inlineUnit}>kg</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </section>
                ) : null}

                <section className={styles.card}>
                    <div className={styles.sectionHeader}>
                        <div>
                            <h2 className={styles.sectionTitle}>Notas operativas</h2>
                        </div>
                    </div>

                    <textarea
                        className={`form-textarea ${styles.textarea}`}
                        value={notes}
                        onChange={(event) => setNotes(event.target.value)}
                        placeholder="Observaciones de la ejecucion"
                    />
                </section>
            </div>

            <ConfirmModal
                open={confirmState === "complete"}
                title="Completar produccion"
                description="Se registraran los resultados finales y el desperdicio total de la produccion. Verifica cantidades y pesos reales antes de continuar."
                confirmLabel="Completar produccion"
                cancelLabel="Volver"
                variant="warning"
                isSubmitting={isCompleting}
                onClose={() => setConfirmState("")}
                onConfirm={handleComplete}
            />

            <ConfirmModal
                open={confirmState === "cancel"}
                title="Cancelar produccion"
                description="Se devolveran los insumos consumidos al inventario de cocina y la produccion quedara cancelada."
                confirmLabel="Cancelar produccion"
                cancelLabel="Volver"
                variant="danger"
                isSubmitting={isCancelling}
                onClose={() => setConfirmState("")}
                onConfirm={handleCancel}
            />

            <DialogModal
                open={dialogState.open}
                title={dialogState.title}
                message={dialogState.message}
                variant={dialogState.variant}
                confirmText="Aceptar"
                showCancel={false}
                onConfirm={() =>
                    setDialogState((prev) => ({ ...prev, open: false }))
                }
                onClose={() =>
                    setDialogState((prev) => ({ ...prev, open: false }))
                }
            />
        </>
    );
}
