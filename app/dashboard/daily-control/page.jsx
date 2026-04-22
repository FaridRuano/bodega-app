"use client";

import { useEffect, useMemo, useState } from "react";
import {
    ClipboardCheck,
    RefreshCcw,
    Search,
    ShieldCheck,
} from "lucide-react";

import styles from "./page.module.scss";
import { getLocationLabel } from "@libs/constants/domainLabels";
import { getUnitLabel } from "@libs/constants/units";
import { getUserDisplayName } from "@libs/userDisplay";
import ConfirmModal from "@components/shared/ConfirmModal/ConfirmModal";
import DialogModal from "@components/shared/DialogModal/DialogModal";
import PaginationBar from "@components/shared/PaginationBar/PaginationBar";

const LOCATION_OPTIONS = [
    { value: "kitchen", label: "Cocina" },
    { value: "lounge", label: "Salon" },
];

function getTodayValue() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

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

function formatNumber(value) {
    return new Intl.NumberFormat("es-EC", {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
    }).format(Number(value || 0));
}

function formatShortDate(value) {
    if (!value) return getTodayValue();

    try {
        return new Intl.DateTimeFormat("es-EC", {
            dateStyle: "medium",
        }).format(new Date(value));
    } catch {
        return getTodayValue();
    }
}

function buildInitialLineValues(products = []) {
    return Object.fromEntries(
        products.map((product) => [
            String(product.productId),
            {
                issuedQuantity: "",
                note: "",
            },
        ])
    );
}

