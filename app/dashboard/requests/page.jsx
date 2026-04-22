"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowRightLeft, Plus, Search } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import styles from "./page.module.scss";

import DialogModal from "@components/shared/DialogModal/DialogModal";
import RequestFulfillmentModal from "@components/requests/RequestFulfillmentModal/RequestFulfillmentModal";
import RequestReviewModal from "@components/requests/RequestReviewModal/RequestReviewModal";
import RequestDetailsModal from "@components/requests/RequestDetailsModal/RequestDetailsModal";
import RequestFormModal from "@components/requests/RequestFormModal/RequestFormModal";
import { getPurposeLabel } from "@libs/constants/purposes";
import PaginationBar from "@components/shared/PaginationBar/PaginationBar";
import { PAGE_LIMITS } from "@libs/constants/pagination";
import { buildSearchParams, getPositiveIntParam, getStringParam } from "@libs/urlParams";
import { getUserDisplayName } from "@libs/userDisplay";
import {
  getLocationLabel,
  getRequestStatusLabel,
  getRequestTypeLabel,
} from "@libs/constants/domainLabels";

const PAGE_SIZE = PAGE_LIMITS.requests;

function createEmptyRequestItem() {
  return {
    productId: "",
    requestedQuantity: "",
    unit: "unit",
    notes: "",
  };
}

function createInitialFormData(destinationLocation = "warehouse", operationalLocation = "kitchen") {
  const isReturnRequest = destinationLocation === "warehouse";

  return {
    requestType: isReturnRequest ? "return" : "operation",
    sourceLocation: operationalLocation,
    destinationLocation,
    requestPurpose: isReturnRequest ? "return_to_warehouse" : "",
    notes: "",
    items: [createEmptyRequestItem()],
  };
}

function createInitialReviewData() {
  return {
    notes: "",
    items: [],
  };
}

function createInitialFulfillmentData() {
  return {
    notes: "",
    items: [],
  };
}

function getRequestStatusClass(status) {
  switch (status) {
    case "pending":
      return styles.statusPending;
    case "approved":
    case "processing":
      return styles.statusApproved;
    case "partially_fulfilled":
      return styles.statusPartial;
    case "fulfilled":
      return styles.statusFulfilled;
    case "rejected":
      return styles.statusRejected;
    case "cancelled":
      return styles.statusCancelled;
    default:
      return styles.statusDefault;
  }
}

function formatDate(value) {
  if (!value) return "Ã¢â‚¬â€,Ã¢â‚¬â€";

  try {
    return new Intl.DateTimeFormat("es-EC", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));
  } catch {
    return "Ã¢â‚¬â€,Ã¢â‚¬â€";
  }
}

function getPersonName(user) {
  if (!user) return "ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â";
  return getUserDisplayName(user, "Usuario");
}

