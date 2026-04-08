"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./product-autocomplete.module.scss";
import { getUnitLabel } from "@libs/constants/units";

export default function ProductAutocomplete({
    value = "",
    selectedProduct = null,
    onChange,
    disabled = false,
    placeholder = "Buscar por nombre o código...",
    forProductionTemplate = false,
}) {
    const wrapperRef = useRef(null);
    const debounceRef = useRef(null);

    const [query, setQuery] = useState("");
    const [results, setResults] = useState([]);
    const [loading, setLoading] = useState(false);
    const [showDropdown, setShowDropdown] = useState(false);
    const [selected, setSelected] = useState(selectedProduct);

    useEffect(() => {
        setSelected(selectedProduct || null);

        if (selectedProduct?.name) {
            setQuery(
                selectedProduct.code
                    ? `${selectedProduct.code} - ${selectedProduct.name}`
                    : selectedProduct.name
            );
            return;
        }

        if (!value) {
            setQuery("");
        }
    }, [selectedProduct, value]);

    useEffect(() => {
        function handleClickOutside(event) {
            if (!wrapperRef.current?.contains(event.target)) {
                setShowDropdown(false);
            }
        }

        function handleEscape(event) {
            if (event.key === "Escape") {
                setShowDropdown(false);
            }
        }

        document.addEventListener("mousedown", handleClickOutside);
        window.addEventListener("keydown", handleEscape);

        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
            window.removeEventListener("keydown", handleEscape);
        };
    }, []);

    useEffect(() => {
        if (!showDropdown) return;

        const trimmedQuery = query.trim();

        if (!trimmedQuery) {
            setResults([]);
            setLoading(false);
            return;
        }

        clearTimeout(debounceRef.current);

        debounceRef.current = setTimeout(async () => {
            try {
                setLoading(true);

                const params = new URLSearchParams({
                    q: trimmedQuery,
                });

                if (forProductionTemplate) {
                    params.set("allowsProduction", "true");
                }

                const response = await fetch(
                    `/api/products/search?${params.toString()}`,
                    {
                        method: "GET",
                        cache: "no-store",
                    }
                );

                const data = await response.json();

                if (!response.ok || !data.ok) {
                    throw new Error(data.message || "No se pudieron buscar productos");
                }

                setResults(Array.isArray(data.data) ? data.data : []);
            } catch (error) {
                console.error("Error searching products:", error);
                setResults([]);
            } finally {
                setLoading(false);
            }
        }, 300);

        return () => clearTimeout(debounceRef.current);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [query, showDropdown]);

    function handleInputChange(event) {
        const nextValue = event.target.value;

        setQuery(nextValue);
        setSelected(null);
        setShowDropdown(true);

        if (!nextValue.trim()) {
            onChange?.(null);
        }
    }

    function handleSelect(product) {
        setSelected(product);
        setQuery(
            product.code ? `${product.code} - ${product.name}` : product.name
        );
        setShowDropdown(false);
        setResults([]);

        onChange?.(product);
    }

    function handleFocus() {
        if (!disabled) {
            setShowDropdown(true);
        }
    }

    return (
        <div ref={wrapperRef} className={styles.wrapper}>
            <input
                type="text"
                value={query}
                onChange={handleInputChange}
                onFocus={handleFocus}
                placeholder={placeholder}
                className="form-input"
                disabled={disabled}
                autoComplete="off"
            />

            {showDropdown && (
                <div className={styles.dropdown}>
                    {loading && (
                        <div className={styles.stateMessage}>Buscando productos...</div>
                    )}

                    {!loading && !results.length && query.trim() && (
                        <div className={styles.stateMessage}>No se encontraron productos</div>
                    )}

                    {!loading && results.length > 0 && (
                        <div className={styles.optionsList}>
                            {results.map((product) => (
                                <button
                                    key={product._id}
                                    type="button"
                                    className={`${styles.option} ${selected?._id === product._id ? styles.optionActive : ""
                                        }`}
                                    onMouseDown={(event) => event.preventDefault()}
                                    onClick={() => handleSelect(product)}
                                >
                                    <div className={styles.optionMain}>
                                        <span className={styles.optionName}>{product.name}</span>

                                        {product.code && (
                                            <span className={styles.optionCode}>
                                                {product.code}
                                            </span>
                                        )}
                                    </div>

                                    {(product.unitLabel || product.unit) && (
                                        <span className={styles.optionMeta}>
                                            Unidad: {product.unitLabel || getUnitLabel(product.unit)}
                                        </span>
                                    )}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
