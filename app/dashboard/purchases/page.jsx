"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Boxes,
  ClipboardList,
  PackagePlus,
  Search,
  ShoppingCart,
} from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import DialogModal from "@components/shared/DialogModal/DialogModal";
import ConfirmModal from "@components/shared/ConfirmModal/ConfirmModal";
import PurchaseExecutionModal from "@components/purchases/PurchaseExecutionModal/PurchaseExecutionModal";
import PaginationBar from "@components/shared/PaginationBar/PaginationBar";
import PurchaseRequestModal from "@components/purchases/PurchaseRequestModal/PurchaseRequestModal";
import PurchaseRequestReviewModal from "@components/purchases/PurchaseRequestReviewModal/PurchaseRequestReviewModal";
import { getLocationLabel } from "@libs/constants/domainLabels";
import { buildSearchParams, getPositiveIntParam, getStringParam } from "@libs/urlParams";
import styles from "./page.module.scss";

const PAGE_SIZE = 12;
const PURCHASE_DRAFT_STORAGE_KEY = "purchase-execution-draft:v1";

const REQUEST_STATUS_LABELS = {
  pending: "Pendiente",
  approved: "Aprobada",
  in_progress: "En proceso",
  partially_purchased: "Parcialmente atendida",
  completed: "Completada",
  rejected: "Rechazada",
  cancelled: "Cancelada",
};

const PURCHASE_BATCH_STATUS_LABELS = {
  draft: "Borrador",
  posted: "Guardada",
  purchased: "Compra realizada",
  dispatched: "Despachada",
  completed: "Completada",
  cancelled: "Cancelada",
};

const PURCHASE_REQUEST_LOCATION_OPTIONS = [
  { value: "warehouse", label: "Bodega" },
  { value: "kitchen", label: "Cocina" },
  { value: "lounge", label: "Salon" },
];

function formatDate(value) {
  if (!value) return "Sin fecha";

  try {
    return new Intl.DateTimeFormat("es-EC", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));
  } catch {
    return "Sin fecha";
  }
}

function getRequesterLabel(request) {
  const person = request?.requestedBy;
  if (!person) return "Usuario";

  const fullName = [person.firstName, person.lastName].filter(Boolean).join(" ").trim();
  return fullName || person.username || person.email || "Usuario";
}

function getRequestStatusLabel(status) {
  return REQUEST_STATUS_LABELS[status] || status || "Pendiente";
}

function getPurchaseBatchStatusLabel(status) {
  return PURCHASE_BATCH_STATUS_LABELS[status] || status || "Compra";
}

function canConfirmReceipt(request) {
  if (!request) return false;

  return (request.items || []).some(
    (item) =>
      Math.max(
        Number(item?.dispatchedQuantity || 0) - Number(item?.receivedQuantity || 0),
        0
      ) > 0
  );
}

function canDispatchBatch(batch) {
  if (!batch) return false;

  const effectiveStatus = String(batch.baseStatus || batch.status || "").toLowerCase();
  return !batch.dispatchedAt && !["draft", "dispatched", "completed", "cancelled"].includes(effectiveStatus);
}

function getDefaultRequestDraft() {
  return {
    destinationLocation: "warehouse",
    requesterNote: "",
    itemsByProduct: {},
  };
}

function getDefaultRequestLocationForRole(role = "") {
  switch (String(role || "").trim()) {
    case "kitchen":
      return "kitchen";
    case "lounge":
      return "lounge";
    case "warehouse":
    case "admin":
    default:
      return "warehouse";
  }
}

function getDefaultPurchaseDraft() {
  return {
    batchId: null,
    supplierName: "",
    purchasedAt: "",
    note: "",
    itemsByProduct: {},
  };
}

function getTodayDateTimeLocal() {
  const date = new Date();
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60000).toISOString().slice(0, 16);
}

function formatDateTimeLocalInput(value) {
  if (!value) return getTodayDateTimeLocal();

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return getTodayDateTimeLocal();
  }

  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60000).toISOString().slice(0, 16);
}

function createPurchaseDraftItem(item) {
  return {
    productId: item.productId,
    product: item.product,
    quantity: "",
    unitCost: "",
    note: "",
    pendingQuantity: item.pendingQuantity,
    unitSnapshot: item.unitSnapshot,
  };
}

function mergePurchaseDraftWithShoppingList(draft, shoppingList = []) {
  const currentItems = draft?.itemsByProduct || {};
  const nextItems = {};

  shoppingList.forEach((item) => {
    const currentItem = currentItems[item.productId];
    nextItems[item.productId] = {
      ...createPurchaseDraftItem(item),
      ...(currentItem || {}),
      productId: item.productId,
      product: item.product,
      pendingQuantity: item.pendingQuantity,
      unitSnapshot: item.unitSnapshot,
    };
  });

  return {
    batchId: draft?.batchId || null,
    supplierName: draft?.supplierName || "",
    purchasedAt: draft?.purchasedAt || getTodayDateTimeLocal(),
    note: draft?.note || "",
    itemsByProduct: nextItems,
  };
}

function buildPurchaseDraftFromBatch(batch, shoppingList = []) {
  const baseDraft = mergePurchaseDraftWithShoppingList(
    {
      batchId: batch?._id || null,
      supplierName: batch?.supplierName || "",
      purchasedAt: batch?.purchasedAt
        ? formatDateTimeLocalInput(batch.purchasedAt)
        : getTodayDateTimeLocal(),
      note: batch?.note || "",
      itemsByProduct: {},
    },
    shoppingList
  );

  const itemsByProduct = { ...baseDraft.itemsByProduct };

  for (const item of batch?.items || []) {
    const productId = String(item.productId || item.product?._id || "");
    if (!productId) continue;

    itemsByProduct[productId] = {
      ...(itemsByProduct[productId] || {}),
      productId,
      product: item.product || itemsByProduct[productId]?.product || null,
      quantity: item.quantity != null ? String(item.quantity) : "",
      unitCost: item.unitCost != null ? String(item.unitCost) : "",
      note: item.note || "",
      unitSnapshot: item.unitSnapshot || itemsByProduct[productId]?.unitSnapshot || "",
      pendingQuantity:
        itemsByProduct[productId]?.pendingQuantity ??
        Number(item.quantity || 0),
    };
  }

  return {
    ...baseDraft,
    itemsByProduct,
  };
}

