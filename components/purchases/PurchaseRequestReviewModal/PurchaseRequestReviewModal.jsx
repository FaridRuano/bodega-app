"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, ClipboardList, PackageCheck, PencilLine, X, XCircle } from "lucide-react";
import { getLocationLabel } from "@libs/constants/domainLabels";
import { getUnitLabel } from "@libs/constants/units";
import {
  formatQuantity,
  getQuantityInputStep,
  normalizeQuantityInput,
} from "@libs/unitQuantities";
import styles from "./purchase-request-review-modal.module.scss";

const STATUS_LABELS = {
  pending: "Pendiente",
  approved: "Aprobada",
  in_progress: "En proceso",
  partially_purchased: "Parcialmente atendida",
  completed: "Completada",
  rejected: "Rechazada",
  cancelled: "Cancelada",
};

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

function buildLatestDispatchMap(request) {
  const dispatchActivities = (request?.activityLog || [])
    .filter(
      (activity) =>
        activity?.title === "Compra despachada" &&
        Array.isArray(activity?.metadata?.items) &&
        activity.metadata.items.length > 0
    )
    .sort((left, right) => {
      const leftTime = new Date(left?.performedAt || 0).getTime();
      const rightTime = new Date(right?.performedAt || 0).getTime();
      return rightTime - leftTime;
    });

  const latestDispatch = dispatchActivities[0];
  const latestItems = latestDispatch?.metadata?.items || [];

  return latestItems.reduce((acc, item) => {
    const itemId = String(item?.purchaseRequestItemId || "");
    if (!itemId) return acc;

    acc[itemId] = Number(item?.quantity || 0);
    return acc;
  }, {});
}

