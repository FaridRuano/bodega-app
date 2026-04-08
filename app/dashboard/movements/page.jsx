"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowRightLeft,
  ClipboardList,
  Factory,
  Funnel,
  Package,
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
  { value: "production_consumption", label: "Consumo de producción" },
  { value: "production_output", label: "Salida de producción" },
  { value: "adjustment_in", label: "Ajustes de entrada" },
  { value: "adjustment_out", label: "Ajustes de salida" },
  { value: "waste", label: "Mermas" },
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

  return `${from} → ${to}`;
}

export default function MovementsPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [movements, setMovements] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [locationFilter, setLocationFilter] = useState(() => getStringParam(searchParams, "location"));
  const [movementTypeFilter, setMovementTypeFilter] = useState(() => getStringParam(searchParams, "movementType"));
  const [page, setPage] = useState(() => getPositiveIntParam(searchParams, "page", 1));
  const [pagination, setPagination] = useState({ page: 1, limit: PAGE_SIZE, total: 0, pages: 1 });
  const [summary, setSummary] = useState({ total: 0, transfers: 0, outputs: 0, inputs: 0 });

  useEffect(() => {
    setPage(1);
  }, [locationFilter, movementTypeFilter]);

  useEffect(() => {
    const nextQuery = buildSearchParams(searchParams, {
      location: locationFilter || null,
      movementType: movementTypeFilter || null,
      page: page > 1 ? page : null,
    });

    if (nextQuery !== searchParams.toString()) {
      router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname, { scroll: false });
    }
  }, [locationFilter, movementTypeFilter, page, pathname, router, searchParams]);

  useEffect(() => {
    let ignore = false;

    async function loadMovements() {
      try {
        setIsLoading(true);
        const params = new URLSearchParams();
        params.set("page", String(page));
        params.set("limit", String(PAGE_SIZE));

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
  }, [locationFilter, movementTypeFilter, page]);

  const fromItem = pagination.total === 0 ? 0 : (pagination.page - 1) * pagination.limit + 1;
  const toItem = pagination.total === 0 ? 0 : Math.min(pagination.page * pagination.limit, pagination.total);

  const cards = useMemo(
    () => [
      { label: "Movimientos", value: summary.total, tone: '' },
      { label: "Transferencias", value: summary.transfers, tone: styles.infoCard },
      { label: "Entradas a cocina", value: summary.outputs, tone: styles.successCard },
      { label: "Salidas de cocina", value: summary.inputs, tone: styles.warningCard },
    ],
    [summary]
  );

  return (
    <div className={styles.page}>
      <div className={styles.headerRow}>
        <div className={styles.stats}>
          {cards.map((card) => (
            <div key={card.label} className={`${styles.statCard} ${card.tone}`}>
              <span>{card.label}</span>
              <strong>{card.value}</strong>
            </div>
          ))}
        </div>
      </div>

      <div className={styles.filtersBar}>
        <div className={styles.filtersTitle}>
          <Funnel size={16} />
          <span>Filtros</span>
        </div>

        <div className={styles.filtersGroup}>
          <select
            className={styles.filterSelect}
            value={locationFilter}
            onChange={(event) => setLocationFilter(event.target.value)}
          >
            <option value="">Todas las ubicaciones</option>
            <option value="warehouse">Bodega</option>
            <option value="kitchen">Cocina</option>
          </select>

          <select
            className={styles.filterSelect}
            value={movementTypeFilter}
            onChange={(event) => setMovementTypeFilter(event.target.value)}
          >
            {MOVEMENT_TYPE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>

          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => {
              setLocationFilter("");
              setMovementTypeFilter("");
              setPage(1);
            }}
          >
            Limpiar
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className={styles.emptyState}>Cargando movimientos...</div>
      ) : movements.length === 0 ? (
        <div className={styles.emptyState}>No hay movimientos para mostrar.</div>
      ) : (
        <>
          <div className={styles.list}>
            {movements.map((movement) => {
              const Icon = getMovementIcon(movement.movementType);

              return (
                <article key={movement._id} className={styles.card}>
                  <div className={styles.cardTop}>
                    <div className={styles.titleBlock}>
                      <div className={styles.typeBadge}>
                        <Icon size={15} />
                        <span>{movement.movementTypeLabel || getMovementTypeLabel(movement.movementType)}</span>
                      </div>

                      <h3 className={styles.title}>
                        {movement.productId?.name || "Producto"}
                      </h3>
                    </div>

                    <div className={styles.quantityBlock}>
                      <span className={styles.quantityLabel}>Cantidad</span>
                      <strong className={styles.quantityValue}>
                        {movement.quantity} {getUnitLabel(movement.unitSnapshot)}
                      </strong>
                    </div>
                  </div>

                  <div className={styles.routePanel}>
                    <span className={styles.routeLabel}>Ruta</span>
                    <strong className={styles.routeText}>{getRouteSummary(movement)}</strong>
                    <span className={styles.routeSubtext}>
                      {movement.referenceTypeLabel || "Movimiento"}
                    </span>
                  </div>

                  <div className={styles.metaGrid}>
                    <div className={styles.metaItem}>
                      <span className={styles.metaLabel}>Registrado</span>
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
  );
}
