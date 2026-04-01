"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, Search } from "lucide-react";

import styles from "./page.module.scss";

import { useDashboardUser } from "@context/dashboard-user-context";
import ConfirmModal from "@components/shared/ConfirmModal/ConfirmModal";
import RequestFulfillmentModal from "@components/requests/RequestFulfillmentModal/RequestFulfillmentModal";
import RequestReviewModal from "@components/requests/RequestReviewModal/RequestReviewModal";
import RequestDetailsModal from "@components/requests/RequestDetailsModal/RequestDetailsModal";
import RequestFormModal from "@components/requests/RequestFormModal/RequestFormModal";
import { getPurposeLabel } from "@libs/constants/purposes";

const REQUEST_TYPE_LABELS = {
  operation: "Operación",
  production: "Producción",
};

const REQUEST_STATUS_LABELS = {
  pending: "Pendiente",
  approved: "Aprobada",
  partially_fulfilled: "Parcialmente atendida",
  fulfilled: "Completada",
  rejected: "Rechazada",
  cancelled: "Cancelada",
};

function createEmptyRequestItem() {
  return {
    productId: "",
    requestedQuantity: "",
    unit: "unit",
    notes: "",
  };
}

function createInitialFormData() {
  return {
    requestType: "production",
    sourceLocation: "warehouse",
    destinationLocation: "kitchen",
    requestPurpose: "",
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
  if (!value) return "—";

  try {
    return new Intl.DateTimeFormat("es-EC", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));
  } catch {
    return "—";
  }
}

function getPersonName(user) {
  if (!user) return "—";
  return user.username || "Usuario";
}

