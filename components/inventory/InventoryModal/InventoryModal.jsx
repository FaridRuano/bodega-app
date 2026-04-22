"use client";

import { useEffect, useMemo } from "react";
import { ArrowLeftRight, PackageMinus, PackagePlus, Trash2, X } from "lucide-react";

import styles from "./inventory-modal.module.scss";
import { getUnitLabel } from "@libs/constants/units";

const MODE_CONFIG = {
    entry: {
        title: "Agregar inventario",
        description: "Registra una entrada manual para actualizar existencias.",
        icon: PackagePlus,
        iconClass: "modal-icon modal-icon--success",
        submitLabel: "Registrar entrada",
    },
    exit: {
        title: "Retirar inventario",
        description: "Registra una salida manual para este producto.",
        icon: PackageMinus,
        iconClass: "modal-icon modal-icon--warning",
        submitLabel: "Registrar salida",
    },
    waste: {
        title: "Registrar merma",
        description: "Descuenta inventario perdido, dañado o vencido.",
        icon: Trash2,
        iconClass: "modal-icon modal-icon--danger",
        submitLabel: "Registrar merma",
    },
    transfer: {
        title: "Transferir inventario",
        description: "Mueve existencias entre ubicaciones del sistema.",
        icon: ArrowLeftRight,
        iconClass: "modal-icon modal-icon--info",
        submitLabel: "Registrar transferencia",
    },
};

const LOCATION_OPTIONS = [
    { value: "warehouse", label: "Bodega" },
    { value: "kitchen", label: "Cocina" },
    { value: "lounge", label: "Salon" },
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
        <div className="modal-overlay">
            <div
                className={`modal-container ${styles.movementModal}`}
                onClick={(event) => event.stopPropagation()}
            >
                <div className="modal-top">
                    <div className="modal-headerContent">
                        <div className={config.iconClass}>
                            <Icon size={20} />
                        </div>

                        <div className="modal-headerBlock">
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

                <form className="modal-body" onSubmit={handleFormSubmit}>
                    <section className="modal-section fadeSlideIn">
                        <div className="modal-sectionHeader">
                            <h3 className="modal-sectionTitle">Producto</h3>
                            <p className="modal-sectionDescription">
                                Consulta el stock actual antes de registrar el movimiento.
                            </p>
                        </div>

                        <div className={styles.productCard}>
                            <div className={styles.productMain}>
                                <div className={styles.productCopy}>
                                    <p className={styles.productName}>{product.name}</p>
                                    <p className={styles.productMeta}>
                                        {product.code || "Sin codigo"}
                                    </p>
                                </div>

                                <span className={styles.unitBadge}>{getUnitLabel(product.unit)}</span>
                            </div>

                            <div className={styles.stockGrid}>
                                <div className={styles.stockItem}>
                                    <span className={styles.stockLabel}>Total</span>
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
                                    <span className={styles.stockLabel}>Salon</span>
                                    <strong className={styles.stockValue}>
                                        {Number(product.inventory?.lounge || 0)}
                                    </strong>
                                </div>
                            </div>
                        </div>
                    </section>

                    <section className="modal-section fadeSlideIn delayOne">
                        <div className="modal-sectionHeader">
                            <h3 className="modal-sectionTitle">Movimiento</h3>
                            <p className="modal-sectionDescription">
                                Completa la cantidad y la ubicación correspondiente.
                            </p>
                        </div>

                        <div className={`form-grid ${isTransfer ? "form-grid--3" : "form-grid--2"}`}>
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

                            {!isTransfer ? (
                                <div className="form-field">
                                    <label className="form-label" htmlFor="movement-location">
                                        {mode === "entry" ? "Ubicacion destino" : "Ubicacion origen"}
                                    </label>
                                    <div className="selectWrap">
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
                                </div>
                            ) : (
                                <>
                                    <div className="form-field">
                                        <label className="form-label" htmlFor="movement-from-location">
                                            Ubicacion origen
                                        </label>
                                        <div className="selectWrap">
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
                                    </div>

                                    <div className="form-field">
                                        <label className="form-label" htmlFor="movement-to-location">
                                            Ubicacion destino
                                        </label>
                                        <div className="selectWrap">
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
                                    </div>
                                </>
                            )}
                        </div>

                        {(exceedsAvailableStock || hasInvalidTransfer) && (
                            <div className={`${styles.helperCard} fadeSlideIn`}>
                                {exceedsAvailableStock ? (
                                    <div className={styles.alertItem}>
                                        <span className={styles.alertTitle}>Cantidad no disponible</span>
                                        <p className={styles.alertText}>
                                            La cantidad ingresada no puede ser mayor al stock disponible en la
                                            ubicacion seleccionada.
                                        </p>
                                    </div>
                                ) : null}

                                {hasInvalidTransfer ? (
                                    <div className={styles.alertItem}>
                                        <span className={styles.alertTitle}>Transferencia invalida</span>
                                        <p className={styles.alertText}>
                                            La ubicacion de origen y destino no pueden ser la misma.
                                        </p>
                                    </div>
                                ) : null}
                            </div>
                        )}
                    </section>

                    <section className="modal-section fadeSlideIn delayTwo">
                        <div className="modal-sectionHeader">
                            <h3 className="modal-sectionTitle">Notas</h3>
                            <p className="modal-sectionDescription">
                                Agrega contexto si necesitas dejar una observacion interna.
                            </p>
                        </div>

                        <div className="form-field">
                            <label className="form-label" htmlFor="movement-notes">
                                Detalle
                            </label>
                            <textarea
                                id="movement-notes"
                                name="notes"
                                className={`form-textarea`}
                                value={formData.notes}
                                onChange={onChange}
                                placeholder="Agrega una observacion o detalle del movimiento"
                                rows={3}
                            />
                        </div>
                    </section>

                    <div className={`modal-footer ${styles.footer} fadeSlideIn delayThree`}>
                        <button
                            type="button"
                            className="miniAction modal-textButton"
                            onClick={onClose}
                            disabled={isSubmitting}
                        >
                            Cancelar
                        </button>

                        <button
                            type="submit"
                            className="miniAction miniActionPrimary modal-textButton"
                            disabled={isSubmitDisabled}
                        >
                            {isSubmitting ? "Guardando..." : config.submitLabel}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
