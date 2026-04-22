"use client";

import { useEffect, useMemo } from "react";
import { PackagePlus, Search, X } from "lucide-react";
import styles from "./purchase-request-modal.module.scss";

function getCategoryId(product) {
  return String(product?.category?._id || product?.categoryId || "");
}

function getCategoryName(product, categoriesMap) {
  const categoryId = getCategoryId(product);
  return categoriesMap.get(categoryId)?.name || product?.categoryName || "Sin categoria";
}

function buildFamilyGroups(products, families, categories) {
  const familyOrder = new Map(families.map((family, index) => [String(family._id), index]));
  const categoriesMap = new Map(categories.map((category) => [String(category._id), category]));
  const groups = new Map();

  products.forEach((product) => {
    const categoryId = getCategoryId(product);
    const category = categoriesMap.get(categoryId);
    const family = category?.familyId || null;
    const familyId = String(family?._id || family || "ungrouped");
    const familyName = family?.name || "Sin familia";

    if (!groups.has(familyId)) {
      groups.set(familyId, {
        familyId,
        familyName,
        order: familyOrder.get(familyId) ?? Number.MAX_SAFE_INTEGER,
        products: [],
      });
    }

    groups.get(familyId).products.push(product);
  });

  return Array.from(groups.values())
    .filter((group) => group.products.length > 0)
    .sort((a, b) => {
      if (a.order !== b.order) {
        return a.order - b.order;
      }

      return a.familyName.localeCompare(b.familyName);
    })
    .map((group) => ({
      ...group,
      products: [...group.products].sort((a, b) => a.name.localeCompare(b.name)),
    }));
}

