"use client";

import { useEffect, useMemo, useState } from "react";
import {
    AlertTriangle,
    ArrowLeft,
    CheckCircle2,
    LoaderCircle,
    Plus,
    Save,
    Trash2,
    XCircle,
} from "lucide-react";
import { useRouter } from "next/navigation";
import ProductAutocomplete from "@components/shared/ProductAutocomplete/ProductAutoComplete";
import ConfirmModal from "@components/shared/ConfirmModal/ConfirmModal";
import DialogModal from "@components/shared/DialogModal/DialogModal";
import { getUnitLabel, PRODUCT_UNIT_OPTIONS } from "@libs/constants/units";
import { getProductionTypeLabel } from "@libs/constants/productionTypes";
import styles from "./production-progress-view.module.scss";

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

function createOutputRow() {
    return {
        productId: "",
        productNameSnapshot: "",
        productCodeSnapshot: "",
        unitSnapshot: "unit",
        quantity: "",
        destinationLocation: "warehouse",
        isMain: false,
        isByProduct: false,
        notes: "",
    };
}

function createWasteRow() {
    return {
        type: "merma",
        quantity: "",
        unitSnapshot: "kg",
        originKind: "process",
        originProductId: "",
        originNameSnapshot: "",
        originUnitSnapshot: "",
        sourceLocation: "kitchen",
        notes: "",
    };
}

function mapOutputRows(items = [], fallbackIsByProduct = false) {
    return items.length
        ? items.map((item) => ({
            productId: item.productId?._id || item.productId || "",
            productNameSnapshot:
                item.productNameSnapshot || item.productId?.name || "",
            productCodeSnapshot:
                item.productCodeSnapshot || item.productId?.code || "",
            unitSnapshot: item.unitSnapshot || item.productId?.unit || "unit",
            quantity: String(item.quantity ?? ""),
            destinationLocation: item.destinationLocation || "warehouse",
            isMain: Boolean(item.isMain),
            isByProduct: fallbackIsByProduct || Boolean(item.isByProduct),
            notes: item.notes || "",
        }))
        : [];
}

function mapWasteRows(items = []) {
    return items.length
        ? items.map((item) => ({
            type: item.type || "merma",
            quantity: String(item.quantity ?? ""),
            unitSnapshot: item.unitSnapshot || "kg",
            originKind: item.originKind || "process",
            originProductId: item.originProductId?._id || item.originProductId || "",
            originNameSnapshot:
                item.originNameSnapshot || item.originProductId?.name || "",
            originUnitSnapshot:
                item.originUnitSnapshot || item.originProductId?.unit || "",
            sourceLocation: item.sourceLocation || "kitchen",
            notes: item.notes || "",
        }))
        : [];
}

function buildWasteOriginOptions(production) {
    const inputOptions = (production?.inputs || []).map((item) => ({
        value: String(item.productId?._id || item.productId || ""),
        label: item.productNameSnapshot || "Producto",
        unit: item.unitSnapshot || "",
    }));

    const outputOptions = (production?.outputs || []).map((item) => ({
        value: String(item.productId?._id || item.productId || ""),
        label: item.productNameSnapshot || "Producto",
        unit: item.unitSnapshot || "",
    }));

    const unique = new Map();

    [...inputOptions, ...outputOptions].forEach((item) => {
        if (!item.value) return;
        if (!unique.has(item.value)) {
            unique.set(item.value, item);
        }
    });

    return Array.from(unique.values());
}

