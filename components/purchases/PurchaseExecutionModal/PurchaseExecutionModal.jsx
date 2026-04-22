"use client";

import { ShoppingCart, X } from "lucide-react";
import { useMemo } from "react";
import { getUnitLabel } from "@libs/constants/units";
import styles from "./purchase-execution-modal.module.scss";

function getCategoryId(item) {
  return String(item?.product?.categoryId?._id || item?.product?.categoryId || "");
}

function buildRenderableItems(shoppingList = [], purchaseDraft = {}) {
  const merged = new Map();

  shoppingList.forEach((item) => {
    merged.set(String(item.productId), item);
  });

  Object.values(purchaseDraft?.itemsByProduct || {}).forEach((item) => {
    const productId = String(item?.productId || "");
    if (!productId || merged.has(productId)) return;

    merged.set(productId, {
      productId,
      product: item.product || null,
      pendingQuantity: item.pendingQuantity || 0,
      unitSnapshot: item.unitSnapshot || item.product?.unit || "",
      requests: [],
    });
  });

  return Array.from(merged.values());
}

function buildGroupedShoppingList(items = [], families = [], categories = []) {
  const familyOrder = new Map(families.map((family, index) => [String(family._id), index]));
  const categoryMap = new Map(categories.map((category) => [String(category._id), category]));
  const familyGroups = new Map();

  items.forEach((item) => {
    const category = categoryMap.get(getCategoryId(item));
    const family = category?.familyId || null;
    const familyId = String(family?._id || family || "ungrouped");
    const familyName = family?.name || "Sin familia";
    const categoryId = String(category?._id || "uncategorized");
    const categoryName = category?.name || "Sin categoria";

    if (!familyGroups.has(familyId)) {
      familyGroups.set(familyId, {
        familyId,
        familyName,
        order: familyOrder.get(familyId) ?? Number.MAX_SAFE_INTEGER,
        categories: new Map(),
      });
    }

    const familyGroup = familyGroups.get(familyId);

    if (!familyGroup.categories.has(categoryId)) {
      familyGroup.categories.set(categoryId, {
        categoryId,
        categoryName,
        items: [],
      });
    }

    familyGroup.categories.get(categoryId).items.push(item);
  });

  return Array.from(familyGroups.values())
    .sort((a, b) => {
      if (a.order !== b.order) return a.order - b.order;
      return a.familyName.localeCompare(b.familyName);
    })
    .map((familyGroup) => ({
      ...familyGroup,
      categories: Array.from(familyGroup.categories.values())
        .sort((a, b) => a.categoryName.localeCompare(b.categoryName))
        .map((categoryGroup) => ({
          ...categoryGroup,
          items: [...categoryGroup.items].sort((a, b) =>
            (a.product?.name || "").localeCompare(b.product?.name || "")
          ),
        })),
    }));
}

