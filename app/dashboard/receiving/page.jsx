"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowRightLeft, PackageCheck, Search, ShoppingCart } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import DialogModal from "@components/shared/DialogModal/DialogModal";
import PurchaseRequestReviewModal from "@components/purchases/PurchaseRequestReviewModal/PurchaseRequestReviewModal";
import RequestFulfillmentModal from "@components/requests/RequestFulfillmentModal/RequestFulfillmentModal";
import { getLocationLabel, getRequestTypeLabel } from "@libs/constants/domainLabels";
import { buildSearchParams, getStringParam } from "@libs/urlParams";
import styles from "./page.module.scss";

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

function getPendingPurchaseReceipt(request) {
  return (request.items || []).reduce(
    (sum, item) =>
      sum +
      Math.max(
        Number(item?.dispatchedQuantity || 0) - Number(item?.receivedQuantity || 0),
        0
      ),
    0
  );
}

function getPendingInternalReceipt(request) {
  return (request.items || []).reduce(
    (sum, item) =>
      sum +
      Math.max(
        Number(item?.dispatchedQuantity || 0) - Number(item?.receivedQuantity || 0),
        0
      ),
    0
  );
}

function getPendingItemCount(items = []) {
  return items.filter(
    (item) =>
      Math.max(
        Number(item?.dispatchedQuantity || 0) - Number(item?.receivedQuantity || 0),
        0
      ) > 0
  ).length;
}

function getUserLabel(person) {
  if (!person) return "Usuario";
  return [person.firstName, person.lastName].filter(Boolean).join(" ").trim() || person.username || person.email || "Usuario";
}

