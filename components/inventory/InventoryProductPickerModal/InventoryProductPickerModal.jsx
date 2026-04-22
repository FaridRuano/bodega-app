"use client";

import { useEffect, useState } from "react";
import { PlusCircle, Search, X } from "lucide-react";

import { getUnitLabel } from "@libs/constants/units";
import styles from "./inventory-product-picker-modal.module.scss";

export default function InventoryProductPickerModal({
  open,
  scopeLabel = "",
  onClose,
  onSelect,
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setResults([]);
      setIsLoading(false);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const normalizedQuery = query.trim();
    if (!normalizedQuery) {
      setResults([]);
      setIsLoading(false);
      return undefined;
    }

    let cancelled = false;

    async function searchProducts() {
      try {
        setIsLoading(true);

        const params = new URLSearchParams();
        params.set("q", normalizedQuery);

        const response = await fetch(`/api/products/search?${params.toString()}`, {
          cache: "no-store",
        });
        const result = await response.json();

        if (!response.ok || !result.ok) {
          throw new Error(result.message || "No se pudieron buscar productos.");
        }

        if (!cancelled) {
          setResults(result.data || []);
        }
      } catch (error) {
        console.error(error);
        if (!cancelled) {
          setResults([]);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    const timeoutId = window.setTimeout(searchProducts, 180);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [open, query]);

  useEffect(() => {
    function handleEscape(event) {
      if (event.key === "Escape" && open) {
        onClose();
      }
    }

    window.addEventListener("keydown", handleEscape);

    return () => {
      window.removeEventListener("keydown", handleEscape);
    };
  }, [onClose, open]);

  if (!open) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className={`modal-container ${styles.pickerModal}`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-top">
          <div className="modal-headerContent">
            <div className="modal-icon modal-icon--info">
              <PlusCircle size={20} />
            </div>

            <div className="modal-headerBlock">
              <h2 className="modal-title">Agregar producto</h2>
              <p className="modal-description">
                Busca un producto para registrarlo en {scopeLabel.toLowerCase()}.
              </p>
            </div>
          </div>

          <button
            type="button"
            className="modal-close"
            onClick={onClose}
            aria-label="Cerrar modal"
          >
            <X size={18} />
          </button>
        </div>

        <div className="modal-body">
          <section className="modal-section">
            <div className="searchField">
              <Search size={16} />
              <input
                type="text"
                className="searchInput"
                placeholder="Buscar por nombre o codigo"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                autoFocus
              />
            </div>
          </section>

          <section className="modal-section">
            <div className={styles.resultsList}>
              {!query.trim() ? (
                <div className={styles.emptyState}>Escribe el nombre o codigo para buscar un producto.</div>
              ) : isLoading ? (
                <div className={styles.emptyState}>Buscando productos...</div>
              ) : results.length === 0 ? (
                <div className={styles.emptyState}>No se encontraron productos.</div>
              ) : (
                results.map((product) => (
                  <button
                    key={product._id}
                    type="button"
                    className={styles.resultCard}
                    onClick={() => onSelect(product)}
                  >
                    <div className={styles.resultCopy}>
                      <strong>{product.name}</strong>
                      <span>
                        {product.code || "Sin codigo"} · {getUnitLabel(product.unit)}
                      </span>
                    </div>
                  </button>
                ))
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
