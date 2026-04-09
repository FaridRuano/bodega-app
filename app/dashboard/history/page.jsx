"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, Clock3, Factory, Search, ShoppingBag, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import styles from "./page.module.scss";
import PaginationBar from "@components/shared/PaginationBar/PaginationBar";
import { PAGE_LIMITS } from "@libs/constants/pagination";
import { buildSearchParams, getPositiveIntParam, getStringParam } from "@libs/urlParams";
import { getLocationLabel, getRequestStatusLabel } from "@libs/constants/domainLabels";
import { PRODUCTION_STATUS_LABELS } from "@libs/constants/productionStatus";
import { getPurposeLabel } from "@libs/constants/purposes";

const PAGE_SIZE = PAGE_LIMITS.history;

const HISTORY_FILTERS = [
  { value: "all", label: "Todo" },
  { value: "request", label: "Solicitudes" },
  { value: "production", label: "Producción" },
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

function buildPersonLabel(user) {
  if (!user) return "Sin responsable";

  const fullName = [user.firstName, user.lastName].filter(Boolean).join(" ").trim();
  return fullName || user.username || user.email || "Sin responsable";
}

function getSortedRequestActivities(request) {
  return [...(request.activityLog || [])].sort((a, b) => {
    const first = new Date(a?.performedAt || 0).getTime();
    const second = new Date(b?.performedAt || 0).getTime();
    return second - first;
  });
}

function getRequestActionLabel(activity, request) {
  if (activity?.title) return activity.title;

  switch (activity?.type) {
    case "request_created":
      return "Solicitud creada";
    case "approved":
      return "Solicitud aprobada";
    case "dispatch":
      return request?.requestType === "return"
        ? "Devolución despachada"
        : "Despacho registrado";
    case "receive":
      return request?.requestType === "return"
        ? "Devolución recibida"
        : "Recepción registrada";
    case "rejected":
      return "Solicitud rechazada";
    case "cancelled":
      return "Solicitud cancelada";
    case "edited":
      return "Solicitud editada";
    default:
      return "Movimiento registrado";
  }
}

function getProductionActionLabel(production) {
  switch (production?.status) {
    case "completed":
      return "Producción completada";
    case "cancelled":
      return "Producción cancelada";
    case "in_progress":
      return "Producción iniciada";
    case "draft":
    default:
      return "Producción creada";
  }
}

function buildRequestPreview(request) {
  const names = (request.items || []).map((item) => item.product?.name).filter(Boolean);

  if (names.length === 0) return "Sin productos registrados.";
  if (names.length <= 2) return names.join(" · ");

  return `${names.slice(0, 2).join(" · ")} +${names.length - 2} más`;
}

function buildProductionPreview(production) {
  const outputs = [
    ...(production.outputs || []),
    ...(production.byproducts || []),
    ...(production.waste || []),
  ];

  const names = (outputs.length ? outputs : production.expectedOutputs || [])
    .map((item) => item.productNameSnapshot)
    .filter(Boolean);

  if (names.length === 0) return "Sin resultados registrados.";
  if (names.length <= 2) return names.join(" · ");

  return `${names.slice(0, 2).join(" · ")} +${names.length - 2} más`;
}

function buildHistoryItems(requests, productions) {
  const requestItems = (requests || []).flatMap((request) => {
    const activities = getSortedRequestActivities(request);

    if (!activities.length) {
      return [{
        id: request._id,
        kind: "request",
        code: request.requestNumber || "Solicitud sin número",
        title: getPurposeLabel(request.justification) || request.justification || "Solicitud operativa",
        statusLabel: getRequestStatusLabel(request.status),
        date: request.requestedAt || request.createdAt,
        actionLabel: "Solicitud creada",
        actorLabel: buildPersonLabel(request.requestedBy),
        route: {
          from: getLocationLabel(request.sourceLocation, "Bodega"),
          to: getLocationLabel(request.destinationLocation, "Cocina"),
        },
        preview: buildRequestPreview(request),
        note: request.notes || request.statusReason || "",
        href: `/dashboard/requests?search=${encodeURIComponent(request.requestNumber || "")}`,
        searchText: [
          request.requestNumber,
          request.justification,
          request.notes,
          request.statusReason,
          request.requestedBy?.username,
          request.requestedBy?.email,
          ...(request.items || []).flatMap((item) => [item.product?.name, item.product?.code]),
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase(),
      }];
    }

    return activities.map((activity) => ({
      id: `${request._id}-${activity._id || activity.performedAt || activity.type}`,
      kind: "request",
      code: request.requestNumber || "Solicitud sin número",
      title: getPurposeLabel(request.justification) || request.justification || "Solicitud operativa",
      statusLabel: getRequestStatusLabel(request.status),
      date: activity?.performedAt || request.requestedAt || request.createdAt,
      actionLabel: getRequestActionLabel(activity, request),
      actorLabel: buildPersonLabel(activity?.performedBy || request.requestedBy),
      route: {
        from: getLocationLabel(request.sourceLocation, "Bodega"),
        to: getLocationLabel(request.destinationLocation, "Cocina"),
      },
      preview: buildRequestPreview(request),
      note: activity?.description || request.notes || request.statusReason || "",
      href: `/dashboard/requests?search=${encodeURIComponent(request.requestNumber || "")}`,
      searchText: [
        request.requestNumber,
        request.justification,
        request.notes,
        request.statusReason,
        activity?.title,
        activity?.description,
        activity?.performedBy?.username,
        activity?.performedBy?.email,
        request.requestedBy?.username,
        request.requestedBy?.email,
        ...(request.items || []).flatMap((item) => [item.product?.name, item.product?.code]),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase(),
    }));
  });

  const productionItems = (productions || []).map((production) => ({
    id: production._id,
    kind: "production",
    code: production.productionNumber || "Producción sin número",
    title: production.templateSnapshot?.name || "Producción sin plantilla",
    statusLabel: PRODUCTION_STATUS_LABELS[production.status] || production.status,
    date: production.completedAt || production.startedAt || production.createdAt,
    actionLabel: getProductionActionLabel(production),
    actorLabel: buildPersonLabel(production.performedBy),
    route: {
      from: getLocationLabel(production.location, "Cocina"),
      to: "Producción",
    },
    preview: buildProductionPreview(production),
    note: production.notes || "",
    href: `/dashboard/production/${production._id}`,
    searchText: [
      production.productionNumber,
      production.templateSnapshot?.name,
      production.templateSnapshot?.code,
      production.notes,
      production.performedBy?.username,
      production.performedBy?.firstName,
      production.performedBy?.lastName,
      ...(production.expectedInputs || []).flatMap((item) => [item.productNameSnapshot, item.productCodeSnapshot]),
      ...(production.expectedOutputs || []).flatMap((item) => [item.productNameSnapshot, item.productCodeSnapshot]),
      ...(production.outputs || []).flatMap((item) => [item.productNameSnapshot, item.productCodeSnapshot]),
      ...(production.byproducts || []).flatMap((item) => [item.productNameSnapshot, item.productCodeSnapshot]),
      ...(production.waste || []).flatMap((item) => [item.productNameSnapshot, item.productCodeSnapshot]),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase(),
  }));

  return [...requestItems, ...productionItems].sort((a, b) => {
    const dateA = a.date ? new Date(a.date).getTime() : 0;
    const dateB = b.date ? new Date(b.date).getTime() : 0;
    return dateB - dateA;
  });
}

export default function HistoryPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [requests, setRequests] = useState([]);
  const [productions, setProductions] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState(() => getStringParam(searchParams, "search"));
  const [typeFilter, setTypeFilter] = useState(() => getStringParam(searchParams, "type", "all"));
  const [page, setPage] = useState(() => getPositiveIntParam(searchParams, "page", 1));

  useEffect(() => {
    setPage(1);
  }, [search, typeFilter]);

  useEffect(() => {
    const nextQuery = buildSearchParams(searchParams, {
      search: search.trim() || null,
      type: typeFilter !== "all" ? typeFilter : null,
      page: page > 1 ? page : null,
    });

    if (nextQuery !== searchParams.toString()) {
      router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname, { scroll: false });
    }
  }, [page, pathname, router, search, searchParams, typeFilter]);

  useEffect(() => {
    let ignore = false;

    async function loadHistory() {
      try {
        setIsLoading(true);

        const [meResponse, requestsResponse, productionsResponse] = await Promise.all([
          fetch("/api/auth/me", { cache: "no-store" }),
          fetch("/api/requests", { cache: "no-store" }),
          fetch("/api/productions", { cache: "no-store" }),
        ]);

        const [meResult, requestsResult, productionsResult] = await Promise.all([
          meResponse.json(),
          requestsResponse.json(),
          productionsResponse.json(),
        ]);

        if (!meResponse.ok || !meResult?.success) {
          throw new Error(meResult?.message || "No se pudo cargar la sesión actual.");
        }

        if (!requestsResponse.ok || !requestsResult?.success) {
          throw new Error(requestsResult?.message || "No se pudieron cargar las solicitudes.");
        }

        if (!productionsResponse.ok || !productionsResult?.success) {
          throw new Error(productionsResult?.message || "No se pudieron cargar las producciones.");
        }

        if (!ignore) {
          setCurrentUser(meResult.user || null);
          setRequests(Array.isArray(requestsResult?.data) ? requestsResult.data : []);
          setProductions(Array.isArray(productionsResult?.data?.items) ? productionsResult.data.items : []);
        }
      } catch (error) {
        console.error("[HISTORY_PAGE_LOAD_ERROR]", error);

        if (!ignore) {
          setCurrentUser(null);
          setRequests([]);
          setProductions([]);
        }
      } finally {
        if (!ignore) {
          setIsLoading(false);
        }
      }
    }

    loadHistory();

    return () => {
      ignore = true;
    };
  }, []);

  const scopedHistoryItems = useMemo(() => {
    const role = currentUser?.role;
    const currentUserId = String(currentUser?.id || currentUser?._id || "");

    if (!currentUserId || role === "admin") {
      return buildHistoryItems(requests, productions);
    }

    const scopedRequests = requests.filter((request) => {
      const actorIds = new Set([
        request?.requestedBy?._id,
        request?.approvedBy?._id,
        request?.rejectedBy?._id,
        request?.cancelledBy?._id,
        ...(request?.dispatches || []).map((dispatch) => dispatch?.dispatchedBy?._id),
        ...(request?.receipts || []).map((receipt) => receipt?.receivedBy?._id),
        ...(request?.activityLog || []).map((activity) => activity?.performedBy?._id),
      ]
        .filter(Boolean)
        .map((value) => String(value)));

      return actorIds.has(currentUserId);
    });

    const scopedProductions = productions.filter((production) => {
      const performedById = String(
        production?.performedBy?._id || production?.performedBy?.id || ""
      );

      return performedById === currentUserId;
    });

    return buildHistoryItems(scopedRequests, scopedProductions);
  }, [currentUser, productions, requests]);

  const filteredHistory = useMemo(() => {
    const query = search.trim().toLowerCase();

    return scopedHistoryItems.filter((item) => {
      const matchesType = typeFilter === "all" || item.kind === typeFilter;
      const matchesSearch = !query || item.searchText.includes(query) || item.code.toLowerCase().includes(query);

      return matchesType && matchesSearch;
    });
  }, [scopedHistoryItems, search, typeFilter]);

  const paginatedHistory = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filteredHistory.slice(start, start + PAGE_SIZE);
  }, [filteredHistory, page]);

  const totalPages = Math.max(Math.ceil(filteredHistory.length / PAGE_SIZE), 1);
  const fromItem = filteredHistory.length === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const toItem = filteredHistory.length === 0 ? 0 : Math.min(page * PAGE_SIZE, filteredHistory.length);

  return (
    <div className={styles.page}>
      <div className={styles.toolbarCard}>
        <div className={styles.toolbarTop}>
          <div>
            <h1 className={styles.pageTitle}>Historial</h1>
            <p className={styles.pageDescription}>
              Busca una solicitud o una producción por número, código o nombre de producto.
            </p>
          </div>
        </div>

        <div className={styles.searchRow}>
          <div className={styles.searchBox}>
            <Search size={16} />
            <input
              type="text"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar por número, código, producto o nota"
              className={styles.searchInput}
            />
            {search ? (
              <button
                type="button"
                className={styles.clearButton}
                onClick={() => setSearch("")}
                aria-label="Limpiar búsqueda"
              >
                <X size={15} />
              </button>
            ) : null}
          </div>

          <div className={styles.filterRow}>
            {HISTORY_FILTERS.map((filter) => (
              <button
                key={filter.value}
                type="button"
                className={`${styles.filterChip} ${typeFilter === filter.value ? styles.filterChipActive : ""}`}
                onClick={() => setTypeFilter(filter.value)}
              >
                {filter.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className={styles.emptyState}>Cargando historial...</div>
      ) : paginatedHistory.length === 0 ? (
        <div className={styles.emptyState}>
          <p className={styles.emptyTitle}>No encontramos resultados</p>
          <p className={styles.emptyDescription}>
            Ajusta la búsqueda o limpia el filtro para volver a ver todo el historial.
          </p>
        </div>
      ) : (
        <>
          <div className={styles.resultsList}>
            {paginatedHistory.map((item) => (
              <article key={`${item.kind}-${item.id}`} className={styles.resultCard}>
                <div className={styles.cardHeader}>
                  <div className={styles.titleBlock}>
                    <span className={`${styles.kindBadge} ${item.kind === "request" ? styles.kindRequest : styles.kindProduction}`}>
                      {item.kind === "request" ? (
                        <>
                          <ShoppingBag size={14} />
                          Solicitud
                        </>
                      ) : (
                        <>
                          <Factory size={14} />
                          Producción
                        </>
                      )}
                    </span>

                    <div>
                      <h2 className={styles.resultCode}>{item.code}</h2>
                      <p className={styles.resultTitle}>{item.title}</p>
                    </div>
                  </div>

                  <div className={styles.headerMeta}>
                    <span className={styles.statusPill}>{item.statusLabel}</span>
                    <span className={styles.datePill}>
                      <Clock3 size={14} />
                      {formatDate(item.date)}
                    </span>
                  </div>
                </div>

                <div className={styles.detailsGrid}>
                  <div className={styles.detailBlock}>
                    <span className={styles.detailLabel}>Acción</span>
                    <strong className={styles.detailValue}>{item.actionLabel} </strong>
                    <span className={styles.detailSubtle}>· {item.actorLabel}</span>
                  </div>

                  <div className={styles.detailBlock}>
                    <span className={styles.detailLabel}>Flujo</span>
                    <strong className={`${styles.detailValue} ${styles.routeValue}`}>
                      <span>{item.route?.from || "Sin origen"}</span>
                      <ArrowRight size={14} className={styles.routeIcon} />
                      <span>{item.route?.to || "Sin destino"}</span>
                    </strong>
                  </div>
                </div>

                <div className={styles.previewBox}>
                  <span className={styles.previewLabel}>Detalle rápido</span>
                  <p className={styles.previewText}>{item.preview}</p>
                </div>

                {item.note ? <p className={styles.noteText}>{item.note}</p> : null}

                <div className={styles.cardFooter}>
                  <Link href={item.href} className="btn btn-secondary">
                    {item.kind === "request" ? "Ver en solicitudes" : "Ver producción"}
                  </Link>
                </div>
              </article>
            ))}
          </div>

          <PaginationBar
            page={page}
            totalPages={totalPages}
            totalItems={filteredHistory.length}
            fromItem={fromItem}
            toItem={toItem}
            itemLabel="registros"
            onPageChange={setPage}
          />
        </>
      )}
    </div>
  );
}