export default function PurchaseRequestModal({
  open,
  mode = "create",
  isSubmitting = false,
  isLoading = false,
  families = [],
  categories = [],
  filteredCategories = [],
  products = [],
  showDestinationSelect = false,
  destinationOptions = [],
  search,
  familyId,
  categoryId,
  requestDraft,
  selectedItems = [],
  onSearchChange,
  onFamilyChange,
  onCategoryChange,
  onClearFilters,
  onToggleProduct,
  onItemChange,
  onNoteChange,
  onDestinationChange,
  onClose,
  onSubmit,
}) {
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

  const hasActiveFilters = Boolean(search.trim()) || Boolean(familyId) || Boolean(categoryId);

  const categoriesMap = useMemo(
    () => new Map(categories.map((category) => [String(category._id), category])),
    [categories]
  );

  const familyGroups = useMemo(
    () => buildFamilyGroups(products, families, categories),
    [categories, families, products]
  );

  if (!open) return null;

  return (
    <div className="modal-overlay">
      <div
        className={`modal-container ${styles.modalShell}`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className={`modal-top ${styles.modalHeader}`}>
            <div className="modal-headerContent">
            <div className="modal-icon modal-icon--info">
              <PackagePlus size={20} />
            </div>
            <div>
              <h2 className="modal-title">
                {mode === "edit" ? "Editar solicitud" : "Nueva solicitud"}
              </h2>
              <p className="modal-description">
                {mode === "edit"
                  ? "Ajusta los productos y cantidades mientras la solicitud siga pendiente."
                  : "Explora productos comprables por familia, revisa stock por ubicacion y arma una solicitud rapida."}
              </p>
            </div>
          </div>

          <button
            type="button"
            className="modal-close"
            onClick={onClose}
            disabled={isSubmitting}
            aria-label="Cerrar modal"
          >
            <X size={18} />
          </button>
        </div>

        <form className={styles.form} onSubmit={onSubmit}>
          <div className={styles.toolbar}>
            <div className="searchField">
              <Search size={16} />
              <input
                type="text"
                className="searchInput"
                placeholder="Buscar producto"
                value={search}
                onChange={(event) => onSearchChange(event.target.value)}
              />
            </div>

            <button
              type="button"
              className="miniAction"
              onClick={onClearFilters}
              disabled={!hasActiveFilters}
            >
              Limpiar filtros
            </button>
          </div>

          <div className={styles.filtersRow}>
            {showDestinationSelect ? (
              <div className="selectWrap">
                <select
                  value={requestDraft.destinationLocation || ""}
                  onChange={(event) => onDestinationChange(event.target.value)}
                  className="filterSelect"
                >
                  {destinationOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}

            <div className="selectWrap">
              <select
                value={familyId}
                onChange={(event) => onFamilyChange(event.target.value)}
                className="filterSelect"
              >
                <option value="">Todas las familias</option>
                {families.map((family) => (
                  <option key={family._id} value={family._id}>
                    {family.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="selectWrap">
              <select
                value={categoryId}
                onChange={(event) => onCategoryChange(event.target.value)}
                className="filterSelect"
              >
                <option value="">Todas las categorias</option>
                {filteredCategories.map((category) => (
                  <option key={category._id} value={category._id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className={styles.content}>
            <div className={styles.catalog}>
              {isLoading ? (
                <div className={styles.emptyState}>Cargando productos...</div>
              ) : familyGroups.length === 0 ? (
                <div className={styles.emptyState}>No hay productos para mostrar.</div>
              ) : (
                <div className={styles.groupList}>
                  {familyGroups.map((group) => (
                    <section key={group.familyId} className={styles.familySection}>
                      <div className={styles.familyHeader}>
                        <span className={styles.familyEyebrow}>Familia</span>
                        <h3 className={styles.familyTitle}>{group.familyName}</h3>
                      </div>

                      <div className={styles.productsList}>
                        {group.products.map((product, index) => {
                          const selectedItem = requestDraft.itemsByProduct[product._id];
                          const isSelected = Boolean(selectedItem);

                          return (
                            <article
                              key={product._id}
                              className={`fadeScaleIn ${styles.productCard} ${isSelected ? styles.productCardSelected : ""}`}
                              style={{ animationDelay: `${Math.min(index, 8) * 0.03}s` }}
                            >
                              <div className={styles.productRow}>
                                <div className={styles.productInfo}>
                                  <strong>{product.name}</strong>
                                  <span>{getCategoryName(product, categoriesMap)}</span>
                                </div>

                                <div className={styles.stockPills}>
                                  <span>Bod {product.inventory?.warehouse || 0}</span>
                                  <span>Coc {product.inventory?.kitchen || 0}</span>
                                  <span>Salon {product.inventory?.lounge || 0}</span>
                                </div>

                                <button
                                  type="button"
                                  className={`miniAction ${isSelected ? "" : "miniActionPrimary"}`}
                                  onClick={() => onToggleProduct(product)}
                                >
                                  {isSelected ? "Quitar" : "Agregar"}
                                </button>
                              </div>

                              {isSelected ? (
                                <div className={styles.productInputs}>
                                  <input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    className="form-input"
                                    value={selectedItem.requestedQuantity}
                                    onChange={(event) =>
                                      onItemChange(product._id, "requestedQuantity", event.target.value)
                                    }
                                    placeholder="Cantidad"
                                  />

                                  <input
                                    type="text"
                                    className="form-input"
                                    value={selectedItem.requesterNote}
                                    onChange={(event) =>
                                      onItemChange(product._id, "requesterNote", event.target.value)
                                    }
                                    placeholder="Nota opcional por item"
                                  />
                                </div>
                              ) : null}
                            </article>
                          );
                        })}
                      </div>
                    </section>
                  ))}
                </div>
              )}
            </div>

            <aside className={styles.summaryAside}>
              <div className={styles.summaryCard}>
                <span className={styles.summaryEyebrow}>Resumen</span>
                <h3 className={styles.summaryTitle}>{selectedItems.length} productos seleccionados</h3>

                <div className={styles.summaryList}>
                  {selectedItems.length === 0 ? (
                    <span className={styles.summaryHint}>Agrega productos para armar la solicitud.</span>
                  ) : (
                    selectedItems.map((item) => (
                      <div key={item.productId} className={styles.summaryRow}>
                        <span>{item.product?.name || "Producto"}</span>
                        <strong>{item.requestedQuantity}</strong>
                      </div>
                    ))
                  )}
                </div>

                <textarea
                  className={`form-input ${styles.summaryNote}`}
                  rows={5}
                  placeholder="Nota general opcional"
                  value={requestDraft.requesterNote}
                  onChange={(event) => onNoteChange(event.target.value)}
                />
              </div>
            </aside>
          </div>

          <div className={`modal-footer ${styles.footer}`}>
            <button
              type="button"
              className="miniAction"
              onClick={onClose}
              disabled={isSubmitting}
            >
              Cancelar
            </button>

            <button
              type="submit"
              className="miniAction miniActionPrimary"
              disabled={isSubmitting}
            >
              {isSubmitting ? "Guardando..." : mode === "edit" ? "Guardar cambios" : "Crear solicitud"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