export default function PurchaseRequestReviewModal({
  open,
  request,
  canApprove = false,
  canEdit = false,
  canCancel = false,
  canReceive = false,
  isApproving = false,
  isCancelling = false,
  isReceiving = false,
  onClose,
  onApprove,
  onEdit,
  onCancel,
  onReceive,
}) {
  const latestDispatchMap = useMemo(
    () => buildLatestDispatchMap(request),
    [request]
  );
  const receiptRequestKey = String(request?._id || request?.requestNumber || "");
  const initialReceiptItems = useMemo(() => {
    if (!request) return {};

    return (request.items || []).reduce((acc, item) => {
      const pendingReceipt = Math.max(
        Number(item.dispatchedQuantity || 0) - Number(item.receivedQuantity || 0),
        0
      );

      if (pendingReceipt > 0) {
        acc[item._id] = "";
      }

      return acc;
    }, {});
  }, [request]);
  const [receiptState, setReceiptState] = useState({
    requestKey: "",
    note: "",
    items: {},
  });

  if (open && request && receiptState.requestKey !== receiptRequestKey) {
    setReceiptState({
      requestKey: receiptRequestKey,
      note: "",
      items: initialReceiptItems,
    });
  }

  const receiptNote = receiptState.note;
  const receiptItems = receiptState.items;

  useEffect(() => {
    function handleEscape(event) {
      if (event.key === "Escape" && open && !isCancelling && !isApproving && !isReceiving) {
        onClose();
      }
    }

    window.addEventListener("keydown", handleEscape);

    return () => {
      window.removeEventListener("keydown", handleEscape);
    };
  }, [isApproving, isCancelling, isReceiving, onClose, open]);

  if (!open || !request) return null;

  const pendingReceiptItems = (request.items || []).filter(
    (item) =>
      Math.max(
        Number(item.dispatchedQuantity || 0) - Number(item.receivedQuantity || 0),
        0
      ) > 0
  );

  const hasReceiptItems = pendingReceiptItems.length > 0;

  function handleReceiptValueChange(itemId, value, unit) {
    setReceiptState((prev) => ({
      ...prev,
      items: {
        ...prev.items,
        [itemId]: normalizeQuantityInput(value, unit),
      },
    }));
  }

  function autofillReceiptItem(item) {
    const pendingReceipt = Math.max(
      Number(item.dispatchedQuantity || 0) - Number(item.receivedQuantity || 0),
      0
    );
    const latestDispatchedQuantity = Number(latestDispatchMap[item._id] || 0);
    const suggestedQuantity = latestDispatchedQuantity > 0
      ? Math.min(latestDispatchedQuantity, pendingReceipt)
      : pendingReceipt;

    setReceiptState((prev) => ({
      ...prev,
      items: {
        ...prev.items,
        [item._id]: suggestedQuantity > 0 ? String(suggestedQuantity) : "",
      },
    }));
  }

  async function handleReceiveSubmit() {
    if (!onReceive) return;

    const items = pendingReceiptItems
      .map((item) => ({
        itemId: item._id,
        receivedQuantity: Number(receiptItems[item._id] || 0),
      }))
      .filter((item) => item.receivedQuantity > 0);

    if (!items.length) return;

    await onReceive({
      notes: receiptNote,
      items,
    });
  }

  const hasPendingReceiptSelection = pendingReceiptItems.some(
    (item) => Number(receiptItems[item._id] || 0) > 0
  );

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className={`modalDetachedStack modal-container--lg ${styles.reviewStack}`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className={`modal-container modal-container--lg ${styles.modalShell}`}>
          <div className="modal-top">
            <div className="modal-headerContent">
              <div className="modal-icon modal-icon--info">
                <ClipboardList size={20} />
              </div>
              <div>
                <h2 className="modal-title">Solicitud de compra</h2>
                <p className="modal-description">
                  Revisa el resumen de la solicitud antes de editarla o cancelarla.
                </p>
              </div>
            </div>

            <button
              type="button"
              className="modal-close"
              onClick={onClose}
              aria-label="Cerrar modal"
              disabled={isCancelling || isApproving || isReceiving}
            >
              <X size={18} />
            </button>
          </div>

          <div className={`modal-body ${styles.body}`}>
            <section className={styles.summaryCard}>
              <div className={styles.summaryTop}>
                <div>
                  <strong className={styles.requestNumber}>{request.requestNumber}</strong>
                  <p className={styles.summaryMeta}>{formatDate(request.requestedAt)}</p>
                  <p className={styles.summaryMeta}>{getRequesterLabel(request)}</p>
                </div>

                <span className={styles.statusBadge}>
                  {STATUS_LABELS[request.status] || request.status}
                </span>
              </div>

              <div className={styles.metricsRow}>
                <span className={styles.metricChip}>{request.items?.length || 0} productos</span>
                <span className={styles.metricChip}>{getLocationLabel(request.destinationLocation, "Bodega")}</span>
              </div>

              {request.requesterNote ? (
                <div className={styles.noteCard}>
                  <span className={styles.noteLabel}>Nota general</span>
                  <p className={styles.noteText}>{request.requesterNote}</p>
                </div>
              ) : null}
            </section>

            <section className={styles.itemsCard}>
              <div className={styles.itemsHeader}>
                <h3 className={styles.itemsTitle}>Productos</h3>
              </div>

              <div className={styles.itemsList}>
                {(request.items || []).map((item) => (
                  <article key={item._id} className={styles.itemRow}>
                    <div className={styles.itemMain}>
                      <strong>{item.product?.name || "Producto"}</strong>
                      <span>{getUnitLabel(item.unitSnapshot)}</span>
                    </div>

                    <div className={styles.itemMetrics}>
                      <div className={styles.metricBlock}>
                        <strong>{formatQuantity(item.requestedQuantity)}</strong>
                        <span>Solicitado</span>
                      </div>
                      <div className={styles.metricBlock}>
                        <strong>{formatQuantity(item.purchasedQuantity)}</strong>
                        <span>Comprado</span>
                      </div>
                      <div className={styles.metricBlock}>
                        <strong>{formatQuantity(item.dispatchedQuantity)}</strong>
                        <span>Despachado</span>
                      </div>
                      <div className={styles.metricBlock}>
                        <strong>
                          {formatQuantity(Math.max(
                            Number(item.approvedQuantity || item.requestedQuantity || 0) -
                            Number(item.receivedQuantity || 0),
                            0
                          ))}
                        </strong>
                        <span>Pendiente</span>
                      </div>
                    </div>

                    {item.requesterNote ? (
                      <p className={styles.itemNote}>{item.requesterNote}</p>
                    ) : null}

                    {item.adminNote ? (
                      <p className={styles.itemNote}>Compra: {item.adminNote}</p>
                    ) : null}

                    {canReceive && Math.max(
                      Number(item.dispatchedQuantity || 0) - Number(item.receivedQuantity || 0),
                      0
                    ) > 0 ? (
                      <div className={styles.receiveRow}>
                        {Number(latestDispatchMap[item._id] || 0) > 0 ? (
                          <span className={styles.receiveHint}>
                            Último despacho: {formatQuantity(latestDispatchMap[item._id])}
                          </span>
                        ) : null}
                        <input
                          type="number"
                          min="0"
                          step={getQuantityInputStep(item.unitSnapshot || item.product?.unit)}
                          className={`form-input ${styles.receiveInput}`}
                          placeholder="Recibido"
                          value={receiptItems[item._id] ?? ""}
                          onChange={(event) =>
                            handleReceiptValueChange(
                              item._id,
                              event.target.value,
                              item.unitSnapshot || item.product?.unit
                            )
                          }
                          disabled={isReceiving}
                        />
                        <button
                          type="button"
                          className="miniAction"
                          onClick={() => autofillReceiptItem(item)}
                          disabled={isReceiving}
                        >
                          <PackageCheck size={16} />
                          Completar
                        </button>
                      </div>
                    ) : null}
                  </article>
                ))}
              </div>
            </section>

            {canReceive && hasReceiptItems ? (
              <section className={styles.receiveCard}>
                <div className={styles.itemsHeader}>
                  <h3 className={styles.itemsTitle}>Confirmar recepcion</h3>
                </div>

                <textarea
                  className={`form-textarea ${styles.receiveNote}`}
                  placeholder="Nota de recepcion opcional"
                  value={receiptNote}
                  onChange={(event) =>
                    setReceiptState((prev) => ({
                      ...prev,
                      note: event.target.value,
                    }))
                  }
                  disabled={isReceiving}
                />
              </section>
            ) : null}
          </div>
        </div>

        {(canApprove || canEdit || canCancel || (canReceive && hasReceiptItems)) ? (
          <div className={`modalDetachedFooter ${styles.footer}`}>
            {canReceive && hasReceiptItems ? (
              <button
                type="button"
                className="miniAction miniActionPrimary"
                onClick={handleReceiveSubmit}
                disabled={isCancelling || isApproving || isReceiving || !hasPendingReceiptSelection}
              >
                <PackageCheck size={16} />
                {isReceiving ? "Confirmando..." : "Confirmar recibido"}
              </button>
            ) : null}

            {canApprove ? (
              <button
                type="button"
                className="miniAction miniActionPrimary"
                onClick={onApprove}
                disabled={isCancelling || isApproving || isReceiving}
              >
                <CheckCircle2 size={16} />
                {isApproving ? "Aprobando..." : "Aprobar"}
              </button>
            ) : null}

            {canEdit ? (
              <button
                type="button"
                className="miniAction"
                onClick={onEdit}
                disabled={isCancelling || isApproving || isReceiving}
              >
                <PencilLine size={16} />
                Editar
              </button>
            ) : null}

            {canCancel ? (
              <button
                type="button"
                className="miniAction miniActionDanger"
                onClick={onCancel}
                disabled={isCancelling || isApproving || isReceiving}
              >
                <XCircle size={16} />
                {isCancelling ? "Cancelando..." : "Cancelar solicitud"}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
