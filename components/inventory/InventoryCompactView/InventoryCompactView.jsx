"use client";

import {
  ArrowDownToLine,
  ArrowRightLeft,
  ArrowUpFromLine,
} from "lucide-react";

import styles from "./inventory-compact-view.module.scss";
import { getInventoryStatusLabel } from "@libs/constants/domainLabels";
import { getUnitLabel } from "@libs/constants/units";

export default function InventoryCompactView({
  products,
  isLoading,
  onEntry,
  onExit,
  onTransfer,
  getStatusClass,
  showActions = true,
  scope = "all",
  scopeLabel = "",
}) {
  const isGeneralScope = scope === "all";
  const quantityLabel = scopeLabel || "Cantidad";
  const gridTemplateColumns = isGeneralScope
    ? "minmax(180px, 2fr) repeat(4, minmax(46px, 0.55fr)) minmax(122px, auto)"
    : showActions
      ? "minmax(180px, 2fr) minmax(46px, 0.55fr) minmax(122px, auto)"
      : "minmax(180px, 2fr) minmax(46px, 0.55fr)";

  if (isLoading) {
    return (
      <div className={styles.tableWrap}>
        <div className={styles.tableHeader} style={{ gridTemplateColumns }} data-scope={scope}>
          <span>Producto</span>
          {isGeneralScope ? (
            <>
              <span>Total</span>
              <span>Bodega</span>
              <span>Cocina</span>
              <span>Salon</span>
            </>
          ) : (
            <span>{quantityLabel}</span>
          )}
          {showActions ? <span className={styles.actionsHeaderSpacer} aria-hidden="true" /> : null}
        </div>

        <div className={styles.tableBody}>
          {Array.from({ length: 8 }).map((_, index) => (
            <div
              key={`inventory-compact-skeleton-${index}`}
              className={`${styles.tableRow} ${styles.skeletonRow} shimmerBlock pulseSoft`}
              style={{ gridTemplateColumns }}
            >
              <span className={styles.skeletonName} />
              <span className={styles.skeletonValue} />
              {isGeneralScope ? (
                <>
                  <span className={styles.skeletonValue} />
                  <span className={styles.skeletonValue} />
                  <span className={styles.skeletonValue} />
                </>
              ) : null}
              {showActions ? <span className={styles.skeletonActions} /> : null}
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (products.length === 0) {
    return <div className={styles.emptyState}>No se encontraron productos para mostrar.</div>;
  }

  return (
    <div className={styles.tableWrap}>
      <div className={styles.tableHeader} style={{ gridTemplateColumns }} data-scope={scope}>
        <span>Producto</span>
        {isGeneralScope ? (
          <>
            <span>Total</span>
            <span>Bodega</span>
            <span>Cocina</span>
            <span>Salon</span>
          </>
        ) : (
          <span>{quantityLabel}</span>
        )}
        {showActions ? <span className={styles.actionsHeaderSpacer} aria-hidden="true" /> : null}
      </div>

      <div className={styles.tableBody}>
        {products.map((product, index) => (
          <article
            key={product._id}
            className={`${styles.tableRow} fadeSlideIn`}
            style={{ animationDelay: `${0.02 * index}s`, gridTemplateColumns }}
            data-scope={scope}
          >
            <div className={styles.productCell}>
              <div className={styles.productMain}>
                <strong className={styles.productName}>{product.name}</strong>
                <span className={styles.productMeta}>
                  {product.code || "Sin codigo"} · {getUnitLabel(product.unit)}
                </span>
              </div>
              <span className={`${styles.statusBadge} ${getStatusClass(product.status, styles)}`}>
                {getInventoryStatusLabel(product.status)}
              </span>
            </div>

            {isGeneralScope ? (
              <>
                <strong className={styles.amountCell}>{product.inventory?.total || 0}</strong>
                <span className={styles.amountCell}>{product.inventory?.warehouse || 0}</span>
                <span className={styles.amountCell}>{product.inventory?.kitchen || 0}</span>
                <span className={styles.amountCell}>{product.inventory?.lounge || 0}</span>
              </>
            ) : (
              <strong className={styles.amountCell}>{product.inventory?.[scope] || 0}</strong>
            )}

            {showActions ? (
              <div className={styles.actionsCell}>
                <button
                  type="button"
                  className="action-button action-button--neutral"
                  onClick={() => onEntry(product)}
                >
                  <span className="action-button__icon">
                    <ArrowDownToLine size={14} />
                  </span>
                  <span className="action-button__label">Agregar</span>
                </button>

                <button
                  type="button"
                  className="action-button action-button--neutral"
                  onClick={() => onExit(product)}
                >
                  <span className="action-button__icon">
                    <ArrowUpFromLine size={14} />
                  </span>
                  <span className="action-button__label">Retirar</span>
                </button>

                {isGeneralScope ? (
                  <button
                    type="button"
                    className="action-button action-button--neutral"
                    onClick={() => onTransfer(product)}
                  >
                    <span className="action-button__icon">
                      <ArrowRightLeft size={14} />
                    </span>
                    <span className="action-button__label">Transferir</span>
                  </button>
                ) : null}
              </div>
            ) : null}
          </article>
        ))}
      </div>
    </div>
  );
}
