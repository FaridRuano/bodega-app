"use client";

import { useEffect, useState } from "react";
import { Factory, Plus, RefreshCcw, Search } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import styles from "./page.module.scss";
import ProductionTemplateReviewModal from "@components/config/ProductionTemplateReview/ProductionTemplateReview";
import ProductionTemplateModal from "@components/config/ProductionTemplateModal/ProductionTemplateModal";
import ConfirmModal from "@components/shared/ConfirmModal/ConfirmModal";
import PaginationBar from "@components/shared/PaginationBar/PaginationBar";
import {
    buildSearchParams,
    getPositiveIntParam,
    getStringParam,
} from "@libs/urlParams";

const PAGE_SIZE = 5;

const TYPE_OPTIONS = [
    { value: "", label: "Todos los tipos" },
    { value: "transformation", label: "Transformacion" },
    { value: "cutting", label: "Despiece" },
    { value: "preparation", label: "Preparacion" },
    { value: "portioning", label: "Porcionado" },
];

const STATUS_OPTIONS = [
    { value: "", label: "Todos los estados" },
    { value: "true", label: "Activas" },
    { value: "false", label: "Inactivas" },
];

const TYPE_LABELS = {
    transformation: "Transformacion",
    cutting: "Despiece",
    preparation: "Preparacion",
    portioning: "Porcionado",
};

function getFlowLabel(template) {
    const inputsCount = template.inputs?.length || 0;
    const outputsCount = template.outputs?.length || 0;

    if (inputsCount === 1 && outputsCount === 1) {
        return "1 insumo -> 1 resultado";
    }

    return `${inputsCount} insumos -> ${outputsCount} resultados`;
}

function getTemplateSubtitle(template) {
    const typeLabel = TYPE_LABELS[template.type] || template.type || "Sin tipo";
    const baseLabel = template.baseUnit === "kg" ? "Kilogramo" : "Unidad";

    return `${typeLabel} · ${baseLabel}`;
}