export default function PurchasesPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [currentUser, setCurrentUser] = useState(null);
  const [hasResolvedCurrentUser, setHasResolvedCurrentUser] = useState(false);
  const [requests, setRequests] = useState([]);
  const [summary, setSummary] = useState(null);
  const [shoppingList, setShoppingList] = useState([]);
  const [batches, setBatches] = useState([]);
  const [batchesTotal, setBatchesTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState(() => getStringParam(searchParams, "search"));
  const [statusFilter, setStatusFilter] = useState(() => getStringParam(searchParams, "status", "all"));
  const [page, setPage] = useState(() => getPositiveIntParam(searchParams, "page", 1));
  const [activeTab, setActiveTab] = useState(() => getStringParam(searchParams, "tab", "requests"));

  const [requestModalOpen, setRequestModalOpen] = useState(false);
  const [purchaseModalOpen, setPurchaseModalOpen] = useState(false);
  const [requestModalMode, setRequestModalMode] = useState("create");
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [reviewModalOpen, setReviewModalOpen] = useState(false);
  const [isSubmittingRequest, setIsSubmittingRequest] = useState(false);
  const [isSubmittingPurchase, setIsSubmittingPurchase] = useState(false);
  const [isApprovingRequest, setIsApprovingRequest] = useState(false);
  const [isCancellingRequest, setIsCancellingRequest] = useState(false);
  const [isDeletingRequest, setIsDeletingRequest] = useState(false);
  const [isReceivingRequest, setIsReceivingRequest] = useState(false);
  const [dispatchingBatchId, setDispatchingBatchId] = useState("");
  const [dispatchBatchTarget, setDispatchBatchTarget] = useState(null);
  const [cancelRequestTarget, setCancelRequestTarget] = useState(null);
  const [deleteRequestTarget, setDeleteRequestTarget] = useState(null);

  const [builderFamilies, setBuilderFamilies] = useState([]);
  const [builderCategories, setBuilderCategories] = useState([]);
  const [builderProducts, setBuilderProducts] = useState([]);
  const [isLoadingBuilder, setIsLoadingBuilder] = useState(false);
  const [isLoadingBuilderMeta, setIsLoadingBuilderMeta] = useState(false);
  const [hasLoadedBuilderMeta, setHasLoadedBuilderMeta] = useState(false);
  const [builderSearch, setBuilderSearch] = useState("");
  const [builderFamilyId, setBuilderFamilyId] = useState("");
  const [builderCategoryId, setBuilderCategoryId] = useState("");
  const [requestDraft, setRequestDraft] = useState(() => getDefaultRequestDraft());
  const [purchaseDraft, setPurchaseDraft] = useState(() => getDefaultPurchaseDraft());
  const [hasInitializedPurchaseDraft, setHasInitializedPurchaseDraft] = useState(false);
  const [isDeletingPurchaseDraft, setIsDeletingPurchaseDraft] = useState(false);

  const [dialogModal, setDialogModal] = useState({
    open: false,
    title: "",
    message: "",
    variant: "info",
  });

  const isAdmin = currentUser?.role === "admin";

  useEffect(() => {
    setPage(1);
  }, [search, statusFilter, activeTab]);

  useEffect(() => {
    if (!hasResolvedCurrentUser) return;

    if (!isAdmin && activeTab !== "requests") {
      setActiveTab("requests");
    }
  }, [activeTab, hasResolvedCurrentUser, isAdmin]);

  useEffect(() => {
    if (!hasResolvedCurrentUser) return;

    const nextQuery = buildSearchParams(searchParams, {
      search: search.trim() || null,
      status: activeTab === "requests" && statusFilter !== "all" ? statusFilter : null,
      page: activeTab === "requests" && page > 1 ? page : null,
      tab: isAdmin && activeTab !== "requests" ? activeTab : null,
      modal: purchaseModalOpen && activeTab === "execution" ? "execution" : null,
    });

    if (nextQuery !== searchParams.toString()) {
      router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname, { scroll: false });
    }
  }, [activeTab, hasResolvedCurrentUser, isAdmin, page, pathname, purchaseModalOpen, router, search, searchParams, statusFilter]);

  const filteredBuilderCategories = useMemo(() => {
    if (!builderFamilyId) {
      return builderCategories;
    }

    return builderCategories.filter(
      (category) => String(category.familyId?._id || category.familyId || "") === builderFamilyId
    );
  }, [builderCategories, builderFamilyId]);

  useEffect(() => {
    if (
      builderCategoryId &&
      !filteredBuilderCategories.some((category) => category._id === builderCategoryId)
    ) {
      setBuilderCategoryId("");
    }
  }, [builderCategoryId, filteredBuilderCategories]);

  async function loadPage(options = {}) {
    const { silent = false } = options;

    try {
      if (!silent) {
        setIsLoading(true);
      }

      const meResponse = await fetch("/api/auth/me", { cache: "no-store" });
      const meResult = await meResponse.json();
      const user = meResult?.user || null;
      setCurrentUser(user);
      setHasResolvedCurrentUser(true);

      const requestParams = new URLSearchParams();
      requestParams.set("page", String(page));
      requestParams.set("limit", String(PAGE_SIZE));

      if (search.trim()) {
        requestParams.set("search", search.trim());
      }

      if (statusFilter !== "all") {
        requestParams.set("status", statusFilter);
      }

      if (user?.role !== "admin") {
        requestParams.set("mine", "true");
      }

      const tasks = [
        fetch(`/api/purchase-requests?${requestParams.toString()}`, {
          cache: "no-store",
        }),
      ];

      if (user?.role === "admin") {
        tasks.push(
          fetch("/api/purchase-batches?page=1&limit=24", {
            cache: "no-store",
          })
        );
      }

      const [requestsResponse, batchesResponse] = await Promise.all(tasks);
      const requestsResult = await requestsResponse.json();

      if (!requestsResponse.ok || !requestsResult.success) {
        throw new Error(requestsResult.message || "No se pudieron obtener las compras.");
      }

      setRequests(requestsResult.data || []);
      setSummary(requestsResult.summary || null);
      setShoppingList(requestsResult.consolidatedShoppingList || []);

      if (user?.role === "admin" && batchesResponse) {
        const batchesResult = await batchesResponse.json();

        if (!batchesResponse.ok || !batchesResult.success) {
          throw new Error(batchesResult.message || "No se pudo obtener la ejecucion de compras.");
        }

        setBatches(batchesResult.data || []);
        setBatchesTotal(batchesResult.meta?.total || 0);
        setShoppingList(batchesResult.consolidatedShoppingList || requestsResult.consolidatedShoppingList || []);
      } else {
        setBatches([]);
        setBatchesTotal(0);
      }
    } catch (error) {
      console.error(error);
      setRequests([]);
      setSummary(null);
      setShoppingList([]);
      setBatches([]);
      setBatchesTotal(0);
      setHasResolvedCurrentUser(true);
    } finally {
      if (!silent) {
        setIsLoading(false);
      }
    }
  }

  useEffect(() => {
    loadPage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, search, statusFilter]);

  useEffect(() => {
    if (!isAdmin || (builderFamilies.length && builderCategories.length)) return;

    let isCancelled = false;

    async function loadHierarchyMeta() {
      try {
        const [familiesResponse, categoriesResponse] = await Promise.all([
          fetch("/api/families", { cache: "no-store" }),
          fetch("/api/categories", { cache: "no-store" }),
        ]);

        const [familiesResult, categoriesResult] = await Promise.all([
          familiesResponse.json(),
          categoriesResponse.json(),
        ]);

        if (!familiesResponse.ok || !familiesResult.success) {
          throw new Error(familiesResult.message || "No se pudieron cargar las familias.");
        }

        if (!categoriesResponse.ok || !categoriesResult.success) {
          throw new Error(categoriesResult.message || "No se pudieron cargar las categorias.");
        }

        if (!isCancelled) {
          setBuilderFamilies(familiesResult.data || []);
          setBuilderCategories((categoriesResult.data || []).filter((category) => category.isActive));
        }
      } catch (error) {
        console.error(error);
      }
    }

    loadHierarchyMeta();

    return () => {
      isCancelled = true;
    };
  }, [builderCategories.length, builderFamilies.length, isAdmin]);

  useEffect(() => {
    if (!isAdmin || hasInitializedPurchaseDraft || !shoppingList.length) return;

    try {
      const savedDraft = JSON.parse(window.localStorage.getItem(PURCHASE_DRAFT_STORAGE_KEY) || "null");
      setPurchaseDraft(mergePurchaseDraftWithShoppingList(savedDraft || getDefaultPurchaseDraft(), shoppingList));
    } catch (error) {
      console.error(error);
      setPurchaseDraft(mergePurchaseDraftWithShoppingList(getDefaultPurchaseDraft(), shoppingList));
    } finally {
      setHasInitializedPurchaseDraft(true);
    }
  }, [hasInitializedPurchaseDraft, isAdmin, shoppingList]);

  useEffect(() => {
    if (!isAdmin) return;

    const shouldOpenExecutionModal =
      activeTab === "execution" && getStringParam(searchParams, "modal") === "execution";

    if (shouldOpenExecutionModal && !purchaseModalOpen) {
      setPurchaseModalOpen(true);
    }
  }, [activeTab, isAdmin, searchParams]);

  useEffect(() => {
    if (!requestModalOpen || hasLoadedBuilderMeta) return;

    let isCancelled = false;

    async function loadBuilderMeta() {
      try {
        setIsLoadingBuilderMeta(true);

        const [familiesResponse, categoriesResponse] = await Promise.all([
          fetch("/api/families", { cache: "no-store" }),
          fetch("/api/categories", { cache: "no-store" }),
        ]);

        const [familiesResult, categoriesResult] = await Promise.all([
          familiesResponse.json(),
          categoriesResponse.json(),
        ]);

        if (!familiesResponse.ok || !familiesResult.success) {
          throw new Error(familiesResult.message || "No se pudieron cargar las familias.");
        }

        if (!categoriesResponse.ok || !categoriesResult.success) {
          throw new Error(categoriesResult.message || "No se pudieron cargar las categorias.");
        }

        if (!isCancelled) {
          setBuilderFamilies(familiesResult.data || []);
          setBuilderCategories((categoriesResult.data || []).filter((category) => category.isActive));
          setHasLoadedBuilderMeta(true);
        }
      } catch (error) {
        console.error(error);
      } finally {
        if (!isCancelled) {
          setIsLoadingBuilderMeta(false);
        }
      }
    }

    loadBuilderMeta();

    return () => {
      isCancelled = true;
    };
  }, [hasLoadedBuilderMeta, requestModalOpen]);

  useEffect(() => {
    if (!requestModalOpen) return;

    let isCancelled = false;

    async function loadBuilderProducts() {
      try {
        setIsLoadingBuilder(true);

        const params = new URLSearchParams();

        if (builderSearch.trim()) {
          params.set("search", builderSearch.trim());
        }

        if (builderFamilyId) {
          params.set("familyId", builderFamilyId);
        }

        if (builderCategoryId) {
          params.set("categoryId", builderCategoryId);
        }

        const inventoryResponse = await fetch(
          `/api/inventory?${new URLSearchParams({
            ...Object.fromEntries(params.entries()),
            activeOnly: "true",
            purchaseEligible: "true",
          }).toString()}`,
          { cache: "no-store" }
        );
        const inventoryResult = await inventoryResponse.json();

        if (!inventoryResponse.ok || !inventoryResult.success) {
          throw new Error(inventoryResult.message || "No se pudieron cargar los productos.");
        }

        if (!isCancelled) {
          setBuilderProducts(inventoryResult.data || []);
        }
      } catch (error) {
        console.error(error);
        if (!isCancelled) {
          setBuilderProducts([]);
        }
      } finally {
        if (!isCancelled) {
          setIsLoadingBuilder(false);
        }
      }
    }

    loadBuilderProducts();

    return () => {
      isCancelled = true;
    };
  }, [builderFamilyId, builderSearch, builderCategoryId, requestModalOpen]);

  const heroStats = useMemo(() => {
    const baseStats = [
      { label: "Solicitudes", value: summary?.total || 0 },
      { label: "Pendientes", value: summary?.pending || 0 },
      { label: "Aprobadas", value: summary?.approved || 0 },
    ];

    if (isAdmin) {
      baseStats.push({ label: "Por ejecutar", value: shoppingList.length });
      baseStats.push({ label: "Compras", value: batchesTotal });
    } else {
      baseStats.push({ label: "Completadas", value: summary?.completed || 0 });
    }

    return baseStats;
  }, [batchesTotal, isAdmin, shoppingList.length, summary]);

  const filteredShoppingList = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return shoppingList;

    return shoppingList.filter((item) => {
      const productName = item.product?.name?.toLowerCase() || "";
      const productCode = item.product?.code?.toLowerCase() || "";
      return productName.includes(query) || productCode.includes(query);
    });
  }, [search, shoppingList]);

  const filteredBatches = useMemo(() => {
    const query = search.trim().toLowerCase();
    const visibleBatches = batches.filter((batch) =>
      batch.status !== "completed" && batch.status !== "cancelled"
    );
    if (!query) return visibleBatches;

    return visibleBatches.filter((batch) => {
      const supplier = batch.supplierName?.toLowerCase() || "";
      const code = batch.batchNumber?.toLowerCase() || "";
      return supplier.includes(query) || code.includes(query);
    });
  }, [batches, search]);

  const executionBatches = useMemo(
    () => filteredBatches.slice(0, 5),
    [filteredBatches]
  );

  const selectedRequestItems = useMemo(
    () =>
      Object.entries(requestDraft.itemsByProduct)
        .filter(([, item]) => Number(item.requestedQuantity) > 0)
        .map(([, item]) => item),
    [requestDraft.itemsByProduct]
  );

  const selectedPurchaseItems = useMemo(
    () =>
      Object.entries(purchaseDraft.itemsByProduct)
        .filter(([, item]) => Number(item.quantity) > 0)
        .map(([, item]) => item),
    [purchaseDraft.itemsByProduct]
  );

  const hasPurchaseSelection = selectedPurchaseItems.length > 0;
  const hasPurchaseDraftData =
    hasPurchaseSelection ||
    Boolean(purchaseDraft.supplierName?.trim()) ||
    Boolean(purchaseDraft.note?.trim());

  function openRequestModal() {
    const destinationLocation = getDefaultRequestLocationForRole(currentUser?.role);
    setRequestModalMode("create");
    setSelectedRequest(null);
    setRequestDraft({
      ...getDefaultRequestDraft(),
      destinationLocation,
    });
    setBuilderSearch("");
    setBuilderFamilyId("");
    setBuilderCategoryId("");
    setRequestModalOpen(true);
  }

  function closeRequestModal() {
    if (isSubmittingRequest) return;
    setRequestModalOpen(false);
  }

  function dismissRequestModal() {
    setRequestModalOpen(false);
  }

  function openReviewModal(request) {
    setSelectedRequest(request);
    setReviewModalOpen(true);
  }

  function closeReviewModal() {
    if (isCancellingRequest || isApprovingRequest || isDeletingRequest || isReceivingRequest) return;
    setReviewModalOpen(false);
  }

  function dismissReviewModal() {
    setReviewModalOpen(false);
  }

  function openEditRequestModal(request) {
    setSelectedRequest(request);
    setRequestModalMode("edit");
    setRequestDraft({
      destinationLocation: request.destinationLocation || getDefaultRequestLocationForRole(currentUser?.role),
      requesterNote: request.requesterNote || "",
      itemsByProduct: (request.items || []).reduce((acc, item) => {
        const productId = String(item.productId?._id || item.productId);
        acc[productId] = {
          productId,
          product: item.product || null,
          requestedQuantity: String(item.requestedQuantity || ""),
          requesterNote: item.requesterNote || "",
        };
        return acc;
      }, {}),
    });
    setBuilderSearch("");
    setBuilderFamilyId("");
    setBuilderCategoryId("");
    setReviewModalOpen(false);
    setRequestModalOpen(true);
  }

  function clearBuilderFilters() {
    setBuilderSearch("");
    setBuilderFamilyId("");
    setBuilderCategoryId("");
  }

  function openPurchaseModal() {
    setPurchaseDraft((prev) => mergePurchaseDraftWithShoppingList(prev, shoppingList));
    setPurchaseModalOpen(true);
  }

  function openPurchaseDraft(batch) {
    if (!batch?._id) return;
    setPurchaseDraft(buildPurchaseDraftFromBatch(batch, shoppingList));
    setPurchaseModalOpen(true);
  }

  function openPurchaseHistory() {
    router.push("/dashboard/purchases/history");
  }

  function openDispatchConfirm(batch) {
    setDispatchBatchTarget(batch || null);
  }

  function closeDispatchConfirm() {
    if (dispatchingBatchId) return;
    setDispatchBatchTarget(null);
  }

  function openCancelRequestConfirm(request) {
    setCancelRequestTarget(request || selectedRequest || null);
  }

  function closeCancelRequestConfirm() {
    if (isCancellingRequest) return;
    setCancelRequestTarget(null);
  }

  function openDeleteRequestConfirm(request) {
    setDeleteRequestTarget(request || selectedRequest || null);
  }

  function closeDeleteRequestConfirm() {
    if (isDeletingRequest) return;
    setDeleteRequestTarget(null);
  }

  function closePurchaseModal() {
    if (isSubmittingPurchase || isDeletingPurchaseDraft) return;
    setPurchaseModalOpen(false);
  }

  function dismissPurchaseModal() {
    setPurchaseModalOpen(false);
  }

  function toggleRequestProduct(product) {
    setRequestDraft((prev) => {
      const nextItems = { ...prev.itemsByProduct };
      const key = product._id;

      if (nextItems[key]) {
        delete nextItems[key];
      } else {
        nextItems[key] = {
          productId: product._id,
          product,
          requestedQuantity: "1",
          requesterNote: "",
        };
      }

      return {
        ...prev,
        itemsByProduct: nextItems,
      };
    });
  }

  function handleRequestItemChange(productId, field, value) {
    setRequestDraft((prev) => ({
      ...prev,
      itemsByProduct: {
        ...prev.itemsByProduct,
        [productId]: {
          ...prev.itemsByProduct[productId],
          [field]: value,
        },
      },
    }));
  }

  function handlePurchaseItemChange(productId, field, value) {
    setPurchaseDraft((prev) => ({
      ...prev,
      itemsByProduct: {
        ...prev.itemsByProduct,
        [productId]: {
          ...prev.itemsByProduct[productId],
          [field]: value,
        },
      },
    }));
  }

  useEffect(() => {
    if (!isAdmin) return;

    try {
      window.localStorage.setItem(
        PURCHASE_DRAFT_STORAGE_KEY,
        JSON.stringify(mergePurchaseDraftWithShoppingList(purchaseDraft, shoppingList))
      );
    } catch (error) {
      console.error(error);
    }
  }, [isAdmin, purchaseDraft, shoppingList]);

  async function handleCreateRequest(event) {
    event.preventDefault();

    const items = selectedRequestItems.map((item) => ({
      productId: item.productId,
      requestedQuantity: Number(item.requestedQuantity),
      requesterNote: item.requesterNote || "",
    }));

    if (!items.length) {
      setDialogModal({
        open: true,
        title: "Agrega productos",
        message: "Selecciona al menos un producto con cantidad mayor a cero.",
        variant: "warning",
      });
      return;
    }

    try {
      setIsSubmittingRequest(true);
      const isEditing = requestModalMode === "edit" && selectedRequest?._id;
      const response = await fetch(
        isEditing ? `/api/purchase-requests/${selectedRequest._id}` : "/api/purchase-requests",
        {
        method: isEditing ? "PATCH" : "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          destinationLocation: requestDraft.destinationLocation,
          requesterNote: requestDraft.requesterNote,
          items,
        }),
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.message || "No se pudo crear la solicitud.");
      }

      setDialogModal({
        open: true,
        title: isEditing ? "Solicitud actualizada" : "Solicitud creada",
        message: isEditing
          ? "La solicitud se actualizo correctamente."
          : "La solicitud se registro correctamente.",
        variant: "success",
      });
      dismissRequestModal();
      await loadPage({ silent: true });
    } catch (error) {
      console.error(error);
      setDialogModal({
        open: true,
        title: "No se pudo crear la solicitud",
        message: error.message || "Intenta nuevamente.",
        variant: "danger",
      });
    } finally {
      setIsSubmittingRequest(false);
    }
  }

  async function handleCancelRequest() {
    const requestToCancel = cancelRequestTarget || selectedRequest;
    if (!requestToCancel?._id) return;

    try {
      setIsCancellingRequest(true);

      const response = await fetch(`/api/purchase-requests/${requestToCancel._id}/cancel`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}),
      });
      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.message || "No se pudo cancelar la solicitud.");
      }

      setCancelRequestTarget(null);
      dismissReviewModal();
      setDialogModal({
        open: true,
        title: "Solicitud cancelada",
        message: "La solicitud se cancelo correctamente.",
        variant: "success",
      });
      await loadPage({ silent: true });
    } catch (error) {
      console.error(error);
      setDialogModal({
        open: true,
        title: "No se pudo cancelar la solicitud",
        message: error.message || "Intenta nuevamente.",
        variant: "danger",
      });
    } finally {
      setIsCancellingRequest(false);
    }
  }

  async function handleApproveRequest() {
    if (!selectedRequest?._id) return;

    try {
      setIsApprovingRequest(true);

      const response = await fetch(`/api/purchase-requests/${selectedRequest._id}/approve`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}),
      });
      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.message || "No se pudo aprobar la solicitud.");
      }

      dismissReviewModal();
      setDialogModal({
        open: true,
        title: "Solicitud aprobada",
        message: "La solicitud ya forma parte del flujo de compras.",
        variant: "success",
      });
      await loadPage({ silent: true });
    } catch (error) {
      console.error(error);
      setDialogModal({
        open: true,
        title: "No se pudo aprobar la solicitud",
        message: error.message || "Intenta nuevamente.",
        variant: "danger",
      });
    } finally {
      setIsApprovingRequest(false);
    }
  }

  async function handleDeleteRequest() {
    const requestToDelete = deleteRequestTarget || selectedRequest;
    if (!requestToDelete?._id) return;

    try {
      setIsDeletingRequest(true);

      const response = await fetch(`/api/purchase-requests/${requestToDelete._id}`, {
        method: "DELETE",
      });
      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.message || "No se pudo eliminar la solicitud.");
      }

      setDeleteRequestTarget(null);
      dismissReviewModal();
      setDialogModal({
        open: true,
        title: "Solicitud eliminada",
        message: "La solicitud de compra se elimino correctamente.",
        variant: "success",
      });
      await loadPage({ silent: true });
    } catch (error) {
      console.error(error);
      setDialogModal({
        open: true,
        title: "No se pudo eliminar la solicitud",
        message: error.message || "Intenta nuevamente.",
        variant: "danger",
      });
    } finally {
      setIsDeletingRequest(false);
    }
  }

  async function handleReceiveRequest(payload) {
    if (!selectedRequest?._id) return;

    try {
      setIsReceivingRequest(true);

      const response = await fetch(`/api/purchase-requests/${selectedRequest._id}/receive`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.message || "No se pudo registrar la recepcion.");
      }

      dismissReviewModal();
      setDialogModal({
        open: true,
        title: "Recepcion registrada",
        message: "La solicitud reflejo correctamente lo recibido en restaurante.",
        variant: "success",
      });
      await loadPage({ silent: true });
    } catch (error) {
      console.error(error);
      setDialogModal({
        open: true,
        title: "No se pudo registrar la recepcion",
        message: error.message || "Intenta nuevamente.",
        variant: "danger",
      });
    } finally {
      setIsReceivingRequest(false);
    }
  }

  async function handleCreatePurchase(event) {
    event.preventDefault();

    const items = selectedPurchaseItems.map((item) => ({
      productId: item.productId,
      quantity: Number(item.quantity),
      unitCost: item.unitCost === "" ? null : Number(item.unitCost),
      note: item.note || "",
    }));

    if (!items.length) {
      setDialogModal({
        open: true,
        title: "Agrega productos",
        message: "Selecciona al menos un producto para registrar la compra.",
        variant: "warning",
      });
      return;
    }

    try {
      setIsSubmittingPurchase(true);

      const response = await fetch("/api/purchase-batches", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          batchId: purchaseDraft.batchId || null,
          supplierName: purchaseDraft.supplierName,
          purchasedAt: purchaseDraft.purchasedAt || null,
          note: purchaseDraft.note,
          items,
        }),
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.message || "No se pudo registrar la compra.");
      }

      dismissPurchaseModal();
      setPurchaseDraft(getDefaultPurchaseDraft());
      window.localStorage.removeItem(PURCHASE_DRAFT_STORAGE_KEY);
      setActiveTab("execution");
      setDialogModal({
        open: true,
        title: "Compra registrada",
        message: "La compra quedo registrada. La solicitud pasa a en proceso hasta que el despacho y la recepcion sean confirmados.",
        variant: "success",
      });
      await loadPage({ silent: true });
    } catch (error) {
      console.error(error);
      setDialogModal({
        open: true,
        title: "No se pudo registrar la compra",
        message: error.message || "Intenta nuevamente.",
        variant: "danger",
      });
    } finally {
      setIsSubmittingPurchase(false);
    }
  }

  async function handleSavePurchaseDraft() {
    if (!hasPurchaseDraftData) {
      setDialogModal({
        open: true,
        title: "Nada para guardar",
        message: "Agrega al menos un producto o una nota antes de guardar el borrador.",
        variant: "warning",
      });
      return;
    }

    try {
      setIsSubmittingPurchase(true);

      const items = Object.values(purchaseDraft.itemsByProduct || {})
        .filter((item) => Number(item.quantity) > 0)
        .map((item) => ({
          productId: item.productId,
          quantity: Number(item.quantity),
          unitCost: item.unitCost === "" ? null : Number(item.unitCost),
          note: item.note || "",
        }));

      const response = await fetch("/api/purchase-batches", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          batchId: purchaseDraft.batchId || null,
          saveAsDraft: true,
          supplierName: purchaseDraft.supplierName,
          purchasedAt: purchaseDraft.purchasedAt || null,
          note: purchaseDraft.note,
          items,
        }),
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.message || "No se pudo guardar el borrador.");
      }

      setPurchaseDraft((prev) => ({
        ...prev,
        batchId: result.data?._id || prev.batchId || null,
      }));

      try {
        window.localStorage.setItem(
          PURCHASE_DRAFT_STORAGE_KEY,
          JSON.stringify({
            ...mergePurchaseDraftWithShoppingList(purchaseDraft, shoppingList),
            batchId: result.data?._id || purchaseDraft.batchId || null,
          })
        );
      } catch (storageError) {
        console.error(storageError);
      }

      setDialogModal({
        open: true,
        title: "Borrador guardado",
        message: "La compra quedó guardada como borrador para continuar luego.",
        variant: "success",
      });
      await loadPage({ silent: true });
    } catch (error) {
      console.error(error);
      setDialogModal({
        open: true,
        title: "No se pudo guardar el borrador",
        message: error.message || "Intenta nuevamente.",
        variant: "danger",
      });
    } finally {
      setIsSubmittingPurchase(false);
    }
  }

  async function handleDeletePurchaseDraft() {
    if (!purchaseDraft.batchId) {
      setPurchaseDraft(getDefaultPurchaseDraft());
      window.localStorage.removeItem(PURCHASE_DRAFT_STORAGE_KEY);
      dismissPurchaseModal();
      return;
    }

    try {
      setIsDeletingPurchaseDraft(true);

      const response = await fetch(`/api/purchase-batches/${purchaseDraft.batchId}`, {
        method: "DELETE",
      });
      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.message || "No se pudo eliminar el borrador.");
      }

      setPurchaseDraft(getDefaultPurchaseDraft());
      window.localStorage.removeItem(PURCHASE_DRAFT_STORAGE_KEY);
      dismissPurchaseModal();
      setDialogModal({
        open: true,
        title: "Borrador eliminado",
        message: "El borrador de compra fue eliminado correctamente.",
        variant: "success",
      });
      await loadPage({ silent: true });
    } catch (error) {
      console.error(error);
      setDialogModal({
        open: true,
        title: "No se pudo eliminar el borrador",
        message: error.message || "Intenta nuevamente.",
        variant: "danger",
      });
    } finally {
      setIsDeletingPurchaseDraft(false);
    }
  }

  async function handleDispatchBatch(batchId) {
    if (!batchId) return;

    try {
      setDispatchingBatchId(batchId);

      const response = await fetch(`/api/purchase-batches/${batchId}/dispatch`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}),
      });
      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.message || "No se pudo despachar la compra.");
      }

      setDispatchBatchTarget(null);
      setDialogModal({
        open: true,
        title: "Compra despachada",
        message: "La compra ya fue despachada. Ahora cada solicitante debe confirmar lo recibido para que ingrese al inventario.",
        variant: "success",
      });
      await loadPage({ silent: true });
    } catch (error) {
      console.error(error);
      setDialogModal({
        open: true,
        title: "No se pudo despachar la compra",
        message: error.message || "Intenta nuevamente.",
        variant: "danger",
      });
    } finally {
      setDispatchingBatchId("");
    }
  }

  const fromItem = summary?.total ? (page - 1) * PAGE_SIZE + 1 : 0;
  const toItem = summary?.total ? Math.min(page * PAGE_SIZE, summary.total) : 0;

  return (
    <>
      <div className="page">
        <section className={`hero fadeScaleIn ${styles.heroShell}`}>
          <div className="heroCopy">
            <span className="eyebrow">Compras</span>
            <h1 className="title">Compras</h1>
            <p className="description">
              Gestiona solicitudes, necesidades pendientes y la ejecucion real de compras desde un solo modulo.
            </p>
          </div>

          <div className={styles.heroStats}>
            {heroStats.map((item) => (
              <div key={item.label} className="compactStat">
                <span>
                  {item.label} <strong>{item.value}</strong>
                </span>
              </div>
            ))}
          </div>
        </section>

        {isAdmin ? (
          <div className={`${styles.tabBar} fadeSlideIn delayOne`}>
            <button
              type="button"
              className={`miniAction ${activeTab === "requests" ? "miniActionPrimary" : ""}`}
              onClick={() => setActiveTab("requests")}
            >
              <ClipboardList size={14} />
              Solicitudes
            </button>
            <button
              type="button"
              className={`miniAction ${activeTab === "execution" ? "miniActionPrimary" : ""}`}
              onClick={() => setActiveTab("execution")}
            >
              <ShoppingCart size={14} />
              Ejecucion
            </button>
          </div>
        ) : null}

        {activeTab === "requests" ? (
          <>
            <div className={`${styles.toolbar} fadeSlideIn delayOne`}>
              <div className="searchField">
                <Search size={16} />
                <input
                  type="text"
                  className="searchInput"
                  placeholder="Buscar por numero o nota"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </div>

              <div className="selectWrap">
                <select
                  value={statusFilter}
                  onChange={(event) => setStatusFilter(event.target.value)}
                  className="filterSelect"
                >
                  <option value="all">Todos los estados</option>
                  <option value="pending">Pendiente</option>
                  <option value="approved">Aprobada</option>
                  <option value="in_progress">En proceso</option>
                  <option value="partially_purchased">Parcialmente atendida</option>
                  <option value="completed">Completada</option>
                  <option value="rejected">Rechazada</option>
                  <option value="cancelled">Cancelada</option>
                </select>
              </div>
            </div>

            <section className={`${styles.panel} fadeSlideIn delayTwo`}>
              <div className={styles.panelHeader}>
                <div>
                  <span className="panelEyebrow">Solicitudes</span>
                  <h2 className={styles.panelTitle}>
                    {isAdmin ? "Bandeja general" : "Mis solicitudes"}
                  </h2>
                </div>

                <button type="button" className="miniAction miniActionPrimary" onClick={openRequestModal}>
                  <PackagePlus size={14} />
                  Nueva solicitud
                </button>
              </div>

              {isLoading ? (
                <div className={styles.emptyState}>Cargando compras...</div>
              ) : requests.length === 0 ? (
                <div className={styles.emptyState}>No hay solicitudes para mostrar.</div>
              ) : (
                <>
                  <div className={styles.requestList}>
                    {requests.map((request, index) => (
                      <article
                        key={request._id}
                        className={`${styles.requestCard} fadeScaleIn`}
                        style={{ animationDelay: `${Math.min(index, 8) * 0.03}s` }}
                        role="button"
                        tabIndex={0}
                        onClick={() => openReviewModal(request)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            openReviewModal(request);
                          }
                        }}
                      >
                        <div className={styles.requestTop}>
                          <div>
                            <strong className={styles.requestNumber}>{request.requestNumber}</strong>
                            <p className={styles.requestMeta}>{formatDate(request.requestedAt)}</p>
                            {isAdmin ? (
                              <p className={styles.requestMeta}>{getRequesterLabel(request)}</p>
                            ) : null}
                          </div>

                          <span
                            className={`${styles.statusBadge} ${
                              styles[`status${String(request.status || "").replace(/(^|_)([a-z])/g, (_, __, char) => char.toUpperCase())}`] || ""
                            }`}
                          >
                            {getRequestStatusLabel(request.status)}
                          </span>
                        </div>

                        <div className={styles.requestBody}>
                          <span>{request.items?.length || 0} productos</span>
                        </div>

                        <div className={styles.requestItems}>
                          {(request.items || []).slice(0, 3).map((item) => (
                            <span key={item._id} className={styles.requestItemChip}>
                              {item.product?.name || "Producto"} x {item.requestedQuantity}
                            </span>
                          ))}
                          {(request.items?.length || 0) > 3 ? (
                            <span className={styles.requestItemChip}>+{request.items.length - 3} mas</span>
                          ) : null}
                        </div>

                        {request.requesterNote ? (
                          <p className={styles.requestNote}>{request.requesterNote}</p>
                        ) : null}

                        {canConfirmReceipt(request) ? (
                          <div className={styles.requestActions}>
                            <button
                              type="button"
                              className="miniAction miniActionSuccess"
                              onClick={(event) => {
                                event.stopPropagation();
                                openReviewModal(request);
                              }}
                            >
                              Confirmar recibido
                            </button>
                          </div>
                        ) : null}
                      </article>
                    ))}
                  </div>

                  <PaginationBar
                    page={page}
                    totalPages={Math.max(Math.ceil((summary?.total || 0) / PAGE_SIZE), 1)}
                    totalItems={summary?.total || 0}
                    fromItem={fromItem}
                    toItem={toItem}
                    itemLabel="solicitudes"
                    onPageChange={setPage}
                  />
                </>
              )}
            </section>
          </>
        ) : (
          <>
            <div className={`${styles.toolbar} fadeSlideIn delayOne`}>
              <div className="searchField">
                <Search size={16} />
                <input
                  type="text"
                  className="searchInput"
                  placeholder="Buscar por producto, proveedor o lote"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </div>

              <button
                type="button"
                className={`miniAction miniActionPrimary ${styles.toolbarAction}`}
                onClick={openPurchaseModal}
                disabled={!shoppingList.length}
              >
                <ShoppingCart size={14} />
                Registrar compra
              </button>
            </div>

            <div className={`${styles.executionGrid} fadeSlideIn delayTwo`}>
              <section className={styles.panel}>
                <div className={styles.panelHeader}>
                  <div>
                    <span className="panelEyebrow">Consolidado</span>
                    <h2 className={styles.panelTitle}>Pendiente por ejecutar</h2>
                  </div>
                </div>

                {isLoading ? (
                  <div className={styles.emptyState}>Cargando pendientes...</div>
                ) : filteredShoppingList.length === 0 ? (
                  <div className={styles.emptyState}>No hay productos pendientes por comprar.</div>
                ) : (
                  <div className={styles.shoppingList}>
                    {filteredShoppingList.map((item, index) => (
                      <article
                        key={item.productId}
                        className={`${styles.shoppingRow} fadeScaleIn`}
                        style={{ animationDelay: `${Math.min(index, 8) * 0.03}s` }}
                      >
                        <div className={styles.shoppingMain}>
                          <strong>{item.product?.name || "Producto"}</strong>
                          <span>{item.requests.length} solicitudes vinculadas</span>
                        </div>

                        <div className={styles.shoppingMeta}>
                          <Boxes size={14} />
                          <strong>{item.pendingQuantity}</strong>
                          <span>{item.unitSnapshot}</span>
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </section>

              <section
                className={`${styles.panel} ${styles.historyPanel}`}
                role="button"
                tabIndex={0}
                onClick={openPurchaseHistory}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    openPurchaseHistory();
                  }
                }}
              >
                <div className={styles.panelHeader}>
                  <div>
                    <span className="panelEyebrow">Historial</span>
                    <h2 className={styles.panelTitle}>Compras registradas</h2>
                  </div>
                  <span className={styles.historyHint}>Abrir historial</span>
                </div>

                {isLoading ? (
                  <div className={styles.emptyState}>Cargando compras...</div>
                ) : executionBatches.length === 0 ? (
                  <div className={styles.emptyState}>Aun no hay compras registradas.</div>
                ) : (
                  <div className={styles.batchList}>
                    {executionBatches.map((batch, index) => (
                      <article
                        key={batch._id}
                        className={`${styles.batchCard} fadeScaleIn`}
                        style={{ animationDelay: `${Math.min(index, 8) * 0.03}s` }}
                      >
                        <div className={styles.batchTop}>
                          <div className={styles.batchHeading}>
                            <strong>{batch.batchNumber}</strong>
                            <span>{formatDate(batch.purchasedAt)}</span>
                          </div>
                          <span className={`${styles.statusBadge} ${batch.status === "completed" ? styles.statusCompleted : styles.statusApproved}`}>
                            {getPurchaseBatchStatusLabel(batch.status)}
                          </span>
                        </div>

                        <div className={styles.batchBody}>
                          {batch.baseStatus === "dispatched"
                            ? <span>{getLocationLabel(batch.destinationLocation)}</span>
                            : batch.baseStatus === "draft"
                              ? <span>Borrador editable</span>
                              : null}
                        </div>

                        {isAdmin && batch.baseStatus === "draft" ? (
                          <div className={styles.batchActions}>
                            <button
                              type="button"
                              className={`miniAction ${styles.batchDispatchButton}`}
                              onClick={(event) => {
                                event.stopPropagation();
                                openPurchaseDraft(batch);
                              }}
                            >
                              <ShoppingCart size={14} />
                              Abrir borrador
                            </button>
                          </div>
                        ) : null}

                        {isAdmin && canDispatchBatch(batch) ? (
                          <div className={styles.batchActions}>
                            <button
                              type="button"
                              className={`miniAction ${styles.batchDispatchButton}`}
                              onClick={(event) => {
                                event.stopPropagation();
                                openDispatchConfirm(batch);
                              }}
                              disabled={dispatchingBatchId === batch._id}
                            >
                              <ShoppingCart size={14} />
                              {dispatchingBatchId === batch._id ? "Despachando..." : "Despachar compra"}
                            </button>
                          </div>
                        ) : null}
                      </article>
                    ))}
                  </div>
                )}

                {batchesTotal > 0 ? (
                  <button
                    type="button"
                    className={`miniAction ${styles.historyAction}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      openPurchaseHistory();
                    }}
                  >
                    Ver historial completo
                  </button>
                ) : null}
              </section>
            </div>
          </>
        )}
      </div>

      <PurchaseRequestModal
        open={requestModalOpen}
        mode={requestModalMode}
        isSubmitting={isSubmittingRequest}
        isLoading={isLoadingBuilder || isLoadingBuilderMeta}
        families={builderFamilies}
        categories={builderCategories}
        filteredCategories={filteredBuilderCategories}
        products={builderProducts}
        showDestinationSelect={isAdmin}
        destinationOptions={PURCHASE_REQUEST_LOCATION_OPTIONS}
        search={builderSearch}
        familyId={builderFamilyId}
        categoryId={builderCategoryId}
        requestDraft={requestDraft}
        selectedItems={selectedRequestItems}
        onSearchChange={setBuilderSearch}
        onFamilyChange={(value) => {
          setBuilderFamilyId(value);
          setBuilderCategoryId("");
        }}
        onCategoryChange={setBuilderCategoryId}
        onClearFilters={clearBuilderFilters}
        onToggleProduct={toggleRequestProduct}
        onItemChange={handleRequestItemChange}
        onNoteChange={(value) =>
          setRequestDraft((prev) => ({
            ...prev,
            requesterNote: value,
          }))
        }
        onDestinationChange={(value) =>
          setRequestDraft((prev) => ({
            ...prev,
            destinationLocation: value,
          }))
        }
        onClose={closeRequestModal}
        onSubmit={handleCreateRequest}
      />

      <PurchaseRequestReviewModal
        open={reviewModalOpen}
        request={selectedRequest}
        canApprove={isAdmin && selectedRequest?.status === "pending"}
        canEdit={selectedRequest?.status === "pending"}
        canCancel={selectedRequest?.status === "pending"}
        canDelete={isAdmin}
        canReceive={canConfirmReceipt(selectedRequest)}
        isApproving={isApprovingRequest}
        isCancelling={isCancellingRequest}
        isDeleting={isDeletingRequest}
        isReceiving={isReceivingRequest}
        onClose={closeReviewModal}
        onApprove={handleApproveRequest}
        onEdit={() => openEditRequestModal(selectedRequest)}
        onCancel={() => openCancelRequestConfirm(selectedRequest)}
        onDelete={() => openDeleteRequestConfirm(selectedRequest)}
        onReceive={handleReceiveRequest}
      />

      <PurchaseExecutionModal
        open={purchaseModalOpen}
        purchaseDraft={purchaseDraft}
        shoppingList={shoppingList}
        families={builderFamilies}
        categories={builderCategories}
        isSubmitting={isSubmittingPurchase || isDeletingPurchaseDraft}
        hasSelectedItems={hasPurchaseSelection}
        hasDraftData={hasPurchaseDraftData}
        isDraft={Boolean(purchaseDraft.batchId)}
        onClose={closePurchaseModal}
        onSubmit={handleCreatePurchase}
        onSaveDraft={handleSavePurchaseDraft}
        onDeleteDraft={handleDeletePurchaseDraft}
        onDraftChange={(field, value) =>
          setPurchaseDraft((prev) => ({
            ...prev,
            [field]: value,
          }))
        }
        onItemChange={handlePurchaseItemChange}
      />

      <DialogModal
        open={dialogModal.open}
        title={dialogModal.title}
        message={dialogModal.message}
        variant={dialogModal.variant}
        onClose={() => setDialogModal((prev) => ({ ...prev, open: false }))}
        onConfirm={() => setDialogModal((prev) => ({ ...prev, open: false }))}
      />

      <ConfirmModal
        open={Boolean(dispatchBatchTarget)}
        title="Despachar compra"
        description={
          dispatchBatchTarget
            ? `Esta accion marcara ${dispatchBatchTarget.batchNumber} como despachada hacia las ubicaciones de sus solicitudes vinculadas.`
            : "Confirma el despacho de esta compra."
        }
        confirmLabel="Despachar"
        cancelLabel="Volver"
        variant="warning"
        isSubmitting={Boolean(dispatchingBatchId)}
        onClose={closeDispatchConfirm}
        onConfirm={() => handleDispatchBatch(dispatchBatchTarget?._id)}
      />

      <ConfirmModal
        open={Boolean(cancelRequestTarget)}
        title="Cancelar solicitud"
        description={
          cancelRequestTarget
            ? `Esta accion cancelara ${cancelRequestTarget.requestNumber} y ya no seguira en el flujo de compras.`
            : "Confirma la cancelacion de esta solicitud."
        }
        confirmLabel="Cancelar solicitud"
        cancelLabel="Volver"
        variant="danger"
        isSubmitting={isCancellingRequest}
        onClose={closeCancelRequestConfirm}
        onConfirm={handleCancelRequest}
      />

      <ConfirmModal
        open={Boolean(deleteRequestTarget)}
        title="Eliminar solicitud"
        description={
          deleteRequestTarget
            ? `Esta accion eliminara ${deleteRequestTarget.requestNumber} de forma permanente.`
            : "Confirma la eliminacion de esta solicitud."
        }
        confirmLabel="Eliminar"
        cancelLabel="Volver"
        variant="danger"
        isSubmitting={isDeletingRequest}
        onClose={closeDeleteRequestConfirm}
        onConfirm={handleDeleteRequest}
      />
    </>
  );
}
