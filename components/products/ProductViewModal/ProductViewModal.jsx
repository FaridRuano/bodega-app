"use client";

import {
  Archive,
  Box,
  ClipboardList,
  Package,
  PencilLine,
  Power,
  Tag,
  ThermometerSnowflake,
  Trash,
  X,
} from "lucide-react";

import styles from "./product-view-modal.module.scss";
import { useEffect } from "react";
import { getUnitLabel } from "@libs/constants/units";


const PRODUCT_TYPE_LABELS = {
  raw_material: "Materia prima",
  processed: "Procesado",
  prepared: "Preparado",
  supply: "Insumo",
};

const STORAGE_TYPE_LABELS = {
  ambient: "Ambiente",
  refrigerated: "Refrigerado",
  frozen: "Congelado",
};

function formatBoolean(value, truthyLabel = "Sí", falsyLabel = "No") {
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
    minStock,
    reorderPoint,
    isActive,
    notes,
    inventory,
  } = product;

  const totalInventory = Number(inventory?.total ?? 0);
  const warehouseInventory = Number(inventory?.warehouse ?? 0);
  const kitchenInventory = Number(inventory?.kitchen ?? 0);
  const reservedInventory = Number(inventory?.reserved ?? 0);
  const availableInventory =
    typeof inventory?.available !== "undefined"
      ? Number(inventory.available ?? 0)
      : Math.max(totalInventory - reservedInventory, 0);

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="modal-container modal-container--xl" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <div>
            <div className="product-view-topline">
              <span
                className={`product-view-status ${isActive
                  ? "product-view-status--active"
                  : "product-view-status--inactive"
                  }`}
              >
                {isActive ? "Activo" : "Inactivo"}
              </span>

              <span className="product-view-type">
                {PRODUCT_TYPE_LABELS[productType] || productType}
              </span>
            </div>

            <h3 className="modal-title">{name}</h3>

            <p className="modal-description">
              {description || "Sin descripción registrada."}
            </p>
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

        <div className="modal-body">
          <section className={styles.productviewsection}>
            <div className={styles.productviewsectionheader}>
              <h4 className="product-view-sectionTitle">Información general</h4>
            </div>

            <div className={styles.productviewgrid}>
              <div className={styles.productviewitem}>
                <div className={styles.productviewitemLabel}>
                  <Package size={15} />
                  <span>Código</span>
                </div>
                <p className={styles.productviewitemValue}>
                  {code || "Sin código"}
                </p>
              </div>

              <div className={styles.productviewitem}>
                <div className={styles.productviewitemLabel}>
                  <Tag size={15} />
                  <span>Categoría</span>
                </div>
                <p className={styles.productviewitemValue}>
                  {category?.name || categoryName || "Sin categoría"}
                </p>
              </div>

              <div className={styles.productviewitem}>
                <div className={styles.productviewitemLabel}>
                  <Box size={15} />
                  <span>Unidad</span>
                </div>
                <p className={styles.productviewitemValue}>
                  {getUnitLabel(unit)}
                </p>
              </div>

              <div className={styles.productviewitem}>
                <div className={styles.productviewitemLabel}>
                  <Archive size={15} />
                  <span>Tipo</span>
                </div>
                <p className={styles.productviewitemValue}>
                  {PRODUCT_TYPE_LABELS[productType] || productType}
                </p>
              </div>

              <div className={styles.productviewitem}>
                <div className={styles.productviewitemLabel}>
                  <ThermometerSnowflake size={15} />
                  <span>Almacenamiento</span>
                </div>
                <p className={styles.productviewitemValue}>
                  {STORAGE_TYPE_LABELS[storageType] || storageType}
                </p>
              </div>

              <div className={styles.productviewitem}>
                <div className={styles.productviewitemLabel}>
                  <ClipboardList size={15} />
                  <span>Permite producción</span>
                </div>
                <p className={styles.productviewitemValue}>
                  {formatBoolean(allowsProduction)}
                </p>
              </div>

              <div className={styles.productviewitem}>
                <div className={styles.productviewitemLabel}>
                  <ClipboardList size={15} />
                  <span>Controla stock</span>
                </div>
                <p className={styles.productviewitemValue}>
                  {formatBoolean(tracksStock)}
                </p>
              </div>

              <div className={styles.productviewitem}>
                <div className={styles.productviewitemLabel}>
                  <ClipboardList size={15} />
                  <span>Stock mínimo</span>
                </div>
                <p className={styles.productviewitemValue}>
                  {formatNumber(minStock)}
                </p>
              </div>

              <div className={styles.productviewitem}>
                <div className={styles.productviewitemLabel}>
                  <ClipboardList size={15} />
                  <span>Punto de reposición</span>
                </div>
                <p className={styles.productviewitemValue}>
                  {formatNumber(reorderPoint)}
                </p>
              </div>
            </div>
          </section>

          <section className={styles.productviewsection}>
            <div className={styles.productviewsectionHeader}>
              <h4 className={styles.productviewsectionTitle}>Inventario actual</h4>
            </div>

            <div className={styles.productviewinventoryGrid}>
              <div className={styles.productviewstatCard}>
                <span className={styles.productviewstatLabel}>Total</span>
                <strong className={styles.productviewstatValue}>
                  {formatNumber(totalInventory)}
                </strong>
              </div>

              <div className={styles.productviewstatCard}>
                <span className={styles.productviewstatLabel}>Disponible</span>
                <strong className={styles.productviewstatValue}>
                  {formatNumber(availableInventory)}
                </strong>
              </div>

              <div className={styles.productviewstatCard}>
                <span className={styles.productviewstatLabel}>Bodega</span>
                <strong className={styles.productviewstatValue}>
                  {formatNumber(warehouseInventory)}
                </strong>
              </div>

              <div className={styles.productviewstatCard}>
                <span className={styles.productviewstatLabel}>Cocina</span>
                <strong className={styles.productviewstatValue}>
                  {formatNumber(kitchenInventory)}
                </strong>
              </div>

              <div className={styles.productviewstatCard}>
                <span className={styles.productviewstatLabel}>Reservado</span>
                <strong className={styles.productviewstatValue}>
                  {formatNumber(reservedInventory)}
                </strong>
              </div>
            </div>
          </section>

          <section className={styles.productviewsection}>
            <div className={styles.productviewsectionHeader}>
              <h4 className={styles.productviewsectionTitle}>Notas</h4>
            </div>

            <div className={styles.productviewnotesBox}>
              <p className={styles.productviewnotestext}>
                {notes || "Sin notas registradas."}
              </p>
            </div>
          </section>
        </div>

        <div className="modal-footer">

          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => onEdit?.(product)}
            disabled={loading}
          >
            <PencilLine size={16} />
            Editar
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => onDelete?.(product)}
            disabled={loading}
          >
            <Trash size={16} />
            Eliminar
          </button>

          <button
            type="button"
            className={isActive ? "btn btn-danger" : "btn btn-primary"}
            onClick={() => onToggleActive?.(product)}
            disabled={loading}
          >
            <Power size={16} />
            {isActive ? "Desactivar producto" : "Activar producto"}
          </button>
        </div>
      </div>
    </div>
  );
}