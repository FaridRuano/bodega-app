"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowDownToLine,
  ArrowRightLeft,
  ArrowUpFromLine,
  AlertTriangle,
  Boxes,
  LayoutGrid,
  List,
  PackageSearch,
  Search,
  Warehouse,
} from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import styles from "./page.module.scss";
import InventoryCompactView from "@components/inventory/InventoryCompactView/InventoryCompactView";
import InventoryMovementModal from "@components/inventory/InventoryModal/InventoryModal";
import InventoryProductPickerModal from "@components/inventory/InventoryProductPickerModal/InventoryProductPickerModal";
import InventoryQuickAdjustModal from "@components/inventory/InventoryQuickAdjustModal/InventoryQuickAdjustModal";
import DialogModal from "@components/shared/DialogModal/DialogModal";
import PaginationBar from "@components/shared/PaginationBar/PaginationBar";
import { getInventoryStatusLabel } from "@libs/constants/domainLabels";
import { PAGE_LIMITS } from "@libs/constants/pagination";
import { getUnitLabel } from "@libs/constants/units";
import { buildSearchParams, getPositiveIntParam, getStringParam } from "@libs/urlParams";

const PAGE_SIZE = PAGE_LIMITS.inventory;
const AUTO_REFRESH_INTERVAL_MS = 30000;
const INVENTORY_SCOPE_LABELS = {
  all: "General",
  warehouse: "Bodega",
  kitchen: "Cocina",
  lounge: "Salon",
};

function getAvailableScopesForRole(role = "") {
  switch (String(role || "").trim()) {
    case "kitchen":
      return ["all", "kitchen", "warehouse", "lounge"];
    case "loung":
      return ["all", "lounge", "warehouse", "kitchen"];
    case "warehouse":
      return ["all", "warehouse"];
    case "admin":
    default:
      return ["all", "warehouse", "kitchen", "lounge"];
  }
}

function getStatusClass(status, stylesRef) {
  switch (status) {
    case "low":
      return stylesRef.statusDanger;
    case "warning":
      return stylesRef.statusWarning;
    case "out":
    case "inactive":
      return stylesRef.statusMuted;
    default:
      return stylesRef.statusSuccess;
  }
}