export default function RequestsPage() {
  const user = useDashboardUser();
  const currentUserId = user?._id || user?.id || "";

  const [allRequests, setAllRequests] = useState([]);
  const [products, setProducts] = useState([]);

  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

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

  const [confirmModal, setConfirmModal] = useState({
    open: false,
    title: "",
    description: "",
    confirmLabel: "Confirmar",
    variant: "warning",
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
    fetchProducts();
    fetchRequests();
  }, []);

  const filteredRequests = useMemo(() => {
    const query = search.trim().toLowerCase();

    return allRequests.filter((request) => {
      const matchesStatus =
        statusFilter === "all" || request.status === statusFilter;

      const matchesSearch =
        !query ||
        request.requestNumber?.toLowerCase().includes(query) ||
        request.requestedBy?.name?.toLowerCase().includes(query) ||
        request.requestedBy?.email?.toLowerCase().includes(query) ||
        request.notes?.toLowerCase().includes(query) ||
        request.justification?.toLowerCase().includes(query);

      return matchesStatus && matchesSearch;
    });
  }, [allRequests, statusFilter, search]);

  const localSummary = useMemo(() => {
    return {
      total: allRequests.length,
      pending: allRequests.filter((r) => r.status === "pending").length,
      approved: allRequests.filter((r) => r.status === "approved").length,
      partiallyFulfilled: allRequests.filter(
        (r) => r.status === "partially_fulfilled"
      ).length,
      fulfilled: allRequests.filter((r) => r.status === "fulfilled").length,
      rejected: allRequests.filter((r) => r.status === "rejected").length,
      cancelled: allRequests.filter((r) => r.status === "cancelled").length,
    };
  }, [allRequests]);

  function resetFormState() {
    setFormData(createInitialFormData());
  }

  function openCreateModal() {
    resetFormState();
    setFormModal({
      open: true,
      mode: "create",
    });
  }

  function openEditModal() {
    if (!selectedRequest) return;

    setFormData({
      requestType: selectedRequest.requestType || "production",
      sourceLocation: selectedRequest.sourceLocation || "warehouse",
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
      alert(error.message || "No se pudo abrir la solicitud.");
    }
  }

  function closeDetailsModal() {
    setDetailsOpen(false);
  }

  function handleFormChange(event) {
    const { name, value } = event.target;

    setFormData((prev) => ({
      ...prev,
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

    if (!currentUserId) {
      alert("No se pudo identificar el usuario actual.");
      return;
    }

    const cleanedItems = formData.items
      .map((item) => ({
        productId: item.productId,
        requestedQuantity: Number(item.requestedQuantity),
        notes: item.notes || "",
      }))
      .filter((item) => item.productId && item.requestedQuantity > 0);

    if (!formData.requestPurpose) {
      alert("Debes seleccionar el motivo de la solicitud.");
      return;
    }

    if (!cleanedItems.length) {
      alert("Debes agregar al menos un producto válido.");
      return;
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
        requestedBy: currentUserId,
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
      alert(error.message || "No se pudo guardar la solicitud.");
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

    if (!selectedRequest?._id || !currentUserId) {
      alert("No se pudo procesar la solicitud.");
      return;
    }

    try {
      setIsSubmitting(true);

      let endpoint = "";
      let payload = {};

      if (reviewModal.mode === "approve") {
        endpoint = `/api/requests/${selectedRequest._id}/approve`;
        payload = {
          approvedBy: currentUserId,
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
          rejectedBy: currentUserId,
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
      alert(error.message || "No se pudo procesar la solicitud.");
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

    if (!selectedRequest?._id || !currentUserId) {
      alert("No se pudo procesar la solicitud.");
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
          dispatchedBy: currentUserId,
          notes: fulfillmentData.notes,
          items,
        }
        : {
          receivedBy: currentUserId,
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
        throw new Error(result.message || "No se pudo procesar la operación.");
      }

      closeFulfillmentModal();
      await fetchRequests();
      await refreshSelectedRequest(selectedRequest._id);
    } catch (error) {
      console.error(error);
      alert(error.message || "No se pudo procesar la operación.");
    } finally {
      setIsSubmitting(false);
    }
  }

  function openCancelConfirm() {
    if (!selectedRequest?._id || !currentUserId) return;

    setConfirmModal({
      open: true,
      title: "Cancelar solicitud",
      description: "Esta acción marcará la solicitud como cancelada.",
      confirmLabel: "Sí, cancelar",
      variant: "danger",
      onConfirm: async () => {
        try {
          setIsSubmitting(true);

          const response = await fetch(`/api/requests/${selectedRequest._id}`, {
            method: "DELETE",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              cancelledBy: currentUserId,
            }),
          });

          const result = await response.json();

          if (!response.ok || !result.success) {
            throw new Error(
              result.message || "No se pudo cancelar la solicitud."
            );
          }

          closeConfirmModal();
          await fetchRequests();
          await refreshSelectedRequest(selectedRequest._id);
        } catch (error) {
          console.error(error);
          alert(error.message || "No se pudo cancelar la solicitud.");
        } finally {
          setIsSubmitting(false);
        }
      },
    });
  }

  function closeConfirmModal() {
    setConfirmModal({
      open: false,
      title: "",
      description: "",
      confirmLabel: "Confirmar",
      variant: "warning",
      onConfirm: null,
    });
  }

  return (
    <>
      <div className={styles.headerRow}>
        <div className={styles.statsGroup}>
          <button
            type="button"
            onClick={() => setStatusFilter("all")}
            className={`${styles.statCard} ${statusFilter === "all" ? styles.activeCard : ""
              }`}
          >
            <span className={styles.statLabel}>Total solicitudes</span>
            <strong className={styles.statValue}>
              {localSummary.total || 0}
            </strong>
          </button>

          <button
            type="button"
            onClick={() => setStatusFilter("pending")}
            className={`${styles.statCard} ${styles.warningCard} ${statusFilter === "pending" ? styles.activeCard : ""
              }`}
          >
            <span className={styles.statLabel}>Pendientes</span>
            <strong className={styles.statValue}>
              {localSummary.pending || 0}
            </strong>
          </button>

          <button
            type="button"
            onClick={() => setStatusFilter("approved")}
            className={`${styles.statCard} ${styles.infoCard} ${statusFilter === "approved" ? styles.activeCard : ""
              }`}
          >
            <span className={styles.statLabel}>Aprobadas</span>
            <strong className={styles.statValue}>
              {localSummary.approved || 0}
            </strong>
          </button>

          {/* <button
            type="button"
            onClick={() => setStatusFilter("partially_fulfilled")}
            className={`${styles.statCard} ${styles.infoCard} ${statusFilter === "partially_fulfilled" ? styles.activeCard : ""
              }`}
          >
            <span className={styles.statLabel}>Parcialmente atendidas</span>
            <strong className={styles.statValue}>
              {localSummary.partiallyFulfilled || 0}
            </strong>
          </button> */}

          <button
            type="button"
            onClick={() => setStatusFilter("fulfilled")}
            className={`${styles.statCard} ${styles.successCard} ${statusFilter === "fulfilled" ? styles.activeCard : ""
              }`}
          >
            <span className={styles.statLabel}>Completadas</span>
            <strong className={styles.statValue}>
              {localSummary.fulfilled || 0}
            </strong>
          </button>
        </div>

        <button
          type="button"
          className="btn btn-primary"
          onClick={openCreateModal}
        >
          <Plus size={16} />
          Nueva solicitud
        </button>
      </div>

      <div className={styles.toolbar}>
        <div className={styles.searchBox}>
          <Search size={16} />
          <input
            type="text"
            className={styles.searchInput}
            placeholder="Buscar por número, usuario o nota"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>

        <div className={styles.filtersGroup}>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={fetchRequests}
          >
            Actualizar
          </button>
        </div>
      </div>

      <div className={styles.listSection}>
        {isLoading ? (
          <div className={styles.emptyState}>Cargando solicitudes...</div>
        ) : filteredRequests.length === 0 ? (
          <div className={styles.emptyState}>
            No se encontraron solicitudes para mostrar.
          </div>
        ) : (
          <div className={styles.requestList}>
            {filteredRequests.map((request) => (
              <article
                key={request._id}
                className={styles.requestCard}
                onClick={() => openDetailsModal(request)}
              >
                <div className={styles.cardHeader}>
                  <div>
                    <p className={styles.requestNumber}>
                      {request.requestNumber}
                    </p>
                    <p className={styles.requestMeta}>
                      {REQUEST_TYPE_LABELS[request.requestType] ||
                        request.requestType}{" "}
                      · {getPersonName(request.requestedBy)}
                    </p>
                  </div>

                  <span
                    className={`${styles.statusBadge} ${getRequestStatusClass(
                      request.status
                    )}`}
                  >
                    {REQUEST_STATUS_LABELS[request.status] || request.status}
                  </span>
                </div>

                <div className={styles.cardBody}>
                  <div className={styles.cardInfoRow}>
                    <span className={styles.infoLabel}>Origen</span>
                    <strong className={styles.infoValue}>
                      {request.sourceLocation === "warehouse"
                        ? "Bodega"
                        : "Cocina"}
                    </strong>
                  </div>

                  <div className={styles.cardInfoRow}>
                    <span className={styles.infoLabel}>Destino</span>
                    <strong className={styles.infoValue}>
                      {request.destinationLocation === "warehouse"
                        ? "Bodega"
                        : "Cocina"}
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
      </div>

      <RequestFormModal
        open={formModal.open}
        mode={formModal.mode}
        formData={formData}
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

      <ConfirmModal
        open={confirmModal.open}
        title={confirmModal.title}
        description={confirmModal.description}
        confirmLabel={confirmModal.confirmLabel}
        variant={confirmModal.variant}
        isSubmitting={isSubmitting}
        onClose={closeConfirmModal}
        onConfirm={confirmModal.onConfirm}
      />
    </>
  );
}