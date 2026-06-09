"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDownToLine,
  ArrowRightLeft,
  ArrowUpFromLine,
  AlertTriangle,
  Boxes,
  History,
  LayoutGrid,
  List,
  PackageSearch,
  Search,
  Warehouse,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import styles from "./page.module.scss";
import InventoryCompactView from "@components/inventory/InventoryCompactView/InventoryCompactView";
import InventoryMovementModal from "@components/inventory/InventoryModal/InventoryModal";
import InventoryProductPickerModal from "@components/inventory/InventoryProductPickerModal/InventoryProductPickerModal";
import InventoryQuickAdjustModal from "@components/inventory/InventoryQuickAdjustModal/InventoryQuickAdjustModal";
import DialogModal from "@components/shared/DialogModal/DialogModal";
import PaginationBar from "@components/shared/PaginationBar/PaginationBar";
import { getInventoryStatusLabel, getLocationLabel } from "@libs/constants/domainLabels";
import { PAGE_LIMITS } from "@libs/constants/pagination";
import { getUnitLabel } from "@libs/constants/units";
import { buildSearchParams, getPositiveIntParam, getStringParam } from "@libs/urlParams";
import { formatQuantity } from "@libs/unitQuantities";
import { isPrivilegedUserRole, normalizeUserRole } from "@libs/userRoles";

const PAGE_SIZE = PAGE_LIMITS.inventory;
const AUTO_REFRESH_INTERVAL_MS = 30000;
const INVENTORY_VIEW_MODE_STORAGE_KEY = "bodega:inventory:view-mode:v1";
const INVENTORY_VIEW_MODES = ["compact", "cards"];
const INVENTORY_SCOPE_LABELS = {
  all: "General",
  warehouse: "Bodega",
  kitchen: "Cocina",
  lounge: "Salon",
};
const INVENTORY_LOCATION_OPTIONS = [
  { value: "warehouse", label: "Bodega" },
  { value: "kitchen", label: "Cocina" },
  { value: "lounge", label: "Salon" },
];

function getOperationalScopeForRole(role = "") {
  if (role === "loung") return "lounge";
  if (["warehouse", "kitchen", "lounge"].includes(role)) return role;
  return "";
}

function getAvailableScopesForRole(role = "") {
  switch (String(role || "").trim()) {
    case "kitchen":
      return ["kitchen"];
    case "loung":
      return ["lounge"];
    case "warehouse":
      return ["all", "warehouse"];
    case "admin":
    case "manager":
      return ["all", "warehouse", "kitchen", "lounge"];
    default:
      return ["all"];
  }
}

