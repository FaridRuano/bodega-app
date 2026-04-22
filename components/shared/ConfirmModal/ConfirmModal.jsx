"use client";

import { useEffect } from "react";
import { AlertTriangle, Info, CheckCircle2, XCircle, X } from "lucide-react";

import styles from "./confirm-modal.module.scss";

const VARIANT_CONFIG = {
    danger: {
        icon: XCircle,
        iconClass: "modal-icon modal-icon--danger",
        confirmClass: "btn btn-danger",
    },
    warning: {
        icon: AlertTriangle,
        iconClass: "modal-icon modal-icon--warning",
        confirmClass: "btn btn-primary",
    },
    success: {
        icon: CheckCircle2,
        iconClass: "modal-icon modal-icon--success",
        confirmClass: "btn btn-primary",
    },
    info: {
        icon: Info,
        iconClass: "modal-icon modal-icon--info",
        confirmClass: "btn btn-primary",
    },
};

export default function ConfirmModal({
    open,
    title = "Confirmar acción",
    description = "¿Estás seguro de continuar?",
    confirmLabel = "Confirmar",
    cancelLabel = "Cancelar",
    variant = "warning",
    isSubmitting = false,
    onClose,
    onConfirm,
}) {
    const config = VARIANT_CONFIG[variant] || VARIANT_CONFIG.warning;
    const Icon = config.icon;

    useEffect(() => {
        function handleEscape(event) {
            if (event.key === "Escape" && open && !isSubmitting) {
                onClose();
            }
        }

        window.addEventListener("keydown", handleEscape);

        return () => {
            window.removeEventListener("keydown", handleEscape);
        };
    }, [open, isSubmitting, onClose]);

    if (!open) return null;

    function handleOverlayClick() {
        if (isSubmitting) return;
        onClose();
    }

    function handleConfirm(event) {
        event.preventDefault();
        onConfirm?.();
    }

    return (
        <div className="modal-overlay" onClick={handleOverlayClick}>
            <div
                className={`modal-container ${styles.confirmModal}`}
                onClick={(event) => event.stopPropagation()}
            >
                <div className="modal-top">
                    <div className="modal-headerContent">
                        <div className={config.iconClass}>
                            <Icon size={20} />
                        </div>

                        <div>
                            <h2 className="modal-title">{title}</h2>
                            <p className="modal-description">{description}</p>
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

                <form className={styles.form} onSubmit={handleConfirm}>
                    {/* <div className={`modal-body ${styles.body}`}>
                        <div className={styles.noticeBox}>
                            <p className={styles.noticeText}>{description}</p>
                        </div>
                    </div> */}

                    <div className="modal-footer">
                        <button
                            type="button"
                            className="btn btn-secondary"
                            onClick={onClose}
                            disabled={isSubmitting}
                        >
                            {cancelLabel}
                        </button>

                        <button
                            type="submit"
                            className={config.confirmClass}
                            disabled={isSubmitting}
                        >
                            {isSubmitting ? "Procesando..." : confirmLabel}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}