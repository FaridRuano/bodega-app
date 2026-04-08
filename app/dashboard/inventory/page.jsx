"use client";

import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import styles from "./page.module.scss";
import InventoryMovementModal from "@components/inventory/InventoryModal/InventoryModal";
import DialogModal from "@components/shared/DialogModal/DialogModal";
import PaginationBar from "@components/shared/PaginationBar/PaginationBar";
import { PAGE_LIMITS } from "@libs/constants/pagination";
import { buildSearchParams, getPositiveIntParam, getStringParam } from "@libs/urlParams";
import { getUnitLabel } from "@libs/constants/units";
import { getInventoryStatusLabel } from "@libs/constants/domainLabels";

const PAGE_SIZE = PAGE_LIMITS.inventory;

function getStatusClass(status, stylesRef) {
  switch (status) {
    case "low":
      return stylesRef.statusDanger;
    case "warning":
      return stylesRef.statusWarning;
    case "out":
      return stylesRef.statusMuted;
    case "inactive":
      return stylesRef.statusMuted;
    default:
      return stylesRef.statusSuccess;
  }
}

export default function InventoryPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [products, setProducts] = useState([]);
  const [summary, setSummary] = useState(null);
  const [searchTerm, setSearchTerm] = useState(() => getStringParam(searchParams, "search"));
  const [page, setPage] = useState(() => getPositiveIntParam(searchParams, "page", 1));
  const [pagination, setPagination] = useState({ page: 1, limit: PAGE_SIZE, total: 0, pages: 1 });
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmittingMovement, setIsSubmittingMovement] = useState(false);

  const [movementModal, setMovementModal] = useState({
    open: false,
    mode: "entry",
    product: null,
  });

  const [movementForm, setMovementForm] = useState({
    quantity: "",
    location: "warehouse",
    fromLocation: "warehouse",
    toLocation: "kitchen",
    notes: "",
  });

  const [dialogModal, setDialogModal] = useState({
    open: false,
    title: "",
    message: "",
    variant: "info",
  });

  useEffect(() => {
    setPage(1);
  }, [searchTerm]);

  useEffect(() => {
    const nextQuery = buildSearchParams(searchParams, {
      search: searchTerm.trim() || null,
      page: page > 1 ? page : null,
    });

    if (nextQuery !== searchParams.toString()) {
      router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname, { scroll: false });
    }
  }, [page, pathname, router, searchParams, searchTerm]);

  async function fetchInventory() {
    try {
      setIsLoading(true);

      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("limit", String(PAGE_SIZE));

      if (searchTerm.trim()) {
        params.set("search", searchTerm.trim());
      }

      const response = await fetch(`/api/inventory?${params.toString()}`);
      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.message || "No se pudo obtener el inventario.");
      }

      setProducts(result.data || []);
      setSummary(result.summary || null);
      setPagination({
        page: Number(result.meta?.page || page),
        limit: Number(result.meta?.limit || PAGE_SIZE),
        total: Number(result.meta?.total || 0),
        pages: Number(result.meta?.pages || 1),
      });
    } catch (error) {
      console.error(error);
      setProducts([]);
      setSummary(null);
      setPagination({ page: 1, limit: PAGE_SIZE, total: 0, pages: 1 });
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    fetchInventory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, searchTerm]);

  function openMovementModal(mode, product) {
    setMovementModal({ open: true, mode, product });
    setMovementForm({
      quantity: "",
      location: "warehouse",
      fromLocation: "warehouse",
      toLocation: "kitchen",
      notes: "",
    });
  }

  function closeMovementModal() {
    setMovementModal({ open: false, mode: "entry", product: null });
  }

  function handleMovementFormChange(event) {
    const { name, value } = event.target;

    setMovementForm((prev) => ({
      ...prev,
      [name]: value,
    }));
  }

  async function handleSubmitMovement(event) {
    event.preventDefault();

    if (!movementModal.product) return;

    try {
      setIsSubmittingMovement(true);

      const payload = {
        productId: movementModal.product._id,
        quantity: Number(movementForm.quantity),
        notes: movementForm.notes,
      };

      if (movementModal.mode === "entry") {
        payload.movementType = "adjustment_in";
        payload.location = movementForm.location;
      }

      if (movementModal.mode === "exit") {
        payload.movementType = "adjustment_out";
        payload.location = movementForm.location;
      }

      if (movementModal.mode === "transfer") {
        payload.movementType = "transfer";
        payload.fromLocation = movementForm.fromLocation;
        payload.toLocation = movementForm.toLocation;
      }

      const response = await fetch("/api/inventory/movements", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.message || "No se pudo registrar el movimiento.");
      }

      closeMovementModal();
      await fetchInventory();
    } catch (error) {
      console.error(error);
      setDialogModal({
        open: true,
        title: "No se pudo registrar el movimiento",
        message: error.message || "Intenta nuevamente.",
        variant: "danger",
      });
    } finally {
      setIsSubmittingMovement(false);
    }
  }

  const fromItem = pagination.total === 0 ? 0 : (pagination.page - 1) * pagination.limit + 1;
  const toItem = pagination.total === 0 ? 0 : Math.min(pagination.page * pagination.limit, pagination.total);

  return (
    <>
      <div className={styles.headerRow}>
        <div className={styles.statsGroup}>
          <div className={styles.statCard}>
            <span className={styles.statLabel}>Total productos</span>
            <strong className={styles.statValue}>{summary?.totalProducts || 0}</strong>
          </div>

          <div className={`${styles.statCard} ${styles.warningCard}`}>
            <span className={styles.statLabel}>Stock bajo</span>
            <strong className={styles.statValue}>{summary?.lowStockProducts || 0}</strong>
          </div>

          <div className={`${styles.statCard} ${styles.mutedCard}`}>
            <span className={styles.statLabel}>Sin stock</span>
            <strong className={styles.statValue}>{summary?.outOfStockProducts || 0}</strong>
          </div>
        </div>

        <div className={styles.searchBox}>
          <Search size={16} />
          <input
            type="text"
            className={styles.searchInput}
            placeholder="Buscar por nombre, código o categoría"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
          />
        </div>
      </div>

      <div className={styles.listSection}>
        {isLoading ? (
          <div className={styles.emptyState}>Cargando inventario...</div>
        ) : products.length === 0 ? (
          <div className={styles.emptyState}>No se encontraron productos para mostrar.</div>
        ) : (
          <>
            <div className={styles.productList}>
              {products.map((product) => (
                <article key={product._id} className={styles.productCard}>
                  <div className={styles.productInfo}>
                    <div className={styles.productTitleRow}>
                      <h3 className={styles.productName}>{product.name}</h3>
                      <span className={`${styles.statusBadge} ${getStatusClass(product.status, styles)}`}>
                        {getInventoryStatusLabel(product.status)}
                      </span>
                    </div>

                    <p className={styles.productMeta}>
                      {product.code || "Sin código"} · {product.categoryName || "Sin categoría"} · {getUnitLabel(product.unit)}
                    </p>
                  </div>

                  <div className={styles.stockSummary}>
                    <div className={styles.stockBlock}>
                      <span>Total</span>
                      <strong>{product.inventory?.total || 0}</strong>
                    </div>

                    <div className={styles.stockBlock}>
                      <span>Bodega</span>
                      <strong>{product.inventory?.warehouse || 0}</strong>
                    </div>

                    <div className={styles.stockBlock}>
                      <span>Cocina</span>
                      <strong>{product.inventory?.kitchen || 0}</strong>
                    </div>
                  </div>

                  <div className={styles.actions}>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => openMovementModal("entry", product)}
                    >
                      Agregar
                    </button>

                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => openMovementModal("exit", product)}
                    >
                      Retirar
                    </button>

                    <button
                      type="button"
                      className="btn btn-ghost"
                      onClick={() => openMovementModal("transfer", product)}
                    >
                      Transferir
                    </button>
                  </div>
                </article>
              ))}
            </div>

            <PaginationBar
              page={pagination.page}
              totalPages={pagination.pages}
              totalItems={pagination.total}
              fromItem={fromItem}
              toItem={toItem}
              itemLabel="productos"
              onPageChange={setPage}
            />
          </>
        )}
      </div>

      <InventoryMovementModal
        open={movementModal.open}
        mode={movementModal.mode}
        product={movementModal.product}
        formData={movementForm}
        onChange={handleMovementFormChange}
        onClose={closeMovementModal}
        onSubmit={handleSubmitMovement}
        isSubmitting={isSubmittingMovement}
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
