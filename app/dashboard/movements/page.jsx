"use client";

import { useEffect, useState } from "react";
import {
  ArrowDownToLine,
  ArrowRightLeft,
  ArrowUpFromLine,
  CalendarDays,
  ClipboardList,
  Factory,
  Package,
  Search,
  User,
} from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import styles from "./page.module.scss";
import PaginationBar from "@components/shared/PaginationBar/PaginationBar";
import { PAGE_LIMITS } from "@libs/constants/pagination";
import { buildSearchParams, getPositiveIntParam, getStringParam } from "@libs/urlParams";
import {
  getLocationLabel,
  getMovementTypeLabel,
} from "@libs/constants/domainLabels";
import { getUnitLabel } from "@libs/constants/units";

const PAGE_SIZE = PAGE_LIMITS.movements;

const MOVEMENT_TYPE_OPTIONS = [
  { value: "", label: "Todos los tipos" },
  { value: "transfer", label: "Transferencias" },
  { value: "request_dispatch", label: "Despachos" },
  { value: "production_consumption", label: "Consumo de produccion" },
  { value: "production_output", label: "Salida de produccion" },
  { value: "adjustment_in", label: "Ajustes de entrada" },
  { value: "adjustment_out", label: "Ajustes de salida" },
  { value: "waste", label: "Mermas" },
];

const LOCATION_OPTIONS = [
  { value: "", label: "Todas las ubicaciones" },
  { value: "warehouse", label: "Bodega" },
  { value: "kitchen", label: "Cocina" },
  { value: "lounge", label: "Salon" },
];

