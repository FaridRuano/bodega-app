"use client";

import { useEffect, useMemo, useState } from "react";
import {
    Factory,
    Play,
    Plus,
    RefreshCcw,
    Search,
    XCircle,
} from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import styles from "./page.module.scss";
import { getUnitLabel } from "@libs/constants/units";
import { PRODUCTION_STATUS_LABELS } from "@libs/constants/productionStatus";
import { PAGE_LIMITS } from "@libs/constants/pagination";
import {
    buildSearchParams,
    getPositiveIntParam,
    getStringParam,
} from "@libs/urlParams";
import PaginationBar from "@components/shared/PaginationBar/PaginationBar";
import { getUserDisplayName } from "@libs/userDisplay";

const PAGE_SIZE = PAGE_LIMITS.production;

const PRODUCTION_TYPE_LABELS = {
    transformation: "Transformacion",
    cutting: "Despiece",
    preparation: "Preparacion",
    portioning: "Porcionado",
    generic: "General",
};

function formatDate(value) {
    if (!value) return "Sin fecha";

    return new Intl.DateTimeFormat("es-EC", {
        dateStyle: "medium",
        timeStyle: "short",
    }).format(new Date(value));
}

function formatQuantity(value) {
    return new Intl.NumberFormat("es-EC", {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
    }).format(Number(value || 0));
}

function buildPreview(items = []) {
    if (!Array.isArray(items) || items.length === 0) {
        return "Sin resultados registrados.";
    }

    const firstTwo = items.slice(0, 2).map((item) => {
        return `${formatQuantity(item.quantity)} ${getUnitLabel(item.unitSnapshot)} de ${item.productNameSnapshot}`;
    });

    if (items.length <= 2) return firstTwo.join(" · ");
    return `${firstTwo.join(" · ")} · +${items.length - 2}`;
}

function getStatusTone(status) {
    switch (status) {
        case "completed":
            return "heroStatSuccess";
        case "in_progress":
            return "heroStatInfo";
        case "cancelled":
            return "";
        default:
            return "";
    }
}

function getStatusClass(stylesModule, status) {
    switch (status) {
        case "completed":
            return stylesModule.statusCompleted;
        case "in_progress":
            return stylesModule.statusInProgress;
        case "cancelled":
            return stylesModule.statusCancelled;
        default:
            return stylesModule.statusDraft;
    }
}

