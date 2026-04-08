"use client";

import { useEffect, useState } from "react";
import {
    Factory,
    Filter,
    Package2,
    Plus,
    RefreshCcw,
    Search,
    Settings2,
} from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import styles from "./page.module.scss";
import ProductionTemplateReviewModal from "@components/config/ProductionTemplateReview/ProductionTemplateReview";
import ProductionTemplateModal from "@components/config/ProductionTemplateModal/ProductionTemplateModal";
import ConfirmModal from "@components/shared/ConfirmModal/ConfirmModal";
import PaginationBar from "@components/shared/PaginationBar/PaginationBar";
import { PAGE_LIMITS } from "@libs/constants/pagination";
import { buildSearchParams, getPositiveIntParam, getStringParam } from "@libs/urlParams";

const PAGE_SIZE = PAGE_LIMITS.productionTemplates;

const TYPE_OPTIONS = [
    { value: "", label: "Todos los tipos" },
    { value: "transformation", label: "Transformación" },
    { value: "cutting", label: "Despiece" },
    { value: "preparation", label: "Preparación" },
    { value: "portioning", label: "Porcionado" },
];

const STATUS_OPTIONS = [
    { value: "", label: "Todos los estados" },
    { value: "true", label: "Activas" },
    { value: "false", label: "Inactivas" },
];

const TYPE_LABELS = {
    transformation: "Transformación",
    cutting: "Despiece",
    preparation: "Preparación",
    portioning: "Porcionado",
};

