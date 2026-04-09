"use client";

import { useEffect, useMemo, useState } from "react";
import {
    ArrowLeft,
    ClipboardList,
    Factory,
    FileText,
    LoaderCircle,
    Save,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { getUnitLabel } from "@libs/constants/units";
import styles from "./page.module.scss";
import AutocompleteSelect from "@components/production/AutoCompleteSelect/AutoCompleteSelect";
import DialogModal from "@components/shared/DialogModal/DialogModal";

const TEMPLATE_TYPE_LABELS = {
    transformation: "Transformación",
    cutting: "Corte",
    preparation: "Preparación",
    portioning: "Porcionado",
};

function formatNumber(value) {
    const parsed = Number(value || 0);
    return new Intl.NumberFormat("es-EC", {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
    }).format(parsed);
}

export default function NewProductionPage() {
    const router = useRouter();

    const [selectedTemplateId, setSelectedTemplateId] = useState("");
    const [selectedTemplateOption, setSelectedTemplateOption] = useState(null);
    const [selectedTemplate, setSelectedTemplate] = useState(null);
    const [isLoadingTemplate, setIsLoadingTemplate] = useState(false);
    const [form, setForm] = useState({
        productionQuantity: "",
        notes: "",
    });
    const [submitMode, setSubmitMode] = useState("create");
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [errorMessage, setErrorMessage] = useState("");
    const [dialogState, setDialogState] = useState({
        open: false,
        title: "",
        message: "",
        variant: "warning",
    });

    function openDialog(title, message, variant = "warning") {
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

    async function fetchTemplateOptions(query) {
        const params = new URLSearchParams();
        params.set("isActive", "true");

        if (query.trim()) {
            params.set("search", query.trim());
        }

        const response = await fetch(
            `/api/production-templates/options?${params.toString()}`,
            { cache: "no-store" }
        );

        const result = await response.json();

        if (!response.ok || !result?.success) {
            throw new Error(
                result?.message || "No se pudieron cargar las fichas de producción."
            );
        }

        return Array.isArray(result.data) ? result.data : [];
    }

    useEffect(() => {
        let ignore = false;

        async function loadTemplateDetail() {
            if (!selectedTemplateId) {
                setSelectedTemplate(null);
                return;
            }

            try {
                setIsLoadingTemplate(true);
                setErrorMessage("");

                const response = await fetch(
                    `/api/production-templates/${selectedTemplateId}`,
                    { cache: "no-store" }
                );

                const result = await response.json();

                if (!response.ok || !result?.success) {
                    throw new Error(
                        result?.message || "No se pudo cargar el detalle de la ficha."
                    );
                }

                if (!ignore) {
                    setSelectedTemplate(result.data);
                }
            } catch (error) {
                console.error("[NEW_PRODUCTION_TEMPLATE_DETAIL_ERROR]", error);

                if (!ignore) {
                    setSelectedTemplate(null);
                    setErrorMessage(
                        error?.message || "No se pudo cargar el detalle de la ficha."
                    );
                }
            } finally {
                if (!ignore) {
                    setIsLoadingTemplate(false);
                }
            }
        }

        loadTemplateDetail();

        return () => {
            ignore = true;
        };
    }, [selectedTemplateId]);

    const productionUnitLabel = useMemo(() => {
        return selectedTemplate?.baseUnit
            ? getUnitLabel(selectedTemplate.baseUnit)
            : "—";
    }, [selectedTemplate]);

    const canSubmit = useMemo(() => {
        return (
            Boolean(selectedTemplateId) &&
            Boolean(selectedTemplate) &&
            Number(form.productionQuantity) > 0 &&
            !isSubmitting
        );
    }, [selectedTemplateId, selectedTemplate, form.productionQuantity, isSubmitting]);

    async function handleSubmit(event, mode = "create") {
        event.preventDefault();

        if (!selectedTemplateId) {
            openDialog("Falta información", "Debes seleccionar una ficha de producción.", "warning");
            return;
        }

        if (!form.productionQuantity || Number(form.productionQuantity) <= 0) {
            openDialog("Falta información", "La cantidad a producir debe ser mayor a 0.", "warning");
            return;
        }

        if (!selectedTemplate?.baseUnit) {
            openDialog("Ficha inválida", "La ficha seleccionada no tiene una unidad base válida.", "warning");
            return;
        }

        const isDraftMode = mode === "draft";

        try {
            setSubmitMode(mode);
            setIsSubmitting(true);
            setErrorMessage("");

            const payload = {
                productionTemplateId: selectedTemplateId,
                targetQuantity: Number(form.productionQuantity),
                targetUnit: selectedTemplate.baseUnit,
                notes: form.notes.trim(),
                status: isDraftMode ? "draft" : "in_progress",
            };

            const response = await fetch("/api/productions", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(payload),
            });

            const result = await response.json();

            if (!response.ok || !result?.ok) {
                openDialog(
                    "No se pudo iniciar la producción",
                    result?.message || "No se pudo crear la producción.",
                    "warning"
                );
                return;
            }

            const createdId = result?.data?._id;

            if (!createdId) {
                openDialog(
                    "Producción incompleta",
                    "La producción fue creada, pero no se recibió su identificador.",
                    "warning"
                );
                return;
            }

            if (isDraftMode) {
                router.push("/dashboard/production");
                return;
            }

            router.push(`/dashboard/production/${createdId}`);
        } catch (error) {
            console.error("[NEW_PRODUCTION_CREATE_ERROR]", error);
            openDialog(
                "Error inesperado",
                error?.message || "No se pudo crear la producción.",
                "warning"
            );
        } finally {
            setIsSubmitting(false);
        }
    }

    return (
        <div className={styles.page}>
            <div className={styles.header}>
                <button
                    type="button"
                    className={`btn btn-secondary ${styles.backButton}`}
                    onClick={() => router.push("/dashboard/production")}
                >
                    <ArrowLeft size={16} />
                    Volver
                </button>

                <div className={styles.heading}>
                    <h1 className={styles.title}>Nueva producción</h1>
                    <p className={styles.subtitle}>
                        Selecciona una ficha, indica cuánto vas a producir y elige si deseas iniciarla ahora o guardarla como borrador.
                    </p>
                </div>
            </div>

            <form className={styles.layout}>
                <section className={styles.mainColumn}>
                    <div className={styles.formCard}>
                        <div className={styles.sectionHeader}>
                            <div>
                                <h2 className={styles.sectionTitle}>Configuración inicial</h2>
                                <p className={styles.sectionDescription}>
                                    Aquí defines qué ficha vas a ejecutar y en qué cantidad vas a trabajar.
                                </p>
                            </div>
                        </div>

                        <div className={styles.formGrid}>
                            <AutocompleteSelect
                                label="Ficha de producción"
                                placeholder="Buscar por código, nombre o tipo"
                                value={selectedTemplateId}
                                selectedOption={selectedTemplateOption}
                                onChange={(option) => {
                                    setSelectedTemplateOption(option);
                                    setSelectedTemplateId(option?.value || "");
                                }}
                                fetchOptions={fetchTemplateOptions}
                                disabled={isSubmitting}
                                minChars={1}
                                helperText="Escribe para buscar fichas activas."
                            />

                            <div className={styles.fieldBlock}>
                                <label className={styles.fieldLabel}>
                                    Cantidad a producir
                                </label>

                                <div className={styles.inlineInput}>
                                    <input
                                        type="number"
                                        min="0"
                                        step="0.0001"
                                        value={form.productionQuantity}
                                        onChange={(event) =>
                                            setForm((prev) => ({
                                                ...prev,
                                                productionQuantity: event.target.value,
                                            }))
                                        }
                                        className={styles.fieldInput}
                                        placeholder="Ej: 10"
                                        disabled={isSubmitting}
                                    />

                                    <div className={styles.inlineUnit}>
                                        {productionUnitLabel}
                                    </div>
                                </div>

                                <span className={styles.helperText}>
                                    Indica cuánto producto final vas a preparar con esta ficha.
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
                                    placeholder="Observaciones iniciales para esta producción"
                                    disabled={isSubmitting}
                                />
                            </div>
                        </div>

                        {errorMessage ? (
                            <div className={styles.errorBox}>
                                <p className={styles.errorText}>{errorMessage}</p>
                            </div>
                        ) : null}
                    </div>

                    <div className={styles.formCard}>
                        <div className={styles.sectionHeader}>
                            <div>
                                <h2 className={styles.sectionTitle}>Resumen de la ficha</h2>
                                <p className={styles.sectionDescription}>
                                    Revisa la configuración base, insumos y resultados antes de crear la producción.
                                </p>
                            </div>
                        </div>

                        {!selectedTemplateId ? (
                            <div className={styles.emptyPreview}>
                                <Factory size={22} className={styles.emptyPreviewIcon} />
                                <p className={styles.emptyPreviewTitle}>Selecciona una ficha</p>
                                <p className={styles.emptyPreviewDescription}>
                                    Cuando elijas una ficha, aquí verás su información base y sus componentes.
                                </p>
                            </div>
                        ) : isLoadingTemplate ? (
                            <div className={styles.emptyPreview}>
                                <LoaderCircle
                                    size={22}
                                    className={`${styles.emptyPreviewIcon} ${styles.spin}`}
                                />
                                <p className={styles.emptyPreviewTitle}>Cargando ficha...</p>
                            </div>
                        ) : !selectedTemplate ? (
                            <div className={styles.emptyPreview}>
                                <p className={styles.emptyPreviewTitle}>No se pudo cargar la ficha</p>
                            </div>
                        ) : (
                            <div className={styles.previewContent}>
                                <div className={styles.infoRow}>
                                    <span className={styles.infoPill}>
                                        <ClipboardList size={14} />
                                        {selectedTemplate.code || "Sin código"}
                                    </span>

                                    <span className={styles.infoPill}>
                                        <Factory size={14} />
                                        {TEMPLATE_TYPE_LABELS[selectedTemplate.type] ||
                                            selectedTemplate.type}
                                    </span>

                                    <span className={styles.infoPill}>
                                        Unidad base: {getUnitLabel(selectedTemplate.baseUnit)}
                                    </span>

                                    <span className={styles.infoPill}>
                                        Destino por defecto:{" "}
                                        {selectedTemplate.defaultDestination === "warehouse"
                                            ? "Bodega"
                                            : selectedTemplate.defaultDestination === "kitchen"
                                                ? "Cocina"
                                                : "No definido"}
                                    </span>

                                    <span className={styles.infoPill}>
                                        Requiere registro de merma:{" "}
                                        {selectedTemplate.requiresWasteRecord ? "Sí" : "No"}
                                    </span>
                                </div>

                                {(selectedTemplate.description || selectedTemplate.notes) && (
                                    <div className={styles.notesBox}>
                                        <FileText size={16} />
                                        <div className={styles.notesContent}>
                                            {selectedTemplate.description ? (
                                                <p className={styles.notesText}>
                                                    {selectedTemplate.description}
                                                </p>
                                            ) : null}

                                            {selectedTemplate.notes ? (
                                                <p className={styles.notesText}>
                                                    {selectedTemplate.notes}
                                                </p>
                                            ) : null}
                                        </div>
                                    </div>
                                )}

                                <div className={styles.previewGrid}>
                                    <div className={styles.previewPanel}>
                                        <div className={styles.panelHeader}>
                                            <h3 className={styles.panelTitle}>Insumos base</h3>
                                        </div>

                                        <div className={styles.itemList}>
                                            {(selectedTemplate.inputs || []).map((item) => (
                                                <div key={item._id} className={styles.itemRow}>
                                                    <div className={styles.itemMain}>
                                                        <strong className={styles.itemName}>
                                                            {item.productId?.name || "Producto"}
                                                        </strong>
                                                        <span className={styles.itemSub}>
                                                            {item.productId?.code || "Sin código"}
                                                        </span>
                                                    </div>

                                                    <div className={styles.itemSide}>
                                                        <strong className={styles.itemQty}>
                                                            {formatNumber(item.quantity)}{" "}
                                                            {getUnitLabel(item.unit)}
                                                        </strong>
                                                        <span className={styles.itemSub}>
                                                            {item.isPrimary
                                                                ? "Principal"
                                                                : "Secundario"}
                                                        </span>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    <div className={styles.previewPanel}>
                                        <div className={styles.panelHeader}>
                                            <h3 className={styles.panelTitle}>Resultados base</h3>
                                        </div>

                                        <div className={styles.itemList}>
                                            {(selectedTemplate.outputs || []).map((item) => (
                                                <div key={item._id} className={styles.itemRow}>
                                                    <div className={styles.itemMain}>
                                                        <strong className={styles.itemName}>
                                                            {item.productId?.name || "Producto"}
                                                        </strong>
                                                        <span className={styles.itemSub}>
                                                            {item.productId?.code || "Sin código"}
                                                        </span>
                                                    </div>

                                                    <div className={styles.itemSide}>
                                                        <strong className={styles.itemQty}>
                                                            {item.quantity != null
                                                                ? `${formatNumber(item.quantity)} ${getUnitLabel(item.unit)}`
                                                                : `Cantidad variable (${getUnitLabel(item.unit)})`}
                                                        </strong>
                                                        <span className={styles.itemSub}>
                                                            {item.isMain
                                                                ? "Principal"
                                                                : item.isByProduct
                                                                    ? "Subproducto"
                                                                    : "Resultado"}
                                                        </span>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </section>

                <aside className={styles.sideColumn}>
                    <div className={styles.summaryCard}>
                        <div className={styles.sectionHeader}>
                            <div>
                                <h2 className={styles.sectionTitle}>Resumen rápido</h2>
                                <p className={styles.sectionDescription}>
                                    Información mínima antes de crear la producción.
                                </p>
                            </div>
                        </div>

                        <div className={styles.summaryList}>
                            <div className={styles.summaryItem}>
                                <span className={styles.summaryLabel}>Ficha</span>
                                <span className={styles.summaryValue}>
                                    {selectedTemplate?.name || "Sin seleccionar"}
                                </span>
                            </div>

                            <div className={styles.summaryItem}>
                                <span className={styles.summaryLabel}>Cantidad a producir</span>
                                <span className={styles.summaryValue}>
                                    {form.productionQuantity
                                        ? `${formatNumber(form.productionQuantity)} ${productionUnitLabel}`
                                        : "—"}
                                </span>
                            </div>
                        </div>

                        <div className={styles.sideActions}>
                            <button
                                type="button"
                                className="btn btn-primary"
                                onClick={(event) => handleSubmit(event, "create")}
                                disabled={!canSubmit}
                            >
                                {isSubmitting && submitMode === "create" ? (
                                    <>
                                        <LoaderCircle size={16} className={styles.spin} />
                                        Iniciando...
                                    </>
                                ) : (
                                    <>
                                        <Save size={16} />
                                        Iniciar producción
                                    </>
                                )}
                            </button>

                            <button
                                type="button"
                                className="btn btn-secondary"
                                onClick={(event) => handleSubmit(event, "draft")}
                                disabled={!canSubmit}
                            >
                                {isSubmitting && submitMode === "draft" ? (
                                    <>
                                        <LoaderCircle size={16} className={styles.spin} />
                                        Guardando borrador...
                                    </>
                                ) : (
                                    <>
                                        <Save size={16} />
                                        Guardar borrador
                                    </>
                                )}
                            </button>

                            <button
                                type="button"
                                className="btn btn-secondary"
                                onClick={() => router.push("/dashboard/production")}
                                disabled={isSubmitting}
                            >
                                <ArrowLeft size={16} />
                                Cancelar
                            </button>
                        </div>
                    </div>
                </aside>
            </form>

            <DialogModal
                open={dialogState.open}
                title={dialogState.title}
                message={dialogState.message}
                variant={dialogState.variant}
                confirmText="Aceptar"
                onConfirm={closeDialog}
                onClose={closeDialog}
            />
        </div>
    );
}