function formatDate(value) {
  if (!value) return "Sin fecha";
  return new Intl.DateTimeFormat("es-EC", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function getMovementIcon(type) {
  switch (type) {
    case "transfer":
      return ArrowRightLeft;
    case "request_dispatch":
      return ClipboardList;
    case "production_consumption":
    case "production_output":
      return Factory;
    default:
      return Package;
  }
}

function getRouteSummary(movement) {
  const from = movement.fromLocationLabel || getLocationLabel(movement.fromLocation);
  const to = movement.toLocationLabel || getLocationLabel(movement.toLocation, "Sin destino");

  return `${from} -> ${to}`;
}

export default function MovementsPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [movements, setMovements] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState(() => getStringParam(searchParams, "search"));
  const [dateFilter, setDateFilter] = useState(() => getStringParam(searchParams, "date"));
  const [locationFilter, setLocationFilter] = useState(() => getStringParam(searchParams, "location"));
  const [movementTypeFilter, setMovementTypeFilter] = useState(() => getStringParam(searchParams, "movementType"));
  const [page, setPage] = useState(() => getPositiveIntParam(searchParams, "page", 1));
  const [pagination, setPagination] = useState({ page: 1, limit: PAGE_SIZE, total: 0, pages: 1 });
  const [summary, setSummary] = useState({ total: 0, transfers: 0, outputs: 0, inputs: 0 });

  const hasActiveFilters = Boolean(search.trim()) || Boolean(dateFilter) || Boolean(locationFilter) || Boolean(movementTypeFilter);

  useEffect(() => {
    setPage(1);
  }, [dateFilter, locationFilter, movementTypeFilter, search]);

  useEffect(() => {
    const nextQuery = buildSearchParams(searchParams, {
      search: search.trim() || null,
      date: dateFilter || null,
      location: locationFilter || null,
      movementType: movementTypeFilter || null,
      page: page > 1 ? page : null,
    });

    if (nextQuery !== searchParams.toString()) {
      router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname, { scroll: false });
    }
  }, [dateFilter, locationFilter, movementTypeFilter, page, pathname, router, search, searchParams]);

  useEffect(() => {
    let ignore = false;

    async function loadMovements() {
      try {
        setIsLoading(true);
        const params = new URLSearchParams();
        params.set("page", String(page));
        params.set("limit", String(PAGE_SIZE));

        if (search.trim()) {
          params.set("search", search.trim());
        }

        if (dateFilter) {
          params.set("date", dateFilter);
        }

        if (locationFilter) {
          params.set("location", locationFilter);
        }

        if (movementTypeFilter) {
          params.set("movementType", movementTypeFilter);
        }

        const response = await fetch(`/api/inventory/movements?${params.toString()}`, {
          cache: "no-store",
        });
        const result = await response.json();

        if (!ignore) {
          setMovements(result?.data || []);
          setSummary({
            total: Number(result?.summary?.total || 0),
            transfers: Number(result?.summary?.transfers || 0),
            outputs: Number(result?.summary?.outputs || 0),
            inputs: Number(result?.summary?.inputs || 0),
          });
          setPagination({
            page: Number(result?.meta?.page || page),
            limit: Number(result?.meta?.limit || PAGE_SIZE),
            total: Number(result?.meta?.total || 0),
            pages: Number(result?.meta?.pages || 1),
          });
        }
      } catch (error) {
        console.error("[MOVEMENTS_PAGE_LOAD_ERROR]", error);
        if (!ignore) {
          setMovements([]);
          setSummary({ total: 0, transfers: 0, outputs: 0, inputs: 0 });
          setPagination({ page: 1, limit: PAGE_SIZE, total: 0, pages: 1 });
        }
      } finally {
        if (!ignore) {
          setIsLoading(false);
        }
      }
    }

    loadMovements();

    return () => {
      ignore = true;
    };
  }, [dateFilter, locationFilter, movementTypeFilter, page, search]);

  const fromItem = pagination.total === 0 ? 0 : (pagination.page - 1) * pagination.limit + 1;
  const toItem = pagination.total === 0 ? 0 : Math.min(pagination.page * pagination.limit, pagination.total);

  return (
    <div className="page">
      <section className={`hero fadeScaleIn ${styles.heroShell}`}>
        <div className="heroCopy">
          <span className="eyebrow">Movimientos</span>
          <h1 className="title">Trazabilidad de movimientos</h1>
          <p className="description">
            Busca por producto o nota y filtra por fecha, ubicacion o tipo.
          </p>
        </div>

        <div className={styles.heroStats}>
          <div className="compactStat heroStatButton">
            <ClipboardList size={14} />
            <span>
              Movimientos <strong>{summary.total}</strong>
            </span>
          </div>
        </div>
      </section>

      <div className={`${styles.filterPanel} fadeSlideIn delayOne`}>
        <div className={styles.filterTopRow}>
          <div className="searchField">
            <Search size={16} />
            <input
              type="text"
              className="searchInput"
              placeholder="Buscar por producto, codigo o nota"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>

          <button
            type="button"
            className={`miniAction ${styles.clearButton}`}
            disabled={!hasActiveFilters}
            onClick={() => {
              if (!hasActiveFilters) return;
              setSearch("");
              setDateFilter("");
              setLocationFilter("");
              setMovementTypeFilter("");
              setPage(1);
            }}
          >
            Limpiar filtros
          </button>
        </div>

        <div className={styles.filterBottomRow}>
          <label className={styles.dateField}>
            <CalendarDays size={14} />
            <input
              type="date"
              className="form-input"
              value={dateFilter}
              onChange={(event) => setDateFilter(event.target.value)}
            />
          </label>

          <div className="selectWrap">
            <select
              className="filterSelect"
              value={locationFilter}
              onChange={(event) => setLocationFilter(event.target.value)}
            >
              {LOCATION_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div className="selectWrap">
            <select
              className="filterSelect"
              value={movementTypeFilter}
              onChange={(event) => setMovementTypeFilter(event.target.value)}
            >
              {MOVEMENT_TYPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className={`${styles.listSection} fadeSlideIn delayTwo`}>
        {isLoading ? (
          <div className={styles.loadingGrid}>
            {Array.from({ length: 6 }).map((_, index) => (
              <article
                key={`movement-skeleton-${index}`}
                className={`${styles.card} ${styles.skeletonCard} shimmerBlock pulseSoft`}
              >
                <div className={styles.skeletonTop}>
                  <span className={styles.skeletonBadge} />
                  <span className={styles.skeletonTitle} />
                </div>
                <div className={styles.skeletonChips}>
                  <span className={styles.skeletonChip} />
                  <span className={styles.skeletonChipShort} />
                </div>
                <div className={styles.skeletonMetaRow}>
                  <span className={styles.skeletonMeta} />
                  <span className={styles.skeletonMeta} />
                </div>
              </article>
            ))}
          </div>
        ) : movements.length === 0 ? (
          <div className={styles.emptyState}>No hay movimientos para mostrar.</div>
        ) : (
          <>
            <div className={styles.list}>
              {movements.map((movement, index) => {
                const Icon = getMovementIcon(movement.movementType);

                return (
                  <article
                    key={movement._id}
                    className={`${styles.card} fadeScaleIn`}
                    style={{ animationDelay: `${0.03 * (index % PAGE_SIZE)}s` }}
                  >
                    <div className={styles.cardTop}>
                      <div className={styles.titleBlock}>
                        <div className={styles.titleRow}>
                          <div className={styles.typeBadge}>
                            <Icon size={14} />
                            <span>{movement.movementTypeLabel || getMovementTypeLabel(movement.movementType)}</span>
                          </div>
                          <h3 className={styles.title}>
                            {movement.productId?.name || "Producto"}
                          </h3>
                        </div>

                        <div className={styles.inlineMeta}>
                          <span className={styles.metaChip}>{getRouteSummary(movement)}</span>
                          <span className={styles.metaChip}>{movement.referenceTypeLabel || "Movimiento"}</span>
                        </div>
                      </div>

                      <div className={styles.quantityBlock}>
                        <strong className={styles.quantityValue}>
                          {movement.quantity} {getUnitLabel(movement.unitSnapshot)}
                        </strong>
                        <span className={styles.quantityLabel}>Cantidad</span>
                      </div>
                    </div>

                    <div className={styles.metaGrid}>
                      <div className={styles.metaItem}>
                        <span className={styles.metaLabel}>Fecha</span>
                        <strong className={styles.metaValue}>{formatDate(movement.movementDate)}</strong>
                      </div>

                      <div className={styles.metaItem}>
                        <span className={styles.metaLabel}>Usuario</span>
                        <strong className={`${styles.metaValue} ${styles.metaInline}`}>
                          <User size={14} />
                          {movement.performedByLabel || "Sistema"}
                        </strong>
                      </div>
                    </div>

                    {movement.notes ? (
                      <p className={styles.note}>
                        {movement.notes}
                      </p>
                    ) : null}
                  </article>
                );
              })}
            </div>

            <PaginationBar
              page={pagination.page}
              totalPages={pagination.pages}
              totalItems={pagination.total}
              fromItem={fromItem}
              toItem={toItem}
              itemLabel="movimientos"
              onPageChange={setPage}
            />
          </>
        )}
      </div>
    </div>
  );
}
