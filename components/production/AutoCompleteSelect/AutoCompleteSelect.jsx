"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, LoaderCircle, Search, X } from "lucide-react";
import styles from "./auto-complete-select.module.scss";
import { getUnitLabel } from "@libs/constants/units";
import { getProductionTypeLabel } from "@libs/constants/productionTypes";

function normalizeText(value) {
    return String(value || "").toLowerCase().trim();
}

export default function AutocompleteSelect({
    label,
    placeholder = "Buscar...",
    value = "",
    selectedOption = null,
    onChange,
    fetchOptions,
    disabled = false,
    minChars = 0,
    debounceMs = 300,
    emptyMessage = "No se encontraron resultados.",
    helperText = "",
    error = "",
    getOptionLabel = (option) => option?.label || "",
}) {
    const containerRef = useRef(null);
    const inputRef = useRef(null);

    const [query, setQuery] = useState("");
    const [isOpen, setIsOpen] = useState(false);
    const [highlightedIndex, setHighlightedIndex] = useState(-1);
    const [loading, setLoading] = useState(false);
    const [options, setOptions] = useState([]);

    const selectedLabel = useMemo(() => {
        return selectedOption ? getOptionLabel(selectedOption) : "";
    }, [selectedOption, getOptionLabel]);

    useEffect(() => {
        if (!isOpen) {
            setQuery(selectedLabel);
        }
    }, [selectedLabel, isOpen]);

    useEffect(() => {
        function handleClickOutside(event) {
            if (!containerRef.current?.contains(event.target)) {
                setIsOpen(false);
                setHighlightedIndex(-1);
                setQuery(selectedLabel);
            }
        }

        document.addEventListener("mousedown", handleClickOutside);
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, [selectedLabel]);

    useEffect(() => {
        let ignore = false;

        async function loadOptions() {
            if (!isOpen || typeof fetchOptions !== "function") return;

            const trimmed = query.trim();

            if (trimmed.length < minChars) {
                setOptions([]);
                setLoading(false);
                return;
            }

            try {
                setLoading(true);
                const results = await fetchOptions(trimmed);

                if (!ignore) {
                    setOptions(Array.isArray(results) ? results : []);
                    setHighlightedIndex(0);
                }
            } catch (error) {
                console.error("[AUTOCOMPLETE_SELECT_FETCH_ERROR]", error);
                if (!ignore) {
                    setOptions([]);
                }
            } finally {
                if (!ignore) {
                    setLoading(false);
                }
            }
        }

        const timeout = setTimeout(loadOptions, debounceMs);

        return () => {
            ignore = true;
            clearTimeout(timeout);
        };
    }, [query, isOpen, fetchOptions, minChars, debounceMs]);

    function handleSelect(option) {
        onChange?.(option);
        setQuery(getOptionLabel(option));
        setIsOpen(false);
        setHighlightedIndex(-1);
    }

    function handleClear() {
        onChange?.(null);
        setQuery("");
        setOptions([]);
        setIsOpen(false);
        setHighlightedIndex(-1);
        inputRef.current?.focus();
    }

    function handleInputChange(event) {
        const nextValue = event.target.value;
        setQuery(nextValue);
        setIsOpen(true);
        setHighlightedIndex(0);

        if (!nextValue.trim() && value) {
            onChange?.(null);
        }
    }

    function handleKeyDown(event) {
        if (!isOpen && ["ArrowDown", "ArrowUp", "Enter"].includes(event.key)) {
            setIsOpen(true);
        }

        if (event.key === "ArrowDown") {
            event.preventDefault();
            setHighlightedIndex((prev) => Math.min(prev + 1, options.length - 1));
        }

        if (event.key === "ArrowUp") {
            event.preventDefault();
            setHighlightedIndex((prev) => Math.max(prev - 1, 0));
        }

        if (event.key === "Enter") {
            if (isOpen && options[highlightedIndex]) {
                event.preventDefault();
                handleSelect(options[highlightedIndex]);
            }
        }

        if (event.key === "Escape") {
            setIsOpen(false);
            setHighlightedIndex(-1);
            setQuery(selectedLabel);
        }
    }

    const shouldShowMinChars =
        isOpen && !loading && query.trim().length < minChars;

    return (
        <div className={styles.fieldBlock} ref={containerRef}>
            {label ? <label className={styles.label}>{label}</label> : null}

            <div
                className={`${styles.control} ${isOpen ? styles.controlOpen : ""} ${error ? styles.controlError : ""
                    } ${disabled ? styles.controlDisabled : ""}`}
            >
                <Search size={16} className={styles.leadingIcon} />

                <input
                    ref={inputRef}
                    type="text"
                    value={query}
                    onChange={handleInputChange}
                    onFocus={() => {
                        if (!disabled) setIsOpen(true);
                    }}
                    onKeyDown={handleKeyDown}
                    placeholder={placeholder}
                    className={styles.input}
                    disabled={disabled}
                    autoComplete="off"
                />

                {loading ? (
                    <span className={styles.loadingIcon}>
                        <LoaderCircle size={16} className={styles.spin} />
                    </span>
                ) : value && !disabled ? (
                    <button
                        type="button"
                        className={styles.iconButton}
                        onClick={handleClear}
                        aria-label="Limpiar selección"
                    >
                        <X size={16} />
                    </button>
                ) : null}

                <span className={styles.trailingIcon}>
                    <ChevronDown size={16} />
                </span>
            </div>

            {helperText && !error ? (
                <span className={styles.helperText}>{helperText}</span>
            ) : null}

            {error ? <span className={styles.errorText}>{error}</span> : null}

            {isOpen && !disabled ? (
                <div className={styles.dropdown}>
                    {shouldShowMinChars ? (
                        <div className={styles.stateRow}>
                            Escribe al menos {minChars} caracteres.
                        </div>
                    ) : loading ? (
                        <div className={styles.stateRow}>Buscando resultados...</div>
                    ) : options.length === 0 ? (
                        <div className={styles.stateRow}>{emptyMessage}</div>
                    ) : (
                        <div className={styles.optionsList}>
                            {options.map((option, index) => {
                                const isSelected = String(option.value) === String(value);
                                const isHighlighted = index === highlightedIndex;

                                return (
                                    <button
                                        key={option.value}
                                        type="button"
                                        className={`${styles.option} ${isSelected ? styles.optionSelected : ""
                                            } ${isHighlighted ? styles.optionHighlighted : ""}`}
                                        onMouseDown={(event) => event.preventDefault()}
                                        onClick={() => handleSelect(option)}
                                    >
                                        <div className={styles.optionMain}>
                                            <span className={styles.optionLabel}>
                                                {option.label || option.name}
                                            </span>

                                            <span className={styles.optionMeta}>
                                                {getProductionTypeLabel(option.type) || "Sin tipo"} · {getUnitLabel(option.baseUnit) || "Sin unidad"}
                                            </span>
                                        </div>

                                        {isSelected ? (
                                            <Check size={16} className={styles.checkIcon} />
                                        ) : null}
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </div>
            ) : null}
        </div>
    );
}