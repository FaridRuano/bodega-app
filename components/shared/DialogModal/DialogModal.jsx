"use client";

import { AlertTriangle, CheckCircle2, Info, X, XCircle } from "lucide-react";
import { useEffect } from "react";

const VARIANT_CONFIG = {
    info: {
        icon: Info,
        iconClassName: "modal-icon modal-icon--info",
        confirmButtonClassName: "btn btn-primary",
        defaultTitle: "Información",
        defaultConfirmText: "Aceptar",
    },
    success: {
        icon: CheckCircle2,
        iconClassName: "modal-icon modal-icon--success",
        confirmButtonClassName: "btn btn-primary",
        defaultTitle: "Operación completada",
        defaultConfirmText: "Aceptar",
    },
    warning: {
        icon: AlertTriangle,
        iconClassName: "modal-icon modal-icon--warning",
        confirmButtonClassName: "btn btn-primary",
        defaultTitle: "Confirmación",
        defaultConfirmText: "Confirmar",
    },
    danger: {
        icon: XCircle,
        iconClassName: "modal-icon modal-icon--danger",
        confirmButtonClassName: "btn btn-danger",
        defaultTitle: "Acción delicada",
        defaultConfirmText: "Eliminar",
    },
};

export default function DialogModal({
    open,
    title,
    message,
    variant = "info",
    confirmText,
    cancelText = "Cancelar",
    showCancel = false,
    loading = false,
    onConfirm,
    onClose,
}) {

    const config = VARIANT_CONFIG[variant] || VARIANT_CONFIG.info;
    const Icon = config.icon;

    function handleConfirm() {
        if (loading) return;
        onConfirm?.();
    }

    function handleClose() {
        if (loading) return;
        onClose?.();
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
            <div className="modal-container" onClick={(event) => event.stopPropagation()}>
                <div className="modal-top">
                    <div className="modal-headerContent">
                        <div className={config.iconClassName}>
                            <Icon size={20} />
                        </div>

                        <div>
                            <h3 className="modal-title">{title || config.defaultTitle}</h3>
                            <p className="modal-description">{message}</p>
                        </div>
                    </div>

                    <button
                        type="button"
                        className="modal-close"
                        onClick={handleClose}
                        aria-label="Cerrar modal"
                    >
                        <X size={18} />
                    </button>
                </div>

                <div className="modal-footer">
                    {showCancel && (
                        <button
                            type="button"
                            className="btn btn-secondary"
                            onClick={handleClose}
                            disabled={loading}
                        >
                            {cancelText}
                        </button>
                    )}

                    <button
                        type="button"
                        className={config.confirmButtonClassName}
                        onClick={handleConfirm}
                        disabled={loading}
                    >
                        {loading ? "Procesando..." : confirmText || config.defaultConfirmText}
                    </button>
                </div>
            </div>
        </div>
    );
}