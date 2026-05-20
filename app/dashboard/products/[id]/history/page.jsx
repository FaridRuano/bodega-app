"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  ArrowRightLeft,
  CalendarDays,
  ClipboardList,
  Factory,
  Package,
  Search,
  User,
} from "lucide-react";

import styles from "./page.module.scss";
import PaginationBar from "@components/shared/PaginationBar/PaginationBar";
import { PAGE_LIMITS } from "@libs/constants/pagination";
import { buildSearchParams, getPositiveIntParam, getStringParam } from "@libs/urlParams";
import {
  getLocationLabel,
  getMovementTypeLabel,
} from "@libs/constants/domainLabels";
import { getUnitLabel } from "@libs/constants/units";
import { formatQuantity } from "@libs/unitQuantities";

const PAGE_SIZE = PAGE_LIMITS.movements;

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
    case "production_consumption":
    case "production_output":
      return Factory;
    case "request_dispatch":
    case "request_return":
      return ClipboardList;
    default:
      return Package;
  }
}

function getRouteSummary(movement) {
  const from = movement.fromLocationLabel || getLocationLabel(movement.fromLocation);
  const to = movement.toLocationLabel || getLocationLabel(movement.toLocation, "Sin destino");

  return `${from} -> ${to}`;
}

function getImpactLabel(movement) {
  if (movement.fromLocation && movement.toLocation) return "Traslado";
  if (movement.toLocation) return "Entrada";
  if (movement.fromLocation) return "Salida";
  return "Movimiento";
}