export default function ProductionTemplatesPage() {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();

    const [templates, setTemplates] = useState([]);
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState(false);
    const [error, setError] = useState("");
    const [pagination, setPagination] = useState({ page: 1, limit: PAGE_SIZE, total: 0, pages: 1 });
    const [summary, setSummary] = useState({ total: 0, active: 0, inactive: 0, cutting: 0 });

    const [filters, setFilters] = useState({
        search: getStringParam(searchParams, "search"),
        type: getStringParam(searchParams, "type"),
        isActive: getStringParam(searchParams, "isActive"),
    });
    const [page, setPage] = useState(() => getPositiveIntParam(searchParams, "page", 1));

    const [createEditOpen, setCreateEditOpen] = useState(false);
    const [reviewOpen, setReviewOpen] = useState(false);
    const [modalMode, setModalMode] = useState("create");
    const [selectedTemplate, setSelectedTemplate] = useState(null);
    const [categories, setCategories] = useState([]);
    const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

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
            router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname, { scroll: false });
        }
    }, [filters, page, pathname, router, searchParams]);

    async function fetchTemplates() {
        try {
            setLoading(true);
            setError("");

            const params = new URLSearchParams();
            params.set("page", String(page));
            params.set("limit", String(PAGE_SIZE));

            if (filters.search.trim()) params.set("search", filters.search.trim());
            if (filters.type) params.set("type", filters.type);
            if (filters.isActive) params.set("isActive", filters.isActive);

            const response = await fetch(`/api/production-templates?${params.toString()}`, {
                method: "GET",
                cache: "no-store",
            });

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
            setError(err.message || "Ocurrió un error al cargar las fichas.");
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
                throw new Error(result.message || "No se pudieron obtener las categorías.");
            }

            setCategories(result.data || []);
        } catch (err) {
            setError(err.message || "No se pudieron cargar las categorías.");
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
        setFilters((prev) => ({
            ...prev,
            [name]: value,
        }));
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

    function handleCloseCreateEdit() {
        setCreateEditOpen(false);
    }

    function handleCloseReview() {
        setReviewOpen(false);
    }

    function handleEditFromReview() {
        setReviewOpen(false);
        setModalMode("edit");
        setCreateEditOpen(true);
    }

    async function handleSubmitTemplate(payload) {
        try {
            setActionLoading(true);
            setError("");

            const isEdit = modalMode === "edit" && selectedTemplate?._id;

            const response = await fetch(
                isEdit
                    ? `/api/production-templates/${selectedTemplate._id}`
                    : "/api/production-templates",
                {
                    method: isEdit ? "PUT" : "POST",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify(payload),
                }
            );

            const result = await response.json();

            if (!response.ok || !result.success) {
                throw new Error(result.message || "No se pudo guardar la ficha.");
            }

            setCreateEditOpen(false);
            setSelectedTemplate(result.data || null);
            await fetchTemplates();
        } catch (err) {
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
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                        isActive: !selectedTemplate.isActive,
                    }),
                }
            );

            const result = await response.json();

            if (!response.ok || !result.success) {
                throw new Error(result.message || "No se pudo actualizar el estado.");
            }
            handleCloseReview();
            await fetchTemplates();
        } catch (err) {
            setError(err.message || "No se pudo actualizar el estado.");
        } finally {
            setActionLoading(false);
        }
    }

    function handleAskDeleteTemplate() {
        if (!selectedTemplate?._id) return;
        setConfirmDeleteOpen(true);
    }

    async function handleDeleteTemplate() {
        if (!selectedTemplate?._id) return;

        try {
            setActionLoading(true);
            setError("");

            const response = await fetch(`/api/production-templates/${selectedTemplate._id}`, {
                method: "DELETE",
            });

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
            <section className={styles.page}>
                <div className={styles.hero}>
                    <div className={styles.heroContent}>
                        <span className={styles.eyebrow}>Configuración</span>
                        <h1 className={styles.title}>Fichas de producción</h1>
                        <p className={styles.description}>
                            Administra las fichas que definen insumos, resultados y
                            configuraciones operativas para los procesos de producción.
                        </p>
                    </div>

                    <div className={styles.heroActions}>
                        <button
                            type="button"
                            className="btn btn-secondary"
                            onClick={fetchTemplates}
                            disabled={loading || actionLoading}
                        >
                            <RefreshCcw size={16} />
                            Recargar
                        </button>

                        <button
                            type="button"
                            className="btn btn-primary"
                            onClick={handleOpenCreate}
                        >
                            <Plus size={16} />
                            Nueva ficha
                        </button>
                    </div>
                </div>

                <div className={styles.statsGrid}>
                    <article className={styles.statCard}>
                        <div className={styles.statIcon}>
                            <Factory size={18} />
                        </div>
                        <div>
                            <span className={styles.statLabel}>Total fichas</span>
                            <strong className={styles.statValue}>{summary.total}</strong>
                        </div>
                    </article>

                    <article className={styles.statCard}>
                        <div className={styles.statIcon}>
                            <Settings2 size={18} />
                        </div>
                        <div>
                            <span className={styles.statLabel}>Activas</span>
                            <strong className={styles.statValue}>{summary.active}</strong>
                        </div>
                    </article>

                    <article className={styles.statCard}>
                        <div className={styles.statIcon}>
                            <Package2 size={18} />
                        </div>
                        <div>
                            <span className={styles.statLabel}>Inactivas</span>
                            <strong className={styles.statValue}>{summary.inactive}</strong>
                        </div>
                    </article>

                    <article className={styles.statCard}>
                        <div className={styles.statIcon}>
                            <Filter size={18} />
                        </div>
                        <div>
                            <span className={styles.statLabel}>Despiece</span>
                            <strong className={styles.statValue}>{summary.cutting}</strong>
                        </div>
                    </article>
                </div>

                <section className={styles.filtersCard}>
                    <div className={styles.filtersHeader}>
                        <h2 className={styles.filtersTitle}>Filtros</h2>

                        <button
                            type="button"
                            className={styles.clearButton}
                            onClick={handleClearFilters}
                        >
                            Limpiar
                        </button>
                    </div>

                    <div className="form-grid form-grid--3">
                        <div className="form-field">
                            <div className={styles.searchField}>
                                <Search size={16} className={styles.searchIcon} />
                                <input
                                    name="search"
                                    value={filters.search}
                                    onChange={handleFilterChange}
                                    placeholder="Buscar por nombre, código o categoría"
                                    className={`form-input ${styles.searchInput}`}
                                />
                            </div>
                        </div>

                        <div className="form-field">
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

                        <div className="form-field">
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
                </section>

                {error ? <p className={styles.errorText}>{error}</p> : null}

                {loading ? (
                    <section className={styles.grid}>
                        {Array.from({ length: PAGE_SIZE }).map((_, index) => (
                            <article key={index} className={styles.skeletonCard}>
                                <div className={styles.skeletonTop} />
                                <div className={styles.skeletonLine} />
                                <div className={styles.skeletonLineShort} />
                            </article>
                        ))}
                    </section>
                ) : templates.length === 0 ? (
                    <section className={styles.emptyState}>
                        <div className={styles.emptyIcon}>
                            <Factory size={22} />
                        </div>
                        <h3 className={styles.emptyTitle}>
                            No se encontraron fichas de producción
                        </h3>
                        <p className={styles.emptyDescription}>
                            Ajusta los filtros o crea una nueva ficha para comenzar a
                            configurar tus procesos.
                        </p>

                        <button
                            type="button"
                            className="btn btn-primary"
                            onClick={handleOpenCreate}
                        >
                            <Plus size={16} />
                            Crear ficha
                        </button>
                    </section>
                ) : (
                    <>
                        <section className={styles.grid}>
                            {templates.map((template) => (
                                <article
                                    key={template._id}
                                    className={styles.templateCard}
                                    onClick={() => handleOpenReview(template._id)}
                                    role="button"
                                    tabIndex={0}
                                    onKeyDown={(event) => {
                                        if (event.key === "Enter" || event.key === " ") {
                                            event.preventDefault();
                                            handleOpenReview(template._id);
                                        }
                                    }}
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
                                                    className={`${styles.statusBadge} ${template.isActive
                                                        ? styles.active
                                                        : styles.inactive
                                                        }`}
                                                >
                                                    {template.isActive ? "Activa" : "Inactiva"}
                                                </span>
                                            </div>

                                            <h3 className={styles.cardTitle}>{template.name}</h3>

                                            <p className={styles.cardDescription}>
                                                {template.description || "Sin descripción registrada."}
                                            </p>
                                        </div>
                                    </div>

                                    <div className={styles.cardMeta}>
                                        <div className={styles.metaPill}>
                                            <span className={styles.metaLabel}>Tipo</span>
                                            <strong className={styles.metaValue}>
                                                {TYPE_LABELS[template.type] || template.type}
                                            </strong>
                                        </div>

                                        <div className={styles.metaPill}>
                                            <span className={styles.metaLabel}>Categoría</span>
                                            <strong className={styles.metaValue}>
                                                {template.category || "—"}
                                            </strong>
                                        </div>

                                        <div className={styles.metaPill}>
                                            <span className={styles.metaLabel}>Insumos</span>
                                            <strong className={styles.metaValue}>
                                                {template.inputs.length || 0}
                                            </strong>
                                        </div>

                                        <div className={styles.metaPill}>
                                            <span className={styles.metaLabel}>Resultados</span>
                                            <strong className={styles.metaValue}>
                                                {template.outputs.length || 0}
                                            </strong>
                                        </div>
                                    </div>

                                    <div className={styles.cardFooter}>
                                        <span className={styles.footerText}>
                                            Haz clic para revisar la ficha completa
                                        </span>
                                    </div>
                                </article>
                            ))}
                        </section>

                        <PaginationBar
                            page={pagination.page}
                            totalPages={pagination.pages}
                            totalItems={pagination.total}
                            fromItem={pagination.total === 0 ? 0 : (pagination.page - 1) * pagination.limit + 1}
                            toItem={pagination.total === 0 ? 0 : Math.min(pagination.page * pagination.limit, pagination.total)}
                            itemLabel="fichas"
                            onPageChange={setPage}
                        />
                    </>
                )}
            </section>

            <ProductionTemplateModal
                open={createEditOpen}
                onClose={handleCloseCreateEdit}
                onSubmit={handleSubmitTemplate}
                mode={modalMode}
                initialData={selectedTemplate}
                categories={categories}
            />

            <ProductionTemplateReviewModal
                open={reviewOpen}
                onClose={handleCloseReview}
                onEdit={handleEditFromReview}
                onToggleStatus={handleToggleStatus}
                onDelete={handleAskDeleteTemplate}
                template={selectedTemplate}
                loading={actionLoading}
            />

            <ConfirmModal
                open={confirmDeleteOpen}
                onClose={() => {
                    if (actionLoading) return;
                    setConfirmDeleteOpen(false);
                }}
                onConfirm={handleDeleteTemplate}
                title="Eliminar ficha de producción"
                description={`¿Seguro que deseas eliminar la ficha "${selectedTemplate?.name || ""}"? Esta acción no se puede deshacer.`}
                confirmLabel="Eliminar"
                cancelLabel="Cancelar"
                variant="danger"
            />
        </>
    );
}
