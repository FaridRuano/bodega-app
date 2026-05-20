"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  CalendarDays,
  LayoutGrid,
  List,
  Search,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import styles from "./page.module.scss";
import InventoryCompactView from "@components/inventory/InventoryCompactView/InventoryCompactView";
import PaginationBar from "@components/shared/PaginationBar/PaginationBar";
import { getInventoryStatusLabel } from "@libs/constants/domainLabels";
import { PAGE_LIMITS } from "@libs/constants/pagination";
import { getUnitLabel } from "@libs/constants/units";
import { buildSearchParams, getPositiveIntParam, getStringParam } from "@libs/urlParams";
import { formatQuantity } from "@libs/unitQuantities";

const PAGE_SIZE = PAGE_LIMITS.inventory;
const INVENTORY_VIEW_MODE_STORAGE_KEY = "bodega:inventory:view-mode:v1";
const INVENTORY_VIEW_MODES = ["compact", "cards"];
const INVENTORY_SCOPE_LABELS = {
  all: "General",
  warehouse: "Bodega",
  kitchen: "Cocina",
  lounge: "Salon",
};

function getTodayDateValue() {
  const now = new Date();
  const offsetDate = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return offsetDate.toISOString().slice(0, 10);
}

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

function normalizeViewMode(value, fallback = "compact") {
  const normalized = String(value || "").trim();
  return INVENTORY_VIEW_MODES.includes(normalized) ? normalized : fallback;
}

function getStoredViewMode() {
  if (typeof window === "undefined") return "";

  try {
    return normalizeViewMode(window.localStorage.getItem(INVENTORY_VIEW_MODE_STORAGE_KEY), "");
  } catch {
    return "";
  }
}

function storeViewModePreference(nextViewMode) {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(
      INVENTORY_VIEW_MODE_STORAGE_KEY,
      normalizeViewMode(nextViewMode)
    );
  } catch {
    // La preferencia visual no debe bloquear el uso del inventario.
  }
}