export default function ProductHistoryPage() {
  const params = useParams();
  const productId = String(params?.id || "");
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const hasInitializedPageReset = useRef(false);

  const [product, setProduct] = useState(null);
  const [movements, setMovements] = useState([]);
  const [summary, setSummary] = useState({ total: 0 });
  const [pagination, setPagination] = useState({
    page: 1,
    limit: PAGE_SIZE,
    total: 0,
    pages: 1,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [search, setSearch] = useState(() => getStringParam(searchParams, "search"));
  const [dateFrom, setDateFrom] = useState(() => getStringParam(searchParams, "dateFrom"));
  const [dateTo, setDateTo] = useState(() => getStringParam(searchParams, "dateTo"));
  const [page, setPage] = useState(() => getPositiveIntParam(searchParams, "page", 1));

  const hasActiveFilters =
    Boolean(search.trim()) ||
    Boolean(dateFrom) ||
    Boolean(dateTo);
  const isProductLoading = isLoading && !product;

  const inventory = product?.inventory || {};
  const inventoryCards = useMemo(
    () => [
      { label: "Total", value: inventory.total },
      { label: "Bodega", value: inventory.warehouse },
      { label: "Cocina", value: inventory.kitchen },
      { label: "Salon", value: inventory.lounge },
    ],
    [inventory.kitchen, inventory.lounge, inventory.total, inventory.warehouse]
  );

  useEffect(() => {
    if (!hasInitializedPageReset.current) {
      hasInitializedPageReset.current = true;
      return;
    }

    setPage(1);
  }, [dateFrom, dateTo, search]);

  useEffect(() => {
    const nextQuery = buildSearchParams(searchParams, {
      search: search.trim() || null,
      dateFrom: dateFrom || null,
      dateTo: dateTo || null,
      page: page > 1 ? page : null,
    });

    if (nextQuery !== searchParams.toString()) {
      router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname, { scroll: false });
    }
  }, [dateFrom, dateTo, page, pathname, router, search, searchParams]);

  useEffect(() => {
    let ignore = false;

    async function loadProductHistory() {
      if (!productId) return;

      try {
        setIsLoading(true);
        setLoadError("");

        const movementParams = new URLSearchParams();
        movementParams.set("productId", productId);
        movementParams.set("page", String(page));
        movementParams.set("limit", String(PAGE_SIZE));

        if (search.trim()) {
          movementParams.set("search", search.trim());
        }

        if (dateFrom) {
          movementParams.set("dateFrom", dateFrom);
        }

        if (dateTo) {
          movementParams.set("dateTo", dateTo);
        }

        const [productResponse, movementsResponse] = await Promise.all([
          fetch(`/api/products/${productId}`, { cache: "no-store" }),
          fetch(`/api/inventory/movements?${movementParams.toString()}`, {
            cache: "no-store",
          }),
        ]);

        const productResult = await productResponse.json();
        const movementsResult = await movementsResponse.json();

        if (!productResponse.ok || !productResult.success) {
          throw new Error(productResult.message || "No se pudo obtener el producto.");
        }

        if (!movementsResponse.ok || !movementsResult.success) {
          throw new Error(movementsResult.message || "No se pudo obtener el historial.");
        }

        if (!ignore) {
          setProduct(productResult.data || null);
          setMovements(movementsResult.data || []);
          setSummary({
            total: Number(movementsResult.summary?.total || 0),
          });
          setPagination({
            page: Number(movementsResult.meta?.page || page),
            limit: Number(movementsResult.meta?.limit || PAGE_SIZE),
            total: Number(movementsResult.meta?.total || 0),
            pages: Number(movementsResult.meta?.pages || 1),
          });
        }
      } catch (error) {
        console.error("[PRODUCT_HISTORY_LOAD_ERROR]", error);
        if (!ignore) {
          setLoadError(error.message || "No se pudo cargar el historial del producto.");
          setProduct(null);
          setMovements([]);
          setSummary({ total: 0 });
          setPagination({ page: 1, limit: PAGE_SIZE, total: 0, pages: 1 });
        }
      } finally {
        if (!ignore) {
          setIsLoading(false);
        }
      }
    }

    loadProductHistory();

    return () => {
      ignore = true;
    };
  }, [dateFrom, dateTo, page, productId, search]);

  const fromItem = pagination.total === 0 ? 0 : (pagination.page - 1) * pagination.limit + 1;
  const toItem = pagination.total === 0 ? 0 : Math.min(pagination.page * pagination.limit, pagination.total);

  return (
    <div className="page">
      <section className={`hero fadeScaleIn ${styles.heroShell}`}>
        <div className="heroCopy">
          <span className="eyebrow">Historial de producto</span>
          {isProductLoading ? (
            <>
              <span className={`${styles.skeletonLine} ${styles.skeletonTitle} shimmerBlock pulseSoft`} />
              <span className={`${styles.skeletonLine} ${styles.skeletonDescription} shimmerBlock pulseSoft`} />
            </>
          ) : (
            <>
              <h1 className="title">{product?.name || "Producto no encontrado"}</h1>
              <p className="description">
                Inventario actual y movimientos registrados para este producto.
              </p>
            </>
          )}
        </div>

        <div className={styles.heroActions}>
          <div className={`compactStat ${isProductLoading ? styles.skeletonStat : ""}`}>
            <ClipboardList size={14} />
            <span>
              Movimientos <strong>{isProductLoading ? "-" : summary.total}</strong>
            </span>
          </div>

          <Link href="/dashboard/products" className="miniAction">
            Productos
          </Link>
        </div>
      </section>

      <section className={`${styles.inventoryPanel} fadeSlideIn delayOne`}>
        <div className={styles.panelHeader}>
          <div>
            <h2>Inventario actual</h2>
            {isProductLoading ? (
              <span className={`${styles.skeletonLine} ${styles.skeletonMeta} shimmerBlock pulseSoft`} />
            ) : (
              <p>
                {product?.code || "Sin codigo"} · {product ? getUnitLabel(product.unit) : "-"}
              </p>
            )}
          </div>
        </div>

        <div className={styles.inventoryGrid}>
          {inventoryCards.map((item) => (
            <div key={item.label} className={styles.inventoryCard}>
              <span>{item.label}</span>
              {isProductLoading ? (
                <span className={`${styles.skeletonLine} ${styles.skeletonAmount} shimmerBlock pulseSoft`} />
              ) : (
                <strong>{formatQuantity(item.value)}</strong>
              )}
            </div>
          ))}
        </div>
      </section>

      <section className={`${styles.filterPanel} fadeSlideIn delayTwo`}>
        <div className={styles.filterTopRow}>
          <div className="searchField">
            <Search size={16} />
            <input
              type="text"
              className="searchInput"
              placeholder="Buscar por nota"
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
              setDateFrom("");
              setDateTo("");
              setPage(1);
            }}
          >
            Limpiar filtros
          </button>
        </div>

        <div className={styles.dateRange}>
          <label className={styles.dateField}>
            <CalendarDays size={14} />
            <span>Desde</span>
            <input
              type="date"
              className="form-input"
              value={dateFrom}
              max={dateTo || undefined}
              onChange={(event) => setDateFrom(event.target.value)}
            />
          </label>

          <label className={styles.dateField}>
            <CalendarDays size={14} />
            <span>Hasta</span>
            <input
              type="date"
              className="form-input"
              value={dateTo}
              min={dateFrom || undefined}
              onChange={(event) => setDateTo(event.target.value)}
            />
          </label>
        </div>
      </section>

      <section className={`${styles.historySection} fadeSlideIn delayThree`}>
        {loadError ? (
          <div className="form-error-message" role="alert">
            {loadError}
          </div>
        ) : null}

        {isLoading ? (
          <div className={styles.tableWrap}>
            <table className={`${styles.table} ${styles.skeletonTable}`}>
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Movimiento</th>
                  <th>Tipo</th>
                  <th>Ruta</th>
                  <th>Cantidad</th>
                  <th>Usuario</th>
                  <th>Nota</th>
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: 6 }).map((_, index) => (
                  <tr key={`product-history-skeleton-${index}`}>
                    {Array.from({ length: 7 }).map((__, cellIndex) => (
                      <td key={`product-history-skeleton-${index}-${cellIndex}`}>
                        <span className={`${styles.skeletonCell} shimmerBlock pulseSoft`} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : movements.length === 0 ? (
          <div className={styles.emptyState}>No hay movimientos para mostrar.</div>
        ) : (
          <>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Movimiento</th>
                    <th>Tipo</th>
                    <th>Ruta</th>
                    <th>Cantidad</th>
                    <th>Usuario</th>
                    <th>Nota</th>
                  </tr>
                </thead>
                <tbody>
                  {movements.map((movement) => {
                    const Icon = getMovementIcon(movement.movementType);

                    return (
                      <tr key={movement._id}>
                        <td data-label="Fecha">{formatDate(movement.movementDate)}</td>
                        <td data-label="Movimiento">
                          <span className={styles.typeBadge}>
                            <Icon size={14} />
                            {movement.movementTypeLabel || getMovementTypeLabel(movement.movementType)}
                          </span>
                        </td>
                        <td data-label="Tipo">
                          <span className={styles.referenceBadge}>
                            {movement.referenceTypeLabel || getImpactLabel(movement)}
                          </span>
                        </td>
                        <td data-label="Ruta">{getRouteSummary(movement)}</td>
                        <td data-label="Cantidad" className={styles.quantityCell}>
                          {formatQuantity(movement.quantity)} {getUnitLabel(movement.unitSnapshot)}
                        </td>
                        <td data-label="Usuario">
                          <span className={styles.userCell}>
                            <User size={14} />
                            {movement.performedByLabel || "Sistema"}
                          </span>
                        </td>
                        <td data-label="Nota" className={styles.noteCell}>
                          {movement.notes || "-"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
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
      </section>
    </div>
  );
}
