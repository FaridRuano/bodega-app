"use client";

import { useEffect, useMemo } from "react";
import { ClipboardList, Plus, Trash2, X } from "lucide-react";

import ProductAutoComplete from "@components/shared/ProductAutocomplete/ProductAutoComplete";
import { getLocationLabel, getRequestTypeLabel } from "@libs/constants/domainLabels";
import { REQUEST_PURPOSE_OPTIONS } from "@libs/constants/purposes";
import { getUnitLabel } from "@libs/constants/units";
import styles from "./request-form-modal.module.scss";

export default function RequestFormModal({
    open,
    mode = "create",
    formData,
    destinationOptions = [],
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

    const isReturnRequest = formData.requestType === "return";
    const shouldValidateSourceStock = isReturnRequest;

    const hasInventoryOverflow = useMemo(() => {
        if (!shouldValidateSourceStock) return false;

        return (formData.items || []).some((item) => {
            const selectedProduct = products.find((product) => product._id === item.productId);
            if (!selectedProduct) return false;

            const sourceLocation = formData.sourceLocation || "warehouse";
            const maxAvailable = Number(selectedProduct?.inventory?.[sourceLocation] || 0);
            const quantity = Number(item.requestedQuantity || 0);

            return Number.isFinite(quantity) && quantity > maxAvailable;
        });
    }, [formData.items, formData.sourceLocation, products, shouldValidateSourceStock]);

    const sourceLocationLabel = getLocationLabel(formData.sourceLocation).toLowerCase();
    const hasRequestPurpose = Boolean(formData.requestPurpose?.trim?.());
    const canSubmit =
        hasRequestPurpose &&
        validItemsCount > 0 &&
        !hasInventoryOverflow &&
        !isSubmitting;

    function handleFormSubmit(event) {
        event.preventDefault();

        if (!canSubmit) return;
        onSubmit(event);
    }

    if (!open) return null;

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div
                className="modal-container modal-container--xl"
                onClick={(event) => event.stopPropagation()}
            >
                <div className="modal-top">
                    <div className="modal-headerContent">
                        <div className="modal-icon modal-icon--info">
                            <ClipboardList size={20} />
                        </div>

                        <div>
                            <h2 className="modal-title">
                                {mode === "edit"
                                    ? isReturnRequest
                                        ? "Editar transferencia"
                                        : "Editar solicitud interna"
                                    : isReturnRequest
                                        ? "Nueva transferencia"
                                        : "Nueva solicitud interna"}
                            </h2>
                            <p className="modal-description">
                                {isReturnRequest
                                    ? "Define los productos y cantidades que regresarán a bodega."
                                    : "Define los productos y cantidades que deseas mover entre áreas."}
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
                        <div className={styles.flowGrid}>
                            <div className="form-field">
                                <label className="form-label">Origen</label>
                                <div className={styles.readonlyField}>
                                    <span>{getLocationLabel(formData.sourceLocation)}</span>
                                </div>
                            </div>

                            <div className="form-field">
                                <label className="form-label">Destino</label>
                                <div className="selectWrap">
                                    <select
                                        name="destinationLocation"
                                        className="form-input"
                                        value={formData.destinationLocation}
                                        onChange={onChange}
                                        disabled={isSubmitting}
                                    >
                                        {destinationOptions.map((option) => (
                                            <option key={option.value} value={option.value}>
                                                {option.label}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                        </div>

                        <div className={styles.itemsSection}>
                            <div className={styles.itemsHeader}>
                                <h3 className={styles.sectionTitle}>Productos</h3>

                                <button
                                    type="button"
                                    className="miniAction"
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
                                    const sourceLocation = formData.sourceLocation || "warehouse";
                                    const maxAvailable = Number(
                                        selectedProduct?.inventory?.[sourceLocation] || 0
                                    );

                                    return (
                                        <div key={index} className={styles.itemRow}>
                                            <div className="form-field">
                                                <label className="form-label">Producto</label>
                                                <ProductAutoComplete
                                                    value={item.productId}
                                                    selectedProduct={selectedProduct}
                                                    onChange={(product) =>
                                                        onItemChange(index, "productId", product?._id || "")
                                                    }
                                                    disabled={isSubmitting}
                                                    placeholder="Buscar por nombre o código..."
                                                />
                                            </div>

                                            <div className="form-field">
                                                <div className={styles.quantityLabelRow}>
                                                    <label className="form-label">Cantidad</label>
                                                    {selectedProduct && shouldValidateSourceStock ? (
                                                        <span className={styles.stockHint}>
                                                            Máx. {maxAvailable}
                                                        </span>
                                                    ) : null}
                                                </div>
                                                <input
                                                    type="number"
                                                    min="0"
                                                    max={
                                                        selectedProduct && shouldValidateSourceStock
                                                            ? maxAvailable
                                                            : undefined
                                                    }
                                                    step="0.01"
                                                    className="form-input"
                                                    value={item.requestedQuantity}
                                                    onChange={(event) =>
                                                        onItemChange(index, "requestedQuantity", event.target.value)
                                                    }
                                                    placeholder="0"
                                                    disabled={isSubmitting}
                                                />
                                            </div>

                                            <div className="form-field">
                                                <label className="form-label">Und.</label>
                                                <div className={styles.readonlyField}>
                                                    <span>
                                                        {selectedProduct
                                                            ? getUnitLabel(selectedProduct.unit)
                                                            : "Selecciona un producto"}
                                                    </span>
                                                </div>
                                            </div>

                                            <div className="form-field">
                                                <label className="form-label">Nota del producto</label>
                                                <input
                                                    type="text"
                                                    className="form-input"
                                                    value={item.notes || ""}
                                                    onChange={(event) =>
                                                        onItemChange(index, "notes", event.target.value)
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

                            {hasInventoryOverflow ? (
                                <div className={styles.formAlert}>
                                    Ajusta las cantidades. Uno o más productos superan el stock disponible en {sourceLocationLabel}.
                                </div>
                            ) : null}
                        </div>

                        <div className="form-field">
                            <label className="form-label">
                                {isReturnRequest ? "Motivo de la transferencia" : "Motivo de la solicitud"}
                            </label>
                            <div className="selectWrap">
                                <select
                                    name="requestPurpose"
                                    className="form-input"
                                    value={formData.requestPurpose}
                                    onChange={onChange}
                                    disabled={isSubmitting}
                                >
                                    <option value="">Seleccionar</option>
                                    {REQUEST_PURPOSE_OPTIONS.filter((option) =>
                                        isReturnRequest
                                            ? option.value === "return_to_warehouse"
                                            : option.value !== "return_to_warehouse" && option.value !== "production"
                                    ).map((option) => (
                                        <option key={option.value} value={option.value}>
                                            {option.label}
                                        </option>
                                    ))}
                                </select>
                            </div>
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

                        <div className={styles.typeHint}>
                            <span className={styles.typeHintLabel}>Flujo</span>
                            <strong className={styles.typeHintValue}>
                                {getRequestTypeLabel(formData.requestType)}
                                <span>{getLocationLabel(formData.sourceLocation)}</span>
                                <span>→</span>
                                <span>{getLocationLabel(formData.destinationLocation)}</span>
                            </strong>
                        </div>

                        <div className="modal-footer">
                            <button
                                type="button"
                                className="miniAction"
                                onClick={onClose}
                                disabled={isSubmitting}
                            >
                                Cancelar
                            </button>

                            <button
                                type="submit"
                                className="miniAction miniActionPrimary"
                                disabled={!canSubmit}
                            >
                                {isSubmitting
                                    ? "Guardando..."
                                    : mode === "edit"
                                        ? "Guardar cambios"
                                        : "Crear solicitud"}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
}