export default function InventoryHistoryPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const hasInitializedPageReset = useRef(false);

  const [currentUser, setCurrentUser] = useState(null);
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [families, setFamilies] = useState([]);
  const [summary, setSummary] = useState(null);
  const [searchTerm, setSearchTerm] = useState(() => getStringParam(searchParams, "search"));
  const [familyFilter, setFamilyFilter] = useState(() => getStringParam(searchParams, "familyId"));
  const [categoryFilter, setCategoryFilter] = useState(() => getStringParam(searchParams, "categoryId"));
  const [asOfDate, setAsOfDate] = useState(() => getStringParam(searchParams, "asOfDate", getTodayDateValue()));
  const [scope, setScope] = useState(() => getStringParam(searchParams, "scope", "all"));
  const [viewMode, setViewMode] = useState(() =>
    normalizeViewMode(getStringParam(searchParams, "view", "compact"))
  );
  const [page, setPage] = useState(() => getPositiveIntParam(searchParams, "page", 1));
  const [pagination, setPagination] = useState({ page: 1, limit: PAGE_SIZE, total: 0, pages: 1 });
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const availableScopes = useMemo(
    () => getAvailableScopesForRole(currentUser?.role),
    [currentUser?.role]
  );
  const activeScope = availableScopes.includes(scope) ? scope : availableScopes[0] || "all";
  const isGeneralScope = activeScope === "all";
  const scopeLabel = INVENTORY_SCOPE_LABELS[activeScope] || "Inventario";
  const heroEyebrow = "Inventario historico";
  const heroTitle = isGeneralScope ? "Consulta historica de existencias" : `Historico de ${scopeLabel.toLowerCase()}`;
  const heroDescription = "Revisa como estaba el stock en una fecha especifica. Esta pantalla es solo de consulta.";

  const hasActiveFilters =
    Boolean(searchTerm.trim()) ||
    Boolean(familyFilter) ||
    Boolean(categoryFilter) ||
    asOfDate !== getTodayDateValue();
  const areFamilyFiltersLoading = isLoading && families.length === 0;
  const areCategoryFiltersLoading = isLoading && categories.length === 0;

  const filteredCategories = useMemo(() => {
    if (!familyFilter) {
      return categories;
    }

    return categories.filter((category) => String(category.familyId?._id || category.familyId || "") === familyFilter);
  }, [categories, familyFilter]);

  useEffect(() => {
    if (!hasInitializedPageReset.current) {
      hasInitializedPageReset.current = true;
      return;
    }

    setPage(1);
  }, [asOfDate, categoryFilter, familyFilter, searchTerm, activeScope]);

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
    const viewFromUrl = normalizeViewMode(getStringParam(searchParams, "view", ""), "");

    if (viewFromUrl) {
      setViewMode(viewFromUrl);
      storeViewModePreference(viewFromUrl);
      return;
    }

    const storedViewMode = getStoredViewMode();
    if (storedViewMode) {
      setViewMode(storedViewMode);
    }
  }, [searchParams]);

  useEffect(() => {
    const nextQuery = buildSearchParams(searchParams, {
      search: searchTerm.trim() || null,
      familyId: familyFilter || null,
      categoryId: categoryFilter || null,
      asOfDate: asOfDate || getTodayDateValue(),
      scope: activeScope !== "all" ? activeScope : null,
      view: viewMode !== "compact" ? viewMode : null,
      page: page > 1 ? page : null,
    });

    if (nextQuery !== searchParams.toString()) {
      router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname, { scroll: false });
    }
  }, [page, pathname, router, searchParams, searchTerm, familyFilter, categoryFilter, asOfDate, activeScope, viewMode]);

  async function fetchInventory() {
    try {
      setIsLoading(true);
      setLoadError("");

      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("limit", String(PAGE_SIZE));
      params.set("asOfDate", asOfDate || getTodayDateValue());

      if (searchTerm.trim()) {
        params.set("search", searchTerm.trim());
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
        throw new Error(result.message || "No se pudo obtener el inventario historico.");
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
      setLoadError(error.message || "No se pudo obtener el inventario historico.");
      setProducts([]);
      setSummary(null);
      setPagination({ page: 1, limit: PAGE_SIZE, total: 0, pages: 1 });
    } finally {
      setIsLoading(false);
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
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeScope, asOfDate, categoryFilter, familyFilter, page, searchTerm]);

  useEffect(() => {
    if (categories.length === 0) return;

    if (categoryFilter && !filteredCategories.some((category) => category._id === categoryFilter)) {
      setCategoryFilter("");
    }
  }, [categories.length, categoryFilter, filteredCategories]);

  function updateViewMode(nextViewMode) {
    const normalizedViewMode = normalizeViewMode(nextViewMode);
    setViewMode(normalizedViewMode);
    storeViewModePreference(normalizedViewMode);
  }

  const fromItem = pagination.total === 0 ? 0 : (pagination.page - 1) * pagination.limit + 1;
  const toItem = pagination.total === 0 ? 0 : Math.min(pagination.page * pagination.limit, pagination.total);

  return (
    <div className="page">
      <section className={`hero fadeScaleIn ${styles.heroShell}`}>
        <div className="heroCopy">
          <span className="eyebrow">{heroEyebrow}</span>
          <h1 className="title">{heroTitle}</h1>
          <p className="description">{heroDescription}</p>
        </div>

        <div className={styles.heroTools}>
          <label className={`${styles.dateFilter} ${styles.heroDateFilter}`}>
            <CalendarDays size={15} />
            <input
              type="date"
              value={asOfDate}
              max={getTodayDateValue()}
              onChange={(event) => setAsOfDate(event.target.value || getTodayDateValue())}
              aria-label="Fecha historica de inventario"
            />
          </label>

          <Link href="/dashboard/inventory" className="miniAction">
            Inventario actual
          </Link>
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
            setFamilyFilter("");
            setCategoryFilter("");
            setAsOfDate(getTodayDateValue());
            setPage(1);
          }}
        >
          Limpiar filtros
        </button>

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
            onClick={() => updateViewMode("cards")}
            aria-label="Tarjetas"
            disabled={products.length === 0}
          >
            <LayoutGrid size={14} />
            <span className="miniActionLabel">Tarjetas</span>
          </button>
          <button
            type="button"
            className={`miniAction miniActionIconOnly ${viewMode === "compact" ? "miniActionPrimary" : ""}`}
            onClick={() => updateViewMode("compact")}
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
            disabled={areFamilyFiltersLoading}
          >
            {areFamilyFiltersLoading ? (
              <option value={familyFilter || ""}>
                {familyFilter ? "Cargando familia..." : "Cargando familias..."}
              </option>
            ) : (
              <option value="">Todas las familias</option>
            )}
            {familyFilter && !families.some((family) => family._id === familyFilter) ? (
              <option value={familyFilter}>Familia seleccionada</option>
            ) : null}
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
            disabled={areCategoryFiltersLoading}
          >
            {areCategoryFiltersLoading ? (
              <option value={categoryFilter || ""}>
                {categoryFilter ? "Cargando categoria..." : "Cargando categorias..."}
              </option>
            ) : (
              <option value="">Todas las categorias</option>
            )}
            {categoryFilter && !filteredCategories.some((category) => category._id === categoryFilter) ? (
              <option value={categoryFilter}>Categoria seleccionada</option>
            ) : null}
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
              onEntry={() => {}}
              onExit={() => {}}
              onTransfer={() => {}}
              getStatusClass={getStatusClass}
              canAdjust={false}
              canTransfer={false}
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
                key={`inventory-history-skeleton-${index}`}
                className={`${styles.productCard} ${styles.skeletonCard} shimmerBlock pulseSoft`}
              >
                <div className={styles.skeletonHeader}>
                  <span className={styles.skeletonTitle} />
                  <span className={styles.skeletonBadge} />
                </div>

                <div className={styles.skeletonMeta} />

                <div className={styles.skeletonStockGrid}>
                  {Array.from({ length: 4 }).map((__, stockIndex) => (
                    <span key={`inventory-history-skeleton-stock-${stockIndex}`} className={styles.skeletonStockBlock} />
                  ))}
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
                            {formatQuantity(product.inventory?.[activeScope])}
                          </strong>
                        </div>
                      </div>
                    ) : (
                      <div className={styles.stockSummary}>
                        <div className={styles.stockBlock}>
                          <span>Total</span>
                          <strong>{formatQuantity(product.inventory?.total)}</strong>
                        </div>

                        <div className={styles.stockBlock}>
                          <span>Bodega</span>
                          <strong>{formatQuantity(product.inventory?.warehouse)}</strong>
                        </div>

                        <div className={styles.stockBlock}>
                          <span>Cocina</span>
                          <strong>{formatQuantity(product.inventory?.kitchen)}</strong>
                        </div>

                        <div className={styles.stockBlock}>
                          <span>Salon</span>
                          <strong>{formatQuantity(product.inventory?.lounge)}</strong>
                        </div>
                      </div>
                    )}
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
  );
}