function isOperationalFloorRole(role = "") {
  return ["kitchen", "loung"].includes(String(role || "").trim());
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

export default function InventoryPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const hasInitializedPageReset = useRef(false);

  const [currentUser, setCurrentUser] = useState(null);
  const [hasLoadedCurrentUser, setHasLoadedCurrentUser] = useState(false);
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [families, setFamilies] = useState([]);
  const [summary, setSummary] = useState(null);
  const [searchTerm, setSearchTerm] = useState(() => getStringParam(searchParams, "search"));
  const [alertFilter, setAlertFilter] = useState(() => getStringParam(searchParams, "alert"));
  const [familyFilter, setFamilyFilter] = useState(() => getStringParam(searchParams, "familyId"));
  const [categoryFilter, setCategoryFilter] = useState(() => getStringParam(searchParams, "categoryId"));
  const [scope, setScope] = useState(() => getStringParam(searchParams, "scope", "all"));
  const [inventoryStockMode, setInventoryStockMode] = useState(() =>
    getStringParam(searchParams, "stock") === "local" ? "local" : "all"
  );
  const [viewMode, setViewMode] = useState(() =>
    normalizeViewMode(getStringParam(searchParams, "view", "compact"))
  );
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

  const currentUserRole = normalizeUserRole(currentUser?.role);
  const availableScopes = useMemo(
    () => getAvailableScopesForRole(currentUserRole),
    [currentUserRole]
  );
  const activeScope = availableScopes.includes(scope) ? scope : availableScopes[0] || "all";
  const isGeneralScope = activeScope === "all";
  const operationalScope = getOperationalScopeForRole(currentUserRole);
  const isCombinedOperationalView =
    isOperationalFloorRole(currentUserRole) && Boolean(operationalScope);
  const effectiveViewMode = viewMode;
  const shouldShowAllInventoryProducts = isCombinedOperationalView && inventoryStockMode === "all";
  const operationalInventoryFilter = (() => {
    if (!isCombinedOperationalView) return "";
    if (alertFilter === "low") return "low";
    if (alertFilter === "warning") return "warning";
    if (alertFilter === "out") return "out";
    return inventoryStockMode === "local" ? "area" : "products";
  })();
  const operationalAreaStockCount = Number(
    operationalScope === "kitchen"
      ? summary?.kitchenStockProducts || 0
      : operationalScope === "lounge"
        ? summary?.loungeStockProducts || 0
        : operationalScope === "warehouse"
          ? summary?.warehouseStockProducts || 0
          : summary?.selectedStockProducts || 0
  );
  const combinedViewLocations = useMemo(
    () =>
      isCombinedOperationalView
        ? [
            { value: "total", label: "Total" },
            { value: operationalScope, label: INVENTORY_SCOPE_LABELS[operationalScope] || "Area" },
            { value: "warehouse", label: "Bodega" },
          ]
        : [],
    [isCombinedOperationalView, operationalScope]
  );
  const canAdjustCurrentScope =
    isPrivilegedUserRole(currentUserRole) ||
    (!isGeneralScope && operationalScope === activeScope);
  const canTransferInventory =
    isPrivilegedUserRole(currentUserRole) ||
    ["warehouse", "kitchen", "loung"].includes(currentUserRole);
  const canShowInventoryActions = canAdjustCurrentScope || canTransferInventory;
  const canAccessInventoryHistory = isPrivilegedUserRole(currentUserRole);
  const scopeLabel = INVENTORY_SCOPE_LABELS[activeScope] || "Inventario";
  const heroEyebrow = isGeneralScope ? "Inventario" : scopeLabel;
  const heroTitle = isGeneralScope ? "Control de existencias" : `Inventario de ${scopeLabel.toLowerCase()}`;
  const heroDescription = isCombinedOperationalView
    ? `Consulta ${scopeLabel.toLowerCase()} y bodega en una sola tabla. Las entradas y salidas manuales afectan solo ${scopeLabel.toLowerCase()}; bodega se mueve por transferencia.`
    : isGeneralScope
    ? "Revisa stock por ubicacion y cambia entre tarjetas o seguimiento desde un solo modulo."
    : `Consulta solo productos con stock en ${scopeLabel.toLowerCase()} y registra ajustes rapidos.`;
  const shouldUseQuickAdjustModal =
    movementModal.mode !== "transfer" &&
    !isGeneralScope &&
    isOperationalFloorRole(currentUserRole) &&
    operationalScope === activeScope;
  const movementLocationOptions = useMemo(() => {
    if (!canAdjustCurrentScope) return [];
    if (isPrivilegedUserRole(currentUserRole)) {
      if (isGeneralScope) return INVENTORY_LOCATION_OPTIONS;
      return INVENTORY_LOCATION_OPTIONS.filter((option) => option.value === activeScope);
    }

    return INVENTORY_LOCATION_OPTIONS.filter((option) => option.value === operationalScope);
  }, [activeScope, canAdjustCurrentScope, currentUserRole, isGeneralScope, operationalScope]);
  const transferSourceOptions = useMemo(() => {
    if (!canTransferInventory) return [];
    return INVENTORY_LOCATION_OPTIONS;
  }, [canTransferInventory]);
  const transferDestinationOptions = useMemo(() => {
    if (!canTransferInventory) return [];
    return INVENTORY_LOCATION_OPTIONS;
  }, [canTransferInventory]);

  const hasActiveFilters =
    Boolean(searchTerm.trim()) ||
    Boolean(alertFilter) ||
    Boolean(familyFilter) ||
    Boolean(categoryFilter) ||
    (isCombinedOperationalView ? inventoryStockMode !== "all" : shouldShowAllInventoryProducts);
  const historyHref = useMemo(() => {
    const params = new URLSearchParams();

    if (searchTerm.trim()) params.set("search", searchTerm.trim());
    if (alertFilter) params.set("alert", alertFilter);
    if (familyFilter) params.set("familyId", familyFilter);
    if (categoryFilter) params.set("categoryId", categoryFilter);
    if (!isCombinedOperationalView && activeScope !== "all") params.set("scope", activeScope);
    if (!isCombinedOperationalView && effectiveViewMode !== "compact") params.set("view", effectiveViewMode);
    if (page > 1) params.set("page", String(page));

    const query = params.toString();
    return query ? `/dashboard/inventory/history?${query}` : "/dashboard/inventory/history";
  }, [activeScope, alertFilter, categoryFilter, effectiveViewMode, familyFilter, isCombinedOperationalView, page, searchTerm]);
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
  }, [alertFilter, categoryFilter, familyFilter, inventoryStockMode, searchTerm, activeScope]);

  useEffect(() => {
    let cancelled = false;

    async function loadCurrentUser() {
      try {
        const response = await fetch("/api/auth/me", { cache: "no-store" });
        const result = await response.json();

        if (!cancelled) {
          setCurrentUser(result?.user || null);
          setHasLoadedCurrentUser(true);
        }
      } catch (error) {
        console.error(error);
        if (!cancelled) {
          setCurrentUser(null);
          setHasLoadedCurrentUser(true);
        }
      }
    }

    loadCurrentUser();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!hasLoadedCurrentUser) return;

    if (!availableScopes.includes(scope)) {
      setScope(availableScopes[0] || "all");
    }
  }, [availableScopes, hasLoadedCurrentUser, scope]);

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
    if (!hasLoadedCurrentUser) return;

    const nextQuery = buildSearchParams(searchParams, {
      search: searchTerm.trim() || null,
      alert: alertFilter || null,
      familyId: familyFilter || null,
      categoryId: categoryFilter || null,
      scope: !isCombinedOperationalView && activeScope !== "all" ? activeScope : null,
      stock: isCombinedOperationalView && inventoryStockMode === "local" ? "local" : null,
      view: effectiveViewMode !== "compact" ? effectiveViewMode : null,
      page: page > 1 ? page : null,
    });

    if (nextQuery !== searchParams.toString()) {
      router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname, { scroll: false });
    }
  }, [page, pathname, router, searchParams, searchTerm, alertFilter, familyFilter, categoryFilter, activeScope, effectiveViewMode, inventoryStockMode, isCombinedOperationalView, hasLoadedCurrentUser]);

  const fetchInventory = useCallback(async function fetchInventory(options = {}) {
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

      if (isCombinedOperationalView && inventoryStockMode === "local") {
        params.set("location", operationalScope);
        params.set("inStockOnly", "true");
      } else if (!isCombinedOperationalView && !isGeneralScope) {
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
  }, [
    activeScope,
    alertFilter,
    categoryFilter,
    familyFilter,
    isCombinedOperationalView,
    isGeneralScope,
    operationalScope,
    page,
    searchTerm,
    inventoryStockMode,
  ]);

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
    if (!hasLoadedCurrentUser) return;

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
  }, [fetchInventory, hasLoadedCurrentUser]);

  useEffect(() => {
    if (categories.length === 0) return;

    if (categoryFilter && !filteredCategories.some((category) => category._id === categoryFilter)) {
      setCategoryFilter("");
    }
  }, [categories.length, categoryFilter, filteredCategories]);

  useEffect(() => {
    if (!hasLoadedCurrentUser) {
      return undefined;
    }

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
    hasLoadedCurrentUser,
    movementModal.open,
    productPickerOpen,
    fetchInventory,
  ]);

  function toggleAlertFilter(nextFilter) {
    setAlertFilter((prev) => (prev === nextFilter ? "" : nextFilter));
  }

  function applyOperationalInventoryFilter(nextFilter) {
    if (nextFilter === "area") {
      setInventoryStockMode("local");
      setAlertFilter("");
      return;
    }

    setInventoryStockMode("all");
    setAlertFilter(nextFilter === "products" ? "" : nextFilter);
  }

  function updateViewMode(nextViewMode) {
    const normalizedViewMode = normalizeViewMode(nextViewMode);
    setViewMode(normalizedViewMode);
    storeViewModePreference(normalizedViewMode);
  }

  function openMovementModal(mode, product) {
    const canOpenMovement =
      mode === "transfer" ? canTransferInventory : canAdjustCurrentScope;

    if (!canOpenMovement) {
      setDialogModal({
        open: true,
        title: "Accion no disponible",
        message:
          mode === "transfer"
            ? "No tienes permisos para transferir inventario."
            : "Solo puedes ajustar manualmente tu inventario asignado.",
        variant: "warning",
      });
      return;
    }

    const defaultLocation = isGeneralScope ? "warehouse" : activeScope;
    const defaultTransferFrom = isOperationalFloorRole(currentUserRole)
      ? "warehouse"
      : activeScope === "all"
        ? "warehouse"
        : activeScope;
    let defaultTransferTo =
      currentUserRole === "loung"
        ? "lounge"
        : currentUserRole === "kitchen"
          ? "kitchen"
          : activeScope === "all" || activeScope === "warehouse"
            ? "kitchen"
            : "warehouse";

    if (defaultTransferFrom === defaultTransferTo) {
      defaultTransferTo = defaultTransferFrom === "warehouse" ? "kitchen" : "warehouse";
    }

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
        payload.notes =
          movementForm.notes.trim() ||
          `Transferencia de ${getLocationLabel(movementForm.fromLocation).toLowerCase()} a ${getLocationLabel(movementForm.toLocation).toLowerCase()}.`;
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
            {isCombinedOperationalView ? (
              <>
                <button
                  type="button"
                  className={`compactStat ${styles.heroStatButton} ${operationalInventoryFilter === "products" ? styles.heroStatActive : ""}`}
                  onClick={() => applyOperationalInventoryFilter("products")}
                  aria-pressed={operationalInventoryFilter === "products"}
                >
                  <Boxes size={14} />
                  <span>
                    Productos <strong>{summary?.totalProducts || 0}</strong>
                  </span>
                </button>
                <button
                  type="button"
                  className={`compactStat ${styles.heroStatButton} ${operationalInventoryFilter === "area" ? styles.heroStatActive : ""}`}
                  onClick={() => applyOperationalInventoryFilter("area")}
                  aria-pressed={operationalInventoryFilter === "area"}
                >
                  <Warehouse size={14} />
                  <span>
                    {scopeLabel} <strong>{operationalAreaStockCount}</strong>
                  </span>
                </button>
                <button
                  type="button"
                  className={`compactStat ${styles.heroStatButton} ${styles.heroStatDanger} ${operationalInventoryFilter === "low" ? styles.heroStatActive : ""}`}
                  onClick={() => applyOperationalInventoryFilter("low")}
                  aria-pressed={operationalInventoryFilter === "low"}
                >
                  <PackageSearch size={14} />
                  <span>
                    Bajo stock <strong>{summary?.lowStockProducts || 0}</strong>
                  </span>
                </button>
                <button
                  type="button"
                  className={`compactStat ${styles.heroStatButton} heroStatWarning ${operationalInventoryFilter === "warning" ? styles.heroStatActive : ""}`}
                  onClick={() => applyOperationalInventoryFilter("warning")}
                  aria-pressed={operationalInventoryFilter === "warning"}
                >
                  <AlertTriangle size={14} />
                  <span>
                    Reposicion <strong>{summary?.warningStockProducts || 0}</strong>
                  </span>
                </button>
                <button
                  type="button"
                  className={`compactStat ${styles.heroStatButton} ${styles.heroStatMuted} ${operationalInventoryFilter === "out" ? styles.heroStatActive : ""}`}
                  onClick={() => applyOperationalInventoryFilter("out")}
                  aria-pressed={operationalInventoryFilter === "out"}
                >
                  <PackageSearch size={14} />
                  <span>
                    Sin stock <strong>{summary?.totalOutOfStockProducts ?? summary?.outOfStockProducts ?? 0}</strong>
                  </span>
                </button>
              </>
            ) : (
              <>
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
              </>
            )}
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
              setInventoryStockMode("all");
              setPage(1);
            }}
          >
            Limpiar filtros
          </button>

          {!isCombinedOperationalView && !isGeneralScope && canAdjustCurrentScope ? (
            <button
              type="button"
              className="miniAction"
              onClick={openProductPicker}
            >
              Agregar producto
            </button>
          ) : null}

          {!isCombinedOperationalView ? (
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
          ) : null}

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
          {effectiveViewMode === "compact" ? (
            <>
              <InventoryCompactView
                products={products}
                isLoading={isLoading}
                onEntry={(product) => openMovementModal("entry", product)}
                onExit={(product) => openMovementModal("exit", product)}
                onTransfer={(product) => openMovementModal("transfer", product)}
                getStatusClass={getStatusClass}
                canAdjust={canAdjustCurrentScope}
                canTransfer={canTransferInventory}
                scope={activeScope}
                scopeLabel={scopeLabel}
                visibleLocations={combinedViewLocations}
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

                    <div className={styles.footerRow}>
                      {canShowInventoryActions ? (
                        <div className={styles.actions}>
                          {canAdjustCurrentScope ? (
                            <>
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
                            </>
                          ) : null}

                          {canTransferInventory ? (
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

        {canAccessInventoryHistory ? (
          <div className={styles.historyAccess}>
            <Link href={historyHref} className="miniAction">
              <History size={14} />
              Inventario historico
            </Link>
          </div>
        ) : null}
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
          locationOptions={movementLocationOptions}
          sourceLocationOptions={transferSourceOptions}
          destinationLocationOptions={transferDestinationOptions}
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
