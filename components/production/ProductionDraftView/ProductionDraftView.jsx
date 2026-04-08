"use client";

import { useEffect, useMemo, useState } from "react";
import {
    AlertTriangle,
    ArrowLeft,
    ClipboardList,
    LoaderCircle,
    Play,
    Save,
    Trash2,
    FileText,
    Package,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { getUnitLabel } from "@libs/constants/units";
import { getProductionTypeLabel } from "@libs/constants/productionTypes";
import styles from "./production-draft-view.module.scss";
import ConfirmModal from "@components/shared/ConfirmModal/ConfirmModal";
import DialogModal from "@components/shared/DialogModal/DialogModal";


function formatNumber(value) {
    const parsed = Number(value || 0);

    return new Intl.NumberFormat("es-EC", {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
    }).format(parsed);
}

function formatDate(value) {
    if (!value) return "—";

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) return "—";

    return new Intl.DateTimeFormat("es-EC", {
        dateStyle: "medium",
        timeStyle: "short",
    }).format(date);
}

export default function ProductionDraftView({
    production,
    refreshProduction,
}) {
    const router = useRouter();

    const [form, setForm] = useState({
        targetQuantity: "",
        notes: "",
    });

    const [initialForm, setInitialForm] = useState({
        targetQuantity: "",
        notes: "",
    });

    const [successMessage, setSuccessMessage] = useState("");
    const [isSaving, setIsSaving] = useState(false);
    const [isStarting, setIsStarting] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);

    const [showStartModal, setShowStartModal] = useState(false);
    const [showDeleteModal, setShowDeleteModal] = useState(false);

    const [dialogState, setDialogState] = useState({
        open: false,
        title: "",
        message: "",
        variant: "info",
    });

    useEffect(() => {
        const nextForm = {
            targetQuantity: production?.targetQuantity ?? "",
            notes: production?.notes || "",
        };

        setForm(nextForm);
        setInitialForm(nextForm);
    }, [production]);

    const hasChanges = useMemo(() => {
        return (
            String(form.targetQuantity) !== String(initialForm.targetQuantity) ||
            String(form.notes) !== String(initialForm.notes)
        );
    }, [form, initialForm]);

    const canSave = useMemo(() => {
        return (
            hasChanges &&
            !isSaving &&
            !isStarting &&
            !isDeleting &&
            Number(form.targetQuantity) > 0
        );
    }, [hasChanges, form.targetQuantity, isSaving, isStarting, isDeleting]);

    const canStart = useMemo(() => {
        return (
            !isSaving &&
            !isStarting &&
            !isDeleting &&
            Number(form.targetQuantity) > 0
        );
    }, [form.targetQuantity, isSaving, isStarting, isDeleting]);

    function openDialog({
        title,
        message,
        variant = "info",
    }) {
        setDialogState({
            open: true,
            title,
            message,
            variant,
        });
    }

    function closeDialog() {
        setDialogState((prev) => ({
            ...prev,
            open: false,
        }));
    }

    async function handleSave() {
        if (!production?._id) return;

        if (!form.targetQuantity || Number(form.targetQuantity) <= 0) {
            openDialog({
                title: "Cantidad inválida",
                message: "La cantidad objetivo debe ser mayor a 0.",
                variant: "warning",
            });
            return;
        }

        if (!hasChanges) {
            return;
        }

        try {
            setIsSaving(true);
            setSuccessMessage("");

            const payload = {
                targetQuantity: Number(form.targetQuantity),
                notes: form.notes.trim(),
            };

            const response = await fetch(`/api/productions/${production._id}`, {
                method: "PATCH",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(payload),
            });

            const result = await response.json();

            if (!response.ok || !result?.ok) {
                throw new Error(
                    result?.message || "No se pudo actualizar el borrador."
                );
            }

            setSuccessMessage("Borrador actualizado correctamente.");
            await refreshProduction();
        } catch (error) {
            console.error("[PRODUCTION_DRAFT_SAVE_ERROR]", error);
            openDialog({
                title: "No se pudo guardar",
                message:
                    error?.message || "No se pudo actualizar el borrador.",
                variant: "danger",
            });
        } finally {
            setIsSaving(false);
        }
    }

    function handleOpenStartModal() {
        if (!canStart) return;

        if (hasChanges) {
            openDialog({
                title: "Hay cambios sin guardar",
                message:
                    "Debes guardar los cambios del borrador antes de pasar la producción a en proceso.",
                variant: "warning",
            });
            return;
        }

        setShowStartModal(true);
    }

    async function confirmStartProduction() {
        if (!production?._id) return;

        try {
            setIsStarting(true);
            setSuccessMessage("");

            const response = await fetch(
                `/api/productions/${production._id}/start`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                    },
                }
            );

            const result = await response.json();

            if (!response.ok || !result?.ok) {
                throw new Error(
                    result?.message || "No se pudo iniciar la producción."
                );
            }

            setShowStartModal(false);
            await refreshProduction();
        } catch (error) {
            console.error("[PRODUCTION_DRAFT_START_ERROR]", error);
            setShowStartModal(false);
            openDialog({
                title: "No se pudo iniciar la producción",
                message:
                    error?.message ||
                    "Ocurrió un error al validar inventario e iniciar la producción.",
                variant: "danger",
            });
        } finally {
            setIsStarting(false);
        }
    }

    async function confirmDeleteDraft() {
        if (!production?._id) return;

        try {
            setIsDeleting(true);
            setSuccessMessage("");

            const response = await fetch(`/api/productions/${production._id}`, {
                method: "DELETE",
            });

            const result = await response.json();

            if (!response.ok || !result?.ok) {
                throw new Error(
                    result?.message || "No se pudo eliminar el borrador."
                );
            }

            setShowDeleteModal(false);
            router.push("/dashboard/production");
        } catch (error) {
            console.error("[PRODUCTION_DRAFT_DELETE_ERROR]", error);
            setShowDeleteModal(false);
            openDialog({
                title: "No se pudo eliminar",
                message:
                    error?.message || "No se pudo eliminar el borrador.",
                variant: "danger",
            });
        } finally {
            setIsDeleting(false);
        }
    }

    return (
        <>
            <div className={styles.page}>
                <div className={styles.header}>
                    <div className={styles.headerLeft}>
                        <button
                            type="button"
                            className={`btn btn-secondary ${styles.backButton}`}
                            onClick={() => router.push("/dashboard/production")}
                            disabled={isSaving || isStarting || isDeleting}
                        >
                            <ArrowLeft size={16} />
                            Volver
                        </button>

                        <div className={styles.heading}>
                            <div className={styles.titleRow}>
                                <h1 className={styles.title}>
                                    {production.productionNumber || "Borrador de producción"}
                                </h1>

                                <span className={styles.statusBadge}>
                                    Borrador
                                </span>
                            </div>

                            <p className={styles.subtitle}>
                                Revisa la ficha, ajusta la cantidad objetivo y cuando todo esté listo inicia la producción.
                            </p>
                        </div>
                    </div>

                    <div className={styles.headerActions}>
                        <button
                            type="button"
                            className="btn btn-secondary"
                            onClick={handleSave}
                            disabled={!canSave}
                        >
                            {isSaving ? (
                                <>
                                    <LoaderCircle size={16} className={styles.spin} />
                                    Guardando...
                                </>
                            ) : (
                                <>
                                    <Save size={16} />
                                    Guardar cambios
                                </>
                            )}
                        </button>

                        <button
                            type="button"
                            className="btn btn-primary"
                            onClick={handleOpenStartModal}
                            disabled={!canStart}
                        >
                            {isStarting ? (
                                <>
                                    <LoaderCircle size={16} className={styles.spin} />
                                    Iniciando...
                                </>
                            ) : (
                                <>
                                    <Play size={16} />
                                    Pasar a en proceso
                                </>
                            )}
                        </button>

                        <button
                            type="button"
                            className={`btn btn-secondary ${styles.deleteButton}`}
                            onClick={() => setShowDeleteModal(true)}
                            disabled={isSaving || isStarting || isDeleting}
                        >
                            {isDeleting ? (
                                <>
                                    <LoaderCircle size={16} className={styles.spin} />
                                    Eliminando...
                                </>
                            ) : (
                                <>
                                    <Trash2 size={16} />
                                    Eliminar borrador
                                </>
                            )}
                        </button>
                    </div>
                </div>

                {successMessage ? (
                    <div className={styles.successBox}>
                        <p className={styles.successText}>{successMessage}</p>
                    </div>
                ) : null}

                <div className={styles.layout}>
                    <section className={styles.mainColumn}>
                        <div className={styles.card}>
                            <div className={styles.sectionHeader}>
                                <div>
                                    <h2 className={styles.sectionTitle}>Información general</h2>
                                    <p className={styles.sectionDescription}>
                                        Datos base del borrador y de la ficha de producción asociada.
                                    </p>
                                </div>
                            </div>
                            <div className={styles.summaryWrapper}>

                                <div className={styles.summaryGrid}>
                                    <div className={styles.summaryItem}>
                                        <span className={styles.summaryLabel}>Ficha</span>
                                        <span className={styles.summaryValue}>
                                            {production?.productionTemplateId?.name ||
                                                production?.templateSnapshot?.name ||
                                                "—"}
                                        </span>
                                    </div>

                                    <div className={styles.summaryItem}>
                                        <span className={styles.summaryLabel}>Código ficha</span>
                                        <span className={styles.summaryValue}>
                                            {production?.productionTemplateId?.code ||
                                                production?.templateSnapshot?.code ||
                                                "—"}
                                        </span>
                                    </div>

                                    <div className={styles.summaryItem}>
                                        <span className={styles.summaryLabel}>Tipo</span>
                                        <span className={styles.summaryValue}>
                                            {getProductionTypeLabel(
                                                production?.templateSnapshot?.type ||
                                                production?.productionType
                                            )}
                                        </span>
                                    </div>

                                    <div className={styles.summaryItem}>
                                        <span className={styles.summaryLabel}>Ubicación</span>
                                        <span className={styles.summaryValue}>
                                            {production?.location === "kitchen"
                                                ? "Cocina"
                                                : production?.location === "warehouse"
                                                    ? "Bodega"
                                                    : production?.location || "—"}
                                        </span>
                                    </div>

                                    <div className={styles.summaryItem}>
                                        <span className={styles.summaryLabel}>Creado por</span>
                                        <span className={styles.summaryValue}>
                                            {production?.performedBy
                                                ? `${production.performedBy.firstName || ""} ${production.performedBy.lastName || ""}`.trim() ||
                                                production.performedBy.username ||
                                                "Usuario"
                                                : "—"}
                                        </span>
                                    </div>

                                    <div className={styles.summaryItem}>
                                        <span className={styles.summaryLabel}>Creado el</span>
                                        <span className={styles.summaryValue}>
                                            {formatDate(production?.createdAt)}
                                        </span>
                                    </div>
                                </div>
                                <div className={styles.quickMetricsGrid}>
                                    <div className={styles.summaryItem}>
                                        <span className={styles.summaryLabel}>Cantidad objetivo</span>
                                        <span className={styles.summaryValue}>
                                            {form.targetQuantity ? formatNumber(form.targetQuantity) : "—"}
                                        </span>
                                    </div>

                                    <div className={styles.summaryItem}>
                                        <span className={styles.summaryLabel}>Unidad base</span>
                                        <span className={styles.summaryValue}>
                                            {getUnitLabel(
                                                production?.templateSnapshot?.baseUnit ||
                                                production?.targetUnit
                                            )}
                                        </span>
                                    </div>

                                    <div className={styles.summaryItem}>
                                        <span className={styles.summaryLabel}>Insumos esperados</span>
                                        <span className={styles.summaryValue}>
                                            {production?.expectedInputs?.length || 0}
                                        </span>
                                    </div>

                                    <div className={styles.summaryItem}>
                                        <span className={styles.summaryLabel}>Resultados esperados</span>
                                        <span className={styles.summaryValue}>
                                            {production?.expectedOutputs?.length || 0}
                                        </span>
                                    </div>
                                </div>
                            </div>

                        </div>

                        <div className={styles.card}>
                            <div className={styles.sectionHeader}>
                                <div>
                                    <h2 className={styles.sectionTitle}>Configuración del borrador</h2>
                                    <p className={styles.sectionDescription}>
                                        En borrador solo puedes ajustar la cantidad objetivo y las notas.
                                    </p>
                                </div>
                            </div>

                            <div className={styles.formGrid}>
                                <div className={styles.fieldBlock}>
                                    <label className={styles.fieldLabel}>
                                        Cantidad objetivo
                                    </label>
                                    <div className={styles.inlineInput}>
                                        <input
                                            type="number"
                                            min="0.0001"
                                            step="0.0001"
                                            value={form.targetQuantity}
                                            onChange={(event) =>
                                                setForm((prev) => ({
                                                    ...prev,
                                                    targetQuantity: event.target.value,
                                                }))
                                            }
                                            className={styles.fieldInput}
                                            disabled={isSaving || isStarting || isDeleting}
                                        />

                                        <div className={styles.inlineUnit}>
                                            {getUnitLabel(production?.targetUnit)}
                                        </div>
                                    </div>

                                    <span className={styles.helperText}>
                                        Debe ser mayor a 0. Al guardar, el sistema debe recalcular insumos y resultados esperados.
                                    </span>
                                </div>

                                <div className={`${styles.fieldBlock} ${styles.fullWidth}`}>
                                    <label className={styles.fieldLabel}>Notas</label>
                                    <textarea
                                        value={form.notes}
                                        onChange={(event) =>
                                            setForm((prev) => ({
                                                ...prev,
                                                notes: event.target.value,
                                            }))
                                        }
                                        className={styles.fieldTextarea}
                                        placeholder="Observaciones para este borrador"
                                        disabled={isSaving || isStarting || isDeleting}
                                    />
                                </div>
                            </div>
                        </div>

                        <div className={styles.card}>
                            <div className={styles.sectionHeader}>
                                <div>
                                    <h2 className={styles.sectionTitle}>Insumos esperados</h2>
                                    <p className={styles.sectionDescription}>
                                        Estos insumos se tomarán del inventario de cocina al pasar la producción a en proceso.
                                    </p>
                                </div>
                            </div>

                            {!production?.expectedInputs?.length ? (
                                <div className={styles.emptyState}>
                                    <Package size={18} />
                                    <p>No hay insumos esperados registrados.</p>
                                </div>
                            ) : (
                                <div className={styles.itemList}>
                                    {production.expectedInputs.map((item, index) => (
                                        <div key={`expected-input-${index}`} className={styles.itemRow}>
                                            <div className={styles.itemMain}>
                                                <strong className={styles.itemName}>
                                                    {item.productNameSnapshot || "Producto"}
                                                </strong>
                                                <span className={styles.itemSub}>
                                                    {item.productCodeSnapshot || "Sin código"}
                                                </span>
                                            </div>

                                            <div className={styles.itemSide}>
                                                <strong className={styles.itemQty}>
                                                    {formatNumber(item.quantity)}{" "}
                                                    {getUnitLabel(item.unitSnapshot)}
                                                </strong>
                                                <span className={styles.itemSub}>Insumo requerido</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div className={styles.card}>
                            <div className={styles.sectionHeader}>
                                <div>
                                    <h2 className={styles.sectionTitle}>Resultados esperados</h2>
                                    <p className={styles.sectionDescription}>
                                        Referencia de salida esperada según la ficha y la cantidad objetivo.
                                    </p>
                                </div>
                            </div>

                            {!production?.expectedOutputs?.length ? (
                                <div className={styles.emptyState}>
                                    <ClipboardList size={18} />
                                    <p>No hay resultados esperados registrados.</p>
                                </div>
                            ) : (
                                <div className={styles.itemList}>
                                    {production.expectedOutputs.map((item, index) => (
                                        <div key={`expected-output-${index}`} className={styles.itemRow}>
                                            <div className={styles.itemMain}>
                                                <strong className={styles.itemName}>
                                                    {item.productNameSnapshot || "Producto"}
                                                </strong>
                                                <span className={styles.itemSub}>
                                                    {item.productCodeSnapshot || "Sin código"}
                                                </span>
                                            </div>

                                            <div className={styles.itemSide}>
                                                <strong className={styles.itemQty}>
                                                    {formatNumber(item.quantity)}{" "}
                                                    {getUnitLabel(item.unitSnapshot)}
                                                </strong>
                                                <span className={styles.itemSub}>
                                                    {item.isByProduct
                                                        ? "Subproducto esperado"
                                                        : item.isMain
                                                            ? "Resultado principal"
                                                            : "Resultado esperado"}
                                                </span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </section>

                    <aside className={styles.sideColumn}>
                        <div className={styles.sideCard}>
                            <div className={styles.sectionHeader}>
                                <div>
                                    <h2 className={styles.sectionTitle}>Datos de la ficha</h2>
                                    <p className={styles.sectionDescription}>
                                        Configuración congelada al momento de crear el borrador.
                                    </p>
                                </div>
                            </div>

                            <div className={styles.metaList}>
                                <div className={styles.metaPill}>
                                    Rendimiento esperado:{" "}
                                    {production?.templateSnapshot?.expectedYield != null
                                        ? `${formatNumber(
                                            production.templateSnapshot.expectedYield
                                        )}%`
                                        : "No definido"}
                                </div>

                                <div className={styles.metaPill}>
                                    Merma esperada:{" "}
                                    {production?.templateSnapshot?.expectedWaste != null
                                        ? `${formatNumber(
                                            production.templateSnapshot.expectedWaste
                                        )}%`
                                        : "No definida"}
                                </div>

                                <div className={styles.metaPill}>
                                    Requiere registro de merma:{" "}
                                    {production?.templateSnapshot?.requiresWasteRecord
                                        ? "Sí"
                                        : "No"}
                                </div>

                                <div className={styles.metaPill}>
                                    Ajuste real permitido:{" "}
                                    {production?.templateSnapshot?.allowRealOutputAdjustment
                                        ? "Sí"
                                        : "No"}
                                </div>
                            </div>

                            <div className={styles.noteBox}>
                                <FileText size={16} />
                                <div>
                                    <strong className={styles.noteTitle}>Notas actuales</strong>
                                    <p className={styles.noteText}>
                                        {form.notes?.trim()
                                            ? form.notes
                                            : "Este borrador no tiene observaciones registradas."}
                                    </p>
                                </div>
                            </div>
                        </div>

                        <div className={styles.sideCard}>
                            <div className={styles.warningBox}>
                                <AlertTriangle size={18} />
                                <div>
                                    <strong className={styles.warningTitle}>
                                        Qué pasa al iniciar
                                    </strong>
                                    <p className={styles.warningText}>
                                        Al pasar a en proceso, el sistema validará inventario en cocina, descontará automáticamente los insumos y registrará los movimientos correspondientes.
                                    </p>
                                </div>
                            </div>
                        </div>
                    </aside>
                </div>
            </div>

            <ConfirmModal
                open={showStartModal}
                title="Pasar producción a en proceso"
                description="Se validará el inventario de cocina y se descontarán automáticamente los insumos esperados. Esta acción iniciará la ejecución de la producción."
                confirmLabel="Sí, iniciar producción"
                cancelLabel="Volver"
                variant="warning"
                isSubmitting={isStarting}
                onClose={() => {
                    if (!isStarting) setShowStartModal(false);
                }}
                onConfirm={confirmStartProduction}
            />

            <ConfirmModal
                open={showDeleteModal}
                title="Eliminar borrador de producción"
                description="Esta acción eliminará el borrador de forma definitiva. Solo debes hacerlo si ya no vas a utilizar esta producción."
                confirmLabel="Sí, eliminar borrador"
                cancelLabel="Conservar borrador"
                variant="danger"
                isSubmitting={isDeleting}
                onClose={() => {
                    if (!isDeleting) setShowDeleteModal(false);
                }}
                onConfirm={confirmDeleteDraft}
            />

            <DialogModal
                open={dialogState.open}
                title={dialogState.title}
                message={dialogState.message}
                variant={dialogState.variant}
                confirmText="Aceptar"
                showCancel={false}
                loading={false}
                onConfirm={closeDialog}
                onClose={closeDialog}
            />
        </>
    );
}