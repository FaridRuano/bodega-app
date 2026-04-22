"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Search, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import PaginationBar from "@components/shared/PaginationBar/PaginationBar";
import { getLocationLabel } from "@libs/constants/domainLabels";
import { getUnitLabel } from "@libs/constants/units";
import { buildSearchParams, getPositiveIntParam, getStringParam } from "@libs/urlParams";
import styles from "./page.module.scss";

const PAGE_SIZE = 10;
const PURCHASE_BATCH_STATUS_LABELS = {
  draft: "Borrador",
  posted: "Guardada",
  purchased: "Compra realizada",
  dispatched: "Despachada",
  completed: "Completada",
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

function getPurchaseBatchStatusLabel(status) {
  return PURCHASE_BATCH_STATUS_LABELS[status] || status || "Compra";
}

function getUserLabel(user) {
  if (!user) return "Sin usuario";
  return [user.firstName, user.lastName].filter(Boolean).join(" ").trim() || user.username || user.email || "Usuario";
}

function getComputedTotalCost(item) {
  const quantity = Number(item?.quantity || 0);
  const unitCost = item?.unitCost == null ? null : Number(item.unitCost);

  if (!Number.isFinite(quantity) || quantity <= 0) return null;
  if (!Number.isFinite(unitCost) || unitCost < 0) return null;

  return quantity * unitCost;
}

function getBatchActivityTitle(entry) {
  switch (entry?.type) {
    case "purchase_saved_draft":
      return entry?.title || "Borrador guardado";
    case "purchase_updated_draft":
      return entry?.title || "Borrador actualizado";
    case "purchase_created":
      return entry?.title || "Compra registrada";
    case "purchase_dispatched":
      return entry?.title || "Compra despachada";
    case "receipt_confirmed":
      return entry?.title || "Recepcion confirmada";
    case "purchase_deleted_draft":
      return entry?.title || "Borrador eliminado";
    default:
      return entry?.title || "Actualizacion";
  }
}

function getBatchActivityMeta(entry) {
  const itemsCount = Array.isArray(entry?.metadata?.items) ? entry.metadata.items.length : 0;
  const requestNumber = entry?.metadata?.requestNumber || "";
  const destinationLocation = entry?.metadata?.destinationLocation;
  const parts = [];

  if (requestNumber) {
    parts.push(requestNumber);
  }

  if (destinationLocation) {
    parts.push(getLocationLabel(destinationLocation));
  }

  if (itemsCount > 0) {
    parts.push(`${itemsCount} productos`);
  }

  return parts.join(" · ");
}

export default function PurchaseHistoryPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [currentUser, setCurrentUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [batches, setBatches] = useState([]);
  const [users, setUsers] = useState([]);
  const [meta, setMeta] = useState({ page: 1, pages: 1, total: 0, limit: PAGE_SIZE });
  const [selectedBatch, setSelectedBatch] = useState(null);

  const [search, setSearch] = useState(() => getStringParam(searchParams, "search"));
  const [page, setPage] = useState(() => getPositiveIntParam(searchParams, "page", 1));
  const [dateFrom, setDateFrom] = useState(() => getStringParam(searchParams, "dateFrom"));
  const [dateTo, setDateTo] = useState(() => getStringParam(searchParams, "dateTo"));
  const [registeredBy, setRegisteredBy] = useState(() => getStringParam(searchParams, "registeredBy"));

  useEffect(() => {
    setPage(1);
  }, [search, dateFrom, dateTo, registeredBy]);

  useEffect(() => {
    const nextQuery = buildSearchParams(searchParams, {
      search: search.trim() || null,
      page: page > 1 ? page : null,
      dateFrom: dateFrom || null,
      dateTo: dateTo || null,
      registeredBy: registeredBy || null,
    });

    if (nextQuery !== searchParams.toString()) {
      router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname, { scroll: false });
    }
  }, [dateFrom, dateTo, page, pathname, registeredBy, router, search, searchParams]);

  useEffect(() => {
    let cancelled = false;

    async function loadPage() {
      try {
        setIsLoading(true);

        const meResponse = await fetch("/api/auth/me", { cache: "no-store" });
        const meResult = await meResponse.json();

        if (!meResult?.user || meResult.user.role !== "admin") {
          router.replace("/dashboard/purchases");
          return;
        }

        if (!cancelled) {
          setCurrentUser(meResult.user);
        }

        const params = new URLSearchParams();
        params.set("page", String(page));
        params.set("limit", String(PAGE_SIZE));

        if (search.trim()) params.set("search", search.trim());
        if (dateFrom) params.set("dateFrom", dateFrom);
        if (dateTo) params.set("dateTo", dateTo);
        if (registeredBy) params.set("registeredBy", registeredBy);

        const [batchesResponse, usersResponse] = await Promise.all([
          fetch(`/api/purchase-batches?${params.toString()}`, { cache: "no-store" }),
          fetch("/api/users", { cache: "no-store" }),
        ]);

        const [batchesResult, usersResult] = await Promise.all([
          batchesResponse.json(),
          usersResponse.json(),
        ]);

        if (!batchesResponse.ok || !batchesResult.success) {
          throw new Error(batchesResult.message || "No se pudo cargar el historial de compras.");
        }

        if (!usersResponse.ok || !usersResult.success) {
          throw new Error(usersResult.message || "No se pudieron cargar los usuarios.");
        }

        if (!cancelled) {
          setBatches(batchesResult.data || []);
          setUsers(usersResult.data || []);
          setMeta(batchesResult.meta || { page: 1, pages: 1, total: 0, limit: PAGE_SIZE });
        }
      } catch (error) {
        console.error(error);
        if (!cancelled) {
          setBatches([]);
          setUsers([]);
          setMeta({ page: 1, pages: 1, total: 0, limit: PAGE_SIZE });
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    loadPage();

    return () => {
      cancelled = true;
    };
  }, [dateFrom, dateTo, page, registeredBy, router, search]);

  const fromItem = meta.total ? (meta.page - 1) * PAGE_SIZE + 1 : 0;
  const toItem = meta.total ? Math.min(meta.page * PAGE_SIZE, meta.total) : 0;

  const userOptions = useMemo(
    () =>
      users.map((user) => ({
        value: user._id,
        label: getUserLabel(user),
      })),
    [users]
  );

  function clearFilters() {
    setSearch("");
    setDateFrom("");
    setDateTo("");
    setRegisteredBy("");
  }

  function closeDetailsModal() {
    setSelectedBatch(null);
  }

  return (
    <>
    <div className="page">
      <section className={`hero fadeScaleIn ${styles.heroShell}`}>
        <div className="heroCopy">
          <span className="eyebrow">Compras</span>
          <h1 className="title">Historial de compras</h1>
          <p className="description">
            Revisa todas las compras registradas y filtralas por fecha o por usuario.
          </p>
        </div>

        <div className={styles.heroStats}>
          <button
            type="button"
            className="miniAction"
            onClick={() => router.push("/dashboard/purchases?tab=execution")}
          >
            <ArrowLeft size={14} />
            Volver a compras
          </button>
          <div className="compactStat">
            <span>
              Registros <strong>{meta.total || 0}</strong>
            </span>
          </div>
        </div>
      </section>

      <section className={styles.panel}>
        <div className={styles.filtersGrid}>
          <div className="searchField">
            <Search size={16} />
            <input
              type="text"
              className="searchInput"
              placeholder="Buscar por lote o proveedor"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>

          <input
            type="date"
            className="form-input"
            value={dateFrom}
            onChange={(event) => setDateFrom(event.target.value)}
          />

          <input
            type="date"
            className="form-input"
            value={dateTo}
            onChange={(event) => setDateTo(event.target.value)}
          />

          <div className="selectWrap">
            <select
              value={registeredBy}
              onChange={(event) => setRegisteredBy(event.target.value)}
              className="filterSelect"
            >
              <option value="">Todos los usuarios</option>
              {userOptions.map((user) => (
                <option key={user.value} value={user.value}>
                  {user.label}
                </option>
              ))}
            </select>
          </div>

          <button
            type="button"
            className="miniAction"
            onClick={clearFilters}
            disabled={!search.trim() && !dateFrom && !dateTo && !registeredBy}
          >
            Limpiar filtros
          </button>
        </div>

        {isLoading ? (
          <div className={styles.emptyState}>Cargando historial...</div>
        ) : batches.length === 0 ? (
          <div className={styles.emptyState}>No hay compras que coincidan con esos filtros.</div>
        ) : (
          <>
            <div className={styles.tableHead}>
              <span>Lote</span>
              <span>Fecha</span>
              <span>Proveedor</span>
              <span>Usuario</span>
              <span>Productos</span>
              <span>Estado</span>
            </div>

            <div className={styles.rows}>
              {batches.map((batch, index) => (
                <article
                  key={batch._id}
                  className={`${styles.rowCard} fadeScaleIn`}
                  style={{ animationDelay: `${Math.min(index, 8) * 0.03}s` }}
                  role="button"
                  tabIndex={0}
                  onClick={() => setSelectedBatch(batch)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      setSelectedBatch(batch);
                    }
                  }}
                >
                  <div className={styles.rowCell}>
                    <strong>{batch.batchNumber}</strong>
                  </div>
                  <div className={styles.rowCell}>
                    <strong>{formatDate(batch.purchasedAt)}</strong>
                    <span>{batch.dispatchedAt ? `Despachada ${formatDate(batch.dispatchedAt)}` : "Sin despacho"}</span>
                  </div>
                  <div className={styles.rowCell}>
                    <strong>{batch.supplierName || "Sin proveedor"}</strong>
                    <span>{batch.note || "Sin nota"}</span>
                  </div>
                  <div className={styles.rowCell}>
                    <strong>{getUserLabel(batch.registeredBy)}</strong>
                    <span>
                      {batch.dispatchedBy
                        ? (getUserLabel(batch.dispatchedBy) === getUserLabel(batch.registeredBy)
                          ? "Mismo usuario en registro y despacho"
                          : `Despacho: ${getUserLabel(batch.dispatchedBy)}`)
                        : "Sin despacho"}
                    </span>
                  </div>
                  <div className={styles.rowCell}>
                    <strong>{batch.items?.length || 0} productos</strong>
                    <span>{(batch.items || []).slice(0, 2).map((item) => item.product?.name || "Producto").join(", ") || "Sin detalle"}</span>
                  </div>
                  <div className={styles.rowCell}>
                    <span className={`${styles.statusBadge} ${["dispatched", "completed"].includes(batch.status) ? styles.statusDone : styles.statusPending}`}>
                      {getPurchaseBatchStatusLabel(batch.status)}
                    </span>
                  </div>
                </article>
              ))}
            </div>

            <PaginationBar
              page={meta.page || page}
              totalPages={meta.pages || 1}
              totalItems={meta.total || 0}
              fromItem={fromItem}
              toItem={toItem}
              itemLabel="compras"
              onPageChange={setPage}
            />
          </>
        )}
      </section>
    </div>
    {selectedBatch ? (
      <div className="modal-overlay" onClick={closeDetailsModal}>
        <div
          className={`modal-container modal-container--xl ${styles.detailsModal}`}
          onClick={(event) => event.stopPropagation()}
        >
          <div className="modal-top">
            <div className="modal-headerContent">
              <div className="modal-icon modal-icon--info">
                <Search size={18} />
              </div>
              <div>
                <h2 className="modal-title">{selectedBatch.batchNumber}</h2>
                <p className="modal-description">
                  Revisa el detalle completo de la compra registrada.
                </p>
              </div>
            </div>

            <button
              type="button"
              className="modal-close"
              onClick={closeDetailsModal}
              aria-label="Cerrar detalle"
            >
              <X size={18} />
            </button>
          </div>

          <div className="modal-body">
            <section className="modal-section">
              <div className={styles.detailsGrid}>
                <div className={styles.detailItem}>
                  <span>Estado</span>
                  <strong>{getPurchaseBatchStatusLabel(selectedBatch.status)}</strong>
                </div>
                <div className={styles.detailItem}>
                  <span>Fecha de compra</span>
                  <strong>{formatDate(selectedBatch.purchasedAt)}</strong>
                </div>
                <div className={styles.detailItem}>
                  <span>Despacho</span>
                  <strong>{selectedBatch.dispatchedAt ? formatDate(selectedBatch.dispatchedAt) : "Sin despacho"}</strong>
                </div>
                <div className={styles.detailItem}>
                  <span>Proveedor</span>
                  <strong>{selectedBatch.supplierName || "Sin proveedor"}</strong>
                </div>
                <div className={styles.detailItem}>
                  <span>Registrada por</span>
                  <strong>{getUserLabel(selectedBatch.registeredBy)}</strong>
                </div>
              </div>

              {selectedBatch.note ? (
                <div className={styles.detailNote}>
                  <span>Nota general</span>
                  <p>{selectedBatch.note}</p>
                </div>
              ) : null}
            </section>

            <section className="modal-section">
              <div className="modal-sectionHeader">
                <h3 className="modal-sectionTitle">Productos</h3>
                <p className="modal-sectionDescription">
                  {selectedBatch.items?.length || 0} productos registrados en esta compra.
                </p>
              </div>

              <div className={styles.itemsList}>
                {(selectedBatch.items || []).map((item) => (
                  <article key={item._id} className={styles.itemCard}>
                    <div className={styles.itemTop}>
                      <div className={styles.itemMain}>
                        <strong>{item.product?.name || "Producto"}</strong>
                        <span>{getUnitLabel(item.unitSnapshot)}</span>
                      </div>

                      <div className={styles.itemMetrics}>
                        <strong className={styles.itemQuantity}>
                          {item.quantity}
                        </strong>
                        <span className={styles.itemCostMuted}>
                          {item.unitCost != null ? `$${Number(item.unitCost).toFixed(2)}` : "Sin costo unit."}
                        </span>
                        {getComputedTotalCost(item) != null ? (
                          <span>Total estimado: ${getComputedTotalCost(item).toFixed(2)}</span>
                        ) : null}
                      </div>
                    </div>

                    {item.note ? (
                      <p className={styles.itemNote}>{item.note}</p>
                    ) : null}

                  </article>
                ))}
              </div>
            </section>

            {selectedBatch.activityLog?.length ? (
              <section className="modal-section">
                <div className="modal-sectionHeader">
                  <h3 className="modal-sectionTitle">Historial</h3>
                  <p className="modal-sectionDescription">
                    Revisa cuando se registro, despacho y confirmo esta compra.
                  </p>
                </div>

                <div className={styles.timeline}>
                  {selectedBatch.activityLog
                    .slice()
                    .sort(
                      (left, right) =>
                        new Date(right?.performedAt || 0).getTime() -
                        new Date(left?.performedAt || 0).getTime()
                    )
                    .map((entry) => (
                      <article key={entry._id} className={styles.timelineCard}>
                        <div className={styles.timelineTop}>
                          <strong>{getBatchActivityTitle(entry)}</strong>
                          <span>{formatDate(entry.performedAt)}</span>
                        </div>
                        <span className={styles.timelineMeta}>
                          {[getUserLabel(entry.performedBy), getBatchActivityMeta(entry)]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                        {entry.description ? (
                          <p className={styles.timelineDescription}>{entry.description}</p>
                        ) : null}
                      </article>
                    ))}
                </div>
              </section>
            ) : null}
          </div>
        </div>
      </div>
    ) : null}
    </>
  );
}
