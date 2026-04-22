"use client";

import { useEffect } from "react";
import {
  Archive,
  Box,
  ClipboardList,
  ClipboardCheck,
  Package,
  PencilLine,
  Power,
  Scale,
  Tag,
  ThermometerSnowflake,
  Trash,
  X,
} from "lucide-react";

import styles from "./product-view-modal.module.scss";
import { getUnitLabel } from "@libs/constants/units";

const PRODUCT_TYPE_LABELS = {
  raw_material: "Materia prima",
  processed: "Procesado",
  prepared: "Preparado",
  supply: "Insumos y empaques",
  resale: "Producto para reventa",
};

const STORAGE_TYPE_LABELS = {
  ambient: "Ambiente",
  refrigerated: "Refrigerado",
  frozen: "Congelado",
};

function formatBoolean(value, truthyLabel = "Si", falsyLabel = "No") {
  return value ? truthyLabel : falsyLabel;
}

function formatNumber(value) {
  const numericValue = Number(value || 0);

  if (Number.isInteger(numericValue)) {
    return String(numericValue);
  }

  return numericValue.toFixed(2);
}

export default function ProductViewModal({
  open,
  product,
  loading = false,
  onClose,
  onEdit,
  onDelete,
  onToggleActive,
}) {
  useEffect(() => {
    function handleEscape(event) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    window.addEventListener("keydown", handleEscape);

    return () => {
      window.removeEventListener("keydown", handleEscape);
    };
  }, [onClose]);

  if (!open || !product) return null;

  const {
    code,
    name,
    description,
    category,
    categoryName,
    unit,
    productType,
    storageType,
    tracksStock,
    allowsProduction,
    requiresWeightControl,
    requiresDailyControl,
    minStock,
    reorderPoint,
    isActive,
    notes,
    inventory,
  } = product;

  const totalInventory = Number(inventory?.total ?? 0);
  const warehouseInventory = Number(inventory?.warehouse ?? 0);
  const kitchenInventory = Number(inventory?.kitchen ?? 0);
  const loungeInventory = Number(inventory?.lounge ?? 0);

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" onClick={onClose}>
      <div
        className={`modal-container modal-container--xl ${styles.modal}`}
        onClick={(event) => event.stopPropagation()}
      >

        <div className="modal-top">
          <div className="topCopy fadeScaleIn">
            <div className={styles.topline}>
              <span className={`${styles.status} ${isActive ? styles.statusActive : styles.statusInactive}`}>
                {isActive ? "Activo" : "Inactivo"}
              </span>
              <span className={styles.typeBadge}>
                {PRODUCT_TYPE_LABELS[productType] || productType}
              </span>

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
        </div>
        <div className="modal-header">
          {requiresWeightControl && (
            <span className={styles.weightBadge}>
              <Scale size={13} />
              Controlar Peso
            </span>
          )}
          <h3 className="modal-title">{name}</h3>

          <p className="modal-description">
            {description || "Sin descripcion registrada."}
          </p>
        </div>

        <div className="modal-body">
          <section className={`${styles.infoSection} fadeSlideIn`}>
            <div className={styles.sectionHeader}>
              <h4 className={styles.sectionTitle}>Informacion general</h4>
            </div>

            <div className={styles.infoGrid}>
              <div className={styles.infoItem}>
                <div className={styles.infoLabel}>
                  <Package size={15} />
                  <span>Codigo</span>
                </div>
                <p className={styles.infoValue}>{code || "Sin codigo"}</p>
              </div>

              <div className={styles.infoItem}>
                <div className={styles.infoLabel}>
                  <Tag size={15} />
                  <span>Categoria</span>
                </div>
                <p className={styles.infoValue}>
                  {category?.name || categoryName || "Sin categoria"}
                </p>
              </div>

              <div className={styles.infoItem}>
                <div className={styles.infoLabel}>
                  <Box size={15} />
                  <span>Unidad</span>
                </div>
                <p className={styles.infoValue}>{getUnitLabel(unit)}</p>
              </div>

              <div className={styles.infoItem}>
                <div className={styles.infoLabel}>
                  <Archive size={15} />
                  <span>Tipo</span>
                </div>
                <p className={styles.infoValue}>
                  {PRODUCT_TYPE_LABELS[productType] || productType}
                </p>
              </div>

              <div className={styles.infoItem}>
                <div className={styles.infoLabel}>
                  <ThermometerSnowflake size={15} />
                  <span>Almacenamiento</span>
                </div>
                <p className={styles.infoValue}>
                  {STORAGE_TYPE_LABELS[storageType] || storageType}
                </p>
              </div>

              <div className={styles.infoItem}>
                <div className={styles.infoLabel}>
                  <Scale size={15} />
                  <span>Controlar Peso</span>
                </div>
                <p className={styles.infoValue}>{formatBoolean(requiresWeightControl)}</p>
              </div>

              <div className={styles.infoItem}>
                <div className={styles.infoLabel}>
                  <ClipboardCheck size={15} />
                  <span>Control diario</span>
                </div>
                <p className={styles.infoValue}>{formatBoolean(requiresDailyControl)}</p>
              </div>

              <div className={styles.infoItem}>
                <div className={styles.infoLabel}>
                  <ClipboardList size={15} />
                  <span>Permite produccion</span>
                </div>
                <p className={styles.infoValue}>{formatBoolean(allowsProduction)}</p>
              </div>

              <div className={styles.infoItem}>
                <div className={styles.infoLabel}>
                  <ClipboardList size={15} />
                  <span>Controla stock</span>
                </div>
                <p className={styles.infoValue}>{formatBoolean(tracksStock)}</p>
              </div>

              {tracksStock && (
                <>
                  <div className={styles.infoItem}>
                    <div className={styles.infoLabel}>
                      <ClipboardList size={15} />
                      <span>Alerta de stock bajo</span>
                    </div>
                    <p className={styles.infoValue}>{formatNumber(minStock)}</p>
                  </div>

                  <div className={styles.infoItem}>
                    <div className={styles.infoLabel}>
                      <ClipboardList size={15} />
                      <span>Alerta de reposicion</span>
                    </div>
                    <p className={styles.infoValue}>{formatNumber(reorderPoint)}</p>
                  </div>
                </>
              )}
            </div>
          </section>

          {tracksStock && (
            <section className={`${styles.inventorySection} fadeSlideIn delayOne`}>
              <div className={styles.sectionHeader}>
                <h4 className={styles.sectionTitle}>Inventario actual</h4>
              </div>

              <div className={styles.inventoryGrid}>
                <div className={styles.statCard}>
                  <span className={styles.statLabel}>Total</span>
                  <strong className={styles.statValue}>{formatNumber(totalInventory)}</strong>
                </div>

                <div className={styles.statCard}>
                  <span className={styles.statLabel}>Bodega</span>
                  <strong className={styles.statValue}>{formatNumber(warehouseInventory)}</strong>
                </div>

                <div className={styles.statCard}>
                  <span className={styles.statLabel}>Cocina</span>
                  <strong className={styles.statValue}>{formatNumber(kitchenInventory)}</strong>
                </div>

                <div className={styles.statCard}>
                  <span className={styles.statLabel}>Salon</span>
                  <strong className={styles.statValue}>{formatNumber(loungeInventory)}</strong>
                </div>
              </div>
            </section>
          )}

          <section className={`${styles.notesSection} fadeSlideIn delayTwo`}>
            <div className={styles.sectionHeader}>
              <h4 className={styles.sectionTitle}>Notas</h4>
            </div>

            <div className={styles.notesBox}>
              <p className={styles.notesText}>{notes || "Sin notas registradas."}</p>
            </div>
          </section>
        </div>

        <div className={`modal-footer ${styles.footer} fadeSlideIn delayThree`}>
          <button
            type="button"
            className="action-button action-button--neutral"
            onClick={() => onEdit?.(product)}
            disabled={loading}
          >
            <span className="action-button__icon">
              <PencilLine size={16} />
            </span>
            <span className="action-button__label">Editar</span>
          </button>

          <button
            type="button"
            className="action-button action-button--danger"
            onClick={() => onDelete?.(product)}
            disabled={loading}
          >
            <span className="action-button__icon">
              <Trash size={16} />
            </span>
            <span className="action-button__label">Eliminar</span>
          </button>

          <button
            type="button"
            className={isActive ? "action-button action-button--danger" : "action-button"}
            onClick={() => onToggleActive?.(product)}
            disabled={loading}
          >
            <span className="action-button__icon">
              <Power size={16} />
            </span>
            <span className="action-button__label">
              {isActive ? "Desactivar" : "Activar"}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