export default function PurchaseExecutionModal({
  open,
  purchaseDraft,
  shoppingList = [],
  families = [],
  categories = [],
  isSubmitting = false,
  hasSelectedItems = false,
  hasDraftData = false,
  isDraft = false,
  onClose,
  onSubmit,
  onSaveDraft,
  onDeleteDraft,
  onDraftChange,
  onItemChange,
}) {
  const renderableItems = useMemo(
    () => buildRenderableItems(shoppingList, purchaseDraft),
    [purchaseDraft, shoppingList]
  );

  const groupedShoppingList = useMemo(
    () => buildGroupedShoppingList(renderableItems, families, categories),
    [categories, families, renderableItems]
  );

  if (!open) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className={`modal-container ${styles.largeModal}`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-top">
          <div className="modal-headerContent">
            <div className="modal-icon modal-icon--success">
              <ShoppingCart size={20} />
            </div>
            <div>
              <h2 className="modal-title">
                {isDraft ? "Editar borrador de compra" : "Registrar compra"}
              </h2>
              <p className="modal-description">
                Guarda avances mientras compras y registra la compra final solo cuando termines.
              </p>
            </div>
          </div>

          <button type="button" className="modal-close" onClick={onClose} disabled={isSubmitting}>
            <X size={18} />
          </button>
        </div>

        <form className={styles.modalForm} onSubmit={onSubmit}>
          <div className={styles.purchaseHeader}>
            <input
              type="text"
              className="form-input"
              placeholder="Proveedor opcional"
              value={purchaseDraft.supplierName}
              onChange={(event) => onDraftChange("supplierName", event.target.value)}
            />

            <input
              type="datetime-local"
              className="form-input"
              value={purchaseDraft.purchasedAt}
              onChange={(event) => onDraftChange("purchasedAt", event.target.value)}
            />

            <input
              type="text"
              className="form-input"
              placeholder="Nota general"
              value={purchaseDraft.note}
              onChange={(event) => onDraftChange("note", event.target.value)}
            />
          </div>

          <div className={styles.purchaseList}>
            {renderableItems.length === 0 ? (
              <div className={styles.emptyState}>No hay pendientes aprobados para ejecutar.</div>
            ) : (
              groupedShoppingList.map((familyGroup) => (
                <section key={familyGroup.familyId} className={styles.familySection}>
                  <div className={styles.familyHeader}>
                    <span className={styles.familyEyebrow}>Familia</span>
                    <h3 className={styles.familyTitle}>{familyGroup.familyName}</h3>
                  </div>

                  {familyGroup.categories.map((categoryGroup) => (
                    <div key={categoryGroup.categoryId} className={styles.categoryBlock}>
                      <div className={styles.categoryLabel}>{categoryGroup.categoryName}</div>

                      <div className={styles.categoryItems}>
                        {categoryGroup.items.map((item) => {
                          const draftItem = purchaseDraft.itemsByProduct[item.productId] || {
                            productId: item.productId,
                            product: item.product,
                            quantity: "",
                            unitCost: "",
                            note: "",
                            pendingQuantity: item.pendingQuantity,
                            unitSnapshot: item.unitSnapshot,
                          };
                          const isSelected = Number(draftItem.quantity) > 0;

                          return (
                            <article
                              key={item.productId}
                              className={`${styles.purchaseRow} ${isSelected ? styles.purchaseRowSelected : ""}`}
                            >
                              <div className={styles.purchaseRowLayout}>
                                <div className={styles.productInfo}>
                                  <strong>{item.product?.name || "Producto"}</strong>
                                </div>

                                <div className={styles.pendingInline}>
                                  <span>Pendiente</span>
                                  <strong>{item.pendingQuantity}</strong>
                                </div>

                                <div className={styles.unitInline}>
                                  <span className={styles.unitBadge}>
                                    {getUnitLabel(item.unitSnapshot)}
                                  </span>
                                </div>

                                <div className={styles.compactField}>
                                  <input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    className={`form-input ${styles.compactInput}`}
                                    value={draftItem.quantity}
                                    onChange={(event) => onItemChange(item.productId, "quantity", event.target.value)}
                                    placeholder="Cantidad"
                                  />
                                </div>

                                <div className={styles.compactField}>
                                  <input
                                    type="number"
                                    min="0"
                                    step="0.0001"
                                    className={`form-input ${styles.compactInput}`}
                                    value={draftItem.unitCost}
                                    onChange={(event) => onItemChange(item.productId, "unitCost", event.target.value)}
                                    placeholder="Costo unit."
                                  />
                                </div>

                                <div className={`${styles.compactField} ${styles.noteField}`}>
                                  <input
                                    type="text"
                                    className="form-input"
                                    value={draftItem.note}
                                    onChange={(event) => onItemChange(item.productId, "note", event.target.value)}
                                    placeholder="Nota por item"
                                  />
                                </div>

                                <button
                                  type="button"
                                  className={`miniAction ${isSelected ? "" : "miniActionPrimary"} ${styles.completeButton}`}
                                  onClick={() =>
                                    onItemChange(
                                      item.productId,
                                      "quantity",
                                      isSelected ? "" : String(item.pendingQuantity)
                                    )
                                  }
                                >
                                  {isSelected ? "Quitar" : "Completar"}
                                </button>
                              </div>
                            </article>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </section>
              ))
            )}
          </div>

          <div className={`modal-footer ${styles.footerBar}`}>
            <div className={styles.desktopActions}>
              <button
                type="button"
                className="miniAction"
                onClick={onClose}
                disabled={isSubmitting}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="miniAction"
                onClick={onSaveDraft}
                disabled={isSubmitting || !hasDraftData}
              >
                {isSubmitting && !hasSelectedItems ? "Guardando..." : "Guardar borrador"}
              </button>
              {isDraft ? (
                <button
                  type="button"
                  className={`miniAction miniActionDanger ${styles.deleteDraftButton}`}
                  onClick={onDeleteDraft}
                  disabled={isSubmitting}
                >
                  Eliminar borrador
                </button>
              ) : null}
              <button
                type="submit"
                className="miniAction miniActionPrimary"
                disabled={isSubmitting || renderableItems.length === 0 || !hasSelectedItems}
              >
                {isSubmitting && hasSelectedItems ? "Registrando..." : "Registrar compra"}
              </button>
            </div>

            <div className={styles.mobileActions}>
              <button
                type="button"
                className={`miniAction ${styles.mobileCancelButton}`}
                onClick={onClose}
                disabled={isSubmitting}
              >
                Cancelar
              </button>

              <div className={styles.mobilePrimaryRow}>
                <button
                  type="button"
                  className="miniAction"
                  onClick={onSaveDraft}
                  disabled={isSubmitting || !hasDraftData}
                >
                  {isSubmitting && !hasSelectedItems ? "Guardando..." : "Guardar borrador"}
                </button>
                <button
                  type="submit"
                  className="miniAction miniActionPrimary"
                  disabled={isSubmitting || renderableItems.length === 0 || !hasSelectedItems}
                >
                  {isSubmitting && hasSelectedItems ? "Registrando..." : "Registrar compra"}
                </button>
              </div>

              {isDraft ? (
                <button
                  type="button"
                  className={`miniAction miniActionDanger ${styles.mobileDeleteButton}`}
                  onClick={onDeleteDraft}
                  disabled={isSubmitting}
                >
                  Eliminar borrador
                </button>
              ) : null}
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
