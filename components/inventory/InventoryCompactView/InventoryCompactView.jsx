"use client";

import { useEffect, useRef, useState } from "react";
import {
  ArrowDownToLine,
  ArrowRightLeft,
  ArrowUpFromLine,
} from "lucide-react";

import styles from "./inventory-compact-view.module.scss";
import { getInventoryStatusLabel } from "@libs/constants/domainLabels";
import { getUnitLabel } from "@libs/constants/units";
import { formatQuantity } from "@libs/unitQuantities";

export default function InventoryCompactView({
  products,
  isLoading,
  onEntry,
  onExit,
  onTransfer,
  getStatusClass,
  canAdjust = true,
  canTransfer = true,
  scope = "all",
  scopeLabel = "",
  visibleLocations = [],
}) {
  const wrapperRef = useRef(null);
  const [activeProductId, setActiveProductId] = useState("");
  const isGeneralScope = scope === "all";
  const hasCustomLocations = Array.isArray(visibleLocations) && visibleLocations.length > 0;
  const showActions = canAdjust || canTransfer;
  const quantityLabel = scopeLabel || "Cantidad";
  const gridTemplateColumns = isGeneralScope
    ? showActions
      ? "minmax(180px, 2fr) repeat(4, minmax(46px, 0.55fr)) 116px"
      : "minmax(180px, 2fr) repeat(4, minmax(46px, 0.55fr))"
    : hasCustomLocations
      ? showActions
        ? `minmax(180px, 2fr) repeat(${visibleLocations.length}, minmax(46px, 0.55fr)) 116px`
        : `minmax(180px, 2fr) repeat(${visibleLocations.length}, minmax(46px, 0.55fr))`
    : showActions
      ? "minmax(180px, 2fr) minmax(46px, 0.55fr) 116px"
      : "minmax(180px, 2fr) minmax(46px, 0.55fr)";

  useEffect(() => {
    function handlePointerDown(event) {
      if (!wrapperRef.current?.contains(event.target)) {
        setActiveProductId("");
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, []);

  function handleRowClick(productId) {
    if (!showActions) return;
    setActiveProductId((currentProductId) =>
      currentProductId === productId ? "" : productId
    );
  }

  if (isLoading) {
    return (
      <div className={styles.tableWrap}>
        <div className={styles.tableHeader} style={{ gridTemplateColumns }} data-scope={scope} data-combined={hasCustomLocations ? "true" : "false"}>
          <span>Producto</span>
          {isGeneralScope ? (
            <>
              <span>Total</span>
              <span>Bodega</span>
              <span>Cocina</span>
              <span>Salon</span>
            </>
          ) : hasCustomLocations ? (
            visibleLocations.map((location) => (
              <span key={location.value}>{location.label}</span>
            ))
          ) : (
            <span>{quantityLabel}</span>
          )}
          {showActions ? <span className={styles.actionsHeaderSpacer} aria-hidden="true" /> : null}
          <span className={styles.statusHeaderSpacer} aria-hidden="true" />
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
    <div className={styles.tableWrap} ref={wrapperRef}>
      <div className={styles.tableHeader} style={{ gridTemplateColumns }} data-scope={scope} data-combined={hasCustomLocations ? "true" : "false"}>
        <span>Producto</span>
        {isGeneralScope ? (
          <>
            <span>Total</span>
            <span>Bodega</span>
            <span>Cocina</span>
            <span>Salon</span>
          </>
        ) : hasCustomLocations ? (
          visibleLocations.map((location) => (
            <span key={location.value}>{location.label}</span>
          ))
        ) : (
          <span>{quantityLabel}</span>
        )}
        {showActions ? <span className={styles.actionsHeaderSpacer} aria-hidden="true" /> : null}
      </div>

      <div className={styles.tableBody}>
        {products.map((product, index) => (
          <article
            key={product._id}
            className={`${styles.tableRow} ${activeProductId === product._id ? styles.activeRow : ""} fadeSlideIn`}
            style={{ animationDelay: `${0.02 * index}s`, gridTemplateColumns }}
            data-scope={scope}
            data-combined={hasCustomLocations ? "true" : "false"}
            data-status={product.status || "available"}
            onClick={() => handleRowClick(product._id)}
            onMouseLeave={() => {
              if (activeProductId === product._id) {
                setActiveProductId("");
              }
            }}
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
                <strong className={styles.amountCell}>{formatQuantity(product.inventory?.total)}</strong>
                <span className={styles.amountCell}>{formatQuantity(product.inventory?.warehouse)}</span>
                <span className={styles.amountCell}>{formatQuantity(product.inventory?.kitchen)}</span>
                <span className={styles.amountCell}>{formatQuantity(product.inventory?.lounge)}</span>
              </>
            ) : hasCustomLocations ? (
              visibleLocations.map((location) => (
                <strong key={location.value} className={styles.amountCell}>
                  {formatQuantity(product.inventory?.[location.value])}
                </strong>
              ))
            ) : (
              <strong className={styles.amountCell}>{formatQuantity(product.inventory?.[scope])}</strong>
            )}

            {showActions ? (
              <div
                className={styles.actionsCell}
                onClick={(event) => event.stopPropagation()}
              >
                {canAdjust ? (
                  <>
                    <button
                      type="button"
                      className="action-button action-button--neutral"
                      onClick={() => onEntry(product)}
                      title="Agregar inventario"
                      aria-label="Agregar inventario"
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
                      title="Retirar inventario"
                      aria-label="Retirar inventario"
                    >
                      <span className="action-button__icon">
                        <ArrowUpFromLine size={14} />
                      </span>
                      <span className="action-button__label">Retirar</span>
                    </button>
                  </>
                ) : null}

                {canTransfer ? (
                  <button
                    type="button"
                    className="action-button action-button--neutral"
                    onClick={() => onTransfer(product)}
                    title="Transferir inventario"
                    aria-label="Transferir inventario"
                  >
                    <span className="action-button__icon">
                      <ArrowRightLeft size={14} />
                    </span>
                    <span className="action-button__label">Transferir</span>
                  </button>
                ) : null}
              </div>
            ) : null}
            <span className={styles.mobileStatusMarker} aria-hidden="true" />
          </article>
        ))}
      </div>
    </div>
  );
}
