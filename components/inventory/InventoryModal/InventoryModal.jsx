"use client";

import { useEffect, useMemo } from "react";
import { ArrowLeftRight, PackagePlus, PackageMinus, Trash2, X } from "lucide-react";

import styles from "./inventory-modal.module.scss";

const MODE_CONFIG = {
    entry: {
        title: "Agregar inventario",
        description: "Registra una entrada manual de inventario para este producto.",
        icon: PackagePlus,
        iconClass: "modal-icon modal-icon--success",
        submitLabel: "Registrar entrada",
    },
    exit: {
        title: "Retirar inventario",
        description: "Registra una salida manual de inventario para este producto.",
        icon: PackageMinus,
        iconClass: "modal-icon modal-icon--warning",
        submitLabel: "Registrar salida",
    },
    waste: {
        title: "Registrar merma",
        description: "Registra inventario perdido, dañado o vencido.",
        icon: Trash2,
        iconClass: "modal-icon modal-icon--danger",
        submitLabel: "Registrar merma",
    },
    transfer: {
        title: "Transferir inventario",
        description: "Mueve existencias entre ubicaciones.",
        icon: ArrowLeftRight,
        iconClass: "modal-icon modal-icon--info",
        submitLabel: "Registrar transferencia",
    },
};

const LOCATION_OPTIONS = [
    { value: "warehouse", label: "Bodega" },
    { value: "kitchen", label: "Cocina" },
];

function getStockByLocation(product, location) {
    if (!product?.inventory) return 0;
    return Number(product.inventory?.[location] || 0);
}