export default function InventoryPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [currentUser, setCurrentUser] = useState(null);
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [families, setFamilies] = useState([]);
  const [summary, setSummary] = useState(null);
  const [searchTerm, setSearchTerm] = useState(() => getStringParam(searchParams, "search"));
  const [alertFilter, setAlertFilter] = useState(() => getStringParam(searchParams, "alert"));
  const [familyFilter, setFamilyFilter] = useState(() => getStringParam(searchParams, "familyId"));
  const [categoryFilter, setCategoryFilter] = useState(() => getStringParam(searchParams, "categoryId"));
  const [scope, setScope] = useState(() => getStringParam(searchParams, "scope", "all"));
  const [viewMode, setViewMode] = useState(() => getStringParam(searchParams, "view", "compact"));
  const [page, setPage] = useState(() => getPositiveIntParam(searchParams, "page", 1));
  const [pagination, setPagination] = useState({ page: 1, limit: PAGE_SIZE, total: 0, pages: 1 });
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmittingMovement, setIsSubmittingMovement] = useState(false);
  const [loadError, setLoadError] = useState("");

  const [movementModal, setMovementModal] = useState({
    open: false,
    mode: "entry",
    product: null,
  });
  const [productPickerOpen, setProductPickerOpen] = useState(false);

  const [movementForm, setMovementForm] = useState({
    quantity: "",
    location: "warehouse",
    fromLocation: "warehouse",
    toLocation: "kitchen",
    notes: "",
  });

  const [dialogModal, setDialogModal] = useState({
    open: false,
    title: "",
    message: "",
    variant: "info",
  });

  const availableScopes = useMemo(
    () => getAvailableScopesForRole(currentUser?.role),
    [currentUser?.role]
  );
  const activeScope = availableScopes.includes(scope) ? scope : availableScopes[0] || "all";
  const isGeneralScope = activeScope === "all";
  const operationalScope = currentUser?.role === "loung" ? "lounge" : currentUser?.role;
  const canManageCurrentScope =
    currentUser?.role === "admin" ||
    currentUser?.role === "warehouse" ||
    (!isGeneralScope &&
      ["kitchen", "loung"].includes(currentUser?.role || "") &&
      operationalScope === activeScope);
  const scopeLabel = INVENTORY_SCOPE_LABELS[activeScope] || "Inventario";
  const heroEyebrow = isGeneralScope ? "Inventario" : scopeLabel;
  const heroTitle = isGeneralScope ? "Control de existencias" : `Inventario de ${scopeLabel.toLowerCase()}`;
  const heroDescription = isGeneralScope
    ? "Revisa stock por ubicacion y cambia entre tarjetas o seguimiento desde un solo modulo."
    : `Consulta solo productos con stock en ${scopeLabel.toLowerCase()} y registra ajustes rapidos.`;
  const shouldUseQuickAdjustModal =
    !isGeneralScope &&
    ["kitchen", "loung"].includes(currentUser?.role || "") &&
    operationalScope === activeScope;

  const hasActiveFilters =
    Boolean(searchTerm.trim()) ||
    Boolean(alertFilter) ||
    Boolean(familyFilter) ||
    Boolean(categoryFilter);

  const filteredCategories = useMemo(() => {
    if (!familyFilter) {
      return categories;
    }

    return categories.filter((category) => String(category.familyId?._id || category.familyId || "") === familyFilter);
  }, [categories, familyFilter]);

  useEffect(() => {
    setPage(1);
  }, [alertFilter, categoryFilter, familyFilter, searchTerm, activeScope]);

  useEffect(() => {
    let cancelled = false;

    async function loadCurrentUser() {
      try {
        const response = await fetch("/api/auth/me", { cache: "no-store" });
        const result = await response.json();

        if (!cancelled) {
          setCurrentUser(result?.user || null);
        }
      } catch (error) {
        console.error(error);
        if (!cancelled) {
          setCurrentUser(null);
        }
      }
    }

    loadCurrentUser();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!availableScopes.includes(scope)) {
      setScope(availableScopes[0] || "all");
    }
  }, [availableScopes, scope]);

  useEffect(() => {
    const nextQuery = buildSearchParams(searchParams, {
      search: searchTerm.trim() || null,
      alert: alertFilter || null,
      familyId: familyFilter || null,
      categoryId: categoryFilter || null,
      scope: activeScope !== "all" ? activeScope : null,
      view: viewMode !== "compact" ? viewMode : null,
      page: page > 1 ? page : null,
    });

    if (nextQuery !== searchParams.toString()) {
      router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname, { scroll: false });
    }
  }, [page, pathname, router, searchParams, searchTerm, alertFilter, familyFilter, categoryFilter, activeScope, viewMode]);

  async function fetchInventory(options = {}) {
    const { silent = false } = options;

    try {
      if (!silent) {
        setIsLoading(true);
      }
      setLoadError("");

      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("limit", String(PAGE_SIZE));

      if (searchTerm.trim()) {
        params.set("search", searchTerm.trim());
      }

      if (alertFilter) {
        params.set("alert", alertFilter);
      }

      if (familyFilter) {
        params.set("familyId", familyFilter);
      }

      if (categoryFilter) {
        params.set("categoryId", categoryFilter);
      }

      if (!isGeneralScope) {
        params.set("location", activeScope);
        params.set("inStockOnly", "true");
      }

      const response = await fetch(`/api/inventory?${params.toString()}`);
      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.message || "No se pudo obtener el inventario.");
      }

      setProducts(result.data || []);
      setSummary(result.summary || null);
      setPagination({
        page: Number(result.meta?.page || page),
        limit: Number(result.meta?.limit || PAGE_SIZE),
        total: Number(result.meta?.total || 0),
        pages: Number(result.meta?.pages || 1),
      });
    } catch (error) {
      console.error(error);
      if (!silent) {
        setLoadError(error.message || "No se pudo obtener el inventario.");
        setProducts([]);
        setSummary(null);
        setPagination({ page: 1, limit: PAGE_SIZE, total: 0, pages: 1 });
      }
    } finally {
      if (!silent) {
        setIsLoading(false);
      }
    }
  }

  async function fetchCategories() {
    const response = await fetch("/api/categories", {
      method: "GET",
      cache: "no-store",
    });

    const result = await response.json();

    if (!response.ok || !result.success) {
      throw new Error(result.message || "No se pudieron obtener las categorias.");
    }

    return result.data || [];
  }

  async function fetchFamilies() {
    const response = await fetch("/api/families", {
      method: "GET",
      cache: "no-store",
    });

    const result = await response.json();

    if (!response.ok || !result.success) {
      throw new Error(result.message || "No se pudieron obtener las familias.");
    }

    return result.data || [];
  }

  useEffect(() => {
    Promise.all([fetchInventory(), fetchCategories(), fetchFamilies()])
      .then(([, categoriesData, familiesData]) => {
        setCategories(categoriesData.filter((category) => category.isActive));
        setFamilies(familiesData);
      })
      .catch((error) => {
        console.error(error);
        setLoadError(error.message || "No se pudo cargar la informacion auxiliar.");
        setDialogModal({
          open: true,
          title: "No se pudo cargar inventario",
          message: error.message || "Intenta nuevamente en un momento.",
          variant: "danger",
        });
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeScope, alertFilter, categoryFilter, familyFilter, page, searchTerm]);

  useEffect(() => {
    if (categoryFilter && !filteredCategories.some((category) => category._id === categoryFilter)) {
      setCategoryFilter("");
    }
  }, [categoryFilter, filteredCategories]);

  useEffect(() => {
    const hasBlockingModal =
      movementModal.open || productPickerOpen || dialogModal.open;

    if (hasBlockingModal) {
      return undefined;
    }

    function refreshInventorySilently() {
      if (document.visibilityState !== "visible") return;
      fetchInventory({ silent: true });
    }

    const intervalId = window.setInterval(
      refreshInventorySilently,
      AUTO_REFRESH_INTERVAL_MS
    );

    window.addEventListener("focus", refreshInventorySilently);
    document.addEventListener("visibilitychange", refreshInventorySilently);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", refreshInventorySilently);
      document.removeEventListener("visibilitychange", refreshInventorySilently);
    };
  }, [
    dialogModal.open,
    movementModal.open,
    productPickerOpen,
    page,
    searchTerm,
    alertFilter,
    familyFilter,
    categoryFilter,
    activeScope,
  ]);

  function toggleAlertFilter(nextFilter) {
    setAlertFilter((prev) => (prev === nextFilter ? "" : nextFilter));
  }

  function openMovementModal(mode, product) {
    const defaultLocation = isGeneralScope ? "warehouse" : activeScope;
    const defaultTransferFrom = activeScope === "all" ? "warehouse" : activeScope;
    const defaultTransferTo = activeScope === "all" ? "kitchen" : "warehouse";

    setMovementModal({ open: true, mode, product });
    setMovementForm({
      quantity: "",
      location: defaultLocation,
      fromLocation: defaultTransferFrom,
      toLocation: defaultTransferTo,
      notes: "",
    });
  }

  function closeMovementModal() {
    setMovementModal({ open: false, mode: "entry", product: null });
  }

  function openProductPicker() {
    setProductPickerOpen(true);
  }

  function closeProductPicker() {
    setProductPickerOpen(false);
  }

  function handlePickProduct(product) {
    const selectedProduct = {
      ...product,
      inventory: {
        total: 0,
        warehouse: 0,
        kitchen: 0,
        lounge: 0,
      },
      status: "out",
    };

    setProductPickerOpen(false);
    openMovementModal("entry", selectedProduct);
  }

  function handleMovementFormChange(event) {
    const { name, value } = event.target;

    setMovementForm((prev) => ({
      ...prev,
      [name]: value,
    }));
  }

  async function handleSubmitMovement(event) {
    event.preventDefault();

    if (!movementModal.product) return;

    try {
      setIsSubmittingMovement(true);

      const payload = {
        productId: movementModal.product._id,
        quantity: Number(movementForm.quantity),
        notes: movementForm.notes,
      };

      if (movementModal.mode === "entry") {
        payload.movementType = "adjustment_in";
        payload.location = movementForm.location;
      }

      if (movementModal.mode === "exit") {
        payload.movementType = "adjustment_out";
        payload.location = movementForm.location;
      }

      if (movementModal.mode === "transfer") {
        payload.movementType = "transfer";
        payload.fromLocation = movementForm.fromLocation;
        payload.toLocation = movementForm.toLocation;
      }

      const response = await fetch("/api/inventory/movements", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.message || "No se pudo registrar el movimiento.");
      }

      closeMovementModal();
      await fetchInventory();
    } catch (error) {
      console.error(error);
      setDialogModal({
        open: true,
        title: "No se pudo registrar el movimiento",
        message: error.message || "Intenta nuevamente.",
        variant: "danger",
      });
    } finally {
      setIsSubmittingMovement(false);
    }
  }

  const fromItem = pagination.total === 0 ? 0 : (pagination.page - 1) * pagination.limit + 1;
  const toItem = pagination.total === 0 ? 0 : Math.min(pagination.page * pagination.limit, pagination.total);

  return (
    <>
      <div className="page">
        <section className={`hero fadeScaleIn ${styles.heroShell}`}>
          <div className="heroCopy">
            <span className="eyebrow">{heroEyebrow}</span>
            <h1 className="title">{heroTitle}</h1>
            <p className="description">{heroDescription}</p>
          </div>

          <div className={styles.heroStats}>
            <button
              type="button"
              className={`compactStat ${styles.heroStatButton} ${!alertFilter ? styles.heroStatActive : ""}`}
              onClick={() => setAlertFilter("")}
              aria-pressed={!alertFilter}
            >
              <Boxes size={14} />
              <span>
                Productos <strong>{summary?.totalProducts || 0}</strong>
              </span>
            </button>
            <button
              type="button"
              className={`compactStat ${styles.heroStatButton} ${styles.heroStatDanger} ${alertFilter === "low" ? styles.heroStatActive : ""}`}
              onClick={() => toggleAlertFilter("low")}
              aria-pressed={alertFilter === "low"}
            >
              <PackageSearch size={14} />
              <span>
                Bajo stock <strong>{summary?.lowStockProducts || 0}</strong>
              </span>
            </button>
            <button
              type="button"
              className={`compactStat ${styles.heroStatButton} heroStatWarning ${alertFilter === "warning" ? styles.heroStatActive : ""}`}
              onClick={() => toggleAlertFilter("warning")}
              aria-pressed={alertFilter === "warning"}
            >
              <AlertTriangle size={14} />
              <span>
                Reposicion <strong>{summary?.warningStockProducts || 0}</strong>
              </span>
            </button>
            <button
              type="button"
              className={`compactStat ${styles.heroStatButton} ${styles.heroStatMuted} ${alertFilter === "out" ? styles.heroStatActive : ""}`}
              onClick={() => toggleAlertFilter("out")}
              aria-pressed={alertFilter === "out"}
            >
              <Warehouse size={14} />
              <span>
                Sin stock <strong>{summary?.outOfStockProducts || 0}</strong>
              </span>
            </button>
          </div>
        </section>

        <div className={`${styles.headerRow} fadeSlideIn delayOne`}>
          <div className="searchField">
            <Search size={16} />
            <input
              type="text"
              className="searchInput"
              placeholder="Buscar por nombre, o codigo"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
            />
          </div>

          <button
            type="button"
            className={`miniAction ${styles.clearButton}`}
            disabled={!hasActiveFilters}
            onClick={() => {
              if (!hasActiveFilters) return;
              setSearchTerm("");
              setAlertFilter("");
              setFamilyFilter("");
              setCategoryFilter("");
              setPage(1);
            }}
          >
            Limpiar filtros
          </button>

          {!isGeneralScope && canManageCurrentScope ? (
            <button
              type="button"
              className="miniAction"
              onClick={openProductPicker}
            >
              Agregar producto
            </button>
          ) : null}

          <div className={styles.viewSwitch}>
            {availableScopes.map((scopeOption) => (
              <button
                key={scopeOption}
                type="button"
                className={`miniAction ${activeScope === scopeOption ? "miniActionPrimary" : ""}`}
                onClick={() => setScope(scopeOption)}
              >
                {INVENTORY_SCOPE_LABELS[scopeOption]}
              </button>
            ))}
          </div>

          <div className={`${styles.viewSwitch} ${styles.iconViewSwitch}`}>
            <button
              type="button"
              className={`miniAction miniActionIconOnly ${viewMode === "cards" ? "miniActionPrimary" : ""}`}
              onClick={() => setViewMode("cards")}
              aria-label="Tarjetas"
              disabled={products.length === 0}
            >
              <LayoutGrid size={14} />
              <span className="miniActionLabel">Tarjetas</span>
            </button>
            <button
              type="button"
              className={`miniAction miniActionIconOnly ${viewMode === "compact" ? "miniActionPrimary" : ""}`}
              onClick={() => setViewMode("compact")}
              aria-label="Seguimiento"
              disabled={products.length === 0}
            >
              <List size={14} />
              <span className="miniActionLabel">Seguimiento</span>
            </button>
          </div>
        </div>

        <div className={styles.filterRow}>
          <div className="selectWrap">
            <select
              value={familyFilter}
              onChange={(event) => {
                setFamilyFilter(event.target.value);
                setCategoryFilter("");
              }}
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
              value={categoryFilter}
              onChange={(event) => setCategoryFilter(event.target.value)}
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

        <div className={`${styles.listSection} fadeSlideIn delayTwo`}>
          {loadError ? (
            <div className="form-error-message" role="alert">
              {loadError}
            </div>
          ) : null}
          {viewMode === "compact" ? (
            <>
              <InventoryCompactView
                products={products}
                isLoading={isLoading}
                onEntry={(product) => openMovementModal("entry", product)}
                onExit={(product) => openMovementModal("exit", product)}
                onTransfer={(product) => openMovementModal("transfer", product)}
                getStatusClass={getStatusClass}
                showActions={canManageCurrentScope}
                scope={activeScope}
                scopeLabel={scopeLabel}
              />

              {!isLoading && products.length > 0 ? (
                <PaginationBar
                  page={pagination.page}
                  totalPages={pagination.pages}
                  totalItems={pagination.total}
                  fromItem={fromItem}
                  toItem={toItem}
                  itemLabel="productos"
                  onPageChange={setPage}
                />
              ) : null}
            </>
          ) : isLoading ? (
            <div className={styles.loadingGrid}>
              {Array.from({ length: 6 }).map((_, index) => (
                <article
                  key={`inventory-skeleton-${index}`}
                  className={`${styles.productCard} ${styles.skeletonCard} shimmerBlock pulseSoft`}
                >
                  <div className={styles.skeletonHeader}>
                    <span className={styles.skeletonTitle} />
                    <span className={styles.skeletonBadge} />
                  </div>

                  <div className={styles.skeletonMeta} />

                  <div className={styles.skeletonStockGrid}>
                    {Array.from({ length: 4 }).map((__, stockIndex) => (
                      <span key={`inventory-skeleton-stock-${stockIndex}`} className={styles.skeletonStockBlock} />
                    ))}
                  </div>

                  <div className={styles.skeletonActions}>
                    <span className={styles.skeletonAction} />
                    <span className={styles.skeletonAction} />
                    <span className={styles.skeletonAction} />
                  </div>
                </article>
              ))}
            </div>
          ) : products.length === 0 ? (
            <div className={styles.emptyState}>No se encontraron productos para mostrar.</div>
          ) : (
            <>
              <div className={styles.productList}>
                {products.map((product, index) => (
                  <article
                    key={product._id}
                    className={`${styles.productCard} fadeScaleIn`}
                    style={{ animationDelay: `${0.03 * (index % PAGE_SIZE)}s` }}
                  >
                    <div className={styles.productMain}>
                      <div className={styles.productHeader}>
                        <div className={styles.productInfo}>
                          <div className={styles.productTitleRow}>
                            <h3 className={styles.productName}>{product.name}</h3>
                            <span className={`${styles.statusBadge} ${getStatusClass(product.status, styles)}`}>
                              {getInventoryStatusLabel(product.status)}
                            </span>
                          </div>

                          <p className={styles.unitMeta}>
                            {product.code || "Sin codigo"} · {product.categoryName || "Sin categoria"} · {getUnitLabel(product.unit)}
                          </p>
                        </div>
                      </div>

                      {!isGeneralScope ? (
                        <div className={styles.scopeSummary}>
                          <div className={styles.scopeAmountCard}>
                            <span>{scopeLabel}</span>
                            <strong className={styles.scopeAmountValue}>
                              {product.inventory?.[activeScope] || 0}
                            </strong>
                          </div>
                        </div>
                      ) : (
                        <div className={styles.stockSummary}>
                          <div className={styles.stockBlock}>
                            <span>Total</span>
                            <strong>{product.inventory?.total || 0}</strong>
                          </div>

                          <div className={styles.stockBlock}>
                            <span>Bodega</span>
                            <strong>{product.inventory?.warehouse || 0}</strong>
                          </div>

                          <div className={styles.stockBlock}>
                            <span>Cocina</span>
                            <strong>{product.inventory?.kitchen || 0}</strong>
                          </div>

                          <div className={styles.stockBlock}>
                            <span>Salon</span>
                            <strong>{product.inventory?.lounge || 0}</strong>
                          </div>
                        </div>
                      )}
                    </div>

                    <div className={styles.footerRow}>
                      {canManageCurrentScope ? (
                        <div className={styles.actions}>
                          <button
                            type="button"
                            className="action-button action-button--neutral"
                            onClick={() => openMovementModal("entry", product)}
                            aria-label="Agregar"
                          >
                            <span className="action-button__icon">
                              <ArrowDownToLine size={14} />
                            </span>
                            <span className="action-button__label">Agregar</span>
                          </button>

                          <button
                            type="button"
                            className="action-button action-button--neutral"
                            onClick={() => openMovementModal("exit", product)}
                            aria-label="Retirar"
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
                              onClick={() => openMovementModal("transfer", product)}
                              aria-label="Transferir"
                            >
                              <span className="action-button__icon">
                                <ArrowRightLeft size={14} />
                              </span>
                              <span className="action-button__label">Transferir</span>
                            </button>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  </article>
                ))}
              </div>

              <PaginationBar
                page={pagination.page}
                totalPages={pagination.pages}
                totalItems={pagination.total}
                fromItem={fromItem}
                toItem={toItem}
                itemLabel="productos"
                onPageChange={setPage}
              />
            </>
          )}
        </div>
      </div>

      {shouldUseQuickAdjustModal ? (
        <InventoryQuickAdjustModal
          open={movementModal.open}
          mode={movementModal.mode}
          product={movementModal.product}
          formData={movementForm}
          onChange={handleMovementFormChange}
          onClose={closeMovementModal}
          onSubmit={handleSubmitMovement}
          isSubmitting={isSubmittingMovement}
          scopeLabel={scopeLabel}
          currentStock={movementModal.product?.inventory?.[activeScope] || 0}
        />
      ) : (
        <InventoryMovementModal
          open={movementModal.open}
          mode={movementModal.mode}
          product={movementModal.product}
          formData={movementForm}
          onChange={handleMovementFormChange}
          onClose={closeMovementModal}
          onSubmit={handleSubmitMovement}
          isSubmitting={isSubmittingMovement}
        />
      )}

      <InventoryProductPickerModal
        open={productPickerOpen}
        scopeLabel={scopeLabel}
        onClose={closeProductPicker}
        onSelect={handlePickProduct}
      />

      <DialogModal
        open={dialogModal.open}
        title={dialogModal.title}
        message={dialogModal.message}
        variant={dialogModal.variant}
        onClose={() => setDialogModal((prev) => ({ ...prev, open: false }))}
        onConfirm={() => setDialogModal((prev) => ({ ...prev, open: false }))}
      />
    </>
  );
}
