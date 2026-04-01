"use client";

import { useEffect, useMemo } from "react";
import { Truck, PackageCheck, X } from "lucide-react";

import styles from "./request-fulfillment-modal.module.scss";
import { getUnitLabel } from "@libs/constants/units";

function toNumber(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
}

export default function RequestFulfillmentModal({
    open,
    mode = "dispatch", // dispatch | receive
    request,
    fulfillmentData,
    onItemChange,
    onChange,
    onClose,
    onSubmit,
    isSubmitting = false,
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

    const isDispatch = mode === "dispatch";

    const hasAtLeastOneQuantity = useMemo(() => {
        return (fulfillmentData?.items || []).some((item) => {
            const quantity = toNumber(item.quantity);
            return quantity > 0;
        });
    }, [fulfillmentData]);

    function handleQuantityChange(index, maxValue, rawValue) {
        if (rawValue === "") {
            onItemChange(index, "");
            return;
        }

        let nextValue = Number(rawValue);

        if (Number.isNaN(nextValue)) {
            nextValue = 0;
        }

        if (nextValue < 0) {
            nextValue = 0;
        }

        if (nextValue > maxValue) {
            nextValue = maxValue;
        }

        onItemChange(index, String(nextValue));
    }

    function handleFormSubmit(event) {
        event.preventDefault();

        if (!hasAtLeastOneQuantity || isSubmitting) {
            return;
        }

        onSubmit(event);
    }

    if (!open || !request) return null;

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div
                className="modal-container modal-container--lg"
                onClick={(event) => event.stopPropagation()}
            >
                <div className="modal-header">
                    <div className="modal-headerContent">
                        <div
                            className={`modal-icon ${isDispatch ? "modal-icon--warning" : "modal-icon--success"
                                }`}
                        >
                            {isDispatch ? (
                                <Truck size={20} />
                            ) : (
                                <PackageCheck size={20} />
                            )}
                        </div>

                        <div>
                            <h2 className="modal-title">
                                {isDispatch ? "Despachar solicitud" : "Confirmar recepción"}
                            </h2>
                            <p className="modal-description">
                                {isDispatch
                                    ? "Registra las cantidades que serán despachadas desde inventario."
                                    : "Confirma las cantidades recibidas."}
                            </p>
                        </div>
                    </div>

                    <button
                        type="button"
                        className="modal-close"
                        onClick={onClose}
                        aria-label="Cerrar modal"
                        disabled={isSubmitting}
                    >
                        <X size={18} />
                    </button>
                </div>

                <div className="modal-body">
                    <form className={styles.form} onSubmit={handleFormSubmit}>
                        <div className={styles.itemsSection}>
                            {(request.items || []).map((item, index) => {
                                const requested = toNumber(item.requestedQuantity);
                                const approved = toNumber(item.approvedQuantity);
                                const dispatched = toNumber(item.dispatchedQuantity);
                                const received = toNumber(item.receivedQuantity);

                                const pendingDispatch = Math.max(approved - dispatched, 0);
                                const pendingReceive = Math.max(dispatched - received, 0);

                                const maxValue = isDispatch
                                    ? pendingDispatch
                                    : pendingReceive;

                                const currentValue =
                                    fulfillmentData?.items?.[index]?.quantity ?? "";

                                const itemDisabled = maxValue <= 0 || isSubmitting;

                                return (
                                    <div key={item._id} className={styles.itemRow}>
                                        <div className={styles.itemInfo}>
                                            <p className={styles.itemName}>
                                                {item.product?.name || "Producto"}
                                            </p>
                                            <p className={styles.itemMeta}>
                                                {item.product?.code || "Sin código"} ·{" "}
                                                {getUnitLabel(
                                                    item.unitSnapshot || item.product?.unit
                                                )}
                                            </p>
                                        </div>

                                        <div className={styles.itemStats}>
                                            <span>Solicitado: {requested}</span>
                                            <span>Aprobado: {approved}</span>
                                            <span>Despachado: {dispatched}</span>
                                            <span>Recibido: {received}</span>
                                            <span>
                                                {isDispatch
                                                    ? `Pendiente por despachar: ${pendingDispatch}`
                                                    : `Pendiente por recibir: ${pendingReceive}`}
                                            </span>
                                        </div>

                                        <div className="form-field">
                                            <label className="form-label">
                                                {isDispatch ? "Despachar" : "Recibir"}
                                            </label>

                                            <input
                                                type="number"
                                                min="0"
                                                max={maxValue}
                                                step="0.01"
                                                className="form-input"
                                                value={currentValue}
                                                onChange={(event) =>
                                                    handleQuantityChange(
                                                        index,
                                                        maxValue,
                                                        event.target.value
                                                    )
                                                }
                                                disabled={itemDisabled}
                                                placeholder={itemDisabled ? "No disponible" : "0"}
                                            />
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        {!hasAtLeastOneQuantity ? (
                            <p className={styles.errorText}>
                                Debes ingresar al menos una cantidad mayor a cero.
                            </p>
                        ) : null}

                        <div className="form-field">
                            <label className="form-label">Notas (opcional)</label>
                            <textarea
                                name="notes"
                                className="form-textarea"
                                value={fulfillmentData?.notes || ""}
                                onChange={onChange}
                                placeholder={
                                    isDispatch
                                        ? "Notas de despacho"
                                        : "Notas de recepción"
                                }
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
                                disabled={isSubmitting || !hasAtLeastOneQuantity}
                            >
                                {isSubmitting
                                    ? "Procesando..."
                                    : isDispatch
                                        ? "Confirmar despacho"
                                        : "Confirmar recepción"}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
}