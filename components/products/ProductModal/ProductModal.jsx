"use client";

import { useEffect, useMemo, useState } from "react";
import { Archive, ClipboardCheck, Scale, Settings2, X } from "lucide-react";

import { PRODUCT_UNIT_OPTIONS } from "@libs/constants/units";
import { getProductTypeLabel, PRODUCT_TYPES } from "@libs/constants/productTypes";
import styles from "./product-modal.module.scss";

const STORAGE_TYPE_OPTIONS = [
    { value: "ambient", label: "Ambiente" },
    { value: "refrigerated", label: "Refrigerado" },
    { value: "frozen", label: "Congelado" },
];

function buildEmptyForm() {
    return {
        code: "",
        name: "",
        description: "",
        categoryId: "",
        unit: "unit",
        productType: "raw_material",
        storageType: "ambient",
        tracksStock: true,
        allowsProduction: false,
        requiresWeightControl: false,
        requiresDailyControl: false,
        minStock: 0,
        reorderPoint: 0,
        isActive: true,
        notes: "",
    };
}

function buildInitialForm(initialData, isEdit) {
    if (!isEdit || !initialData) {
        return buildEmptyForm();
    }

    return {
        code: initialData.code || "",
        name: initialData.name || "",
        description: initialData.description || "",
        categoryId:
            typeof initialData.categoryId === "string"
                ? initialData.categoryId
                : initialData.categoryId?._id || initialData.category?._id || "",
        unit: initialData.unit || "unit",
        productType: initialData.productType || "raw_material",
        storageType: initialData.storageType || "ambient",
        tracksStock:
            typeof initialData.tracksStock === "boolean"
                ? initialData.tracksStock
                : true,
        allowsProduction:
            typeof initialData.allowsProduction === "boolean"
                ? initialData.allowsProduction
                : false,
        requiresWeightControl:
            typeof initialData.requiresWeightControl === "boolean"
                ? initialData.requiresWeightControl
                : false,
        requiresDailyControl:
            typeof initialData.requiresDailyControl === "boolean"
                ? initialData.requiresDailyControl
                : false,
        minStock: Number(initialData.minStock ?? 0),
        reorderPoint: Number(initialData.reorderPoint ?? 0),
        isActive:
            typeof initialData.isActive === "boolean"
                ? initialData.isActive
                : true,
        notes: initialData.notes || "",
    };
}

