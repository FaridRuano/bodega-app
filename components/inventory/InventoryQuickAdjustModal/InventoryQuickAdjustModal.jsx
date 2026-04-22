"use client";

import { useEffect } from "react";
import { PackageMinus, PackagePlus, X } from "lucide-react";

import styles from "./inventory-quick-adjust-modal.module.scss";
import { getUnitLabel } from "@libs/constants/units";

const MODE_CONFIG = {
  entry: {
    title: "Agregar inventario",
    description: "Registra un ajuste manual rapido para este producto.",
    icon: PackagePlus,
    iconClass: "modal-icon modal-icon--success",
    submitLabel: "Registrar entrada",
  },
  exit: {
    title: "Retirar inventario",
    description: "Registra una salida manual rapida para este producto.",
    icon: PackageMinus,
    iconClass: "modal-icon modal-icon--warning",
    submitLabel: "Registrar salida",
  },
};

export default function InventoryQuickAdjustModal({
  open,
  mode = "entry",
  product,
  formData,
  onChange,
  onClose,
  onSubmit,
  isSubmitting = false,
  scopeLabel = "",
  currentStock = 0,
}) {
  const config = MODE_CONFIG[mode] || MODE_CONFIG.entry;
  const Icon = config.icon;
  const numericQuantity = Number(formData.quantity || 0);
  const exceedsAvailableStock =
    mode === "exit" && numericQuantity > 0 && numericQuantity > Number(currentStock || 0);
  const isSubmitDisabled = isSubmitting || exceedsAvailableStock;

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
  }, [isSubmitting, onClose, open]);

  if (!open || !product) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className={`modal-container ${styles.quickModal}`}
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
            disabled={isSubmitting}
          >
            <X size={18} />
          </button>
        </div>

        <form
          className="modal-body"
          onSubmit={(event) => {
            event.preventDefault();
            if (exceedsAvailableStock) return;
            onSubmit(event);
          }}
        >
          <section className="modal-section fadeSlideIn">
            <div className={styles.productCard}>
              <div className={styles.productMain}>
                <div className={styles.productCopy}>
                  <p className={styles.productName}>{product.name}</p>
                  <p className={styles.productMeta}>
                    {scopeLabel} {currentStock} · {getUnitLabel(product.unit)}
                  </p>
                </div>
              </div>
            </div>
          </section>

          <section className="modal-section fadeSlideIn delayOne">
            <div className={styles.formGrid}>
              <div className="form-field">
                <label className="form-label" htmlFor="quick-movement-quantity">
                  Cantidad
                </label>
                <input
                  id="quick-movement-quantity"
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

              <div className="form-field">
                <label className="form-label" htmlFor="quick-movement-notes">
                  Nota
                </label>
                <textarea
                  id="quick-movement-notes"
                  name="notes"
                  className="form-textarea"
                  value={formData.notes}
                  onChange={onChange}
                  placeholder="Detalle breve del ajuste"
                  rows={3}
                />
              </div>
            </div>

            {exceedsAvailableStock ? (
              <div className={styles.helperCard}>
                <span className={styles.alertTitle}>Cantidad no disponible</span>
                <p className={styles.alertText}>
                  No puedes retirar mas de lo disponible actualmente en {scopeLabel.toLowerCase()}.
                </p>
              </div>
            ) : null}
          </section>

          <div className={`modal-footer ${styles.footer} fadeSlideIn delayTwo`}>
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