export default function ProductionTemplatesPage() {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();

    const [templates, setTemplates] = useState([]);
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState(false);
    const [error, setError] = useState("");
    const [pagination, setPagination] = useState({
        page: 1,
        limit: PAGE_SIZE,
        total: 0,
        pages: 1,
    });
    const [summary, setSummary] = useState({
        total: 0,
        active: 0,
        inactive: 0,
        cutting: 0,
    });
    const [filters, setFilters] = useState({
        search: getStringParam(searchParams, "search"),
        type: getStringParam(searchParams, "type"),
        isActive: getStringParam(searchParams, "isActive"),
    });
    const [page, setPage] = useState(() =>
        getPositiveIntParam(searchParams, "page", 1)
    );
    const [categories, setCategories] = useState([]);
    const [createEditOpen, setCreateEditOpen] = useState(false);
    const [reviewOpen, setReviewOpen] = useState(false);
    const [modalMode, setModalMode] = useState("create");
    const [selectedTemplate, setSelectedTemplate] = useState(null);
    const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
    const [submitError, setSubmitError] = useState("");

    const hasActiveFilters = Boolean(
        filters.search.trim() || filters.type || filters.isActive
    );

    useEffect(() => {
        setPage(1);
    }, [filters.search, filters.type, filters.isActive]);

    useEffect(() => {
        const nextQuery = buildSearchParams(searchParams, {
            search: filters.search.trim() || null,
            type: filters.type || null,
            isActive: filters.isActive || null,
            page: page > 1 ? page : null,
        });

        if (nextQuery !== searchParams.toString()) {
            router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname, {
                scroll: false,
            });
        }
    }, [filters, page, pathname, router, searchParams]);

    async function fetchTemplates() {
        try {
            setLoading(true);
            setError("");

            const params = new URLSearchParams({
                page: String(page),
                limit: String(PAGE_SIZE),
            });

            if (filters.search.trim()) params.set("search", filters.search.trim());
            if (filters.type) params.set("type", filters.type);
            if (filters.isActive) params.set("isActive", filters.isActive);

            const response = await fetch(
                `/api/production-templates?${params.toString()}`,
                {
                    method: "GET",
                    cache: "no-store",
                }
            );

            const result = await response.json();

            if (!response.ok || !result.success) {
                throw new Error(result.message || "No se pudieron obtener las fichas.");
            }

            setTemplates(result.data || []);
            setPagination({
                page: Number(result.pagination?.page || page),
                limit: Number(result.pagination?.limit || PAGE_SIZE),
                total: Number(result.pagination?.total || 0),
                pages: Number(result.pagination?.pages || 1),
            });
            setSummary({
                total: Number(result.summary?.total || 0),
                active: Number(result.summary?.active || 0),
                inactive: Number(result.summary?.inactive || 0),
                cutting: Number(result.summary?.cutting || 0),
            });
        } catch (err) {
            setError(err.message || "No se pudieron cargar las fichas.");
        } finally {
            setLoading(false);
        }
    }

    async function fetchCategories() {
        try {
            const response = await fetch("/api/categories", {
                method: "GET",
                cache: "no-store",
            });
            const result = await response.json();

            if (!response.ok || !result.success) {
                throw new Error(
                    result.message || "No se pudieron obtener las categorias."
                );
            }

            setCategories(result.data || []);
        } catch (err) {
            setError(err.message || "No se pudieron cargar las categorias.");
        }
    }

    useEffect(() => {
        fetchTemplates();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [filters, page]);

    useEffect(() => {
        fetchCategories();
    }, []);

    function handleFilterChange(event) {
        const { name, value } = event.target;
        setFilters((prev) => ({ ...prev, [name]: value }));
    }

    function handleClearFilters() {
        setFilters({ search: "", type: "", isActive: "" });
    }

    function handleOpenCreate() {
        setSelectedTemplate(null);
        setModalMode("create");
        setCreateEditOpen(true);
    }

    async function handleOpenReview(templateId) {
        try {
            setActionLoading(true);

            const response = await fetch(`/api/production-templates/${templateId}`, {
                method: "GET",
                cache: "no-store",
            });
            const result = await response.json();

            if (!response.ok || !result.success) {
                throw new Error(result.message || "No se pudo obtener la ficha.");
            }

            setSelectedTemplate(result.data);
            setReviewOpen(true);
        } catch (err) {
            setError(err.message || "No se pudo abrir la ficha.");
        } finally {
            setActionLoading(false);
        }
    }

    async function handleSubmitTemplate(payload) {
        try {
            setActionLoading(true);
            setError("");
            setSubmitError("");

            const isEdit = modalMode === "edit" && selectedTemplate?._id;
            const response = await fetch(
                isEdit
                    ? `/api/production-templates/${selectedTemplate._id}`
                    : "/api/production-templates",
                {
                    method: isEdit ? "PUT" : "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload),
                }
            );
            const result = await response.json();

            if (!response.ok || !result.success) {
                setSubmitError(result.message || "No se pudo guardar la ficha.");
                return;
            }

            setCreateEditOpen(false);
            setSelectedTemplate(result.data || null);
            setSubmitError("");
            await fetchTemplates();
        } catch (err) {
            setSubmitError("");
            setError(err.message || "No se pudo guardar la ficha.");
        } finally {
            setActionLoading(false);
        }
    }

    async function handleToggleStatus() {
        if (!selectedTemplate?._id) return;

        try {
            setActionLoading(true);
            setError("");

            const response = await fetch(
                `/api/production-templates/${selectedTemplate._id}/status`,
                {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        isActive: !selectedTemplate.isActive,
                    }),
                }
            );
            const result = await response.json();

            if (!response.ok || !result.success) {
                throw new Error(result.message || "No se pudo actualizar el estado.");
            }

            setReviewOpen(false);
            await fetchTemplates();
        } catch (err) {
            setError(err.message || "No se pudo actualizar el estado.");
        } finally {
            setActionLoading(false);
        }
    }

    async function handleDeleteTemplate() {
        if (!selectedTemplate?._id) return;

        try {
            setActionLoading(true);
            setError("");

            const response = await fetch(
                `/api/production-templates/${selectedTemplate._id}`,
                { method: "DELETE" }
            );
            const result = await response.json();

            if (!response.ok || !result.success) {
                throw new Error(result.message || "No se pudo eliminar la ficha.");
            }

            setConfirmDeleteOpen(false);
            setReviewOpen(false);
            setSelectedTemplate(null);
            await fetchTemplates();
        } catch (err) {
            setError(err.message || "No se pudo eliminar la ficha.");
        } finally {
            setActionLoading(false);
        }
    }

    return (
        <>
            <section className="page">
                <section className={`hero fadeScaleIn ${styles.heroShell}`}>
                    <div className="heroCopy">
                        <span className="eyebrow">Configuracion</span>
                        <h1 className="title">Fichas de produccion</h1>
                        <p className="description">
                            Define insumos, resultados, control de gramaje y el flujo
                            operativo de cada proceso de cocina.
                        </p>
                    </div>

                    <div className={styles.heroStats}>
                        <button
                            type="button"
                            className={`compactStat ${styles.heroStatButton}`}
                            onClick={handleClearFilters}
                        >
                            <span>
                                Fichas <strong>{summary.total}</strong>
                            </span>
                        </button>

                        <button
                            type="button"
                            className={`compactStat heroStatSuccess ${styles.heroStatButton}`}
                            onClick={() =>
                                setFilters((prev) => ({ ...prev, isActive: "true" }))
                            }
                        >
                            <span>
                                Activas <strong>{summary.active}</strong>
                            </span>
                        </button>

                        <button
                            type="button"
                            className={`compactStat ${styles.heroStatButton}`}
                            onClick={() =>
                                setFilters((prev) => ({ ...prev, isActive: "false" }))
                            }
                        >
                            <span>
                                Inactivas <strong>{summary.inactive}</strong>
                            </span>
                        </button>

                        <button
                            type="button"
                            className={`compactStat heroStatInfo ${styles.heroStatButton}`}
                            onClick={() =>
                                setFilters((prev) => ({ ...prev, type: "cutting" }))
                            }
                        >
                            <span>
                                Despiece <strong>{summary.cutting}</strong>
                            </span>
                        </button>
                    </div>
                </section>

                <div className={`${styles.toolbar} fadeSlideIn delayOne`}>
                    <div className={styles.actionGroup}>
                        <button
                            type="button"
                            className="miniAction"
                            onClick={fetchTemplates}
                            disabled={loading || actionLoading}
                        >
                            <RefreshCcw size={14} />
                            Recargar
                        </button>

                        <button
                            type="button"
                            className="miniAction miniActionPrimary"
                            onClick={handleOpenCreate}
                        >
                            <Plus size={14} />
                            Nueva ficha
                        </button>
                    </div>
                </div>

                <section className={`${styles.filtersCard} fadeSlideIn delayTwo`}>
                    <div className={styles.filtersGrid}>
                        <div className="form-field">
                            <div className="searchField">
                                <Search size={16} />
                                <input
                                    name="search"
                                    value={filters.search}
                                    onChange={handleFilterChange}
                                    placeholder="Buscar por nombre o codigo"
                                    className="searchInput"
                                />
                            </div>
                        </div>

                        <div className="form-field">
                            <div className="selectWrap">
                                <select
                                    name="type"
                                    value={filters.type}
                                    onChange={handleFilterChange}
                                    className="form-input"
                                >
                                    {TYPE_OPTIONS.map((option) => (
                                        <option key={option.value} value={option.value}>
                                            {option.label}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        <div className="form-field">
                            <div className="selectWrap">
                                <select
                                    name="isActive"
                                    value={filters.isActive}
                                    onChange={handleFilterChange}
                                    className="form-input"
                                >
                                    {STATUS_OPTIONS.map((option) => (
                                        <option key={option.value} value={option.value}>
                                            {option.label}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        <div className={styles.clearSlot}>
                            <button
                                type="button"
                                className="miniAction"
                                onClick={handleClearFilters}
                                disabled={!hasActiveFilters}
                            >
                                Limpiar filtros
                            </button>
                        </div>
                    </div>
                </section>

                {error ? <p className={styles.errorText}>{error}</p> : null}

                {loading ? (
                    <section className={`${styles.grid} fadeSlideIn delayTwo`}>
                        {Array.from({ length: PAGE_SIZE }).map((_, index) => (
                            <article
                                key={index}
                                className={`${styles.skeletonCard} fadeScaleIn`}
                                style={{
                                    animationDelay: `${Math.min(index, 8) * 0.03}s`,
                                }}
                            >
                                <div className={styles.skeletonTop} />
                                <div className={styles.skeletonLine} />
                            </article>
                        ))}
                    </section>
                ) : templates.length === 0 ? (
                    <section className={`${styles.emptyState} fadeScaleIn`}>
                        <div className={styles.emptyIcon}>
                            <Factory size={22} />
                        </div>
                        <h3 className={styles.emptyTitle}>
                            No se encontraron fichas de produccion
                        </h3>
                        <p className={styles.emptyDescription}>
                            Ajusta los filtros o crea una ficha nueva para empezar.
                        </p>
                        <button
                            type="button"
                            className="miniAction miniActionPrimary"
                            onClick={handleOpenCreate}
                        >
                            <Plus size={14} />
                            Crear ficha
                        </button>
                    </section>
                ) : (
                    <>
                        <section className={`${styles.grid} fadeSlideIn delayTwo`}>
                            {templates.map((template, index) => (
                                <article
                                    key={template._id}
                                    className={`${styles.templateCard} fadeScaleIn`}
                                    style={{
                                        animationDelay: `${Math.min(index, 8) * 0.03}s`,
                                    }}
                                    onClick={() => handleOpenReview(template._id)}
                                    onKeyDown={(event) => {
                                        if (event.key === "Enter" || event.key === " ") {
                                            event.preventDefault();
                                            handleOpenReview(template._id);
                                        }
                                    }}
                                    role="button"
                                    tabIndex={0}
                                >
                                    <div className={styles.cardHeader}>
                                        <div className={styles.cardHeaderMain}>
                                            <div className={styles.cardBadges}>
                                                {template.code ? (
                                                    <span className={styles.codeBadge}>
                                                        {template.code}
                                                    </span>
                                                ) : null}
                                                <span
                                                    className={`${styles.statusBadge} ${
                                                        template.isActive
                                                            ? styles.active
                                                            : styles.inactive
                                                    }`}
                                                >
                                                    {template.isActive ? "Activa" : "Inactiva"}
                                                </span>
                                            </div>

                                            <h3 className={styles.cardTitle}>{template.name}</h3>
                                            <p className={styles.cardSubtitle}>
                                                {getTemplateSubtitle(template)}
                                            </p>
                                        </div>
                                    </div>
                                </article>
                            ))}
                        </section>

                        <PaginationBar
                            page={pagination.page}
                            totalPages={pagination.pages}
                            totalItems={pagination.total}
                            fromItem={
                                pagination.total === 0
                                    ? 0
                                    : (pagination.page - 1) * pagination.limit + 1
                            }
                            toItem={
                                pagination.total === 0
                                    ? 0
                                    : Math.min(
                                          pagination.page * pagination.limit,
                                          pagination.total
                                      )
                            }
                            itemLabel="fichas"
                            onPageChange={setPage}
                        />
                    </>
                )}
            </section>

            <ProductionTemplateModal
                open={createEditOpen}
                onClose={() => {
                    setCreateEditOpen(false);
                    setSubmitError("");
                }}
                onSubmit={handleSubmitTemplate}
                mode={modalMode}
                initialData={selectedTemplate}
                categories={categories}
                loading={actionLoading}
                submitError={submitError}
            />

            <ProductionTemplateReviewModal
                open={reviewOpen}
                onClose={() => setReviewOpen(false)}
                onEdit={() => {
                    setReviewOpen(false);
                    setModalMode("edit");
                    setCreateEditOpen(true);
                }}
                onToggleStatus={handleToggleStatus}
                onDelete={() => setConfirmDeleteOpen(true)}
                template={selectedTemplate}
                loading={actionLoading}
            />

            <ConfirmModal
                open={confirmDeleteOpen}
                onClose={() => {
                    if (!actionLoading) setConfirmDeleteOpen(false);
                }}
                onConfirm={handleDeleteTemplate}
                title="Eliminar ficha de produccion"
                description={`Seguro que deseas eliminar la ficha "${
                    selectedTemplate?.name || ""
                }"? Esta accion no se puede deshacer.`}
                confirmLabel="Eliminar"
                cancelLabel="Cancelar"
                variant="danger"
            />
        </>
    );
}