export default function ProductModal({
    open,
    onClose,
    onSubmit,
    mode = "create",
    initialData = null,
    categories = [],
    loading = false,
    submitError = "",
}) {
    const isEdit = mode === "edit";
    const initialForm = useMemo(
        () => buildInitialForm(initialData, isEdit),
        [initialData, isEdit]
    );
    const [form, setForm] = useState(initialForm);

    useEffect(() => {
        setForm(initialForm);
    }, [initialForm, open]);

    function handleChange(event) {
        const { name, value, type, checked } = event.target;

        setForm((prev) => ({
            ...prev,
            [name]: type === "checkbox" ? checked : value,
        }));
    }

    const isDirty = useMemo(
        () =>
            form.code !== initialForm.code ||
            form.name !== initialForm.name ||
            form.description !== initialForm.description ||
            form.categoryId !== initialForm.categoryId ||
            form.unit !== initialForm.unit ||
            form.productType !== initialForm.productType ||
            form.storageType !== initialForm.storageType ||
            form.tracksStock !== initialForm.tracksStock ||
            form.allowsProduction !== initialForm.allowsProduction ||
            form.requiresWeightControl !== initialForm.requiresWeightControl ||
            form.requiresDailyControl !== initialForm.requiresDailyControl ||
            Number(form.minStock) !== Number(initialForm.minStock) ||
            Number(form.reorderPoint) !== Number(initialForm.reorderPoint) ||
            form.isActive !== initialForm.isActive ||
            form.notes !== initialForm.notes,
        [form, initialForm]
    );

    const isValid =
        form.name.trim().length > 0 &&
        form.categoryId.trim().length > 0 &&
        form.unit.trim().length > 0 &&
        form.productType.trim().length > 0 &&
        form.storageType.trim().length > 0 &&
        Number(form.minStock) >= 0 &&
        Number(form.reorderPoint) >= 0;
    const hasThresholdConflict =
        form.tracksStock &&
        Number(form.minStock) === Number(form.reorderPoint) &&
        Number(form.minStock) !== 0;

    const isDisabled =
        loading ||
        hasThresholdConflict ||
        (isEdit ? !isDirty || !isValid : !isValid);

    function handleSubmit(event) {
        event.preventDefault();

        if (isDisabled) return;

        onSubmit?.({
            code: form.code.trim() || null,
            name: form.name.trim(),
            description: form.description.trim(),
            categoryId: form.categoryId,
            unit: form.unit,
            productType: form.productType,
            storageType: form.storageType,
            tracksStock: form.tracksStock,
            allowsProduction: form.allowsProduction,
            requiresWeightControl: form.requiresWeightControl,
            requiresDailyControl: form.requiresDailyControl,
            minStock: form.tracksStock ? Number(form.minStock) || 0 : 0,
            reorderPoint: form.tracksStock ? Number(form.reorderPoint) || 0 : 0,
            isActive: form.isActive,
            notes: form.notes.trim(),
        });
    }

    useEffect(() => {
        function handleEscape(event) {
            if (event.key === "Escape") {
                onClose();
            }
        }

        window.addEventListener("keydown", handleEscape);

        return () => {
            window.removeEventListener("keydown", handleEscape);
        };
    }, [onClose]);

    if (!open) return null;

    return (
        <div className="modal-overlay" role="dialog" aria-modal="true">
            <div
                className={`modal-container modal-container--lg ${styles.modal}`}
                onClick={(event) => event.stopPropagation()}
            >

                <div className="modal-top">
                    <div className="modal-headerBlock">
                        <h3 className="modal-title">
                            {isEdit ? "Editar producto" : "Nuevo producto"}
                        </h3>
                        <p className="modal-description">
                            {isEdit
                                ? "Actualiza la informacion principal del producto."
                                : "Crea un producto nuevo para el catalogo del sistema."}
                        </p>
                    </div>

                    <button
                        type="button"
                        className="modal-close"
                        onClick={onClose}
                        disabled={loading}
                        aria-label="Cerrar modal"
                    >
                        <X size={18} />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="modal-body">
                    <section className="modal-section fadeSlideIn">
                        <div className="modal-sectionHeader">
                            <h4 className="modal-sectionTitle">Datos principales</h4>
                            <p className="modal-sectionDescription">
                                Informacion base para identificar el producto.
                            </p>
                        </div>

                        <div className="form-grid form-grid--3">
                            <div className="form-field">
                                <label htmlFor="product-name" className="form-label">
                                    Nombre
                                </label>
                                <input
                                    id="product-name"
                                    name="name"
                                    value={form.name}
                                    onChange={handleChange}
                                    className="form-input"
                                    placeholder="Filete de res"
                                    disabled={loading}
                                    required
                                />
                            </div>

                            <div className="form-field">
                                <label htmlFor="product-code" className="form-label">
                                    Codigo
                                </label>
                                <input
                                    id="product-code"
                                    name="code"
                                    value={form.code}
                                    onChange={handleChange}
                                    className="form-input"
                                    placeholder="FIL-001"
                                    disabled={loading}
                                />
                            </div>

                            <div className="form-field">
                                <label htmlFor="product-code" className="form-label">
                                    Gestionar
                                </label>
                                <label className="inlineToggle">
                                    <span className="inlineToggleCopy">
                                        <span className="inlineToggleTitle">Producto activo</span>
                                    </span>
                                    <span className="optionSwitch">
                                        <input
                                            type="checkbox"
                                            name="isActive"
                                            checked={form.isActive}
                                            onChange={handleChange}
                                            disabled={loading}
                                        />
                                    </span>
                                </label>
                            </div>
                        </div>

                        <div className="form-field">
                            <label htmlFor="product-description" className="form-label">
                                Descripcion
                            </label>
                            <textarea
                                id="product-description"
                                name="description"
                                value={form.description}
                                onChange={handleChange}
                                className="form-textarea"
                                placeholder="Describe brevemente el producto"
                                disabled={loading}
                            />
                        </div>
                    </section>

                    <section className="modal-section fadeSlideIn delayOne">
                        <div className="modal-sectionHeader">
                            <h4 className="modal-sectionTitle">Configuracion</h4>
                        </div>
                        <div className="form-field">
                            <label htmlFor="product-category" className="form-label">
                                Categoria
                            </label>
                            <div className="selectWrap">
                                <select
                                    id="product-category"
                                    name="categoryId"
                                    value={form.categoryId}
                                    onChange={handleChange}
                                    className="form-input"
                                    disabled={loading}
                                    required
                                >
                                    <option value="">Selecciona una categoria</option>
                                    {categories.map((category) => (
                                        <option key={category._id} value={category._id}>
                                            {category.name}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        </div>
                        <div className="form-grid form-grid--3">


                            <div className="form-field">
                                <label htmlFor="product-unit" className="form-label">
                                    Unidad
                                </label>
                                <div className="selectWrap">
                                    <select
                                        id="product-unit"
                                        name="unit"
                                        value={form.unit}
                                        onChange={handleChange}
                                        className="form-input"
                                        disabled={loading}
                                        required
                                    >
                                        {PRODUCT_UNIT_OPTIONS.map((option) => (
                                            <option key={option.value} value={option.value}>
                                                {option.label}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            <div className="form-field">
                                <label htmlFor="product-type" className="form-label">
                                    Tipo de producto
                                </label>
                                <div className="selectWrap">
                                    <select
                                        id="product-type"
                                        name="productType"
                                        value={form.productType}
                                        onChange={handleChange}
                                        className="form-input"
                                        disabled={loading}
                                        required
                                    >
                                        <option value="">Seleccione un tipo</option>
                                        {PRODUCT_TYPES.map((type) => (
                                            <option key={type} value={type}>
                                                {getProductTypeLabel(type)}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                            <div className="form-field">
                                <label htmlFor="product-storage" className="form-label">
                                    Almacenamiento
                                </label>
                                <div className="selectWrap">
                                    <select
                                        id="product-storage"
                                        name="storageType"
                                        value={form.storageType}
                                        onChange={handleChange}
                                        className="form-input"
                                        disabled={loading}
                                        required
                                    >
                                        {STORAGE_TYPE_OPTIONS.map((option) => (
                                            <option key={option.value} value={option.value}>
                                                {option.label}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                        </div>
                        <div className="form-grid form-grid--3">
                            <label className="optionCard">
                                <span className="optionIcon">
                                    <Archive size={15} />
                                </span>
                                <span className="optionCopy">
                                    <span className="optionTitle">Controla stock</span>
                                    <span className="optionHint">Existencias y movimientos</span>
                                </span>
                                <span className="optionSwitch">
                                    <input
                                        type="checkbox"
                                        name="tracksStock"
                                        checked={form.tracksStock}
                                        onChange={handleChange}
                                        disabled={loading}
                                    />
                                </span>
                            </label>

                            <label className="optionCard">
                                <span className="optionIcon">
                                    <Settings2 size={15} />
                                </span>
                                <span className="optionCopy">
                                    <span className="optionTitle">Permite produccion</span>
                                    <span className="optionHint">Uso en procesos internos</span>
                                </span>
                                <span className="optionSwitch">
                                    <input
                                        type="checkbox"
                                        name="allowsProduction"
                                        checked={form.allowsProduction}
                                        onChange={handleChange}
                                        disabled={loading}
                                    />
                                </span>
                            </label>

                            <label className="optionCard">
                                <span className="optionIcon">
                                    <Scale size={15} />
                                </span>
                                <span className="optionCopy">
                                    <span className="optionTitle">Controlar Peso</span>
                                    <span className="optionHint">Disponible para plantillas</span>
                                </span>
                                <span className="optionSwitch">
                                    <input
                                        type="checkbox"
                                        name="requiresWeightControl"
                                        checked={form.requiresWeightControl}
                                        onChange={handleChange}
                                        disabled={loading}
                                    />
                                </span>
                            </label>

                            <label className="optionCard">
                                <span className="optionIcon">
                                    <ClipboardCheck size={15} />
                                </span>
                                <span className="optionCopy">
                                    <span className="optionTitle">Control diario</span>
                                    <span className="optionHint">Se revisa al cierre del turno</span>
                                </span>
                                <span className="optionSwitch">
                                    <input
                                        type="checkbox"
                                        name="requiresDailyControl"
                                        checked={form.requiresDailyControl}
                                        onChange={handleChange}
                                        disabled={loading || !form.tracksStock}
                                    />
                                </span>
                            </label>
                        </div>
                    </section>

                    {form.tracksStock && (
                        <section className="modal-section fadeSlideIn delayTwo">
                            <div className="modal-sectionHeader">
                                <h4 className="modal-sectionTitle">Inventario</h4>
                                <p className="modal-sectionDescription">
                                    Define los umbrales usados para alertas y seguimiento de existencias.
                                </p>
                            </div>

                            <div className="form-grid form-grid--2">
                                <div className="form-field">
                                    <label htmlFor="product-minStock" className="form-label">
                                        Alerta de stock bajo
                                    </label>
                                    <input
                                        id="product-minStock"
                                        name="minStock"
                                        type="number"
                                        min="0"
                                        step="0.01"
                                        value={form.minStock}
                                        onChange={handleChange}
                                        className="form-input"
                                        placeholder="0"
                                        disabled={loading}
                                    />
                                </div>

                                <div className="form-field">
                                    <label htmlFor="product-reorderPoint" className="form-label">
                                        Alerta de reposicion
                                    </label>
                                    <input
                                        id="product-reorderPoint"
                                        name="reorderPoint"
                                        type="number"
                                        min="0"
                                        step="0.01"
                                        value={form.reorderPoint}
                                        onChange={handleChange}
                                        className="form-input"
                                        placeholder="0"
                                        disabled={loading}
                                    />
                                </div>
                            </div>
                        </section>
                    )}

                    <section className="modal-section fadeSlideIn delayTwo">
                        <div className="modal-sectionHeader">
                            <h4 className="modal-sectionTitle">Notas</h4>
                            <p className="modal-sectionDescription">
                                Agrega contexto interno para compras, preparacion o manejo del producto.
                            </p>
                        </div>

                        <div className="form-field">

                            <textarea
                                id="product-notes"
                                name="notes"
                                value={form.notes}
                                onChange={handleChange}
                                className="form-textarea"
                                placeholder="Notas internas u observaciones"
                                disabled={loading}
                            />
                        </div>
                    </section>

                    {hasThresholdConflict ? (
                        <div className="form-error-message" role="alert">
                            El punto de reposicion no puede ser igual a la alerta de stock bajo, salvo que ambos sean 0.
                        </div>
                    ) : null}

                    {submitError ? (
                        <div className="form-error-message" role="alert">
                            {submitError}
                        </div>
                    ) : null}

                    <div className={`modal-footer ${styles.footer} fadeSlideIn delayThree`}>
                        <button
                            type="button"
                            className="miniAction modal-textButton"
                            onClick={onClose}
                            disabled={loading}
                        >
                            Cancelar
                        </button>

                        <button
                            type="submit"
                            className="miniAction miniActionPrimary modal-textButton"
                            disabled={isDisabled}
                        >
                            {loading
                                ? "Guardando..."
                                : isEdit
                                    ? "Guardar cambios"
                                    : "Crear producto"}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
