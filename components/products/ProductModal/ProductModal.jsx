"use client";

import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import { PRODUCT_UNIT_OPTIONS } from "@libs/constants/units";

const PRODUCT_TYPE_OPTIONS = [
    { value: "raw_material", label: "Materia prima" },
    { value: "processed", label: "Procesado" },
    { value: "prepared", label: "Preparado" },
    { value: "supply", label: "Insumo" },
];

const STORAGE_TYPE_OPTIONS = [
    { value: "ambient", label: "Ambiente" },
    { value: "refrigerated", label: "Refrigerado" },
    { value: "frozen", label: "Congelado" },
];

export default function ProductModal({
    open,
    onClose,
    onSubmit,
    mode = "create",
    initialData = null,
    categories = [],
    loading = false,
}) {
    const isEdit = mode === "edit";

    const emptyForm = {
        code: "",
        name: "",
        description: "",
        categoryId: "",
        unit: "unit",
        productType: "raw_material",
        storageType: "ambient",
        tracksStock: true,
        allowsProduction: false,
        minStock: 0,
        reorderPoint: 0,
        isActive: true,
        notes: "",
    };

    const [form, setForm] = useState(emptyForm);
    const [initialForm, setInitialForm] = useState(emptyForm);

    useEffect(() => {
        if (!open) return;

        if (isEdit && initialData) {
            const editForm = {
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
                minStock: Number(initialData.minStock ?? 0),
                reorderPoint: Number(initialData.reorderPoint ?? 0),
                isActive:
                    typeof initialData.isActive === "boolean"
                        ? initialData.isActive
                        : true,
                notes: initialData.notes || "",
            };

            setForm(editForm);
            setInitialForm(editForm);
            return;
        }

        setForm(emptyForm);
        setInitialForm(emptyForm);
    }, [open, isEdit, initialData]);

    function handleChange(event) {
        const { name, value, type, checked } = event.target;

        setForm((prev) => ({
            ...prev,
            [name]:
                type === "checkbox"
                    ? checked
                    : type === "number"
                        ? value
                        : value,
        }));
    }

    const isDirty = useMemo(() => {
        return (
            form.code !== initialForm.code ||
            form.name !== initialForm.name ||
            form.description !== initialForm.description ||
            form.categoryId !== initialForm.categoryId ||
            form.unit !== initialForm.unit ||
            form.productType !== initialForm.productType ||
            form.storageType !== initialForm.storageType ||
            form.tracksStock !== initialForm.tracksStock ||
            form.allowsProduction !== initialForm.allowsProduction ||
            Number(form.minStock) !== Number(initialForm.minStock) ||
            Number(form.reorderPoint) !== Number(initialForm.reorderPoint) ||
            form.isActive !== initialForm.isActive ||
            form.notes !== initialForm.notes
        );
    }, [form, initialForm]);

    const isValid =
        form.name.trim().length > 0 &&
        form.categoryId.trim().length > 0 &&
        form.unit.trim().length > 0 &&
        form.productType.trim().length > 0 &&
        form.storageType.trim().length > 0 &&
        Number(form.minStock) >= 0 &&
        Number(form.reorderPoint) >= 0;

    const isDisabled = loading || (isEdit ? !isDirty || !isValid : !isValid);

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
            minStock: Number(form.minStock) || 0,
            reorderPoint: Number(form.reorderPoint) || 0,
            isActive: form.isActive,
            notes: form.notes.trim(),
        });
    }

    useEffect(() => {
        function handleEscape(e) {
            if (e.key === "Escape") {
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
        <div className="modal-overlay" role="dialog" aria-modal="true" onClick={onClose}>
            <div className="modal-container modal-container--lg" onClick={(event) => event.stopPropagation()}>
                <div className="modal-header">
                    <div>
                        <h3 className="modal-title">
                            {isEdit ? "Editar producto" : "Nuevo producto"}
                        </h3>
                        <p className="modal-description">
                            {isEdit
                                ? "Actualiza la información general del producto."
                                : "Crea un nuevo producto para el catálogo del sistema."}
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
                    <div className="form-grid">
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
                                placeholder="Ej: Filete de res"
                                disabled={loading}
                                required
                            />
                        </div>

                        <div className="form-field">
                            <label htmlFor="product-code" className="form-label">
                                Código
                            </label>
                            <input
                                id="product-code"
                                name="code"
                                value={form.code}
                                onChange={handleChange}
                                className="form-input"
                                placeholder="Ej: FIL-001"
                                disabled={loading}
                            />
                        </div>
                    </div>

                    <div className="form-field">
                        <label htmlFor="product-description" className="form-label">
                            Descripción
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

                    <div className="form-grid form-grid--3">
                        <div className="form-field">
                            <label htmlFor="product-category" className="form-label">
                                Categoría
                            </label>
                            <select
                                id="product-category"
                                name="categoryId"
                                value={form.categoryId}
                                onChange={handleChange}
                                className="form-input"
                                disabled={loading}
                                required
                            >
                                <option value="">Selecciona una categoría</option>
                                {categories.map((category) => (
                                    <option key={category._id} value={category._id}>
                                        {category.name}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div className="form-field">
                            <label htmlFor="product-unit" className="form-label">
                                Unidad
                            </label>
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

                        <div className="form-field">
                            <label htmlFor="product-type" className="form-label">
                                Tipo de producto
                            </label>
                            <select
                                id="product-type"
                                name="productType"
                                value={form.productType}
                                onChange={handleChange}
                                className="form-input"
                                disabled={loading}
                                required
                            >
                                {PRODUCT_TYPE_OPTIONS.map((option) => (
                                    <option key={option.value} value={option.value}>
                                        {option.label}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div className="form-grid form-grid--3">
                        <div className="form-field">
                            <label htmlFor="product-storage" className="form-label">
                                Almacenamiento
                            </label>
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

                        <div className="form-field">
                            <label htmlFor="product-minStock" className="form-label">
                                Stock mínimo
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
                                Punto de reposición
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

                    <div className="form-grid">
                        <div className="form-switchRow">
                            <div>
                                <p className="form-switchLabel">Controla stock</p>
                                <p className="form-switchDescription">
                                    Mantiene existencias y movimientos de inventario.
                                </p>
                            </div>

                            <label className="switch">
                                <input
                                    type="checkbox"
                                    name="tracksStock"
                                    checked={form.tracksStock}
                                    onChange={handleChange}
                                    disabled={loading}
                                />
                                <span className="switch-slider" />
                            </label>
                        </div>

                        <div className="form-switchRow">
                            <div>
                                <p className="form-switchLabel">Permite producción</p>
                                <p className="form-switchDescription">
                                    Puede usarse en procesos de transformación o preparación.
                                </p>
                            </div>

                            <label className="switch">
                                <input
                                    type="checkbox"
                                    name="allowsProduction"
                                    checked={form.allowsProduction}
                                    onChange={handleChange}
                                    disabled={loading}
                                />
                                <span className="switch-slider" />
                            </label>
                        </div>
                    </div>

                    <div className="form-switchRow">
                        <div>
                            <p className="form-switchLabel">Producto activo</p>
                            <p className="form-switchDescription">
                                El producto estará disponible en el sistema.
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

                    <div className="form-field">
                        <label htmlFor="product-notes" className="form-label">
                            Notas
                        </label>
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

                    <div className="modal-footer">
                        <button
                            type="button"
                            className="btn btn-secondary"
                            onClick={onClose}
                            disabled={loading}
                        >
                            Cancelar
                        </button>

                        <button type="submit" className="btn btn-primary" disabled={isDisabled}>
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