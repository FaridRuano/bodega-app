"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Factory,
  Play,
  Plus,
  Search,
  XCircle,
} from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import styles from "./page.module.scss";
import { getUnitLabel } from "@libs/constants/units";
import { PRODUCTION_STATUS_LABELS } from "@libs/constants/productionStatus";
import { PAGE_LIMITS } from "@libs/constants/pagination";
import { buildSearchParams, getPositiveIntParam, getStringParam } from "@libs/urlParams";
import PaginationBar from "@components/shared/PaginationBar/PaginationBar";
import { getUserDisplayName } from "@libs/userDisplay";

const PRODUCTION_TYPE_LABELS = {
  transformation: "Transformación",
  cutting: "Corte",
  preparation: "Preparación",
  portioning: "Porcionado",
  generic: "General",
};

const PAGE_SIZE = PAGE_LIMITS.production;

function formatDate(value) {
  if (!value) return "Sin fecha";
  return new Intl.DateTimeFormat("es-EC", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatQuantity(value) {
  const parsed = Number(value || 0);
  return new Intl.NumberFormat("es-EC", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(parsed);
}

function getStatusClass(status) {
  switch (status) {
    case "completed":
      return styles.statusCompleted;
    case "in_progress":
      return styles.statusInProgress;
    case "cancelled":
      return styles.statusCancelled;
    default:
      return styles.statusDraft;
  }
}

function buildPreview(items = []) {
  if (!Array.isArray(items) || items.length === 0) {
    return "Sin resultados registrados.";
  }

  const firstTwo = items.slice(0, 2).map((item) => {
    return `${formatQuantity(item.quantity)} ${getUnitLabel(item.unitSnapshot)} de ${item.productNameSnapshot}`;
  });

  if (items.length <= 2) return firstTwo.join(" a ");
  return `${firstTwo.join(" a ")} a· +${items.length - 2} `;
}

export default function ProductionPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [productions, setProductions] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  const [search, setSearch] = useState(() => getStringParam(searchParams, "search"));
  const [statusFilter, setStatusFilter] = useState(() => getStringParam(searchParams, "status"));
  const [typeFilter, setTypeFilter] = useState(() => getStringParam(searchParams, "productionType"));
  const [page, setPage] = useState(() => getPositiveIntParam(searchParams, "page", 1));
  const [pagination, setPagination] = useState({
    page: 1,
    limit: PAGE_SIZE,
    total: 0,
    pages: 1,
  });
  const [summary, setSummary] = useState({
    total: 0,
    draft: 0,
    inProgress: 0,
    completed: 0,
  });

  useEffect(() => {
    setPage(1);
  }, [search, statusFilter, typeFilter]);

  useEffect(() => {
    const nextQuery = buildSearchParams(searchParams, {
      search: search.trim() || null,
      status: statusFilter || null,
      productionType: typeFilter || null,
      page: page > 1 ? page : null,
    });

    if (nextQuery !== searchParams.toString()) {
      router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname, { scroll: false });
    }
  }, [page, pathname, router, search, searchParams, statusFilter, typeFilter]);

  useEffect(() => {
    let ignore = false;

    async function loadProductions() {
      try {
        setIsLoading(true);

        const params = new URLSearchParams();
        params.set("page", String(page));
        params.set("limit", String(PAGE_SIZE));

        if (search.trim()) params.set("search", search.trim());
        if (statusFilter) params.set("status", statusFilter);
        if (typeFilter) params.set("productionType", typeFilter);

        const response = await fetch(`/api/productions?${params.toString()}`, {
          cache: "no-store",
        });

        const result = await response.json();

        if (!response.ok) {
          throw new Error(result?.message || "No se pudieron cargar las producciones.");
        }

        if (!ignore) {
          const items = Array.isArray(result?.data?.items)
            ? result.data.items
            : Array.isArray(result?.data)
              ? result.data
              : [];

          const meta = result?.data?.meta || result?.meta || {
            page,
            limit: PAGE_SIZE,
            total: items.length,
            pages: 1,
          };

          const apiSummary = result?.data?.summary || {};

          setProductions(items);
          setPagination({
            page: Number(meta.page || page),
            limit: Number(meta.limit || PAGE_SIZE),
            total: Number(meta.total || 0),
            pages: Number(meta.pages || 1),
          });
          setSummary({
            total: Number(apiSummary.total || meta.total || 0),
            draft: Number(apiSummary.draft || 0),
            inProgress: Number(apiSummary.inProgress || 0),
            completed: Number(apiSummary.completed || 0),
          });
        }
      } catch (error) {
        console.error("[PRODUCTION_PAGE_LOAD_ERROR]", error);
        if (!ignore) {
          setProductions([]);
          setPagination({
            page: 1,
            limit: PAGE_SIZE,
            total: 0,
            pages: 1,
          });
          setSummary({
            total: 0,
            draft: 0,
            inProgress: 0,
            completed: 0,
          });
        }
      } finally {
        if (!ignore) {
          setIsLoading(false);
        }
      }
    }

    const timeout = setTimeout(loadProductions, 250);

    return () => {
      ignore = true;
      clearTimeout(timeout);
    };
  }, [page, search, statusFilter, typeFilter]);

  const stats = useMemo(() => {
    return {
      total: summary.total || pagination.total || 0,
      draft: summary.draft || 0,
      inProgress: summary.inProgress || 0,
      completed: summary.completed || 0,
    };
  }, [pagination.total, summary]);

  const fromItem =
    pagination.total === 0 ? 0 : (pagination.page - 1) * pagination.limit + 1;

  const toItem =
    pagination.total === 0
      ? 0
      : Math.min(pagination.page * pagination.limit, pagination.total);

  return (
    <div className={styles.page}>
      <div className={styles.topBar}>
        <div className={styles.metricTabs}>
          <button
            type="button"
            className={`${styles.metricTab} ${!statusFilter ? styles.metricTabActive : ""}`}
            onClick={() => setStatusFilter("")}
          >
            <span className={styles.metricLabel}>Todas</span>
            <strong className={styles.metricValue}>{stats.total}</strong>
          </button>

          <button
            type="button"
            className={`${styles.metricTab} ${statusFilter === "draft" ? styles.metricTabActive : ""} ${styles.warningCard}`}
            onClick={() => setStatusFilter("draft")}
          >
            <span className={styles.metricLabel}>Borradores</span>
            <strong className={styles.metricValue}>{stats.draft}</strong>
          </button>

          <button
            type="button"
            className={`${styles.metricTab} ${statusFilter === "in_progress" ? styles.metricTabActive : ""} ${styles.infoCard}`}
            onClick={() => setStatusFilter("in_progress")}
          >
            <span className={styles.metricLabel}>En proceso</span>
            <strong className={styles.metricValue}>{stats.inProgress}</strong>
          </button>

          <button
            type="button"
            className={`${styles.metricTab} ${statusFilter === "completed" ? styles.metricTabActive : ""} ${styles.successCard}`}
            onClick={() => setStatusFilter("completed")}
          >
            <span className={styles.metricLabel}>Completadas</span>
            <strong className={styles.metricValue}>{stats.completed}</strong>
          </button>
        </div>

        <button
          type="button"
          className="btn btn-primary"
          onClick={() => router.push("/dashboard/production/new")}
        >
          <Plus size={16} />
          Nueva producción
        </button>
      </div>

      <div className={styles.filtersCard}>
        <div className={styles.searchField}>
          <Search size={16} />
          <input
            type="text"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar por número, plantilla o notas"
            className={styles.searchInput}
          />
        </div>

        <div className={styles.filtersGrid}>
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            className={styles.filterSelect}
          >
            <option value="">Todos los estados</option>
            <option value="draft">Borrador</option>
            <option value="in_progress">En proceso</option>
            <option value="completed">Completada</option>
            <option value="cancelled">Cancelada</option>
          </select>

          <select
            value={typeFilter}
            onChange={(event) => setTypeFilter(event.target.value)}
            className={styles.filterSelect}
          >
            <option value="">Todos los tipos</option>
            <option value="transformation">Transformación</option>
            <option value="cutting">Corte</option>
            <option value="preparation">Preparación</option>
            <option value="portioning">Porcionado</option>
            <option value="generic">General</option>
          </select>

          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => {
              setSearch("");
              setStatusFilter("");
              setTypeFilter("");
              setPage(1);
            }}
          >
            Limpiar filtros
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className={styles.emptyState}>
          <p className={styles.emptyTitle}>Cargando producciones...</p>
        </div>
      ) : productions.length === 0 ? (
        <div className={styles.emptyState}>
          <Factory size={28} className={styles.emptyIcon} />
          <p className={styles.emptyTitle}>No se encontraron producciones</p>
          <p className={styles.emptyDescription}>
            Ajusta los filtros o crea una nueva producción para comenzar.
          </p>

          <button
            type="button"
            className="btn btn-primary"
            onClick={() => router.push("/dashboard/production/new")}
          >
            <Plus size={16} />
            Nueva producción
          </button>
        </div>
      ) : (
        <>
          <div className={styles.list}>
            {productions.map((production) => {
              const outputPreview = buildPreview(
                production.outputs?.length ? production.outputs : production.expectedOutputs
              );

              const responsibleName = getUserDisplayName(production.performedBy, "Sin responsable");

              return (
                <div
                  key={production._id}
                  className={`card ${styles.productionCard}`}
                >
                  <div className={styles.cardTop}>
                    <div className={styles.cardMain}>
                      <div className={styles.titleRow}>
                        <h3 className={styles.cardTitle}>
                          {production.productionNumber || "Sin número"}
                        </h3>

                        <span
                          className={`${styles.statusBadge} ${getStatusClass(production.status)}`}
                        >
                          {PRODUCTION_STATUS_LABELS[production.status] || production.status}
                        </span>
                      </div>

                      <p className={styles.cardDescription}>
                        {production.templateSnapshot?.name || "Sin plantilla asociada"}
                      </p>
                    </div>

                    <div className={styles.targetBlock}>
                      <span className={styles.targetLabel}>Objetivo</span>
                      <strong className={styles.targetValue}>
                        {formatQuantity(production.targetQuantity)} {getUnitLabel(production.targetUnit)}
                      </strong>
                    </div>
                  </div>

                  <div className={styles.cardMeta}>
                    <span className={styles.metaPill}>
                      <Factory size={14} />
                      {PRODUCTION_TYPE_LABELS[production.productionType] || production.productionType}
                    </span>

                    <span className={styles.metaPill}>
                      Responsable: {responsibleName}
                    </span>

                    <span className={styles.metaPill}>
                      UbicaciÃƒÂ³n: {production.location === "kitchen" ? "Cocina" : production.location}
                    </span>
                  </div>

                  <div className={styles.resultBox}>
                    <span className={styles.resultLabel}>Resultados</span>
                    <p className={styles.resultText}>{outputPreview}</p>
                  </div>

                  <div className={styles.cardFooter}>
                    <div className={styles.footerStats}>
                      <span className={styles.footerStat}>
                        Creada: {formatDate(production.createdAt)}
                      </span>

                      <span className={styles.footerStat}>
                        Inicio: {production.startedAt ? formatDate(production.startedAt) : "Pendiente"}
                      </span>

                      <span className={styles.footerStat}>
                        Cierre: {production.completedAt ? formatDate(production.completedAt) : "Pendiente"}
                      </span>
                    </div>

                    <div className={styles.footerActions}>
                      {production.status === "draft" && (
                        <button
                          type="button"
                          className="btn btn-neutral"
                          onClick={() => router.push(`/dashboard/production/${production._id}`)}
                        >
                          <Play size={15} />
                          Continuar
                        </button>
                      )}

                      {production.status === "in_progress" && (
                        <button
                          type="button"
                          className="btn btn-primary"
                          onClick={() => router.push(`/dashboard/production/${production._id}`)}
                        >
                          <Play size={15} />
                          Gestionar
                        </button>
                      )}

                      {production.status === "cancelled" && (
                        <button
                          type="button"
                          className="btn btn-danger"
                          onClick={() => router.push(`/dashboard/production/${production._id}`)}
                        >
                          <XCircle size={15} />
                          Ver detalle
                        </button>
                      )}

                      {(production.status === "completed" || production.status === "cancelled") &&
                        production.status !== "cancelled" && (
                          <button
                            type="button"
                            className="btn btn-secondary"
                            onClick={() => router.push(`/dashboard/production/${production._id}`)}
                          >
                            Ver detalle
                          </button>
                        )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <PaginationBar
            page={pagination.page}
            totalPages={pagination.pages}
            totalItems={pagination.total}
            fromItem={fromItem}
            toItem={toItem}
            itemLabel="producciones"
            onPageChange={setPage}
          />
        </>
      )}
    </div>
  );
}