export default function InventoryMovementModal({
    open,
    mode = "entry",
    product,
    formData,
    onChange,
    onClose,
    onSubmit,
    isSubmitting = false,
    locationOptions = LOCATION_OPTIONS,
}) {
    const config = MODE_CONFIG[mode] || MODE_CONFIG.entry;
    const Icon = config.icon;

    const isTransfer = mode === "transfer";
    const isExitLike = mode === "exit" || mode === "waste";

    const selectedLocationStock = useMemo(() => {
        if (!product) return 0;

        if (isTransfer) {
            return getStockByLocation(product, formData.fromLocation);
        }

        return getStockByLocation(product, formData.location);
    }, [product, isTransfer, formData.fromLocation, formData.location]);

    const numericQuantity = Number(formData.quantity || 0);

    const exceedsAvailableStock =
        (isExitLike || isTransfer) &&
        numericQuantity > 0 &&
        numericQuantity > selectedLocationStock;

    const hasInvalidTransfer =
        isTransfer &&
        formData.fromLocation &&
        formData.toLocation &&
        formData.fromLocation === formData.toLocation;

    const isSubmitDisabled =
        isSubmitting ||
        exceedsAvailableStock ||
        hasInvalidTransfer;

    function handleFormSubmit(event) {
        event.preventDefault();

        if (exceedsAvailableStock || hasInvalidTransfer) {
            return;
        }

        onSubmit(event);
    }

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

    if (!open || !product) return null;

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div
                className={`modal-container ${styles.movementModal}`}
                onClick={(event) => event.stopPropagation()}
            >
                <div className="modal-header">
                    <div className="modal-headerContent">
                        <div className={config.iconClass}>
                            <Icon size={20} />
                        </div>

                        <div>
                            <h2 className="modal-title">{config.title}</h2>
                            <p className="modal-description">{config.description}</p>
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
                    <div className={styles.productCard}>
                        <div className={styles.productMain}>
                            <div>
                                <p className={styles.productName}>{product.name}</p>
                                <p className={styles.productMeta}>
                                    Código: <span>{product.code || "Sin código"}</span>
                                </p>
                            </div>

                            <span className={styles.unitBadge}>{product.unit}</span>
                        </div>

                        <div className={styles.stockGrid}>
                            <div className={styles.stockItem}>
                                <span className={styles.stockLabel}>Total actual</span>
                                <strong className={styles.stockValue}>
                                    {Number(product.inventory?.total || 0)}
                                </strong>
                            </div>

                            <div className={styles.stockItem}>
                                <span className={styles.stockLabel}>Bodega</span>
                                <strong className={styles.stockValue}>
                                    {Number(product.inventory?.warehouse || 0)}
                                </strong>
                            </div>

                            <div className={styles.stockItem}>
                                <span className={styles.stockLabel}>Cocina</span>
                                <strong className={styles.stockValue}>
                                    {Number(product.inventory?.kitchen || 0)}
                                </strong>
                            </div>

                            <div className={styles.stockItem}>
                                <span className={styles.stockLabel}>Disponible</span>
                                <strong className={styles.stockValue}>
                                    {Number(product.inventory?.available || 0)}
                                </strong>
                            </div>
                        </div>
                    </div>

                    <form className={styles.form} onSubmit={handleFormSubmit}>
                        <div className="form-grid">
                            <div className="form-field">
                                <label className="form-label" htmlFor="movement-quantity">
                                    Cantidad
                                </label>
                                <input
                                    id="movement-quantity"
                                    name="quantity"
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    className="form-input"
                                    value={formData.quantity}
                                    onChange={onChange}
                                    placeholder="0"
                                    required
                                />
                            </div>

                            {!isTransfer && (
                                <div className="form-field">
                                    <label className="form-label" htmlFor="movement-location">
                                        {mode === "entry" ? "Ubicación destino" : "Ubicación origen"}
                                    </label>
                                    <select
                                        id="movement-location"
                                        name="location"
                                        className={`form-input ${styles.selectInput}`}
                                        value={formData.location}
                                        onChange={onChange}
                                        required
                                    >
                                        {locationOptions.map((option) => (
                                            <option key={option.value} value={option.value}>
                                                {option.label}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            )}

                            {isTransfer && (
                                <>
                                    <div className="form-field">
                                        <label className="form-label" htmlFor="movement-from-location">
                                            Ubicación origen
                                        </label>
                                        <select
                                            id="movement-from-location"
                                            name="fromLocation"
                                            className={`form-input ${styles.selectInput}`}
                                            value={formData.fromLocation}
                                            onChange={onChange}
                                            required
                                        >
                                            {locationOptions.map((option) => (
                                                <option key={option.value} value={option.value}>
                                                    {option.label}
                                                </option>
                                            ))}
                                        </select>
                                    </div>

                                    <div className="form-field">
                                        <label className="form-label" htmlFor="movement-to-location">
                                            Ubicación destino
                                        </label>
                                        <select
                                            id="movement-to-location"
                                            name="toLocation"
                                            className={`form-input ${styles.selectInput}`}
                                            value={formData.toLocation}
                                            onChange={onChange}
                                            required
                                        >
                                            {locationOptions.map((option) => (
                                                <option key={option.value} value={option.value}>
                                                    {option.label}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                </>
                            )}
                        </div>

                        {(isExitLike || isTransfer) && (
                            <div className={styles.helperCard}>
                                <span className={styles.helperLabel}>
                                    Stock actual en la ubicación seleccionada
                                </span>
                                <strong className={styles.helperValue}>{selectedLocationStock}</strong>
                            </div>
                        )}

                        {exceedsAvailableStock && (
                            <p className={styles.errorText}>
                                La cantidad ingresada no puede ser mayor al stock disponible en la
                                ubicación seleccionada.
                            </p>
                        )}

                        {hasInvalidTransfer && (
                            <p className={styles.errorText}>
                                La ubicación de origen y destino no pueden ser la misma.
                            </p>
                        )}

                        <div className="form-field">
                            <label className="form-label" htmlFor="movement-notes">
                                Notas
                            </label>
                            <textarea
                                id="movement-notes"
                                name="notes"
                                className={`form-textarea ${styles.notesField}`}
                                value={formData.notes}
                                onChange={onChange}
                                placeholder="Agrega una observación o detalle del movimiento"
                                rows={4}
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
                                disabled={isSubmitDisabled}
                            >
                                {isSubmitting ? "Guardando..." : config.submitLabel}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
}