export default function ProductionPage() {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();

    const [productions, setProductions] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [search, setSearch] = useState(() =>
        getStringParam(searchParams, "search")
    );
    const [statusFilter, setStatusFilter] = useState(() =>
        getStringParam(searchParams, "status")
    );
    const [typeFilter, setTypeFilter] = useState(() =>
        getStringParam(searchParams, "productionType")
    );
    const [dateFilter, setDateFilter] = useState(() =>
        getStringParam(searchParams, "date")
    );
    const [page, setPage] = useState(() =>
        getPositiveIntParam(searchParams, "page", 1)
    );
    const [pagination, setPagination] = useState({
        page: 1,
        limit: PAGE_SIZE,
        total: 0,
        pages: 1,
    });
    const [summary, setSummary] = useState({
        total: 0,
        draft: 0,
        inProgress: 0,
        completed: 0,
        cancelled: 0,
    });

    const hasActiveFilters = Boolean(
        search.trim() || statusFilter || typeFilter || dateFilter
    );

    useEffect(() => {
        setPage(1);
    }, [search, statusFilter, typeFilter, dateFilter]);

    useEffect(() => {
        const nextQuery = buildSearchParams(searchParams, {
            search: search.trim() || null,
            status: statusFilter || null,
            productionType: typeFilter || null,
            date: dateFilter || null,
            page: page > 1 ? page : null,
        });

        if (nextQuery !== searchParams.toString()) {
            router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname, {
                scroll: false,
            });
        }
    }, [
        dateFilter,
        page,
        pathname,
        router,
        search,
        searchParams,
        statusFilter,
        typeFilter,
    ]);

    async function loadProductions() {
        try {
            setIsLoading(true);

            const params = new URLSearchParams({
                page: String(page),
                limit: String(PAGE_SIZE),
            });

            if (search.trim()) params.set("search", search.trim());
            if (statusFilter) params.set("status", statusFilter);
            if (typeFilter) params.set("productionType", typeFilter);
            if (dateFilter) {
                params.set("dateFrom", dateFilter);
                params.set("dateTo", dateFilter);
            }

            const response = await fetch(`/api/productions?${params.toString()}`, {
                cache: "no-store",
            });
            const result = await response.json();

            if (!response.ok) {
                throw new Error(
                    result?.message || "No se pudieron cargar las producciones."
                );
            }

            const items = Array.isArray(result?.data?.items)
                ? result.data.items
                : Array.isArray(result?.data)
                  ? result.data
                  : [];

            const meta = result?.data?.meta || result?.meta || {
                page,
                limit: PAGE_SIZE,
                total: items.length,
                pages: 1,
            };

            const apiSummary = result?.data?.summary || {};

            setProductions(items);
            setPagination({
                page: Number(meta.page || page),
                limit: Number(meta.limit || PAGE_SIZE),
                total: Number(meta.total || 0),
                pages: Number(meta.pages || 1),
            });
            setSummary({
                total: Number(apiSummary.total || meta.total || 0),
                draft: Number(apiSummary.draft || 0),
                inProgress: Number(apiSummary.inProgress || 0),
                completed: Number(apiSummary.completed || 0),
                cancelled: Number(apiSummary.cancelled || 0),
            });
        } catch (error) {
            console.error("[PRODUCTION_PAGE_LOAD_ERROR]", error);
            setProductions([]);
            setPagination({
                page: 1,
                limit: PAGE_SIZE,
                total: 0,
                pages: 1,
            });
            setSummary({
                total: 0,
                draft: 0,
                inProgress: 0,
                completed: 0,
                cancelled: 0,
            });
        } finally {
            setIsLoading(false);
        }
    }

    useEffect(() => {
        const timeout = setTimeout(loadProductions, 220);
        return () => clearTimeout(timeout);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [page, search, statusFilter, typeFilter, dateFilter]);

    const stats = useMemo(
        () => ({
            total: summary.total || pagination.total || 0,
            draft: summary.draft || 0,
            inProgress: summary.inProgress || 0,
            completed: summary.completed || 0,
        }),
        [pagination.total, summary]
    );

    const fromItem =
        pagination.total === 0 ? 0 : (pagination.page - 1) * pagination.limit + 1;
    const toItem =
        pagination.total === 0
            ? 0
            : Math.min(pagination.page * pagination.limit, pagination.total);

    return (
        <div className="page">
            <section className={`hero fadeScaleIn ${styles.heroShell}`}>
                <div className="heroCopy">
                    <span className="eyebrow">Operacion</span>
                    <h1 className="title">Produccion</h1>
                    <p className="description">
                        Revisa las ejecuciones, controla el avance del dia y entra a
                        cada produccion para completar resultados, subproductos,
                        desperdicio y gramaje real.
                    </p>
                </div>

                <div className={styles.heroStats}>
                    <button
                        type="button"
                        className={`compactStat ${styles.heroStatButton} ${
                            !statusFilter ? styles.heroStatActive : ""
                        }`}
                        onClick={() => setStatusFilter("")}
                    >
                        <span>
                            Todas <strong>{stats.total}</strong>
                        </span>
                    </button>

                    <button
                        type="button"
                        className={`compactStat ${styles.heroStatButton} ${
                            statusFilter === "draft" ? styles.heroStatActive : ""
                        }`}
                        onClick={() => setStatusFilter("draft")}
                    >
                        <span>
                            Borradores <strong>{stats.draft}</strong>
                        </span>
                    </button>

                    <button
                        type="button"
                        className={`compactStat heroStatInfo ${styles.heroStatButton} ${
                            statusFilter === "in_progress"
                                ? styles.heroStatActive
                                : ""
                        }`}
                        onClick={() => setStatusFilter("in_progress")}
                    >
                        <span>
                            En proceso <strong>{stats.inProgress}</strong>
                        </span>
                    </button>

                    <button
                        type="button"
                        className={`compactStat heroStatSuccess ${styles.heroStatButton} ${
                            statusFilter === "completed" ? styles.heroStatActive : ""
                        }`}
                        onClick={() => setStatusFilter("completed")}
                    >
                        <span>
                            Completadas <strong>{stats.completed}</strong>
                        </span>
                    </button>
                </div>
            </section>

            <div className={`${styles.toolbar} fadeSlideIn delayOne`}>
                <div className={styles.actionGroup}>
                    <button
                        type="button"
                        className="miniAction"
                        onClick={loadProductions}
                        disabled={isLoading}
                    >
                        <RefreshCcw size={14} />
                        Recargar
                    </button>

                    <button
                        type="button"
                        className="miniAction miniActionPrimary"
                        onClick={() => router.push("/dashboard/production/new")}
                    >
                        <Plus size={14} />
                        Nueva produccion
                    </button>
                </div>
            </div>

            <section className={`${styles.filtersCard} fadeSlideIn delayTwo`}>
                <div className={styles.filtersGrid}>
                    <div className="form-field">
                        <div className="searchField">
                            <Search size={16} />
                            <input
                                type="text"
                                value={search}
                                onChange={(event) => setSearch(event.target.value)}
                                placeholder="Buscar por numero, ficha o notas"
                                className="searchInput"
                            />
                        </div>
                    </div>

                    <div className="form-field">
                        <div className="selectWrap">
                            <select
                                value={statusFilter}
                                onChange={(event) => setStatusFilter(event.target.value)}
                                className="form-input"
                            >
                                <option value="">Todos los estados</option>
                                <option value="draft">Borrador</option>
                                <option value="in_progress">En proceso</option>
                                <option value="completed">Completada</option>
                                <option value="cancelled">Cancelada</option>
                            </select>
                        </div>
                    </div>

                    <div className="form-field">
                        <div className="selectWrap">
                            <select
                                value={typeFilter}
                                onChange={(event) => setTypeFilter(event.target.value)}
                                className="form-input"
                            >
                                <option value="">Todos los tipos</option>
                                <option value="transformation">Transformacion</option>
                                <option value="cutting">Despiece</option>
                                <option value="preparation">Preparacion</option>
                                <option value="portioning">Porcionado</option>
                                <option value="generic">General</option>
                            </select>
                        </div>
                    </div>

                    <div className="form-field">
                        <input
                            type="date"
                            value={dateFilter}
                            onChange={(event) => setDateFilter(event.target.value)}
                            className="form-input"
                        />
                    </div>

                    <div className={styles.clearSlot}>
                        <button
                            type="button"
                            className="miniAction"
                            onClick={() => {
                                setSearch("");
                                setStatusFilter("");
                                setTypeFilter("");
                                setDateFilter("");
                                setPage(1);
                            }}
                            disabled={!hasActiveFilters}
                        >
                            Limpiar filtros
                        </button>
                    </div>
                </div>
            </section>

            {isLoading ? (
                <section className={`${styles.list} fadeSlideIn delayTwo`}>
                    {Array.from({ length: 6 }).map((_, index) => (
                        <article
                            key={index}
                            className={`${styles.skeletonCard} fadeScaleIn`}
                            style={{ animationDelay: `${Math.min(index, 8) * 0.03}s` }}
                        >
                            <div className={styles.skeletonTop} />
                            <div className={styles.skeletonLine} />
                            <div className={styles.skeletonLineShort} />
                        </article>
                    ))}
                </section>
            ) : productions.length === 0 ? (
                <section className={`${styles.emptyState} fadeScaleIn`}>
                    <div className={styles.emptyIcon}>
                        <Factory size={24} />
                    </div>
                    <h3 className={styles.emptyTitle}>
                        No se encontraron producciones
                    </h3>
                    <p className={styles.emptyDescription}>
                        Ajusta los filtros o crea una nueva produccion para empezar.
                    </p>

                    <button
                        type="button"
                        className="miniAction miniActionPrimary"
                        onClick={() => router.push("/dashboard/production/new")}
                    >
                        <Plus size={14} />
                        Nueva produccion
                    </button>
                </section>
            ) : (
                <>
                    <section className={`${styles.list} fadeSlideIn delayThree`}>
                        {productions.map((production, index) => {
                            const outputPreview = buildPreview(
                                production.outputs?.length
                                    ? production.outputs
                                    : production.expectedOutputs
                            );

                            const responsibleName = getUserDisplayName(
                                production.performedBy,
                                "Sin responsable"
                            );

                            return (
                                <article
                                    key={production._id}
                                    className={`${styles.productionCard} fadeScaleIn`}
                                    style={{
                                        animationDelay: `${Math.min(index, 8) * 0.03}s`,
                                    }}
                                >
                                    <div className={styles.cardTop}>
                                        <div className={styles.cardMain}>
                                            <div className={styles.cardBadges}>
                                                <span className={styles.codeBadge}>
                                                    {production.productionNumber ||
                                                        "Sin numero"}
                                                </span>

                                                <span
                                                    className={`${styles.statusBadge} ${getStatusClass(
                                                        styles,
                                                        production.status
                                                    )}`}
                                                >
                                                    {PRODUCTION_STATUS_LABELS[
                                                        production.status
                                                    ] || production.status}
                                                </span>
                                            </div>

                                            <h3 className={styles.cardTitle}>
                                                {production.templateSnapshot?.name ||
                                                    "Sin ficha asociada"}
                                            </h3>

                                            <p className={styles.cardDescription}>
                                                {PRODUCTION_TYPE_LABELS[
                                                    production.productionType
                                                ] || production.productionType}{" "}
                                                · {responsibleName}
                                            </p>
                                        </div>

                                        <div className={styles.targetBlock}>
                                            <span className={styles.targetLabel}>
                                                Objetivo
                                            </span>
                                            <strong className={styles.targetValue}>
                                                {formatQuantity(
                                                    production.targetQuantity
                                                )}{" "}
                                                {getUnitLabel(production.targetUnit)}
                                            </strong>
                                        </div>
                                    </div>

                                    <div className={styles.cardMeta}>
                                        <span
                                            className={`compactStat ${getStatusTone(
                                                production.status
                                            )}`}
                                        >
                                            <span>
                                                Ubicacion{" "}
                                                <strong>
                                                    {production.location === "kitchen"
                                                        ? "Cocina"
                                                        : production.location}
                                                </strong>
                                            </span>
                                        </span>

                                        <span className="compactStat">
                                            <span>
                                                Creada{" "}
                                                <strong>
                                                    {formatDate(production.createdAt)}
                                                </strong>
                                            </span>
                                        </span>

                                        <span className="compactStat">
                                            <span>
                                                Inicio{" "}
                                                <strong>
                                                    {production.startedAt
                                                        ? formatDate(
                                                              production.startedAt
                                                          )
                                                        : "Pendiente"}
                                                </strong>
                                            </span>
                                        </span>
                                    </div>

                                    <div className={styles.resultBox}>
                                        <span className={styles.resultLabel}>
                                            Resultados
                                        </span>
                                        <p className={styles.resultText}>
                                            {outputPreview}
                                        </p>
                                    </div>

                                    <div className={styles.cardFooter}>
                                        <span className={styles.footerText}>
                                            Cierre:{" "}
                                            {production.completedAt
                                                ? formatDate(production.completedAt)
                                                : "Pendiente"}
                                        </span>

                                        <div className={styles.footerActions}>
                                            {production.status === "draft" ? (
                                                <button
                                                    type="button"
                                                    className="action-button action-button--neutral"
                                                    onClick={() =>
                                                        router.push(
                                                            `/dashboard/production/${production._id}`
                                                        )
                                                    }
                                                >
                                                    <span className="action-button__icon">
                                                        <Play size={15} />
                                                    </span>
                                                    <span className="action-button__label">
                                                        Continuar
                                                    </span>
                                                </button>
                                            ) : null}

                                            {production.status === "in_progress" ? (
                                                <button
                                                    type="button"
                                                    className="action-button"
                                                    onClick={() =>
                                                        router.push(
                                                            `/dashboard/production/${production._id}`
                                                        )
                                                    }
                                                >
                                                    <span className="action-button__icon">
                                                        <Play size={15} />
                                                    </span>
                                                    <span className="action-button__label">
                                                        Gestionar
                                                    </span>
                                                </button>
                                            ) : null}

                                            {production.status === "cancelled" ? (
                                                <button
                                                    type="button"
                                                    className="action-button action-button--danger"
                                                    onClick={() =>
                                                        router.push(
                                                            `/dashboard/production/${production._id}`
                                                        )
                                                    }
                                                >
                                                    <span className="action-button__icon">
                                                        <XCircle size={15} />
                                                    </span>
                                                    <span className="action-button__label">
                                                        Ver detalle
                                                    </span>
                                                </button>
                                            ) : null}

                                            {production.status === "completed" ? (
                                                <button
                                                    type="button"
                                                    className="action-button action-button--neutral"
                                                    onClick={() =>
                                                        router.push(
                                                            `/dashboard/production/${production._id}`
                                                        )
                                                    }
                                                >
                                                    <span className="action-button__icon">
                                                        <Play size={15} />
                                                    </span>
                                                    <span className="action-button__label">
                                                        Ver detalle
                                                    </span>
                                                </button>
                                            ) : null}
                                        </div>
                                    </div>
                                </article>
                            );
                        })}
                    </section>

                    <PaginationBar
                        page={pagination.page}
                        totalPages={pagination.pages}
                        totalItems={pagination.total}
                        fromItem={fromItem}
                        toItem={toItem}
                        itemLabel="producciones"
                        onPageChange={setPage}
                    />
                </>
            )}
        </div>
    );
}
