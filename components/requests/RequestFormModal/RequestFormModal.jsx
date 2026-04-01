"use client";

import { useEffect, useMemo } from "react";
import { ClipboardList, Plus, Trash2, X } from "lucide-react";

import styles from "./request-form-modal.module.scss";
import { getUnitLabel } from "@libs/constants/units";
import { REQUEST_PURPOSE_OPTIONS } from "@libs/constants/purposes";

export default function RequestFormModal({
    open,
    mode = "create",
    formData,
    onChange,
    onItemChange,
    onAddItem,
    onRemoveItem,
    onClose,
    onSubmit,
    isSubmitting = false,
    products = [],
}) {
    useEffect(() => {
        function handleEscape(event) {
            if (event.key === "Escape" && open) {
                onClose();
            }
        }

        window.addEventListener("keydown", handleEscape);

        return () => {
            window.removeEventListener("keydown", handleEscape);
        };
    }, [open, onClose]);

    const validItemsCount = useMemo(() => {
        return (formData.items || []).filter((item) => {
            const quantity = Number(item.requestedQuantity || 0);
            return item.productId && Number.isFinite(quantity) && quantity > 0;
        }).length;
    }, [formData.items]);

    const hasRequestPurpose = Boolean(formData.requestPurpose?.trim?.());
    const canSubmit = hasRequestPurpose && validItemsCount > 0 && !isSubmitting;

    function handleFormSubmit(event) {
        event.preventDefault();

        if (!canSubmit) {
            return;
        }

        onSubmit(event);
    }

    if (!open) return null;

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div
                className="modal-container modal-container--xl"
                onClick={(event) => event.stopPropagation()}
            >
                <div className="modal-header">
                    <div className="modal-headerContent">
                        <div className="modal-icon modal-icon--info">
                            <ClipboardList size={20} />
                        </div>

                        <div>
                            <h2 className="modal-title">
                                {mode === "edit" ? "Editar solicitud" : "Nueva solicitud"}
                            </h2>
                            <p className="modal-description">
                                Define los productos y cantidades que deseas solicitar.
                            </p>
                        </div>
                    </div>

                    <button
                        type="button"
                        className="modal-close"
                        onClick={onClose}
                        aria-label="Cerrar modal"
                    >
                        <X size={18} />
                    </button>
                </div>

                <div className="modal-body">
                    <form className={styles.form} onSubmit={handleFormSubmit}>
                        <div className={styles.itemsSection}>
                            <div className={styles.itemsHeader}>
                                <h3 className={styles.sectionTitle}>Productos</h3>

                                <button
                                    type="button"
                                    className="btn btn-secondary"
                                    onClick={onAddItem}
                                    disabled={isSubmitting}
                                >
                                    <Plus size={16} />
                                    Agregar producto
                                </button>
                            </div>

                            {(!formData.items || formData.items.length === 0) && (
                                <div className={styles.emptyState}>
                                    No hay productos agregados.
                                </div>
                            )}

                            <div className={styles.itemsList}>
                                {(formData.items || []).map((item, index) => {
                                    const selectedProduct = products.find(
                                        (product) => product._id === item.productId
                                    );

                                    const quantity = Number(item.requestedQuantity || 0);
                                    const hasValidQuantity =
                                        Number.isFinite(quantity) && quantity > 0;

                                    return (
                                        <div key={index} className={styles.itemRow}>
                                            <div className="form-field">
                                                <label className="form-label">Producto</label>
                                                <select
                                                    className="form-input"
                                                    value={item.productId}
                                                    onChange={(event) =>
                                                        onItemChange(
                                                            index,
                                                            "productId",
                                                            event.target.value
                                                        )
                                                    }
                                                    disabled={isSubmitting}
                                                >
                                                    <option value="">Seleccionar</option>
                                                    {products.map((product) => (
                                                        <option
                                                            key={product._id}
                                                            value={product._id}
                                                        >
                                                            {product.name}
                                                        </option>
                                                    ))}
                                                </select>
                                            </div>

                                            <div className="form-field">
                                                <label className="form-label">Cantidad</label>
                                                <input
                                                    type="number"
                                                    min="0"
                                                    step="0.01"
                                                    className="form-input"
                                                    value={item.requestedQuantity}
                                                    onChange={(event) =>
                                                        onItemChange(
                                                            index,
                                                            "requestedQuantity",
                                                            event.target.value
                                                        )
                                                    }
                                                    placeholder="0"
                                                    disabled={isSubmitting}
                                                />
                                                
                                            </div>

                                            <div className="form-field">
                                                <label className="form-label">Und.</label>
                                                <div className={styles.unitField}>
                                                    <span className="unitValue">
                                                        {selectedProduct
                                                            ? getUnitLabel(selectedProduct.unit)
                                                            : "Selecciona un producto"}
                                                    </span>
                                                </div>
                                            </div>

                                            <div className="form-field">
                                                <label className="form-label">Nota del item</label>
                                                <input
                                                    type="text"
                                                    className="form-input"
                                                    value={item.notes || ""}
                                                    onChange={(event) =>
                                                        onItemChange(
                                                            index,
                                                            "notes",
                                                            event.target.value
                                                        )
                                                    }
                                                    placeholder="Opcional"
                                                    disabled={isSubmitting}
                                                />
                                            </div>

                                            <button
                                                type="button"
                                                className={styles.removeBtn}
                                                onClick={() => onRemoveItem(index)}
                                                aria-label="Eliminar producto"
                                                disabled={isSubmitting}
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        </div>
                                    );
                                })}
                            </div>

                            {validItemsCount === 0 && (
                                <p className="errorText">
                                    Debes agregar al menos un producto con una cantidad mayor a cero.
                                </p>
                            )}
                        </div>

                        <div className="form-field">
                            <label className="form-label">Motivo de la solicitud</label>
                            <select
                                name="requestPurpose"
                                className="form-input"
                                value={formData.requestPurpose}
                                onChange={onChange}
                                disabled={isSubmitting}
                            >
                                <option value="">Seleccionar</option>

                                {REQUEST_PURPOSE_OPTIONS.map((option) => (
                                    <option key={option.value} value={option.value}>
                                        {option.label}
                                    </option>
                                ))}
                            </select>

                            {!hasRequestPurpose && (
                                <p className={styles.errorText}>
                                    Debes seleccionar el motivo de la solicitud.
                                </p>
                            )}
                        </div>

                        <div className="form-field">
                            <label className="form-label">Notas generales</label>
                            <textarea
                                name="notes"
                                className="form-textarea"
                                value={formData.notes}
                                onChange={onChange}
                                placeholder="Información adicional"
                                disabled={isSubmitting}
                            />
                        </div>

                        <div className="modal-footer">
                            <button
                                type="button"
                                className="btn btn-secondary"
                                onClick={onClose}
                                disabled={isSubmitting}
                            >
                                Cancelar
                            </button>

                            <button
                                type="submit"
                                className="btn btn-primary"
                                disabled={!canSubmit}
                            >
                                {isSubmitting
                                    ? "Guardando..."
                                    : mode === "edit"
                                        ? "Guardar cambios"
                                        : "Guardar solicitud"}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
}