export default function RequestsPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [allRequests, setAllRequests] = useState([]);
  const [products, setProducts] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);

  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [search, setSearch] = useState(() => getStringParam(searchParams, "search"));
  const [statusFilter, setStatusFilter] = useState(() => getStringParam(searchParams, "status", "all"));
  const [requestTypeFilter, setRequestTypeFilter] = useState(() =>
    getStringParam(searchParams, "requestType", "all")
  );
  const [page, setPage] = useState(() => getPositiveIntParam(searchParams, "page", 1));

  const [selectedRequest, setSelectedRequest] = useState(null);

  const [formModal, setFormModal] = useState({
    open: false,
    mode: "create",
  });

  const [detailsOpen, setDetailsOpen] = useState(false);

  const [reviewModal, setReviewModal] = useState({
    open: false,
    mode: "approve",
  });

  const [fulfillmentModal, setFulfillmentModal] = useState({
    open: false,
    mode: "dispatch",
  });

  const [dialogModal, setDialogModal] = useState({
    open: false,
    title: "",
    message: "",
    confirmText: "Confirmar",
    cancelText: "Cancelar",
    variant: "warning",
    showCancel: false,
    onConfirm: null,
  });

  const [formData, setFormData] = useState(createInitialFormData);
  const [reviewData, setReviewData] = useState(createInitialReviewData);
  const [fulfillmentData, setFulfillmentData] = useState(
    createInitialFulfillmentData
  );

  async function fetchRequests() {
    try {
      setIsLoading(true);

      const response = await fetch("/api/requests");
      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(
          result.message || "No se pudieron obtener las solicitudes."
        );
      }

      setAllRequests(result.data || []);
    } catch (error) {
      console.error(error);
      setAllRequests([]);
    } finally {
      setIsLoading(false);
    }
  }

  async function fetchProducts() {
    try {
      const response = await fetch("/api/products");
      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(
          result.message || "No se pudieron obtener los productos."
        );
      }

      setProducts((result.data || []).filter((product) => product.isActive));
    } catch (error) {
      console.error(error);
      setProducts([]);
    }
  }

  async function fetchCurrentUser() {
    try {
      const response = await fetch("/api/auth/me", { cache: "no-store" });
      const result = await response.json();

      if (!response.ok || !result?.success) {
        throw new Error(result?.message || "No se pudo obtener la sesiÃƒÂ³n.");
      }

      setCurrentUser(result.user || null);
    } catch (error) {
      console.error(error);
      setCurrentUser(null);
    }
  }

  function closeDialogModal() {
    setDialogModal({
      open: false,
      title: "",
      message: "",
      confirmText: "Confirmar",
      cancelText: "Cancelar",
      variant: "warning",
      showCancel: false,
      onConfirm: null,
    });
  }

  function openDialogModal(config) {
    setDialogModal({
      open: true,
      title: config.title || "",
      message: config.message || "",
      confirmText: config.confirmText || "Aceptar",
      cancelText: config.cancelText || "Cancelar",
      variant: config.variant || "info",
      showCancel: Boolean(config.showCancel),
      onConfirm: config.onConfirm || closeDialogModal,
    });
  }

  async function fetchRequestById(requestId) {
    const response = await fetch(`/api/requests/${requestId}`);
    const result = await response.json();

    if (!response.ok || !result.success) {
      throw new Error(result.message || "No se pudo obtener la solicitud.");
    }

    return result.data;
  }

  async function refreshSelectedRequest(requestId = selectedRequest?._id) {
    if (!requestId) return;

    const freshRequest = await fetchRequestById(requestId);
    setSelectedRequest(freshRequest);
  }

  useEffect(() => {
    fetchCurrentUser();
    fetchProducts();
    fetchRequests();
  }, []);

  useEffect(() => {
    setPage(1);
  }, [search, statusFilter, requestTypeFilter]);

  useEffect(() => {
    const nextQuery = buildSearchParams(searchParams, {
      search: search.trim() || null,
      status: statusFilter !== "all" ? statusFilter : null,
      requestType: requestTypeFilter !== "all" ? requestTypeFilter : null,
      page: page > 1 ? page : null,
    });

    if (nextQuery !== searchParams.toString()) {
      router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname, { scroll: false });
    }
  }, [page, pathname, router, search, searchParams, statusFilter, requestTypeFilter]);

  const requestsByType = useMemo(() => {
    if (requestTypeFilter === "all") {
      return allRequests;
    }

    return allRequests.filter((request) => request.requestType === requestTypeFilter);
  }, [allRequests, requestTypeFilter]);

  const filteredRequests = useMemo(() => {
    const query = search.trim().toLowerCase();

    return requestsByType.filter((request) => {
      const matchesStatus =
        statusFilter === "all" || request.status === statusFilter;

      const matchesSearch =
        !query ||
        request.requestNumber?.toLowerCase().includes(query) ||
        request.requestedBy?.firstName?.toLowerCase().includes(query) ||
        request.requestedBy?.lastName?.toLowerCase().includes(query) ||
        request.requestedBy?.name?.toLowerCase().includes(query) ||
        request.requestedBy?.username?.toLowerCase().includes(query) ||
        request.requestedBy?.email?.toLowerCase().includes(query) ||
        getLocationLabel(request.sourceLocation)?.toLowerCase().includes(query) ||
        getLocationLabel(request.destinationLocation)?.toLowerCase().includes(query) ||
        getRequestStatusLabel(request.status)?.toLowerCase().includes(query) ||
        getRequestTypeLabel(request.requestType)?.toLowerCase().includes(query) ||
        request.notes?.toLowerCase().includes(query) ||
        request.justification?.toLowerCase().includes(query);

      return matchesStatus && matchesSearch;
    });
  }, [requestsByType, statusFilter, search]);

  const paginatedRequests = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filteredRequests.slice(start, start + PAGE_SIZE);
  }, [filteredRequests, page]);

  const localSummary = useMemo(() => {
    return {
      total: requestsByType.length,
      pending: requestsByType.filter((r) => r.status === "pending").length,
      processing: requestsByType.filter((r) => ["approved", "processing"].includes(r.status)).length,
      partiallyFulfilled: requestsByType.filter(
        (r) => r.status === "partially_fulfilled"
      ).length,
      fulfilled: requestsByType.filter((r) => r.status === "fulfilled").length,
      rejected: requestsByType.filter((r) => r.status === "rejected").length,
      cancelled: requestsByType.filter((r) => r.status === "cancelled").length,
    };
  }, [requestsByType]);

  function getOperationalLocation() {
    return currentUser?.role === "lounge" ? "lounge" : "kitchen";
  }

  function getDestinationOptions() {
    const operationalLocation = getOperationalLocation();

    if (operationalLocation === "lounge") {
      return [
        { value: "warehouse", label: "Bodega" },
        { value: "kitchen", label: "Cocina" },
      ];
    }

    return [
      { value: "warehouse", label: "Bodega" },
      { value: "lounge", label: "Salon" },
    ];
  }

  const destinationOptions = getDestinationOptions();
  const canCreateRequests = ["kitchen", "lounge"].includes(currentUser?.role);
  const isAdmin = currentUser?.role === "admin";
  const heroEyebrow = isAdmin ? "Auditoria" : "Operacion";
  const heroTitle = isAdmin ? "Auditoria de solicitudes" : "Solicitudes internas";
  const heroDescription = isAdmin
    ? "Revisa todas las solicitudes realizadas, su estado operativo y el historial completo de cada una."
    : "Gestiona movimientos entre cocina, salón y bodega con un flujo más claro.";
  const searchPlaceholder = isAdmin
    ? "Buscar por número, usuario, destino o nota"
    : "Buscar por número, usuario o nota";
  const sectionHeading = isAdmin ? "Panel general" : "Mis solicitudes";
  const sectionIntro = isAdmin
    ? "Vista general de todas las solicitudes internas registradas en la operación."
    : "Revisa tus solicitudes activas y el avance de cada movimiento.";

  function resetFormState() {
    setFormData(createInitialFormData("warehouse", getOperationalLocation()));
  }

  function openCreateModal() {
    setFormData(
      createInitialFormData(
        requestTypeFilter === "operation"
          ? (getOperationalLocation() === "lounge" ? "kitchen" : "lounge")
          : "warehouse",
        getOperationalLocation()
      )
    );
    setFormModal({
      open: true,
      mode: "create",
    });
  }

  function openEditModal() {
    if (!selectedRequest) return;

    setFormData({
      requestType: selectedRequest.requestType || "operation",
      sourceLocation: selectedRequest.sourceLocation || getOperationalLocation(),
      destinationLocation: selectedRequest.destinationLocation || "kitchen",
      requestPurpose: selectedRequest.justification || "",
      notes: selectedRequest.notes || "",
      items: (selectedRequest.items || []).map((item) => ({
        productId: item.productId || item.product?._id || "",
        requestedQuantity: String(item.requestedQuantity || ""),
        unit: item.unitSnapshot || item.product?.unit || "unit",
        notes: item.notes || "",
      })),
    });

    setFormModal({
      open: true,
      mode: "edit",
    });

    setDetailsOpen(false);
  }

  function closeFormModal() {
    setFormModal({
      open: false,
      mode: "create",
    });
    resetFormState();
  }

  async function openDetailsModal(requestItem) {
    try {
      const freshRequest = await fetchRequestById(requestItem._id);
      setSelectedRequest(freshRequest);
      setDetailsOpen(true);
    } catch (error) {
      console.error(error);
      openDialogModal({
        title: "No se pudo abrir la solicitud",
        message: error.message || "Intenta nuevamente en unos segundos.",
        variant: "danger",
      });
    }
  }

  function closeDetailsModal() {
    setDetailsOpen(false);
  }

  function handleFormChange(event) {
    const { name, value } = event.target;

    setFormData((prev) => ({
      ...prev,
      requestType:
        name === "destinationLocation"
          ? (value === "warehouse" ? "return" : "operation")
          : prev.requestType,
      requestPurpose:
        name === "destinationLocation"
          ? (value === "warehouse"
            ? (prev.requestPurpose === "return_to_warehouse" ? prev.requestPurpose : "return_to_warehouse")
            : (prev.requestPurpose === "return_to_warehouse" ? "" : prev.requestPurpose))
          : prev.requestPurpose,
      [name]: value,
    }));
  }

  function handleFormItemChange(index, field, value) {
    setFormData((prev) => {
      const nextItems = [...prev.items];
      const nextItem = {
        ...nextItems[index],
        [field]: value,
      };

      if (field === "productId") {
        const product = products.find((item) => item._id === value);

        if (product) {
          nextItem.unit = product.unit;
        }
      }

      nextItems[index] = nextItem;

      return {
        ...prev,
        items: nextItems,
      };
    });
  }

  function handleAddFormItem() {
    setFormData((prev) => ({
      ...prev,
      items: [...prev.items, createEmptyRequestItem()],
    }));
  }

  function handleRemoveFormItem(index) {
    setFormData((prev) => {
      const nextItems = prev.items.filter((_, itemIndex) => itemIndex !== index);

      return {
        ...prev,
        items: nextItems.length ? nextItems : [createEmptyRequestItem()],
      };
    });
  }

  async function handleSubmitForm(event) {
    event.preventDefault();

    const cleanedItems = formData.items
      .map((item) => ({
        productId: item.productId,
        requestedQuantity: Number(item.requestedQuantity),
        notes: item.notes || "",
      }))
      .filter((item) => item.productId && item.requestedQuantity > 0);
    const shouldValidateSourceStock = formData.requestType === "return";
    const sourceInventoryKey = formData.sourceLocation || "warehouse";

    if (!formData.requestPurpose) {
      openDialogModal({
        title: "Falta informaciÃƒÂ³n",
        message: "Debes seleccionar el motivo de la solicitud.",
        variant: "warning",
      });
      return;
    }

    if (!cleanedItems.length) {
      openDialogModal({
        title: "Falta informaciÃƒÂ³n",
        message: "Debes agregar al menos un producto vÃƒÂ¡lido.",
        variant: "warning",
      });
      return;
    }

    if (shouldValidateSourceStock) {
      const invalidByInventory = cleanedItems.find((item) => {
        const product = products.find((productItem) => productItem._id === item.productId);
        const available = Number(product?.inventory?.[sourceInventoryKey] || 0);
        return Number(item.requestedQuantity || 0) > available;
      });

      if (invalidByInventory) {
        const product = products.find((productItem) => productItem._id === invalidByInventory.productId);
        openDialogModal({
          title: "Cantidad no disponible",
          message: `La cantidad de ${product?.name || "este producto"} supera el stock disponible en ${getLocationLabel(sourceInventoryKey).toLowerCase()}.`,
          variant: "warning",
        });
        return;
      }
    }

    try {
      setIsSubmitting(true);

      const isEdit = formModal.mode === "edit" && selectedRequest?._id;

      const payload = {
        requestType: formData.requestType,
        sourceLocation: formData.sourceLocation,
        destinationLocation: formData.destinationLocation,
        justification: formData.requestPurpose,
        notes: formData.notes,
        items: cleanedItems,
      };

      const endpoint = isEdit
        ? `/api/requests/${selectedRequest._id}`
        : "/api/requests";
      const method = isEdit ? "PATCH" : "POST";

      const response = await fetch(endpoint, {
        method,
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.message || "No se pudo guardar la solicitud.");
      }

      closeFormModal();
      await fetchRequests();

      if (selectedRequest?._id) {
        await refreshSelectedRequest(selectedRequest._id);
      }
    } catch (error) {
      console.error(error);
      openDialogModal({
        title: "No se pudo guardar la solicitud",
        message: error.message || "Intenta nuevamente.",
        variant: "danger",
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  function openReviewModal(mode) {
    if (!selectedRequest) return;

    setReviewData({
      notes: "",
      items: (selectedRequest.items || []).map((item) => ({
        itemId: item._id,
        approvedQuantity:
          mode === "approve"
            ? String(item.approvedQuantity || item.requestedQuantity || 0)
            : "0",
      })),
    });

    setReviewModal({
      open: true,
      mode,
    });
  }

  function closeReviewModal() {
    setReviewModal({
      open: false,
      mode: "approve",
    });
    setReviewData(createInitialReviewData());
  }

  function handleReviewChange(event) {
    const { name, value } = event.target;

    setReviewData((prev) => ({
      ...prev,
      [name]: value,
    }));
  }

  function handleReviewItemChange(index, field, value) {
    setReviewData((prev) => {
      const nextItems = [...prev.items];
      nextItems[index] = {
        ...nextItems[index],
        [field]: value,
      };

      return {
        ...prev,
        items: nextItems,
      };
    });
  }

  async function handleSubmitReview(event) {
    event.preventDefault();

    if (!selectedRequest?._id) {
      openDialogModal({
        title: "Solicitud no disponible",
        message: "No se pudo procesar la solicitud.",
        variant: "warning",
      });
      return;
    }

    try {
      setIsSubmitting(true);

      let endpoint = "";
      let payload = {};

      if (reviewModal.mode === "approve") {
        endpoint = `/api/requests/${selectedRequest._id}/approve`;
        payload = {
          notes: reviewData.notes,
          items: reviewData.items.map((item) => ({
            itemId: item.itemId,
            approvedQuantity: Number(item.approvedQuantity || 0),
          })),
        };
      }

      if (reviewModal.mode === "reject") {
        endpoint = `/api/requests/${selectedRequest._id}/reject`;
        payload = {
          statusReason: reviewData.notes,
        };
      }

      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.message || "No se pudo procesar la solicitud.");
      }

      closeReviewModal();
      await fetchRequests();
      await refreshSelectedRequest(selectedRequest._id);
    } catch (error) {
      console.error(error);
      openDialogModal({
        title: "No se pudo procesar la solicitud",
        message: error.message || "Intenta nuevamente.",
        variant: "danger",
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  function openFulfillmentModal(mode) {
    if (!selectedRequest) return;

    setFulfillmentData({
      notes: "",
      items: (selectedRequest.items || []).map((item) => ({
        itemId: item._id,
        quantity: "",
      })),
    });

    setFulfillmentModal({
      open: true,
      mode,
    });
  }

  function closeFulfillmentModal() {
    setFulfillmentModal({
      open: false,
      mode: "dispatch",
    });
    setFulfillmentData(createInitialFulfillmentData());
  }

  function handleFulfillmentChange(event) {
    const { name, value } = event.target;

    setFulfillmentData((prev) => ({
      ...prev,
      [name]: value,
    }));
  }

  function handleFulfillmentItemChange(index, value) {
    setFulfillmentData((prev) => {
      const nextItems = [...prev.items];
      nextItems[index] = {
        ...nextItems[index],
        quantity: value,
      };

      return {
        ...prev,
        items: nextItems,
      };
    });
  }

  async function handleSubmitFulfillment(event) {
    event.preventDefault();

    if (!selectedRequest?._id) {
      openDialogModal({
        title: "Solicitud no disponible",
        message: "No se pudo procesar la solicitud.",
        variant: "warning",
      });
      return;
    }

    try {
      setIsSubmitting(true);

      const isDispatch = fulfillmentModal.mode === "dispatch";

      const endpoint = isDispatch
        ? `/api/requests/${selectedRequest._id}/dispatch`
        : `/api/requests/${selectedRequest._id}/receive`;

      const items = fulfillmentData.items.map((item) => {
        if (isDispatch) {
          return {
            itemId: item.itemId,
            dispatchedQuantity: Number(item.quantity || 0),
          };
        }

        return {
          itemId: item.itemId,
          receivedQuantity: Number(item.quantity || 0),
        };
      });

      const payload = isDispatch
        ? {
          notes: fulfillmentData.notes,
          items,
        }
        : {
          notes: fulfillmentData.notes,
          items,
        };

      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        openDialogModal({
          title: "No se pudo procesar la operación",
          message: result.message || "Intenta nuevamente.",
          variant: "danger",
        });
        return;
      }

      closeFulfillmentModal();
      await fetchRequests();
      await refreshSelectedRequest(selectedRequest._id);
    } catch (error) {
      console.error(error);
      openDialogModal({
        title: "No se pudo procesar la operación",
        message: error.message || "Intenta nuevamente.",
        variant: "danger",
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  function openCancelConfirm() {
    if (!selectedRequest?._id) return;

    openDialogModal({
      open: true,
      title: "Cancelar solicitud",
      message: "Esta acción marcará la solicitud como cancelada.",
      confirmText: "Sí, cancelar",
      cancelText: "Volver",
      variant: "danger",
      showCancel: true,
      onConfirm: async () => {
        try {
          setIsSubmitting(true);

          const response = await fetch(`/api/requests/${selectedRequest._id}`, {
            method: "DELETE",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              statusReason: "Solicitud cancelada desde el panel.",
            }),
          });

          const result = await response.json();

          if (!response.ok || !result.success) {
            throw new Error(
              result.message || "No se pudo cancelar la solicitud."
            );
          }

          closeDialogModal();
          await fetchRequests();
          await refreshSelectedRequest(selectedRequest._id);
        } catch (error) {
          console.error(error);
          openDialogModal({
            title: "No se pudo cancelar la solicitud",
            message: error.message || "Intenta nuevamente.",
            variant: "danger",
          });
        } finally {
          setIsSubmitting(false);
        }
      },
    });
  }

  return (
    <>
      <section className={`hero fadeScaleIn ${styles.heroShell}`}>
        <div className="heroCopy">
          <span className="eyebrow">{heroEyebrow}</span>
          <h1 className="title">{heroTitle}</h1>
          <p className="description">{heroDescription}</p>
        </div>

        <div className={styles.heroStats}>
          <button
            type="button"
            className={`compactStat ${styles.heroStatButton} ${statusFilter === "all" ? styles.heroStatActive : ""}`}
            onClick={() => setStatusFilter("all")}
          >
            <span>Solicitudes <strong>{localSummary.total || 0}</strong></span>
          </button>
          <button
            type="button"
            className={`compactStat heroStatWarning ${styles.heroStatButton} ${statusFilter === "pending" ? styles.heroStatActive : ""}`}
            onClick={() => setStatusFilter("pending")}
          >
            <span>Pendientes <strong>{localSummary.pending || 0}</strong></span>
          </button>
          <button
            type="button"
            className={`compactStat heroStatInfo ${styles.heroStatButton} ${statusFilter === "processing" ? styles.heroStatActive : ""}`}
            onClick={() => setStatusFilter("processing")}
          >
            <span>En proceso <strong>{localSummary.processing || 0}</strong></span>
          </button>
          <button
            type="button"
            className={`compactStat heroStatSuccess ${styles.heroStatButton} ${statusFilter === "fulfilled" ? styles.heroStatActive : ""}`}
            onClick={() => setStatusFilter("fulfilled")}
          >
            <span>Completadas <strong>{localSummary.fulfilled || 0}</strong></span>
          </button>
        </div>
      </section>

      {canCreateRequests ? (
        <div className={styles.headerRow}>
          <div className={styles.actionGroup}>
            <button
              type="button"
              className="miniAction"
              onClick={() => {
                setRequestTypeFilter("return");
                setFormData(createInitialFormData("warehouse", getOperationalLocation()));
                setFormModal({ open: true, mode: "create" });
              }}
            >
              <Plus size={14} />
              Nueva transferencia
            </button>

            <button
              type="button"
              className="miniAction miniActionPrimary"
              onClick={() => {
                setRequestTypeFilter("operation");
                setFormData(createInitialFormData(getOperationalLocation() === "lounge" ? "kitchen" : "lounge", getOperationalLocation()));
                setFormModal({ open: true, mode: "create" });
              }}
            >
              <Plus size={14} />
              Nueva solicitud
            </button>
          </div>
        </div>
      ) : null}

      <div className={`${styles.sectionIntro} fadeSlideIn delayOne`}>
        <strong>{sectionHeading}</strong>
        <span>{sectionIntro}</span>
      </div>

      <div className={`${styles.toolbar} fadeSlideIn delayTwo`}>
        <div className={`searchField ${styles.searchBox}`}>
          <Search size={16} />
          <input
            type="text"
            className="searchInput"
            placeholder={searchPlaceholder}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>

        <div className={styles.filtersGroup}>
          <button
            type="button"
            className={`miniAction ${requestTypeFilter === "all" ? "miniActionPrimary" : ""}`}
            onClick={() => setRequestTypeFilter("all")}
          >
            Todas
          </button>
          <button
            type="button"
            className={`miniAction ${requestTypeFilter === "return" ? "miniActionPrimary" : ""}`}
            onClick={() => setRequestTypeFilter("return")}
          >
            Transferencias
          </button>
          <button
            type="button"
            className={`miniAction ${requestTypeFilter === "operation" ? "miniActionPrimary" : ""}`}
            onClick={() => setRequestTypeFilter("operation")}
          >
            Internas
          </button>
          <button
            type="button"
            className="miniAction"
            onClick={fetchRequests}
          >
            Actualizar
          </button>
        </div>
      </div>

      <div className={`${styles.listSection} fadeSlideIn delayThree`}>
        {isLoading ? (
          <div className={`${styles.emptyState} fadeScaleIn`}>Cargando solicitudes...</div>
        ) : filteredRequests.length === 0 ? (
          <div className={`${styles.emptyState} fadeScaleIn`}>
            {isAdmin
              ? "No hay solicitudes registradas para auditar con estos filtros."
              : "No se encontraron solicitudes para mostrar."}
          </div>
        ) : (
          <div className={styles.requestList}>
            {paginatedRequests.map((request, index) => (
              <article
                key={request._id}
                className={`${styles.requestCard} fadeScaleIn`}
                style={{ animationDelay: `${Math.min(index, 8) * 0.03}s` }}
                onClick={() => openDetailsModal(request)}
              >
                <div className={styles.cardHeader}>
                  <div>
                    <p className={styles.requestNumber}>
                      {request.requestNumber}
                    </p>
                    <p className={styles.requestMeta}>
                      {getRequestTypeLabel(request.requestType)}{" "}
                      · {getPersonName(request.requestedBy)}
                    </p>
                  </div>

                  <span
                    className={`${styles.statusBadge} ${getRequestStatusClass(
                      request.status
                    )}`}
                  >
                    {getRequestStatusLabel(request.status)}
                  </span>
                </div>

                <div className={styles.cardBody}>
                  <div className={styles.cardInfoRow}>
                    <span className={styles.infoLabel}>Origen</span>
                    <strong className={styles.infoValue}>
                      {getLocationLabel(request.sourceLocation)}
                    </strong>
                  </div>

                  <div className={styles.cardInfoRow}>
                    <span className={styles.infoLabel}>Destino</span>
                    <strong className={styles.infoValue}>
                      {getLocationLabel(request.destinationLocation)}
                    </strong>
                  </div>

                  <div className={styles.cardInfoRow}>
                    <span className={styles.infoLabel}>Items</span>
                    <strong className={styles.infoValue}>
                      {request.items?.length || 0}
                    </strong>
                  </div>

                  <div className={styles.cardInfoRow}>
                    <span className={styles.infoLabel}>Fecha</span>
                    <strong className={styles.infoValue}>
                      {formatDate(request.requestedAt || request.createdAt)}
                    </strong>
                  </div>
                </div>

                {(request.justification || request.notes) && (
                  <p className={styles.cardNote}>
                    {getPurposeLabel(request.justification) ||
                      request.justification ||
                      request.notes}
                  </p>
                )}
              </article>
            ))}
          </div>
        )}

        <PaginationBar
          page={page}
          totalPages={Math.max(Math.ceil(filteredRequests.length / PAGE_SIZE), 1)}
          totalItems={filteredRequests.length}
          fromItem={filteredRequests.length === 0 ? 0 : (page - 1) * PAGE_SIZE + 1}
          toItem={filteredRequests.length === 0 ? 0 : Math.min(page * PAGE_SIZE, filteredRequests.length)}
          itemLabel="solicitudes"
          onPageChange={setPage}
        />
      </div>

      <RequestFormModal
        open={formModal.open}
        mode={formModal.mode}
        formData={formData}
        destinationOptions={destinationOptions}
        onChange={handleFormChange}
        onItemChange={handleFormItemChange}
        onAddItem={handleAddFormItem}
        onRemoveItem={handleRemoveFormItem}
        onClose={closeFormModal}
        onSubmit={handleSubmitForm}
        isSubmitting={isSubmitting}
        products={products}
      />

      <RequestDetailsModal
        open={detailsOpen}
        request={selectedRequest}
        currentUserRole={currentUser?.role}
        onClose={closeDetailsModal}
        onApprove={() => openReviewModal("approve")}
        onReject={() => openReviewModal("reject")}
        onDispatch={() => openFulfillmentModal("dispatch")}
        onReceive={() => openFulfillmentModal("receive")}
        onEdit={openEditModal}
        onCancel={openCancelConfirm}
      />

      <RequestReviewModal
        open={reviewModal.open}
        mode={reviewModal.mode}
        request={selectedRequest}
        reviewData={reviewData}
        onChange={handleReviewChange}
        onItemChange={handleReviewItemChange}
        onClose={closeReviewModal}
        onSubmit={handleSubmitReview}
        isSubmitting={isSubmitting}
      />

      <RequestFulfillmentModal
        open={fulfillmentModal.open}
        mode={fulfillmentModal.mode}
        request={selectedRequest}
        fulfillmentData={fulfillmentData}
        onItemChange={handleFulfillmentItemChange}
        onChange={handleFulfillmentChange}
        onClose={closeFulfillmentModal}
        onSubmit={handleSubmitFulfillment}
        isSubmitting={isSubmitting}
      />

      <DialogModal
        open={dialogModal.open}
        title={dialogModal.title}
        message={dialogModal.message}
        confirmText={dialogModal.confirmText}
        cancelText={dialogModal.cancelText}
        variant={dialogModal.variant}
        showCancel={dialogModal.showCancel}
        loading={isSubmitting}
        onClose={closeDialogModal}
        onConfirm={dialogModal.onConfirm}
      />
    </>
  );
}

