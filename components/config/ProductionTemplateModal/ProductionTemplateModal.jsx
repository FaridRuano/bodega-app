"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2, X } from "lucide-react";

import { getUnitLabel, PRODUCT_UNIT_OPTIONS } from "@libs/constants/units";
import styles from "./production-template-modal.module.scss";
import ProductAutocomplete from "@components/shared/ProductAutocomplete/ProductAutoComplete";

const TEMPLATE_TYPE_OPTIONS = [
    { value: "transformation", label: "Transformación" },
    { value: "cutting", label: "Despiece" },
    { value: "preparation", label: "Preparación" },
    { value: "portioning", label: "Porcionado" },
];

const DESTINATION_OPTIONS = [
    { value: "kitchen", label: "Cocina" },
    { value: "warehouse", label: "Bodega" },
    { value: "none", label: "Sin destino por defecto" },
];

function createEmptyInput() {
    return {
        productId: "",
        quantity: "",
        unit: "",
        productName: "",
        productCode: "",
        unitLabel: "",
        isPrimary: false,
        notes: "",
    };
}

function createEmptyOutput() {
    return {
        productId: "",
        quantity: "",
        unit: "",
        productName: "",
        productCode: "",
        unitLabel: "",
        isMain: false,
        isWaste: false,
        isByProduct: false,
        notes: "",
    };
}


function buildInitialForm(initialData) {
    return {
        code: initialData?.code || "",
        name: initialData?.name || "",
        description: initialData?.description || "",
        category: initialData?.category?._id || initialData?.category || "",
        type: initialData?.type || "transformation",
        baseUnit: initialData?.baseUnit || "",
        expectedYield:
            initialData?.expectedYield !== null &&
                initialData?.expectedYield !== undefined
                ? String(initialData.expectedYield)
                : "",
        expectedWaste:
            initialData?.expectedWaste !== null &&
                initialData?.expectedWaste !== undefined
                ? String(initialData.expectedWaste)
                : "",
        defaultDestination: initialData?.defaultDestination || "kitchen",
        allowsMultipleOutputs: Boolean(initialData?.allowsMultipleOutputs),
        requiresWasteRecord: Boolean(initialData?.requiresWasteRecord),
        allowRealOutputAdjustment:
            initialData?.allowRealOutputAdjustment === undefined
                ? true
                : Boolean(initialData?.allowRealOutputAdjustment),
        notes: initialData?.notes || "",
        isActive:
            initialData?.isActive === undefined ? true : Boolean(initialData?.isActive),

        inputs:
            initialData?.inputs?.length > 0
                ? initialData.inputs.map((item) => ({
                    productId: item.productId?._id || item.productId || "",
                    productName: item.productId?.name || "",
                    productCode: item.productId?.code || "",
                    quantity:
                        item.quantity !== undefined && item.quantity !== null
                            ? String(item.quantity)
                            : "",
                    unit: item.unit || item.productId?.unit || "",
                    unitLabel: item.productId?.unitLabel || "",
                    isPrimary: Boolean(item.isPrimary),
                    notes: item.notes || "",
                }))
                : [createEmptyInput()],

        outputs:
            initialData?.outputs?.length > 0
                ? initialData.outputs.map((item) => ({
                    productId: item.productId?._id || item.productId || "",
                    productName: item.productId?.name || "",
                    productCode: item.productId?.code || "",
                    quantity:
                        item.quantity !== undefined && item.quantity !== null
                            ? String(item.quantity)
                            : "",
                    unit: item.unit || item.productId?.unit || "",
                    unitLabel: item.productId?.unitLabel || "",
                    isMain: Boolean(item.isMain),
                    isWaste: Boolean(item.isWaste),
                    isByProduct: Boolean(item.isByProduct),
                    notes: item.notes || "",
                }))
                : [createEmptyOutput()],
    };
}