export default function ProductionInProgressView({
    production,
    refreshProduction,
}) {
    const router = useRouter();
    const [notes, setNotes] = useState("");
    const [outputs, setOutputs] = useState([]);
    const [byproducts, setByproducts] = useState([]);
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

    const wasteOriginOptions = useMemo(
        () => buildWasteOriginOptions(production),
        [production]
    );

    useEffect(() => {
        setNotes(production?.notes || "");
        setOutputs(
            mapOutputRows(
                production?.outputs?.length
                    ? production.outputs
                    : (production?.expectedOutputs || []).filter((item) => !item.isByProduct)
            )
        );
        setByproducts(
            mapOutputRows(
                production?.byproducts?.length
                    ? production.byproducts
                    : (production?.expectedOutputs || []).filter((item) => item.isByProduct),
                true
            )
        );
        setWaste(mapWasteRows(production?.waste || []));
    }, [production]);

    const hasMissingWaste =
        production?.templateSnapshot?.requiresWasteRecord && waste.length === 0;

    const canComplete = useMemo(() => {
        return (
            outputs.some((item) => item.productId && Number(item.quantity || 0) > 0) &&
            !hasMissingWaste
        );
    }, [outputs, hasMissingWaste]);

    function openDialog(title, message, variant = "info") {
        setDialogState({
            open: true,
            title,
            message,
            variant,
        });
    }

    function sanitizeOutputRows(rows, forcedByproduct = false) {
        return rows
            .filter((item) => item.productId && Number(item.quantity || 0) > 0)
            .map((item) => ({
                productId: item.productId,
                unitSnapshot: item.unitSnapshot,
                quantity: Number(item.quantity),
                destinationLocation: item.destinationLocation || "warehouse",
                isMain: forcedByproduct ? false : Boolean(item.isMain),
                isByProduct: forcedByproduct ? true : Boolean(item.isByProduct),
                notes: item.notes || "",
            }));
    }

    function sanitizeWasteRows(rows) {
        return rows
            .filter((item) => Number(item.quantity || 0) > 0)
            .map((item) => ({
                type: item.type || "merma",
                quantity: Number(item.quantity),
                unitSnapshot: item.unitSnapshot || "kg",
                originKind: item.originKind || "process",
                originProductId: item.originProductId || null,
                originNameSnapshot: item.originNameSnapshot || "",
                originUnitSnapshot: item.originUnitSnapshot || null,
                sourceLocation: item.sourceLocation || "kitchen",
                notes: item.notes || "",
            }));
    }

    async function handleSave() {
        try {
            setIsSaving(true);

            const response = await fetch(`/api/productions/${production._id}`, {
                method: "PATCH",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    notes,
                    outputs: sanitizeOutputRows(outputs, false),
                    byproducts: sanitizeOutputRows(byproducts, true),
                    waste: sanitizeWasteRows(waste),
                }),
            });

            const result = await response.json();

            if (!response.ok || !result?.ok) {
                throw new Error(result?.message || "No se pudo guardar la producción.");
            }

            await refreshProduction();
            openDialog("Cambios guardados", "La producción fue actualizada.", "success");
        } catch (error) {
            console.error("[PRODUCTION_IN_PROGRESS_SAVE_ERROR]", error);
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
            });
            const result = await response.json();

            if (!response.ok || !result?.ok) {
                throw new Error(result?.message || "No se pudo completar la producción.");
            }

            setConfirmState("");
            await refreshProduction();
        } catch (error) {
            console.error("[PRODUCTION_IN_PROGRESS_COMPLETE_ERROR]", error);
            setConfirmState("");
            openDialog(
                "No se pudo completar",
                error?.message || "No se pudo completar la producción.",
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
                throw new Error(result?.message || "No se pudo cancelar la producción.");
            }

            setConfirmState("");
            await refreshProduction();
        } catch (error) {
            console.error("[PRODUCTION_IN_PROGRESS_CANCEL_ERROR]", error);
            setConfirmState("");
            openDialog(
                "No se pudo cancelar",
                error?.message || "No se pudo cancelar la producción.",
                "danger"
            );
        } finally {
            setIsCancelling(false);
        }
    }

    function updateRows(setter, index, patch) {
        setter((prev) =>
            prev.map((row, rowIndex) =>
                rowIndex === index ? { ...row, ...patch } : row
            )
        );
    }

    function removeRow(setter, index) {
        setter((prev) => prev.filter((_, rowIndex) => rowIndex !== index));
    }

    function renderAutocompleteRow(item, setter, index) {
        return (
            <ProductAutocomplete
                value={item.productId}
                selectedProduct={
                    item.productId
                        ? {
                            _id: item.productId,
                            name: item.productNameSnapshot,
                            code: item.productCodeSnapshot,
                            unit: item.unitSnapshot,
                        }
                        : null
                }
                onChange={(product) =>
                    updateRows(setter, index, {
                        productId: product?._id || "",
                        productNameSnapshot: product?.name || "",
                        productCodeSnapshot: product?.code || "",
                        unitSnapshot: product?.unit || "unit",
                    })
                }
            />
        );
    }

    function renderOutputSection(title, rows, setter, byproduct = false) {
        return (
            <section className={styles.card}>
                <div className={styles.sectionHeader}>
                    <div>
                        <h2 className={styles.sectionTitle}>{title}</h2>
                        <p className={styles.sectionDescription}>
                            Registra cantidades reales y destino.
                        </p>
                    </div>

                    <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={() => setter((prev) => [...prev, createOutputRow()])}
                    >
                        <Plus size={16} />
                        Agregar
                    </button>
                </div>

                <div className={styles.rows}>
                    {rows.length === 0 ? (
                        <div className={styles.emptyState}>No hay registros cargados.</div>
                    ) : (
                        rows.map((item, index) => (
                            <div key={`${title}-${index}`} className={styles.rowCard}>
                                <div className={styles.rowGrid}>
                                    <div className={styles.field}>
                                        <label className={styles.label}>Producto</label>
                                        {renderAutocompleteRow(item, setter, index)}
                                    </div>

                                    <div className={styles.field}>
                                        <label className={styles.label}>Cantidad</label>
                                        <input
                                            className={styles.input}
                                            type="number"
                                            min="0"
                                            step="0.0001"
                                            value={item.quantity}
                                            onChange={(event) =>
                                                updateRows(setter, index, {
                                                    quantity: event.target.value,
                                                })
                                            }
                                        />
                                    </div>

                                    <div className={styles.field}>
                                        <label className={styles.label}>Destino</label>
                                        <select
                                            className={styles.input}
                                            value={item.destinationLocation}
                                            onChange={(event) =>
                                                updateRows(setter, index, {
                                                    destinationLocation: event.target.value,
                                                })
                                            }
                                        >
                                            <option value="warehouse">Bodega</option>
                                            <option value="kitchen">Cocina</option>
                                        </select>
                                    </div>
                                </div>

                                <div className={styles.rowFooter}>
                                    <span className={styles.meta}>
                                        <span className={styles.metaLabel}>Unidad:</span> {getUnitLabel(item.unitSnapshot)}
                                    </span>

                                    {!byproduct ? (
                                        <label
                                            className={`${styles.flagToggle} ${item.isMain ? styles.flagToggleActive : ""
                                                }`}
                                        >
                                            <input
                                                type="checkbox"
                                                checked={Boolean(item.isMain)}
                                                onChange={(event) =>
                                                    updateRows(setter, index, {
                                                        isMain: event.target.checked,
                                                    })
                                                }
                                            />
                                            <span>Principal</span>
                                        </label>
                                    ) : null}

                                    <button
                                        type="button"
                                        className="btn btn-danger"
                                        onClick={() => removeRow(setter, index)}
                                    >
                                        <Trash2 size={14} />
                                        Quitar
                                    </button>
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
            <div className={styles.page}>
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

                        <div className={styles.heading}>
                            <h1 className={styles.title}>{production.productionNumber}</h1>
                            <p className={styles.subtitle}>
                                {getProductionTypeLabel(
                                    production?.templateSnapshot?.type || production?.productionType
                                )} · Iniciada el {formatDate(production?.startedAt)}
                            </p>
                        </div>
                    </div>

                    <div className={styles.headerActions}>
                        <button
                            type="button"
                            className="btn btn-secondary"
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
                            className="btn btn-primary"
                            onClick={() => setConfirmState("complete")}
                            disabled={!canComplete || isSaving || isCompleting || isCancelling}
                        >
                            <CheckCircle2 size={16} />
                            Completar
                        </button>

                        <button
                            type="button"
                            className="btn btn-danger"
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
                            {formatNumber(production?.targetQuantity)} {getUnitLabel(production?.targetUnit)}
                        </strong>
                    </div>
                    <div className={styles.summaryCard}>
                        <span className={styles.summaryLabel}>Insumos consumidos</span>
                        <strong>{production?.inputs?.length || 0}</strong>
                    </div>
                    <div className={styles.summaryCard}>
                        <span className={styles.summaryLabel}>Merma requerida</span>
                        <strong>
                            {production?.templateSnapshot?.requiresWasteRecord ? "Sí" : "No"}
                        </strong>
                    </div>
                </div>

                <section className={styles.card}>
                    <div className={styles.sectionHeader}>
                        <div>
                            <h2 className={styles.sectionTitle}>Insumos consumidos</h2>
                            <p className={styles.sectionDescription}>
                                Ya descontados de inventario al iniciar la producción.
                            </p>
                        </div>
                    </div>

                    <div className={styles.rows}>
                        {(production?.inputs || []).map((item, index) => (
                            <div key={`input-${index}`} className={styles.readonlyRow}>
                                <div>
                                    <strong>{item.productNameSnapshot}</strong>
                                    <p className={styles.meta}>
                                        {item.productCodeSnapshot || "Sin código"}
                                    </p>
                                </div>
                                <strong>
                                    {formatNumber(item.quantity)} {getUnitLabel(item.unitSnapshot)}
                                </strong>
                            </div>
                        ))}
                    </div>
                </section>

                {renderOutputSection("Resultados reales", outputs, setOutputs, false)}
                {renderOutputSection("Subproductos", byproducts, setByproducts, true)}

                <section className={styles.card}>
                    <div className={styles.sectionHeader}>
                        <div>
                            <h2 className={styles.sectionTitle}>Merma y desperdicio</h2>
                            <p className={styles.sectionDescription}>
                                {production?.templateSnapshot?.requiresWasteRecord
                                    ? "Debes registrar al menos una fila antes de completar."
                                    : "Opcional para esta ficha."}
                            </p>
                        </div>

                        <button
                            type="button"
                            className="btn btn-secondary"
                            onClick={() => setWaste((prev) => [...prev, createWasteRow()])}
                        >
                            <Plus size={16} />
                            Agregar
                        </button>
                    </div>

                    {hasMissingWaste ? (
                        <div className={styles.warningBox}>
                            <AlertTriangle size={16} />
                            Debes registrar merma o desperdicio antes de completar.
                        </div>
                    ) : null}

                    <div className={styles.rows}>
                        {waste.length === 0 ? (
                            <div className={styles.emptyState}>No hay merma registrada.</div>
                        ) : (
                            waste.map((item, index) => (
                                <div key={`waste-${index}`} className={styles.rowCard}>
                                    <div className={styles.rowGrid}>
                                        <div className={styles.field}>
                                            <label className={styles.label}>Origen</label>
                                            <select
                                                className={styles.input}
                                                value={item.originKind}
                                                onChange={(event) =>
                                                    updateRows(setWaste, index, {
                                                        originKind: event.target.value,
                                                        originProductId:
                                                            event.target.value === "process"
                                                                ? ""
                                                                : item.originProductId,
                                                        originNameSnapshot:
                                                            event.target.value === "process"
                                                                ? ""
                                                                : item.originNameSnapshot,
                                                        originUnitSnapshot:
                                                            event.target.value === "process"
                                                                ? ""
                                                                : item.originUnitSnapshot,
                                                    })
                                                }
                                            >
                                                <option value="process">Proceso general</option>
                                                <option value="input">Insumo</option>
                                                <option value="output">Resultado</option>
                                            </select>
                                        </div>

                                        {item.originKind !== "process" ? (
                                            <div className={styles.field}>
                                                <label className={styles.label}>Producto origen</label>
                                                <select
                                                    className={styles.input}
                                                    value={item.originProductId}
                                                    onChange={(event) => {
                                                        const selected = wasteOriginOptions.find(
                                                            (option) => option.value === event.target.value
                                                        );

                                                        updateRows(setWaste, index, {
                                                            originProductId: selected?.value || "",
                                                            originNameSnapshot: selected?.label || "",
                                                            originUnitSnapshot: selected?.unit || "",
                                                        });
                                                    }}
                                                >
                                                    <option value="">Selecciona una opción</option>
                                                    {wasteOriginOptions.map((option) => (
                                                        <option key={option.value} value={option.value}>
                                                            {option.label}
                                                        </option>
                                                    ))}
                                                </select>
                                            </div>
                                        ) : null}

                                        <div className={styles.field}>
                                            <label className={styles.label}>Tipo</label>
                                            <select
                                                className={styles.input}
                                                value={item.type}
                                                onChange={(event) =>
                                                    updateRows(setWaste, index, {
                                                        type: event.target.value,
                                                    })
                                                }
                                            >
                                                <option value="merma">Merma</option>
                                                <option value="desperdicio">Desperdicio</option>
                                            </select>
                                        </div>

                                        <div className={styles.field}>
                                            <label className={styles.label}>Cantidad</label>
                                            <input
                                                className={styles.input}
                                                type="number"
                                                min="0"
                                                step="0.0001"
                                                value={item.quantity}
                                                onChange={(event) =>
                                                    updateRows(setWaste, index, {
                                                        quantity: event.target.value,
                                                    })
                                                }
                                            />
                                        </div>

                                        <div className={styles.field}>
                                            <label className={styles.label}>Unidad</label>
                                            <select
                                                className={styles.input}
                                                value={item.unitSnapshot}
                                                onChange={(event) =>
                                                    updateRows(setWaste, index, {
                                                        unitSnapshot: event.target.value,
                                                    })
                                                }
                                            >
                                                {PRODUCT_UNIT_OPTIONS.map((option) => (
                                                    <option key={option.value} value={option.value}>
                                                        {option.label}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>
                                    </div>

                                    <div className={styles.rowFooter}>
                                        <span className={styles.meta}>
                                            {item.originKind === "process"
                                                ? <><span className={styles.metaLabel}>Origen:</span>Proceso General</>
                                                : item.originNameSnapshot
                                                    ? <><span className={styles.metaLabel}>Origen:</span>${item.originNameSnapshot}</>
                                                    : <><span className={styles.metaLabel}>Origen:</span>Sin Definir</> }
                                        </span>

                                        <button
                                            type="button"
                                            className="btn btn-danger"
                                            onClick={() => removeRow(setWaste, index)}
                                        >
                                            <Trash2 size={14} />
                                            Quitar
                                        </button>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </section>

                <section className={styles.card}>
                    <div className={styles.sectionHeader}>
                        <div>
                            <h2 className={styles.sectionTitle}>Notas operativas</h2>
                        </div>
                    </div>

                    <textarea
                        className={styles.textarea}
                        value={notes}
                        onChange={(event) => setNotes(event.target.value)}
                        placeholder="Observaciones de la ejecución"
                    />
                </section>
            </div>

            <ConfirmModal
                open={confirmState === "complete"}
                title="Completar producción"
                description="Se registrarán los movimientos finales de salida e inventario. Verifica resultados y merma antes de continuar."
                confirmLabel="Completar producción"
                cancelLabel="Volver"
                variant="warning"
                isSubmitting={isCompleting}
                onClose={() => setConfirmState("")}
                onConfirm={handleComplete}
            />

            <ConfirmModal
                open={confirmState === "cancel"}
                title="Cancelar producción"
                description="Se devolverán los insumos consumidos al inventario de cocina y la producción quedará cancelada."
                confirmLabel="Cancelar producción"
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
                onConfirm={() => setDialogState((prev) => ({ ...prev, open: false }))}
                onClose={() => setDialogState((prev) => ({ ...prev, open: false }))}
            />
        </>
    );
}
