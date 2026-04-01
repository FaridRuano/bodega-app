"use client";

import { useEffect, useMemo, useState } from "react";
import { Package, Search, TriangleAlert } from "lucide-react";

import styles from "./page.module.scss";
import InventoryMovementModal from "@components/inventory/InventoryModal/InventoryModal";
import { getUnitLabel } from "@libs/constants/units";
import { useDashboardUser } from "@context/dashboard-user-context";


function getStatusLabel(status) {
  switch (status) {
    case "low":
      return "Stock bajo";
    case "warning":
      return "Reposición";
    case "out":
      return "Sin stock";
    case "inactive":
      return "Inactivo";
    default:
      return "Disponible";
  }
}

function getStatusClass(status) {
  switch (status) {
    case "low":
      return styles.statusDanger;
    case "warning":
      return styles.statusWarning;
    case "out":
      return styles.statusMuted;
    case "inactive":
      return styles.statusMuted;
    default:
      return styles.statusSuccess;
  }
}

export default function InventoryPage() {

  const user = useDashboardUser();
  const [products, setProducts] = useState([]);
  const [summary, setSummary] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
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

  async function fetchInventory() {
    try {
      setIsLoading(true);

      const response = await fetch("/api/inventory");
      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.message || "No se pudo obtener el inventario.");
      }

      setProducts(result.data || []);
      setSummary(result.summary || null);
    } catch (error) {
      console.error(error);
      setProducts([]);
      setSummary(null);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    fetchInventory();
  }, []);

  const filteredProducts = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();

    if (!query) return products;

    return products.filter((product) => {
      return (
        product.name?.toLowerCase().includes(query) ||
        product.code?.toLowerCase().includes(query) ||
        product.categoryName?.toLowerCase().includes(query)
      );
    });
  }, [products, searchTerm]);

  function openMovementModal(mode, product) {
    setMovementModal({
      open: true,
      mode,
      product,
    });

    setMovementForm({
      quantity: "",
      location: "warehouse",
      fromLocation: "warehouse",
      toLocation: "kitchen",
      notes: "",
    });
  }

  function closeMovementModal() {
    setMovementModal({
      open: false,
      mode: "entry",
      product: null,
    });
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

    const performedBy = user?._id || user?.id;

    if (!performedBy) {
      alert("No se pudo identificar el usuario.");
      return;
    }

    try {
      setIsSubmittingMovement(true);

      const payload = {
        productId: movementModal.product._id,
        quantity: Number(movementForm.quantity),
        notes: movementForm.notes,
        performedBy,
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
      alert(error.message || "No se pudo registrar el movimiento.");
    } finally {
      setIsSubmittingMovement(false);
    }
  }

  return (
    <>
      <div className={styles.headerRow}>
        <div className={styles.statsGroup}>
          <div className={styles.statCard}>
            <span className={styles.statLabel}>Total productos</span>
            <strong className={styles.statValue}>
              {summary?.totalProducts || 0}
            </strong>
          </div>

          <div className={`${styles.statCard} ${styles.warningCard}`}>
            <span className={styles.statLabel}>Stock bajo</span>
            <strong className={styles.statValue}>
              {summary?.lowStockProducts || 0}
            </strong>
          </div>

          <div className={`${styles.statCard} ${styles.mutedCard}`}>
            <span className={styles.statLabel}>Sin stock</span>
            <strong className={styles.statValue}>
              {summary?.outOfStockProducts || 0}
            </strong>
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
        ) : filteredProducts.length === 0 ? (
          <div className={styles.emptyState}>
            No se encontraron productos para mostrar.
          </div>
        ) : (
          <div className={styles.productList}>
            {filteredProducts.map((product) => (
              <article key={product._id} className={styles.productCard}>
                <div className={styles.productInfo}>
                  <div className={styles.productTitleRow}>
                    <h3 className={styles.productName}>{product.name}</h3>
                    <span
                      className={`${styles.statusBadge} ${getStatusClass(product.status)}`}
                    >
                      {getStatusLabel(product.status)}
                    </span>
                  </div>

                  <p className={styles.productMeta}>
                    {product.code || "Sin código"} · {product.categoryName || "Sin categoría"} ·{" "}
                    {getUnitLabel(product.unit)}
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
    </>
  );
}