export default function ProductionTemplateModal({
    open,
    onClose,
    onSubmit,
    mode = "create",
    initialData = null,
    loading = false,
    categories = [],
}) {

    const isEdit = mode === "edit";

    const [form, setForm] = useState(buildInitialForm(initialData));
    const [initialForm, setInitialForm] = useState(buildInitialForm(initialData));

    useEffect(() => {
        const nextForm = buildInitialForm(initialData);
        setForm(nextForm);
        setInitialForm(nextForm);
    }, [initialData, mode, open]);

    useEffect(() => {
        function handleEscape(event) {
            if (event.key === "Escape") {
                onClose();
            }
        }

        window.addEventListener("keydown", handleEscape);
        return () => window.removeEventListener("keydown", handleEscape);
    }, [onClose]);

    function handleChange(event) {
        const { name, value, type, checked } = event.target;

        if (type === "checkbox") {
            setForm((prev) => {
                const nextForm = {
                    ...prev,
                    [name]: checked,
                };

                if (name === "allowsMultipleOutputs" && !checked && prev.outputs.length > 1) {
                    nextForm.outputs = [prev.outputs[0]];
                }

                return nextForm;
            });
            return;
        }

        if (name === "expectedYield") {
            if (value === "") {
                setForm((prev) => ({
                    ...prev,
                    expectedYield: "",
                    expectedWaste: "",
                }));
                return;
            }

            const numericValue = Number(value);

            if (Number.isNaN(numericValue)) return;

            const clampedValue = Math.min(100, Math.max(0, numericValue));
            const calculatedWaste = 100 - clampedValue;

            setForm((prev) => ({
                ...prev,
                expectedYield: String(clampedValue),
                expectedWaste: String(calculatedWaste),
            }));
            return;
        }

        setForm((prev) => ({
            ...prev,
            [name]: value,
        }));
    }

    function handleInputRowChange(index, fieldOrPatch, value) {
        setForm((prev) => {
            const nextInputs = [...prev.inputs];

            nextInputs[index] = {
                ...nextInputs[index],
                ...(typeof fieldOrPatch === "string"
                    ? { [fieldOrPatch]: value }
                    : fieldOrPatch),
            };

            return {
                ...prev,
                inputs: nextInputs,
            };
        });
    }

    function handlePrimaryInputChange(index, checked) {
        setForm((prev) => {
            const nextInputs = prev.inputs.map((item, itemIndex) => ({
                ...item,
                isPrimary: checked ? itemIndex === index : false,
            }));

            return {
                ...prev,
                inputs: nextInputs,
            };
        });
    }

    function handleOutputRowChange(index, fieldOrPatch, value) {
        setForm((prev) => {
            const nextOutputs = [...prev.outputs];

            nextOutputs[index] = {
                ...nextOutputs[index],
                ...(typeof fieldOrPatch === "string"
                    ? { [fieldOrPatch]: value }
                    : fieldOrPatch),
            };

            return {
                ...prev,
                outputs: nextOutputs,
            };
        });

    }

    function handleOutputFlagChange(index, field, checked) {
        setForm((prev) => {
            const nextOutputs = [...prev.outputs];
            const current = nextOutputs[index];

            nextOutputs[index] = {
                ...current,
                isMain: field === "isMain" ? checked : checked ? false : current.isMain,
                isWaste: field === "isWaste" ? checked : checked ? false : current.isWaste,
                isByProduct:
                    field === "isByProduct" ? checked : checked ? false : current.isByProduct,
            };

            return {
                ...prev,
                outputs: nextOutputs,
            };
        });
    }

    function buildProductSelectionPatch(product) {
        if (!product) {
            return {
                productId: "",
                productName: "",
                productCode: "",
                unit: "",
            };
        }
        console.log(product);

        return {
            productId: product._id || "",
            productName: product.name || "",
            productCode: product.code || "",
            unit: product.unit || "",
        };
    }

    function getSelectedProductFromRow(item) {
        if (!item?.productId) return null;

        return {
            _id: item.productId,
            name: item.productName || "",
            code: item.productCode || "",
            unit: item.unit || "",
        };
    }

    function addInputRow() {
        setForm((prev) => ({
            ...prev,
            inputs: [...prev.inputs, createEmptyInput()],
        }));
    }

    function addOutputRow() {
        setForm((prev) => {
            if (!prev.allowsMultipleOutputs && prev.outputs.length >= 1) {
                return prev;
            }

            return {
                ...prev,
                outputs: [...prev.outputs, createEmptyOutput()],
            };
        });
    }

    function removeInputRow(index) {
        setForm((prev) => ({
            ...prev,
            inputs:
                prev.inputs.length > 1
                    ? prev.inputs.filter((_, itemIndex) => itemIndex !== index)
                    : prev.inputs,
        }));
    }

    function removeOutputRow(index) {
        setForm((prev) => ({
            ...prev,
            outputs:
                prev.outputs.length > 1
                    ? prev.outputs.filter((_, itemIndex) => itemIndex !== index)
                    : prev.outputs,
        }));
    }

    const isDirty = useMemo(() => {
        return JSON.stringify(form) !== JSON.stringify(initialForm);
    }, [form, initialForm]);

    const isValid = useMemo(() => {
        if (!form.name.trim()) return false;
        if (!form.type) return false;
        if (!form.baseUnit) return false;
        if (!form.inputs.length || !form.outputs.length) return false;

        const hasInvalidInput = form.inputs.some((item) => {
            if (!item.productId) return true;
            if (!item.unit) return true;
            if (item.quantity === "") return true;

            const quantity = Number(item.quantity);
            return Number.isNaN(quantity) || quantity <= 0;
        });

        if (hasInvalidInput) return false;

        const hasInvalidOutput = form.outputs.some((item) => {
            if (!item.productId) return true;
            if (!item.unit) return true;

            if (item.quantity === "") return false;

            const quantity = Number(item.quantity);
            return Number.isNaN(quantity) || quantity <= 0;
        });

        if (hasInvalidOutput) return false;

        const mainOutputs = form.outputs.filter((item) => item.isMain);
        if (mainOutputs.length === 0) return false;

        if (form.type === "cutting") {
            const primaryInputs = form.inputs.filter((item) => item.isPrimary);
            if (primaryInputs.length !== 1) return false;
        }

        return true;
    }, [form]);

    const isDisabled = loading || (isEdit ? !isDirty || !isValid : !isValid);

    function handleSubmit(event) {
        event.preventDefault();
        if (isDisabled) return;

        onSubmit({
            ...form,
            expectedYield: form.expectedYield === "" ? null : Number(form.expectedYield),
            expectedWaste: form.expectedWaste === "" ? null : Number(form.expectedWaste),
            inputs: form.inputs.map((item) => ({
                productId: item.productId,
                quantity: Number(item.quantity),
                unit: item.unit,
                isPrimary: item.isPrimary,
                notes: item.notes,
            })),
            outputs: form.outputs.map((item) => ({
                productId: item.productId,
                quantity: item.quantity === "" ? null : Number(item.quantity),
                unit: item.unit,
                isMain: item.isMain,
                isWaste: item.isWaste,
                isByProduct: item.isByProduct,
                notes: item.notes,
            })),
        });
    }

    if (!open) return null;

    return (
        <div className="modal-overlay">
            <div
                className="modal-container modal-container--xl"
                onClick={(event) => event.stopPropagation()}
            >
                <div className="modal-header">
                    <div>
                        <h3 className="modal-title">
                            {isEdit ? "Editar ficha de producción" : "Nueva ficha de producción"}
                        </h3>
                        <p className="modal-description">
                            {isEdit
                                ? "Modifica la configuración de la ficha de producción."
                                : "Crea una ficha de producción para definir insumos y resultados."}
                        </p>
                    </div>

                    <button type="button" className="modal-close" onClick={onClose}>
                        <X size={18} />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className={`modal-body ${styles.modalBody}`}>
                    <section className={styles.section}>
                        <div className={styles.sectionHeader}>
                            <h4 className={styles.sectionTitle}>Información general</h4>
                        </div>

                        <div className={styles.gridTwo}>
                            <div className="form-field">
                                <label className="form-label">Código</label>
                                <input
                                    name="code"
                                    value={form.code}
                                    onChange={handleChange}
                                    placeholder="Ej: PROD-001"
                                    className="form-input"
                                    disabled={loading}
                                />
                            </div>

                            <div className="form-field">
                                <label className="form-label">Categoría</label>
                                <select
                                    name="category"
                                    value={form.category}
                                    onChange={handleChange}
                                    className="form-input"
                                    disabled={loading}
                                >
                                    <option value="">Seleccionar</option>
                                    {categories.map((category) => (
                                        <option key={category._id} value={category._id}>
                                            {category.name}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        <div className="form-field">
                            <label className="form-label">Nombre</label>
                            <input
                                name="name"
                                value={form.name}
                                onChange={handleChange}
                                placeholder="Ej: Despiece de lomo a filetes"
                                className="form-input"
                                required
                                disabled={loading}
                            />
                        </div>

                        <div className="form-field">
                            <label className="form-label">Descripción</label>
                            <textarea
                                name="description"
                                value={form.description}
                                onChange={handleChange}
                                placeholder="Describe el objetivo de esta ficha"
                                className="form-textarea"
                                disabled={loading}
                            />
                        </div>
                    </section>

                    <section className={styles.section}>
                        <div className={styles.sectionHeader}>
                            <h4 className={styles.sectionTitle}>Configuración</h4>
                        </div>

                        <div className={styles.gridThree}>
                            <div className="form-field">
                                <label className="form-label">Tipo</label>
                                <select
                                    name="type"
                                    value={form.type}
                                    onChange={handleChange}
                                    className="form-input"
                                    disabled={loading}
                                >
                                    {TEMPLATE_TYPE_OPTIONS.map((option) => (
                                        <option key={option.value} value={option.value}>
                                            {option.label}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div className="form-field">
                                <label className="form-label">Unidad base</label>
                                <select
                                    name="baseUnit"
                                    value={form.baseUnit}
                                    onChange={handleChange}
                                    className="form-input"
                                    required
                                    disabled={loading}
                                >
                                    <option value="">Seleccionar</option>
                                    {PRODUCT_UNIT_OPTIONS.map((option) => (
                                        <option key={option.value} value={option.value}>
                                            {option.label}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div className="form-field">
                                <label className="form-label">Destino por defecto</label>
                                <select
                                    name="defaultDestination"
                                    value={form.defaultDestination}
                                    onChange={handleChange}
                                    className="form-input"
                                    disabled={loading}
                                >
                                    {DESTINATION_OPTIONS.map((option) => (
                                        <option key={option.value} value={option.value}>
                                            {option.label}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        <div className={styles.gridTwo}>
                            <div className="form-field">
                                <label className="form-label">Aprovechamiento estimado (%)</label>
                                <div className={styles.percentField}>
                                    <input
                                        type="number"
                                        step="0.01"
                                        min="0"
                                        max="100"
                                        name="expectedYield"
                                        value={form.expectedYield}
                                        onChange={handleChange}
                                        placeholder="Ej: 85"
                                        className={`form-input ${styles.percentInput}`}
                                        disabled={loading}
                                    />
                                    <span className={styles.percentSuffix}>%</span>
                                </div>
                            </div>

                            <div className="form-field">
                                <label className="form-label">Pérdida estimada (%)</label>
                                <div className={styles.percentField}>
                                    <input
                                        type="number"
                                        value={form.expectedWaste}
                                        className={`form-input ${styles.percentInput}`}
                                        disabled
                                        placeholder="Calculado automáticamente"
                                    />
                                    <span className={styles.percentSuffix}>%</span>
                                </div>
                            </div>
                        </div>

                        <div className="switchGroup">
                            <div className="form-switchRow">
                                <div>
                                    <p className="form-switchLabel">Múltiples resultados</p>
                                    <p className="form-switchDescription">
                                        Permite varios productos de salida en la ficha.
                                    </p>
                                </div>

                                <label className="switch">
                                    <input
                                        type="checkbox"
                                        name="allowsMultipleOutputs"
                                        checked={form.allowsMultipleOutputs}
                                        onChange={handleChange}
                                        disabled={loading}
                                    />
                                    <span className="switch-slider" />
                                </label>
                            </div>
                            <div className="form-switchRow">
                                <div>
                                    <p className="form-switchLabel">Registrar merma</p>
                                    <p className="form-switchDescription">
                                        Indica si la producción requiere registrar merma.
                                    </p>
                                </div>

                                <label className="switch">
                                    <input
                                        type="checkbox"
                                        name="requiresWasteRecord"
                                        checked={form.requiresWasteRecord}
                                        onChange={handleChange}
                                        disabled={loading}
                                    />
                                    <span className="switch-slider" />
                                </label>
                            </div>

                            <div className="form-switchRow">
                                <div>
                                    <p className="form-switchLabel">Ajuste real permitido</p>
                                    <p className="form-switchDescription">
                                        Permite modificar las cantidades reales al producir.
                                    </p>
                                </div>

                                <label className="switch">
                                    <input
                                        type="checkbox"
                                        name="allowRealOutputAdjustment"
                                        checked={form.allowRealOutputAdjustment}
                                        onChange={handleChange}
                                        disabled={loading}
                                    />
                                    <span className="switch-slider" />
                                </label>
                            </div>

                            <div className="form-switchRow">
                                <div>
                                    <p className="form-switchLabel">Ficha activa</p>
                                    <p className="form-switchDescription">
                                        Disponible para uso en producción.
                                    </p>
                                </div>

                                <label className="switch">
                                    <input
                                        type="checkbox"
                                        name="isActive"
                                        checked={form.isActive}
                                        onChange={handleChange}
                                        disabled={loading}
                                    />
                                    <span className="switch-slider" />
                                </label>
                            </div>
                        </div>

                        <div className="form-field">
                            <label className="form-label">Notas</label>
                            <textarea
                                name="notes"
                                value={form.notes}
                                onChange={handleChange}
                                placeholder="Observaciones internas"
                                className="form-textarea"
                                disabled={loading}
                            />
                        </div>
                    </section>

                    <section className={styles.section}>
                        <div className={styles.sectionHeader}>
                            <div>
                                <h4 className={styles.sectionTitle}>Insumos</h4>
                                <p className={styles.sectionDescription}>
                                    Define los productos de entrada de la ficha.
                                </p>
                            </div>

                            <button
                                type="button"
                                className={styles.addButton}
                                onClick={addInputRow}
                                disabled={loading}
                            >
                                <Plus size={16} />
                                Agregar insumo
                            </button>
                        </div>

                        <div className={styles.rowsGroup}>
                            {form.inputs.map((item, index) => (
                                <div key={`input-${index}`} className={styles.rowCard}>
                                    <div className={styles.rowGridInput}>
                                        <div className="form-field">
                                            <label className="form-label">Producto</label>

                                            <ProductAutocomplete
                                                value={item.productId}
                                                selectedProduct={getSelectedProductFromRow(item)}
                                                onChange={(product) =>
                                                    handleInputRowChange(index, buildProductSelectionPatch(product))
                                                }
                                                disabled={loading}
                                                forProductionTemplate={true}
                                            />
                                        </div>

                                        <div className="form-field">
                                            <label className="form-label">Cantidad</label>
                                            <input
                                                type="number"
                                                step="0.0001"
                                                min="0"
                                                value={item.quantity}
                                                onChange={(event) =>
                                                    handleInputRowChange(index, "quantity", event.target.value)
                                                }
                                                className="form-input"
                                                disabled={loading}
                                            />
                                        </div>

                                        <div className="form-field">
                                            <label className="form-label">Unidad</label>
                                            <span className="form-span">
                                                {getUnitLabel(item.unit)}
                                            </span>
                                        </div>

                                        {form.type === "cutting" ? (
                                            <label className={`${styles.flagToggle} ${item.isPrimary ? styles.flagToggleActive : ""}`}>
                                                <input
                                                    type="checkbox"
                                                    checked={item.isPrimary}
                                                    onChange={(event) => handlePrimaryInputChange(index, event.target.checked)}
                                                    disabled={loading}
                                                />
                                                <span>Principal</span>
                                            </label>
                                        ) : null}
                                    </div>

                                    <div className={styles.rowFooter}>
                                        <div className={styles.notesField}>
                                            <label className="form-label">Notas</label>
                                            <input
                                                value={item.notes}
                                                onChange={(event) =>
                                                    handleInputRowChange(index, "notes", event.target.value)
                                                }
                                                placeholder="Opcional"
                                                className="form-input"
                                                disabled={loading}
                                            />
                                        </div>

                                        <button
                                            type="button"
                                            className={styles.removeButton}
                                            onClick={() => removeInputRow(index)}
                                            disabled={loading || form.inputs.length === 1}
                                        >
                                            <Trash2 size={16} />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </section>

                    <section className={styles.section}>
                        <div className={styles.sectionHeader}>
                            <div>
                                <h4 className={styles.sectionTitle}>Resultados</h4>
                                <p className={styles.sectionDescription}>
                                    Define los productos resultantes de la ficha.
                                </p>
                            </div>

                            <button
                                type="button"
                                className={`${styles.addButton} ${!form.allowsMultipleOutputs || loading ? styles.addButtonDisabled : ""
                                    }`}
                                onClick={addOutputRow}
                                disabled={loading || !form.allowsMultipleOutputs}
                            >
                                <Plus size={16} />
                                Agregar resultado
                            </button>
                        </div>

                        <div className={styles.rowsGroup}>
                            {form.outputs.map((item, index) => (
                                <div key={`output-${index}`} className={styles.rowCard}>
                                    <div className={styles.rowGridOutput}>
                                        <div className="form-field">
                                            <label className="form-label">Producto</label>

                                            <ProductAutocomplete
                                                value={item.productId}
                                                selectedProduct={getSelectedProductFromRow(item)}
                                                onChange={(product) =>
                                                    handleOutputRowChange(index, buildProductSelectionPatch(product))
                                                }
                                                disabled={loading}
                                            />
                                        </div>

                                        <div className="form-field">
                                            <label className="form-label">Cantidad Estimada</label>
                                            <input
                                                type="number"
                                                step="0.0001"
                                                min="0"
                                                placeholder="Opcional"
                                                value={item.quantity}
                                                onChange={(event) =>
                                                    handleOutputRowChange(index, "quantity", event.target.value)
                                                }
                                                className="form-input"
                                                disabled={loading}
                                            />
                                        </div>

                                        <div className="form-field">
                                            <label className="form-label">Unidad</label>
                                            <span className="form-span">
                                                {getUnitLabel(item.unit)}
                                            </span>
                                        </div>
                                    </div>

                                    <div className={styles.outputFlags}>
                                        <label className={`${styles.flagToggle} ${item.isMain ? styles.flagToggleActive : ""}`}>
                                            <input
                                                type="checkbox"
                                                checked={item.isMain}
                                                onChange={(event) =>
                                                    handleOutputFlagChange(index, "isMain", event.target.checked)
                                                }
                                                disabled={loading}
                                            />
                                            <span>Principal</span>
                                        </label>

                                        <label className={`${styles.flagToggle} ${item.isByProduct ? styles.flagToggleWarning : ""}`}>
                                            <input
                                                type="checkbox"
                                                checked={item.isByProduct}
                                                onChange={(event) =>
                                                    handleOutputFlagChange(index, "isByProduct", event.target.checked)
                                                }
                                                disabled={loading}
                                            />
                                            <span>Subproducto</span>
                                        </label>
                                    </div>

                                    <div className={styles.rowFooter}>
                                        <div className={styles.notesField}>
                                            <label className="form-label">Notas</label>
                                            <input
                                                value={item.notes}
                                                onChange={(event) =>
                                                    handleOutputRowChange(index, "notes", event.target.value)
                                                }
                                                placeholder="Opcional"
                                                className="form-input"
                                                disabled={loading}
                                            />
                                        </div>

                                        <button
                                            type="button"
                                            className={styles.removeButton}
                                            onClick={() => removeOutputRow(index)}
                                            disabled={loading || form.outputs.length === 1}
                                        >
                                            <Trash2 size={16} />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </section>

                    <div className="modal-footer">
                        <button
                            type="button"
                            className="btn btn-secondary"
                            onClick={onClose}
                            disabled={loading}
                        >
                            Cancelar
                        </button>

                        <button
                            type="submit"
                            className="btn btn-primary"
                            disabled={isDisabled}
                        >
                            {loading
                                ? isEdit
                                    ? "Guardando..."
                                    : "Creando..."
                                : isEdit
                                    ? "Guardar cambios"
                                    : "Crear ficha"}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}