export default function DailyControlPage() {
    const [currentUser, setCurrentUser] = useState(null);
    const [selectedLocation, setSelectedLocation] = useState("kitchen");
    const [context, setContext] = useState(null);
    const [controls, setControls] = useState([]);
    const [meta, setMeta] = useState({ page: 1, limit: 10, total: 0, pages: 1 });
    const [summary, setSummary] = useState({ total: 0, kitchen: 0, lounge: 0 });
    const [lineFilter, setLineFilter] = useState("");
    const [dateFrom, setDateFrom] = useState("");
    const [dateTo, setDateTo] = useState("");
    const [historyLocation, setHistoryLocation] = useState("");
    const [page, setPage] = useState(1);
    const [controlNotes, setControlNotes] = useState("");
    const [lineValues, setLineValues] = useState({});
    const [confirmOpen, setConfirmOpen] = useState(false);
    const [isLoadingContext, setIsLoadingContext] = useState(true);
    const [isLoadingHistory, setIsLoadingHistory] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [dialog, setDialog] = useState({
        open: false,
        title: "",
        message: "",
        variant: "info",
    });

    const isAdmin = currentUser?.role === "admin";
    const todayDate = getTodayValue();
    const effectiveLocation = isAdmin
        ? selectedLocation
        : currentUser?.role === "lounge"
          ? "lounge"
          : "kitchen";

    useEffect(() => {
        let cancelled = false;

        async function loadUser() {
            try {
                const response = await fetch("/api/auth/me", { cache: "no-store" });
                const result = await response.json();

                if (cancelled) return;

                setCurrentUser(result?.user || null);

                if (result?.user?.role === "lounge") {
                    setSelectedLocation("lounge");
                }
            } catch (error) {
                console.error(error);
                if (!cancelled) setCurrentUser(null);
            }
        }

        loadUser();

        return () => {
            cancelled = true;
        };
    }, []);

    async function loadContext() {
        try {
            setIsLoadingContext(true);

            const params = new URLSearchParams({
                mode: "context",
                location: effectiveLocation,
                date: todayDate,
            });

            const response = await fetch(
                `/api/inventory/daily-controls?${params.toString()}`,
                { cache: "no-store" }
            );
            const result = await response.json();

            if (!response.ok || !result.success) {
                throw new Error(
                    result.message || "No se pudo obtener el contexto del control diario."
                );
            }

            setContext(result.data || null);
            setControlNotes("");
            setLineValues(buildInitialLineValues(result.data?.products || []));
        } catch (error) {
            console.error(error);
            setContext(null);
        } finally {
            setIsLoadingContext(false);
        }
    }

    async function loadHistory() {
        if (!isAdmin) {
            setControls([]);
            setMeta({ page: 1, limit: 10, total: 0, pages: 1 });
            setSummary({ total: 0, kitchen: 0, lounge: 0 });
            setIsLoadingHistory(false);
            return;
        }

        try {
            setIsLoadingHistory(true);

            const params = new URLSearchParams({
                page: String(page),
                limit: "10",
            });

            if (dateFrom) params.set("dateFrom", dateFrom);
            if (dateTo) params.set("dateTo", dateTo);
            if (historyLocation) params.set("location", historyLocation);

            const response = await fetch(
                `/api/inventory/daily-controls?${params.toString()}`,
                { cache: "no-store" }
            );
            const result = await response.json();

            if (!response.ok || !result.success) {
                throw new Error(
                    result.message || "No se pudo obtener el historial de control."
                );
            }

            setControls(result.data || []);
            setMeta(result.meta || { page: 1, limit: 10, total: 0, pages: 1 });
            setSummary(result.summary || { total: 0, kitchen: 0, lounge: 0 });
        } catch (error) {
            console.error(error);
            setControls([]);
            setMeta({ page: 1, limit: 10, total: 0, pages: 1 });
            setSummary({ total: 0, kitchen: 0, lounge: 0 });
        } finally {
            setIsLoadingHistory(false);
        }
    }

    useEffect(() => {
        if (!currentUser?.role) return;
        loadContext();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [currentUser?.role, effectiveLocation]);

    useEffect(() => {
        if (!currentUser?.role) return;
        loadHistory();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [currentUser?.role, page, dateFrom, dateTo, historyLocation, isAdmin]);

    const filteredProducts = useMemo(() => {
        const products = context?.products || [];
        const normalizedFilter = lineFilter.trim().toLowerCase();

        if (!normalizedFilter) return products;

        return products.filter((product) => {
            const haystack = [
                product.productNameSnapshot,
                product.productCodeSnapshot,
                product.categoryNameSnapshot,
                product.familyNameSnapshot,
            ]
                .filter(Boolean)
                .join(" ")
                .toLowerCase();

            return haystack.includes(normalizedFilter);
        });
    }, [context?.products, lineFilter]);

    const groupedProducts = useMemo(() => {
        const groups = new Map();

        for (const product of filteredProducts) {
            const familyName = product.familyNameSnapshot || "Sin familia";

            if (!groups.has(familyName)) {
                groups.set(familyName, []);
            }

            groups.get(familyName).push(product);
        }

        return Array.from(groups.entries()).map(([familyName, items]) => ({
            familyName,
            items,
        }));
    }, [filteredProducts]);

    const lineSummary = useMemo(() => {
        return filteredProducts.reduce(
            (acc, product) => {
                const values = lineValues[String(product.productId)] || {};
                acc.issued += Number(values.issuedQuantity || 0);
                return acc;
            },
            { issued: 0 }
        );
    }, [filteredProducts, lineValues]);

    const hasMeaningfulLines = useMemo(
        () =>
            Object.values(lineValues).some(
                (values) => Number(values?.issuedQuantity || 0) > 0
            ),
        [lineValues]
    );

    const operationStats = useMemo(() => {
        const productsCount = context?.products?.length || 0;
        const isClosedToday = Boolean(context?.existingControl);

        if (isAdmin) {
            return {
                first: summary.total || 0,
                second: summary.kitchen || 0,
                third: summary.lounge || 0,
            };
        }

        return {
            first: productsCount,
            third: isClosedToday,
        };
    }, [context?.existingControl, context?.products?.length, isAdmin, summary]);

    function updateLineValue(productId, field, value) {
        setLineValues((prev) => ({
            ...prev,
            [productId]: {
                issuedQuantity: prev[productId]?.issuedQuantity || "",
                note: prev[productId]?.note || "",
                ...prev[productId],
                [field]: value,
            },
        }));
    }

    async function submitControl() {
        try {
            setIsSubmitting(true);

            const payload = {
                location: effectiveLocation,
                notes: controlNotes,
                lines: Object.entries(lineValues).map(([productId, values]) => ({
                    productId,
                    issuedQuantity: Number(values.issuedQuantity || 0),
                    note: values.note || "",
                })),
            };

            const response = await fetch("/api/inventory/daily-controls", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });
            const result = await response.json();

            if (!response.ok || !result.success) {
                throw new Error(
                    result.message || "No se pudo registrar el control diario."
                );
            }

            setConfirmOpen(false);
            setDialog({
                open: true,
                title: "Cierre registrado",
                message:
                    "El cierre del turno fue guardado y el inventario ya quedó actualizado.",
                variant: "success",
            });

            await Promise.all([loadContext(), loadHistory()]);
        } catch (error) {
            console.error(error);
            setDialog({
                open: true,
                title: "No se pudo registrar",
                message: error.message || "Intenta nuevamente.",
                variant: "danger",
            });
        } finally {
            setIsSubmitting(false);
        }
    }

    function handleOpenConfirm(event) {
        event.preventDefault();

        if (!hasMeaningfulLines || isSubmitting) return;

        setConfirmOpen(true);
    }

    return (
        <>
            <div className="page">
                <section className={`hero fadeScaleIn ${styles.heroShell}`}>
                    <div className="heroCopy">
                        <span className="eyebrow">
                            {isAdmin ? "Auditoria" : "Operacion"}
                        </span>
                        <h1 className="title">Control diario</h1>
                        <p className="description">
                            {isAdmin
                                ? "Audita cuanto inventario salió en cada cierre de cocina y salón, quién lo registró y con cuánto terminó el turno."
                                : `Registra cuánto salió hoy de ${getLocationLabel(
                                      effectiveLocation
                                  ).toLowerCase()} para dejar auditado con qué cantidad termina el turno.`}
                        </p>
                    </div>

                    <div className={styles.heroStats}>
                        <span className="compactStat">
                            <span>
                                {isAdmin ? "Registros" : "Productos"}{" "}
                                <strong>{formatNumber(operationStats.first)}</strong>
                            </span>
                        </span>
                        {isAdmin ? (
                            <span className="compactStat heroStatSuccess">
                                <span>
                                    Cocina <strong>{formatNumber(operationStats.second)}</strong>
                                </span>
                            </span>
                        ) : null}
                        {isAdmin ? (
                            <span className="compactStat heroStatSuccess">
                                <span>
                                    Salon <strong>{formatNumber(operationStats.third)}</strong>
                                </span>
                            </span>
                        ) : (
                            <span
                                className={`compactStat ${
                                    operationStats.third
                                        ? "heroStatSuccess"
                                        : "heroStatWarning"
                                }`}
                            >
                                <span>
                                    <strong>
                                        {operationStats.third
                                            ? "Dia cerrado"
                                            : "Dia sin cerrar"}
                                    </strong>
                                </span>
                            </span>
                        )}
                    </div>
                </section>

                <div className={`${styles.toolbar} fadeSlideIn delayOne`}>
                    <div className={styles.actionGroup}>
                        <button
                            type="button"
                            className="miniAction"
                            onClick={() => {
                                loadContext();
                                loadHistory();
                            }}
                        >
                            <RefreshCcw size={14} />
                            Recargar
                        </button>
                    </div>

                    {isAdmin ? (
                        <div className={styles.scopeSwitch}>
                            {LOCATION_OPTIONS.map((option) => (
                                <button
                                    key={option.value}
                                    type="button"
                                    className={`miniAction ${
                                        selectedLocation === option.value
                                            ? "miniActionPrimary"
                                            : ""
                                    }`}
                                    onClick={() => setSelectedLocation(option.value)}
                                >
                                    {option.label}
                                </button>
                            ))}
                        </div>
                    ) : null}
                </div>

                {!isAdmin ? (
                    <section className={`${styles.registerCard} fadeSlideIn delayTwo`}>
                        <div className={styles.sectionHeader}>
                            <div>
                                <h2 className={styles.sectionTitle}>Registrar cierre de hoy</h2>
                                <p className={styles.sectionDescription}>
                                    {getLocationLabel(effectiveLocation)} · {formatShortDate(todayDate)}
                                </p>
                            </div>
                        </div>

                        {isLoadingContext ? (
                            <div className={styles.emptyState}>Cargando contexto del cierre...</div>
                        ) : context?.existingControl ? (
                            <div className={styles.lockedBox}>
                                <ClipboardCheck size={18} />
                                <div>
                                    <strong>El día ya fue cerrado para esta ubicación.</strong>
                                    <p>
                                        {context.existingControl.controlNumber} ·{" "}
                                        {getUserDisplayName(
                                            context.existingControl.registeredBy,
                                            "Sin responsable"
                                        )}{" "}
                                        · No se puede registrar un segundo cierre hoy.
                                    </p>
                                </div>
                            </div>
                        ) : (context?.products || []).length === 0 ? (
                            <div className={styles.emptyState}>
                                No hay productos con control diario y stock disponible en esta ubicación.
                            </div>
                        ) : (
                            <form onSubmit={handleOpenConfirm} className={styles.registerForm}>
                                <div className={styles.filterRow}>
                                    <div className="form-field">
                                        <div className="searchField">
                                            <Search size={16} />
                                            <input
                                                type="text"
                                                value={lineFilter}
                                                onChange={(event) => setLineFilter(event.target.value)}
                                                placeholder="Buscar por producto, categoría o familia"
                                                className="searchInput"
                                            />
                                        </div>
                                    </div>
                                </div>

                                <div className={styles.registerGrid}>
                                    <section className={styles.catalogCard}>
                                        <div className={styles.cardHeader}>
                                            <h3 className={styles.cardTitle}>Productos del cierre</h3>
                                            <p className={styles.cardDescription}>
                                                Registra solo lo que realmente salió durante el turno.
                                            </p>
                                        </div>

                                        <div className={styles.familyList}>
                                            {groupedProducts.length === 0 ? (
                                                <div className={styles.emptyInline}>
                                                    No hay productos que coincidan con tu búsqueda.
                                                </div>
                                            ) : (
                                                groupedProducts.map((group, groupIndex) => (
                                                    <section
                                                        key={group.familyName}
                                                        className={`${styles.familyGroup} fadeScaleIn`}
                                                        style={{
                                                            animationDelay: `${Math.min(groupIndex, 8) * 0.03}s`,
                                                        }}
                                                    >
                                                        <div className={styles.familyHeader}>
                                                            <span className={styles.familyEyebrow}>Familia</span>
                                                            <strong className={styles.familyName}>
                                                                {group.familyName}
                                                            </strong>
                                                        </div>

                                                        <div className={styles.productList}>
                                                            {group.items.map((product, productIndex) => {
                                                                const values =
                                                                    lineValues[String(product.productId)] || {};
                                                                const before = Number(
                                                                    product.systemQuantityBeforeAdjustment || 0
                                                                );
                                                                const issued = Number(values.issuedQuantity || 0);
                                                                const closing = Math.max(before - issued, 0);

                                                                return (
                                                                    <article
                                                                        key={String(product.productId)}
                                                                        className={`${styles.productRow} fadeScaleIn`}
                                                                        style={{
                                                                            animationDelay: `${Math.min(
                                                                                productIndex,
                                                                                8
                                                                            ) * 0.025}s`,
                                                                        }}
                                                                    >
                                                                        <div className={styles.productTop}>
                                                                            <div>
                                                                                <h4 className={styles.productName}>
                                                                                    {product.productNameSnapshot}
                                                                                </h4>
                                                                                <p className={styles.productMeta}>
                                                                                    {product.categoryNameSnapshot ||
                                                                                        "Sin categoría"}{" "}
                                                                                    · {getUnitLabel(product.unitSnapshot)}
                                                                                </p>
                                                                            </div>

                                                                            <div className={styles.stockTrail}>
                                                                                <span className={styles.stockChip}>
                                                                                    Antes{" "}
                                                                                    <strong>{formatNumber(before)}</strong>
                                                                                </span>
                                                                                <span className={styles.stockChip}>
                                                                                    Queda{" "}
                                                                                    <strong>{formatNumber(closing)}</strong>
                                                                                </span>
                                                                            </div>
                                                                        </div>

                                                                        <div className={styles.productInputs}>
                                                                            <div className="form-field">
                                                                                <label className="form-label">
                                                                                    Salió
                                                                                </label>
                                                                                <input
                                                                                    type="number"
                                                                                    min="0"
                                                                                    step="0.0001"
                                                                                    value={values.issuedQuantity || ""}
                                                                                    onChange={(event) =>
                                                                                        updateLineValue(
                                                                                            String(product.productId),
                                                                                            "issuedQuantity",
                                                                                            event.target.value
                                                                                        )
                                                                                    }
                                                                                    className="form-input"
                                                                                    placeholder="0"
                                                                                />
                                                                            </div>

                                                                            <div className="form-field">
                                                                                <label className="form-label">
                                                                                    Nota
                                                                                </label>
                                                                                <input
                                                                                    type="text"
                                                                                    value={values.note || ""}
                                                                                    onChange={(event) =>
                                                                                        updateLineValue(
                                                                                            String(product.productId),
                                                                                            "note",
                                                                                            event.target.value
                                                                                        )
                                                                                    }
                                                                                    className="form-input"
                                                                                    placeholder="Opcional"
                                                                                />
                                                                            </div>
                                                                        </div>
                                                                    </article>
                                                                );
                                                            })}
                                                        </div>
                                                    </section>
                                                ))
                                            )}
                                        </div>
                                    </section>

                                    <aside className={styles.summaryCard}>
                                        <div className={styles.cardHeader}>
                                            <h3 className={styles.cardTitle}>Resumen</h3>
                                            <p className={styles.cardDescription}>
                                                El cierre quedará auditado para el siguiente encargado.
                                            </p>
                                        </div>

                                        <div className={styles.summaryStack}>
                                            <div className={styles.summaryItem}>
                                                <span>Ubicación</span>
                                                <strong>{getLocationLabel(effectiveLocation)}</strong>
                                            </div>

                                            <div className={styles.summaryItem}>
                                                <span>Fecha</span>
                                                <strong>{formatShortDate(todayDate)}</strong>
                                            </div>

                                            <div className={styles.summaryItem}>
                                                <span>Productos visibles</span>
                                                <strong>{formatNumber(filteredProducts.length)}</strong>
                                            </div>

                                            <div className={styles.summaryItem}>
                                                <span>Total registrado</span>
                                                <strong>{formatNumber(lineSummary.issued)}</strong>
                                            </div>
                                        </div>

                                        <div className="form-field">
                                            <label className="form-label">Nota general</label>
                                            <textarea
                                                value={controlNotes}
                                                onChange={(event) => setControlNotes(event.target.value)}
                                                className="form-textarea"
                                                placeholder="Observaciones del turno"
                                            />
                                        </div>

                                        <button
                                            type="submit"
                                            className="miniAction miniActionPrimary"
                                            disabled={!hasMeaningfulLines || isSubmitting}
                                        >
                                            Registrar cierre
                                        </button>
                                    </aside>
                                </div>
                            </form>
                        )}
                    </section>
                ) : null}

                {isAdmin ? (
                    <section className={`${styles.historyCard} fadeSlideIn delayTwo`}>
                        <div className={styles.sectionHeader}>
                            <div>
                                <h2 className={styles.sectionTitle}>Historial</h2>
                                <p className={styles.sectionDescription}>
                                    Auditoría completa de cierres diarios registrados.
                                </p>
                            </div>

                            <div className={styles.auditPill}>
                                <ShieldCheck size={15} />
                                Solo lectura
                            </div>
                        </div>

                        <div className={styles.historyFilters}>
                            <div className={styles.filterField}>
                                <span className={styles.filterLabel}>Ubicacion</span>
                                <div className="selectWrap">
                                    <select
                                        value={historyLocation}
                                        onChange={(event) => setHistoryLocation(event.target.value)}
                                        className="form-input"
                                    >
                                        <option value="">Todas las ubicaciones</option>
                                        {LOCATION_OPTIONS.map((option) => (
                                            <option key={option.value} value={option.value}>
                                                {option.label}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            <div className={styles.filterField}>
                                <span className={styles.filterLabel}>Desde</span>
                                <input
                                    type="date"
                                    value={dateFrom}
                                    onChange={(event) => setDateFrom(event.target.value)}
                                    className="form-input"
                                />
                            </div>

                            <div className={styles.filterField}>
                                <span className={styles.filterLabel}>Hasta</span>
                                <input
                                    type="date"
                                    value={dateTo}
                                    onChange={(event) => setDateTo(event.target.value)}
                                    className="form-input"
                                />
                            </div>

                            <div className={styles.filterAction}>
                                <span className={styles.filterLabel}>Accion</span>
                                <button
                                    type="button"
                                    className="miniAction"
                                    onClick={() => {
                                        setDateFrom("");
                                        setDateTo("");
                                        setHistoryLocation("");
                                        setPage(1);
                                    }}
                                >
                                    Limpiar filtros
                                </button>
                            </div>
                        </div>

                        {isLoadingHistory ? (
                            <div className={styles.emptyState}>Cargando historial...</div>
                        ) : controls.length === 0 ? (
                            <div className={styles.emptyState}>
                                No hay cierres diarios registrados.
                            </div>
                        ) : (
                            <>
                                <div className={styles.historyList}>
                                    {controls.map((control, index) => (
                                        <article
                                            key={control._id}
                                            className={`${styles.historyRow} fadeScaleIn`}
                                            style={{
                                                animationDelay: `${Math.min(index, 10) * 0.03}s`,
                                            }}
                                        >
                                            <div className={styles.historyHeader}>
                                                <div>
                                                    <h3 className={styles.historyTitle}>
                                                        {control.controlNumber}
                                                    </h3>
                                                    <p className={styles.historyMeta}>
                                                        {control.locationLabel} ·{" "}
                                                        {formatDate(control.controlDate)}
                                                    </p>
                                                </div>

                                                <div className={styles.historyStats}>
                                                    <span className="compactStat">
                                                        <span>
                                                            Productos{" "}
                                                            <strong>{control.summary.productsCount}</strong>
                                                        </span>
                                                    </span>
                                                    <span className="compactStat heroStatInfo">
                                                        <span>
                                                            Salida{" "}
                                                            <strong>
                                                                {formatNumber(
                                                                    control.summary.totalIssuedQuantity
                                                                )}
                                                            </strong>
                                                        </span>
                                                    </span>
                                                    <span className="compactStat heroStatSuccess">
                                                        <span>
                                                            Queda{" "}
                                                            <strong>
                                                                {formatNumber(
                                                                    control.summary.totalClosingQuantity
                                                                )}
                                                            </strong>
                                                        </span>
                                                    </span>
                                                </div>
                                            </div>

                                            <p className={styles.historyMeta}>
                                                Registrado por{" "}
                                                <strong>
                                                    {getUserDisplayName(
                                                        control.registeredBy,
                                                        "Sin responsable"
                                                    )}
                                                </strong>
                                            </p>

                                            <div className={styles.lineGrid}>
                                                {control.lines.slice(0, 4).map((line) => (
                                                    <div
                                                        key={line._id}
                                                        className={styles.linePill}
                                                    >
                                                        <strong>{line.productNameSnapshot}</strong>
                                                        <span>
                                                            Inicio {formatNumber(line.openingQuantity)} ·
                                                            Salió {formatNumber(line.issuedQuantity)} ·
                                                            Queda {formatNumber(line.closingQuantity)}
                                                        </span>
                                                    </div>
                                                ))}
                                            </div>
                                        </article>
                                    ))}
                                </div>

                                <PaginationBar
                                    page={meta.page}
                                    totalPages={meta.pages}
                                    totalItems={meta.total}
                                    fromItem={
                                        meta.total === 0
                                            ? 0
                                            : (meta.page - 1) * meta.limit + 1
                                    }
                                    toItem={
                                        meta.total === 0
                                            ? 0
                                            : Math.min(meta.page * meta.limit, meta.total)
                                    }
                                    itemLabel="cierres"
                                    onPageChange={setPage}
                                />
                            </>
                        )}
                    </section>
                ) : null}
            </div>

            <ConfirmModal
                open={confirmOpen}
                title="Registrar cierre del día"
                description={`Se guardará el cierre de ${getLocationLabel(
                    effectiveLocation
                ).toLowerCase()} con una salida total de ${formatNumber(
                    lineSummary.issued
                )}.`}
                confirmLabel="Registrar cierre"
                cancelLabel="Cancelar"
                variant="warning"
                isSubmitting={isSubmitting}
                onClose={() => {
                    if (!isSubmitting) setConfirmOpen(false);
                }}
                onConfirm={submitControl}
            />

            <DialogModal
                open={dialog.open}
                title={dialog.title}
                message={dialog.message}
                variant={dialog.variant}
                onClose={() => setDialog((prev) => ({ ...prev, open: false }))}
                onConfirm={() => setDialog((prev) => ({ ...prev, open: false }))}
            />
        </>
    );
}