function matchesSearch(entry, query) {
  if (!query) return true;

  const normalized = query.toLowerCase();
  const haystack = [
    entry.number,
    entry.kindLabel,
    entry.requestedByLabel,
    entry.destinationLabel,
    entry.sourceLabel,
    ...(entry.productNames || []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return haystack.includes(normalized);
}

function createInitialFulfillmentData(request) {
  return {
    notes: "",
    items: (request?.items || []).map((item) => ({
      itemId: item._id,
      quantity: "",
    })),
  };
}

export default function ReceivingPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [currentUser, setCurrentUser] = useState(null);
  const [hasResolvedCurrentUser, setHasResolvedCurrentUser] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [purchaseRequests, setPurchaseRequests] = useState([]);
  const [internalRequests, setInternalRequests] = useState([]);
  const [selectedPurchaseRequest, setSelectedPurchaseRequest] = useState(null);
  const [selectedInternalRequest, setSelectedInternalRequest] = useState(null);
  const [fulfillmentData, setFulfillmentData] = useState({ notes: "", items: [] });
  const [isReceivingPurchase, setIsReceivingPurchase] = useState(false);
  const [isReceivingInternal, setIsReceivingInternal] = useState(false);
  const [dialogModal, setDialogModal] = useState({
    open: false,
    title: "",
    message: "",
    variant: "info",
  });

  const [search, setSearch] = useState(() => getStringParam(searchParams, "search"));
  const [typeFilter, setTypeFilter] = useState(() => getStringParam(searchParams, "type", "all"));

  useEffect(() => {
    const nextQuery = buildSearchParams(searchParams, {
      search: search.trim() || null,
      type: typeFilter !== "all" ? typeFilter : null,
    });

    if (nextQuery !== searchParams.toString()) {
      router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname, { scroll: false });
    }
  }, [pathname, router, search, searchParams, typeFilter]);

  async function loadPage(options = {}) {
    const { silent = false } = options;

    try {
      if (!silent) {
        setIsLoading(true);
      }

      const response = await fetch("/api/receiving", { cache: "no-store" });
      const result = await response.json();

      if (!response.ok || !result?.success) {
        throw new Error(result?.message || "No se pudieron obtener los procesos de recepcion.");
      }

      const user = result?.user || null;

      setCurrentUser(user);
      setHasResolvedCurrentUser(true);
      setPurchaseRequests(result?.data?.purchases || []);
      setInternalRequests(result?.data?.internalRequests || []);
    } catch (error) {
      console.error(error);
      setPurchaseRequests([]);
      setInternalRequests([]);
      setHasResolvedCurrentUser(true);
      setDialogModal({
        open: true,
        title: "No se pudo cargar la bandeja",
        message: error.message || "Intenta nuevamente.",
        variant: "danger",
      });
    } finally {
      if (!silent) {
        setIsLoading(false);
      }
    }
  }

  useEffect(() => {
    loadPage();
  }, []);

  const receivingEntries = useMemo(() => {
    const purchaseEntries = (purchaseRequests || [])
      .filter((request) => getPendingPurchaseReceipt(request) > 0)
      .map((request) => ({
        kind: "purchase",
        kindLabel: "Compra",
        id: request._id,
        number: request.requestNumber,
        date: request.updatedAt || request.requestedAt,
        requestedByLabel: getUserLabel(request.requestedBy),
        sourceLabel: "Proveedor",
        destinationLabel: getLocationLabel(request.destinationLocation),
        itemsCount: getPendingItemCount(request.items || []),
        pendingQuantity: getPendingPurchaseReceipt(request),
        productNames: (request.items || []).map((item) => item.product?.name || "Producto"),
        data: request,
      }));

    const filteredInternalRequests = (internalRequests || [])
      .filter((request) => request.requestType !== "return")
      .filter((request) => getPendingInternalReceipt(request) > 0)
      .map((request) => ({
        kind: "request",
        kindLabel: getRequestTypeLabel(request.requestType),
        id: request._id,
        number: request.requestNumber,
        date: request.updatedAt || request.requestedAt,
        requestedByLabel: getUserLabel(request.requestedBy),
        sourceLabel: getLocationLabel(request.sourceLocation),
        destinationLabel: getLocationLabel(request.destinationLocation),
        itemsCount: getPendingItemCount(request.items || []),
        pendingQuantity: getPendingInternalReceipt(request),
        productNames: (request.items || []).map((item) => item.product?.name || "Producto"),
        data: request,
      }));

    return [...purchaseEntries, ...filteredInternalRequests]
      .filter((entry) => typeFilter === "all" || entry.kind === typeFilter)
      .filter((entry) => matchesSearch(entry, search.trim()))
      .sort((left, right) => new Date(right.date || 0).getTime() - new Date(left.date || 0).getTime());
  }, [internalRequests, purchaseRequests, search, typeFilter]);

  const hasUnfilteredEntries = useMemo(() => {
    const purchaseCount = (purchaseRequests || []).filter(
      (request) => getPendingPurchaseReceipt(request) > 0
    ).length;
    const internalCount = (internalRequests || [])
      .filter((request) => request.requestType !== "return")
      .filter((request) => getPendingInternalReceipt(request) > 0).length;

    return purchaseCount + internalCount > 0;
  }, [internalRequests, purchaseRequests]);

  const summary = useMemo(() => {
    return receivingEntries.reduce(
      (acc, entry) => {
        acc.total += 1;
        acc.pendingQuantity += Number(entry.pendingQuantity || 0);
        if (entry.kind === "purchase") {
          acc.purchases += 1;
        }
        if (entry.kind === "request") {
          acc.requests += 1;
        }
        return acc;
      },
      { total: 0, purchases: 0, requests: 0, pendingQuantity: 0 }
    );
  }, [receivingEntries]);

  function openPurchaseReceive(request) {
    setSelectedPurchaseRequest(request);
  }

  function closePurchaseReceive() {
    if (isReceivingPurchase) return;
    setSelectedPurchaseRequest(null);
  }

  function openInternalReceive(request) {
    setSelectedInternalRequest(request);
    setFulfillmentData(createInitialFulfillmentData(request));
  }

  function closeInternalReceive() {
    if (isReceivingInternal) return;
    setSelectedInternalRequest(null);
    setFulfillmentData({ notes: "", items: [] });
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

  async function handleReceivePurchase(payload) {
    if (!selectedPurchaseRequest?._id) return;

    try {
      setIsReceivingPurchase(true);

      const response = await fetch(`/api/purchase-requests/${selectedPurchaseRequest._id}/receive`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.message || "No se pudo confirmar la recepcion.");
      }

      setDialogModal({
        open: true,
        title: "Recepcion confirmada",
        message: "La compra fue confirmada y el inventario ya quedo actualizado.",
        variant: "success",
      });
      setSelectedPurchaseRequest(null);
      await loadPage({ silent: true });
    } catch (error) {
      console.error(error);
      setDialogModal({
        open: true,
        title: "No se pudo confirmar la recepcion",
        message: error.message || "Intenta nuevamente.",
        variant: "danger",
      });
    } finally {
      setIsReceivingPurchase(false);
    }
  }

  async function handleReceiveInternal(event) {
    event.preventDefault();

    if (!selectedInternalRequest?._id) return;

    try {
      setIsReceivingInternal(true);

      const items = (fulfillmentData.items || []).map((item) => ({
        itemId: item.itemId,
        receivedQuantity: Number(item.quantity || 0),
      }));

      const response = await fetch(`/api/requests/${selectedInternalRequest._id}/receive`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          notes: fulfillmentData.notes,
          items,
        }),
      });
      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.message || "No se pudo confirmar la recepcion.");
      }

      setDialogModal({
        open: true,
        title: "Recepcion confirmada",
        message: "La solicitud interna ya quedo registrada como recibida.",
        variant: "success",
      });
      closeInternalReceive();
      await loadPage({ silent: true });
    } catch (error) {
      console.error(error);
      setDialogModal({
        open: true,
        title: "No se pudo confirmar la recepcion",
        message: error.message || "Intenta nuevamente.",
        variant: "danger",
      });
    } finally {
      setIsReceivingInternal(false);
    }
  }

  return (
    <>
      <div className="page">
        <section className={`hero fadeScaleIn ${styles.heroShell}`}>
          <div className="heroCopy">
            <span className="eyebrow">Operacion</span>
            <h1 className="title">Pendientes de recibir</h1>
            <p className="description">
              Confirma en un solo lugar lo que llega por compras o por solicitudes internas.
            </p>
          </div>

          <div className={styles.heroStats}>
            <div className="compactStat">
              <span>
                Pendientes <strong>{summary.total}</strong>
              </span>
            </div>
            <div className="compactStat">
              <span>
                Compras <strong>{summary.purchases}</strong>
              </span>
            </div>
            <div className="compactStat">
              <span>
                Internas <strong>{summary.requests}</strong>
              </span>
            </div>
          </div>
        </section>

        <section className={styles.panel}>
          <div className={styles.toolbar}>
            <div className="searchField">
              <Search size={16} />
              <input
                type="text"
                className="searchInput"
                placeholder="Buscar por numero, usuario o producto"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>

            <div className={styles.filterRow}>
              <button
                type="button"
                className={`miniAction ${typeFilter === "all" ? "miniActionPrimary" : ""}`}
                onClick={() => setTypeFilter("all")}
              >
                Todos
              </button>
              <button
                type="button"
                className={`miniAction ${typeFilter === "purchase" ? "miniActionPrimary" : ""}`}
                onClick={() => setTypeFilter("purchase")}
              >
                <ShoppingCart size={14} />
                Compras
              </button>
              <button
                type="button"
                className={`miniAction ${typeFilter === "request" ? "miniActionPrimary" : ""}`}
                onClick={() => setTypeFilter("request")}
              >
                <ArrowRightLeft size={14} />
                Internas
              </button>
            </div>
          </div>

          {isLoading && !hasResolvedCurrentUser ? (
            <div className={styles.emptyState}>Cargando pendientes...</div>
          ) : receivingEntries.length === 0 ? (
            <div className={styles.emptyState}>
              {hasUnfilteredEntries
                ? "Hay recepciones pendientes, pero no coinciden con los filtros actuales."
                : "No tienes recepciones pendientes por confirmar."}
            </div>
          ) : (
            <div className={styles.list}>
              {receivingEntries.map((entry, index) => (
                <article
                  key={`${entry.kind}-${entry.id}`}
                  className={`${styles.card} fadeScaleIn`}
                  style={{ animationDelay: `${Math.min(index, 8) * 0.03}s` }}
                >
                  <div className={styles.cardTop}>
                    <div>
                      <strong className={styles.number}>{entry.number}</strong>
                      <p className={styles.meta}>{formatDate(entry.date)}</p>
                    </div>
                    <span className={`${styles.kindBadge} ${entry.kind === "purchase" ? styles.kindPurchase : styles.kindRequest}`}>
                      {entry.kindLabel}
                    </span>
                  </div>

                  <div className={styles.cardGrid}>
                    <div className={styles.infoBlock}>
                      <span>Solicitado por</span>
                      <strong>{entry.requestedByLabel}</strong>
                    </div>
                    <div className={styles.infoBlock}>
                      <span>Origen</span>
                      <strong>{entry.sourceLabel}</strong>
                    </div>
                    <div className={styles.infoBlock}>
                      <span>Destino</span>
                      <strong>{entry.destinationLabel}</strong>
                    </div>
                    <div className={styles.infoBlock}>
                      <span>Pendiente</span>
                      <strong>{entry.pendingQuantity}</strong>
                    </div>
                  </div>

                  <div className={styles.productRow}>
                    <span>{entry.itemsCount} productos por confirmar</span>
                    <span>{entry.productNames.slice(0, 2).join(", ") || "Sin detalle"}</span>
                  </div>

                  <div className={styles.actions}>
                    <button
                      type="button"
                      className="miniAction miniActionSuccess"
                      onClick={() =>
                        entry.kind === "purchase"
                          ? openPurchaseReceive(entry.data)
                          : openInternalReceive(entry.data)
                      }
                    >
                      <PackageCheck size={14} />
                      Confirmar recibido
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>

      <PurchaseRequestReviewModal
        open={Boolean(selectedPurchaseRequest)}
        request={selectedPurchaseRequest}
        canReceive
        isReceiving={isReceivingPurchase}
        onClose={closePurchaseReceive}
        onReceive={handleReceivePurchase}
      />

      <RequestFulfillmentModal
        open={Boolean(selectedInternalRequest)}
        mode="receive"
        request={selectedInternalRequest}
        fulfillmentData={fulfillmentData}
        onItemChange={handleFulfillmentItemChange}
        onChange={handleFulfillmentChange}
        onClose={closeInternalReceive}
        onSubmit={handleReceiveInternal}
        isSubmitting={isReceivingInternal}
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
