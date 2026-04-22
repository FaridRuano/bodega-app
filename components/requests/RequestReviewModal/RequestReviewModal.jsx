"use client";

import { useEffect, useMemo } from "react";
import { CheckCircle2, XCircle, X } from "lucide-react";

import styles from "./request-review-modal.module.scss";
import { getUnitLabel } from "@libs/constants/units";

function toNumber(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
}

export default function RequestReviewModal({
    open,
    mode = "approve", // approve | reject
    request,
    reviewData,
    onChange,
    onItemChange,
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

    const isApprove = mode === "approve";

    const hasAtLeastOneApprovedItem = useMemo(() => {
        if (!isApprove) return true;

        return (request?.items || []).some((item, index) => {
            const approvedQuantity = toNumber(
                reviewData?.items?.[index]?.approvedQuantity ?? 0
            );
            return approvedQuantity > 0;
        });
    }, [isApprove, request, reviewData]);

    const canSubmit =
        !isSubmitting &&
        (isApprove
            ? hasAtLeastOneApprovedItem
            : Boolean(reviewData?.notes?.trim?.()));

    function handleApprovedQuantityChange(index, requestedQuantity, value) {
        if (value === "") {
            onItemChange(index, "approvedQuantity", "");
            return;
        }

        const requested = toNumber(requestedQuantity);
        let nextValue = Number(value);

        if (Number.isNaN(nextValue)) {
            nextValue = 0;
        }

        if (nextValue < 0) {
            nextValue = 0;
        }

        if (nextValue > requested) {
            nextValue = requested;
        }

        onItemChange(index, "approvedQuantity", String(nextValue));
    }

    function handleSubmit(event) {
        event.preventDefault();

        if (!canSubmit) {
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
                            className={`modal-icon ${isApprove ? "modal-icon--success" : "modal-icon--danger"
                                }`}
                        >
                            {isApprove ? (
                                <CheckCircle2 size={20} />
                            ) : (
                                <XCircle size={20} />
                            )}
                        </div>

                        <div>
                            <h2 className="modal-title">
                                {isApprove ? "Procesar solicitud" : "Rechazar solicitud"}
                            </h2>
                            <p className="modal-description">
                                {isApprove
                                    ? "Define las cantidades que avanzan al proceso para cada producto."
                                    : "Indica el motivo del rechazo."}
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
                    <form className={styles.form} onSubmit={handleSubmit}>
                        {isApprove ? (
                            <div className={styles.itemsSection}>
                                {(request.items || []).map((item, index) => {
                                    const requestedQuantity = toNumber(
                                        item.requestedQuantity
                                    );
                                    const approvedQuantity =
                                        reviewData?.items?.[index]?.approvedQuantity ?? "";

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

                                            <div className={styles.itemInputs}>
                                                <div className="form-field">
                                                    <label className="form-label">
                                                        Solicitado
                                                    </label>
                                                    <input
                                                        type="number"
                                                        className="form-input"
                                                        value={requestedQuantity}
                                                        disabled
                                                    />
                                                </div>

                                                <div className="form-field">
                                                    <label className="form-label">
                                                        En proceso
                                                    </label>
                                                    <input
                                                        type="number"
                                                        min="0"
                                                        max={requestedQuantity}
                                                        step="0.01"
                                                        className="form-input"
                                                        value={approvedQuantity}
                                                        onChange={(event) =>
                                                            handleApprovedQuantityChange(
                                                                index,
                                                                requestedQuantity,
                                                                event.target.value
                                                            )
                                                        }
                                                        disabled={isSubmitting}
                                                        required
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}

                                {!hasAtLeastOneApprovedItem ? (
                                    <p className={styles.errorText}>
                                        Debes definir al menos una cantidad mayor a cero.
                                    </p>
                                ) : null}
                            </div>
                        ) : null}

                        <div className="form-field">
                            <label className="form-label">
                                {isApprove ? "Notas (opcional)" : "Motivo (obligatorio)"}
                            </label>

                            <textarea
                                name="notes"
                                className="form-textarea"
                                value={reviewData?.notes || ""}
                                onChange={onChange}
                                required={!isApprove}
                                disabled={isSubmitting}
                                placeholder={
                                    isApprove
                                        ? "Notas de aprobación"
                                        : "Motivo del rechazo"
                                }
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
                                className={`btn ${isApprove ? "btn-primary" : "btn-danger"}`}
                                disabled={!canSubmit}
                            >
                                {isSubmitting
                                    ? "Procesando..."
                                    : isApprove
                                        ? "Procesar"
                                        : "Rechazar"}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
}
