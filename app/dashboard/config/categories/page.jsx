"use client";
import { useEffect, useMemo, useState } from "react";
import {
    ChevronDown,
    PencilLine,
    Plus,
    Power,
    Trash2,
} from "lucide-react";

import styles from "./page.module.scss";
import CategoryModal from "@components/config/CategoryModal/CategoryModal";
import DialogModal from "@components/shared/DialogModal/DialogModal";

export default function CategoriesPage() {
    const [categories, setCategories] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [expandedId, setExpandedId] = useState(null);

    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const [selectedCategory, setSelectedCategory] = useState(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const [dialogState, setDialogState] = useState({
        open: false,
        variant: "info",
        title: "",
        message: "",
        confirmText: "Aceptar",
        showCancel: false,
        loading: false,
        onConfirm: null,
    });

    async function fetchCategories() {
        try {
            setIsLoading(true);

            const response = await fetch("/api/categories", {
                method: "GET",
                cache: "no-store",
            });

            const result = await response.json();

            if (!response.ok || !result.success) {
                throw new Error(result.message || "No se pudieron cargar las categorías.");
            }

            setCategories(result.data || []);
        } catch (error) {
            console.error(error);

            setDialogState({
                open: true,
                variant: "danger",
                title: "Error al cargar categorías",
                message:
                    error.message || "Ocurrió un problema al obtener las categorías.",
                confirmText: "Cerrar",
                showCancel: false,
                loading: false,
                onConfirm: () =>
                    setDialogState((prev) => ({
                        ...prev,
                        open: false,
                    })),
            });
        } finally {
            setIsLoading(false);
        }
    }

    useEffect(() => {
        fetchCategories();
    }, []);

    const sortedCategories = useMemo(() => {
        return [...categories].sort((a, b) => {
            if (a.sortOrder !== b.sortOrder) {
                return a.sortOrder - b.sortOrder;
            }

            return a.name.localeCompare(b.name);
        });
    }, [categories]);

    function toggleExpanded(id) {
        setExpandedId((prev) => (prev === id ? null : id));
    }

    async function handleCreateCategory(formData) {
        try {
            setIsSubmitting(true);

            const response = await fetch("/api/categories", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    name: formData.name,
                    description: formData.description,
                }),
            });

            const result = await response.json();

            if (!response.ok || !result.success) {
                throw new Error(result.message || "No se pudo crear la categoría.");
            }

            setCategories((prev) => [...prev, result.data]);
            setIsCreateOpen(false);

            setDialogState({
                open: true,
                variant: "success",
                title: "Categoría creada",
                message: result.message || "La categoría se creó correctamente.",
                confirmText: "Aceptar",
                showCancel: false,
                loading: false,
                onConfirm: () =>
                    setDialogState((prev) => ({
                        ...prev,
                        open: false,
                    })),
            });
        } catch (error) {
            console.error(error);

            setDialogState({
                open: true,
                variant: "danger",
                title: "No se pudo crear la categoría",
                message: error.message || "Ocurrió un problema al crear la categoría.",
                confirmText: "Cerrar",
                showCancel: false,
                loading: false,
                onConfirm: () =>
                    setDialogState((prev) => ({
                        ...prev,
                        open: false,
                    })),
            });
        } finally {
            setIsSubmitting(false);
        }
    }

    function handleOpenEdit(category) {
        setSelectedCategory(category);
    }

    async function handleUpdateCategory(formData) {
        if (!selectedCategory?._id) return;

        try {
            setIsSubmitting(true);

            const response = await fetch(`/api/categories/${selectedCategory._id}`, {
                method: "PATCH",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    name: formData.name,
                    description: formData.description,
                }),
            });

            const result = await response.json();

            if (!response.ok || !result.success) {
                throw new Error(result.message || "No se pudo actualizar la categoría.");
            }

            setCategories((prev) =>
                prev.map((category) =>
                    category._id === selectedCategory._id ? result.data : category
                )
            );

            setSelectedCategory(null);

            setDialogState({
                open: true,
                variant: "success",
                title: "Categoría actualizada",
                message:
                    result.message || "Los cambios de la categoría fueron guardados.",
                confirmText: "Aceptar",
                showCancel: false,
                loading: false,
                onConfirm: () =>
                    setDialogState((prev) => ({
                        ...prev,
                        open: false,
                    })),
            });
        } catch (error) {
            console.error(error);

            setDialogState({
                open: true,
                variant: "danger",
                title: "No se pudo actualizar la categoría",
                message:
                    error.message || "Ocurrió un problema al actualizar la categoría.",
                confirmText: "Cerrar",
                showCancel: false,
                loading: false,
                onConfirm: () =>
                    setDialogState((prev) => ({
                        ...prev,
                        open: false,
                    })),
            });
        } finally {
            setIsSubmitting(false);
        }
    }

    function handleToggleCategory(category) {
        setDialogState({
            open: true,
            variant: category.isActive ? "warning" : "success",
            title: category.isActive ? "Desactivar categoría" : "Activar categoría",
            message: category.isActive
                ? `La categoría "${category.name}" dejará de estar disponible para nuevas asignaciones.`
                : `La categoría "${category.name}" volverá a estar disponible.`,
            confirmText: category.isActive ? "Desactivar" : "Activar",
            showCancel: true,
            loading: false,
            onConfirm: async () => {
                try {
                    setDialogState((prev) => ({
                        ...prev,
                        loading: true,
                    }));

                    const response = await fetch(`/api/categories/${category._id}`, {
                        method: "PATCH",
                        headers: {
                            "Content-Type": "application/json",
                        },
                        body: JSON.stringify({
                            isActive: !category.isActive,
                        }),
                    });

                    const result = await response.json();

                    if (!response.ok || !result.success) {
                        throw new Error(
                            result.message || "No se pudo cambiar el estado de la categoría."
                        );
                    }

                    setCategories((prev) =>
                        prev.map((item) =>
                            item._id === category._id ? result.data : item
                        )
                    );

                    setDialogState({
                        open: true,
                        variant: "success",
                        title: "Estado actualizado",
                        message:
                            result.message ||
                            "El estado de la categoría se actualizó correctamente.",
                        confirmText: "Aceptar",
                        showCancel: false,
                        loading: false,
                        onConfirm: () =>
                            setDialogState((prev) => ({
                                ...prev,
                                open: false,
                            })),
                    });
                } catch (error) {
                    console.error(error);

                    setDialogState({
                        open: true,
                        variant: "danger",
                        title: "No se pudo actualizar el estado",
                        message:
                            error.message ||
                            "Ocurrió un problema al cambiar el estado de la categoría.",
                        confirmText: "Cerrar",
                        showCancel: false,
                        loading: false,
                        onConfirm: () =>
                            setDialogState((prev) => ({
                                ...prev,
                                open: false,
                            })),
                    });
                }
            },
        });
    }

    function handleDeleteCategory(category) {
        setDialogState({
            open: true,
            variant: "danger",
            title: "Eliminar categoría",
            message: `Se eliminará la categoría "${category.name}". Esta acción no se puede deshacer.`,
            confirmText: "Eliminar",
            showCancel: true,
            loading: false,
            onConfirm: async () => {
                try {
                    setDialogState((prev) => ({
                        ...prev,
                        loading: true,
                    }));

                    const response = await fetch(`/api/categories/${category._id}`, {
                        method: "DELETE",
                    });

                    const result = await response.json();

                    if (!response.ok || !result.success) {
                        throw new Error(result.message || "No se pudo eliminar la categoría.");
                    }

                    setCategories((prev) =>
                        prev.filter((item) => item._id !== category._id)
                    );

                    if (expandedId === category._id) {
                        setExpandedId(null);
                    }

                    setDialogState({
                        open: true,
                        variant: "success",
                        title: "Categoría eliminada",
                        message:
                            result.message || "La categoría fue eliminada correctamente.",
                        confirmText: "Aceptar",
                        showCancel: false,
                        loading: false,
                        onConfirm: () =>
                            setDialogState((prev) => ({
                                ...prev,
                                open: false,
                            })),
                    });
                } catch (error) {
                    console.error(error);

                    setDialogState({
                        open: true,
                        variant: "danger",
                        title: "No se pudo eliminar la categoría",
                        message:
                            error.message || "Ocurrió un problema al eliminar la categoría.",
                        confirmText: "Cerrar",
                        showCancel: false,
                        loading: false,
                        onConfirm: () =>
                            setDialogState((prev) => ({
                                ...prev,
                                open: false,
                            })),
                    });
                }
            },
        });
    }

    return (
        <>
            <div className={styles.page}>
                <div className={styles.headerRow}>
                    <div className={styles.headerContent}>
                        <h2 className={styles.title}>Administrador de Categorías</h2>
                        <p className={styles.description}>
                            Administra las categorías de productos en el sistema.
                        </p>
                    </div>

                    <button
                        type="button"
                        className="btn btn-primary"
                        onClick={() => setIsCreateOpen(true)}
                    >
                        <Plus size={16} />
                        Nueva categoría
                    </button>
                </div>

                {isLoading ? (
                    <div className={styles.emptyState}>
                        <p className={styles.emptyTitle}>Cargando categorías...</p>
                    </div>
                ) : sortedCategories.length === 0 ? (
                    <div className={styles.emptyState}>
                        <p className={styles.emptyTitle}>No hay categorías registradas</p>
                        <p className={styles.emptyDescription}>
                            Crea tu primera categoría para empezar a organizar los productos.
                        </p>
                    </div>
                ) : (
                    <div className={styles.list}>
                        {sortedCategories.map((category) => {
                            const isOpen = expandedId === category._id;

                            return (
                                <article
                                    key={category._id}
                                    className={`${styles.card} ${isOpen ? styles.cardOpen : ""}`}
                                >
                                    <button
                                        type="button"
                                        className={styles.summary}
                                        onClick={() => toggleExpanded(category._id)}
                                    >
                                        <div className={styles.summaryMain}>
                                            <div className={styles.titleRow}>
                                                <h3 className={styles.cardTitle}>{category.name}</h3>

                                                <span
                                                    className={`${styles.statusBadge} ${category.isActive
                                                        ? styles.statusActive
                                                        : styles.statusInactive
                                                        }`}
                                                >
                                                    {category.isActive ? "Activa" : "Inactiva"}
                                                </span>
                                            </div>

                                            <p className={styles.preview}>
                                                {category.description || "Sin descripción registrada."}
                                            </p>
                                        </div>

                                        <div className={styles.summaryAside}>
                                            <span className={styles.expandText}>
                                                {isOpen ? "Ocultar" : "Ver más"}
                                            </span>
                                            <ChevronDown
                                                size={18}
                                                className={`${styles.chevron} ${isOpen ? styles.chevronOpen : ""
                                                    }`}
                                            />
                                        </div>
                                    </button>

                                    {isOpen && (
                                        <div className={styles.details}>
                                            <div className={styles.meta}>
                                                <div className={styles.metaItem}>
                                                    <span className={styles.metaLabel}>Slug</span>
                                                    <span className={styles.metaValue}>{category.slug}</span>
                                                </div>

                                                <div className={styles.metaItem}>
                                                    <span className={styles.metaLabel}>Orden</span>
                                                    <span className={styles.metaValue}>
                                                        {category.sortOrder}
                                                    </span>
                                                </div>

                                                <div
                                                    className={`${styles.metaItem} ${styles.metaDescription}`}
                                                >
                                                    <span className={styles.metaLabel}>Descripción</span>
                                                    <span className={styles.metaValue}>
                                                        {category.description ||
                                                            "Sin descripción registrada."}
                                                    </span>
                                                </div>
                                            </div>

                                            <div className={styles.actions}>
                                                <button
                                                    type="button"
                                                    className="btn btn-secondary"
                                                    onClick={() => handleOpenEdit(category)}
                                                >
                                                    <PencilLine size={16} />
                                                    Editar
                                                </button>

                                                <button
                                                    type="button"
                                                    className="btn btn-secondary"
                                                    onClick={() => handleToggleCategory(category)}
                                                >
                                                    <Power size={16} />
                                                    {category.isActive ? "Desactivar" : "Activar"}
                                                </button>

                                                <button
                                                    type="button"
                                                    className="btn btn-danger"
                                                    onClick={() => handleDeleteCategory(category)}
                                                >
                                                    <Trash2 size={16} />
                                                    Eliminar
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </article>
                            );
                        })}
                    </div>
                )}
            </div>

            <CategoryModal
                open={isCreateOpen}
                onClose={() => setIsCreateOpen(false)}
                onSubmit={handleCreateCategory}
                mode="create"
                loading={isSubmitting}
            />

            <CategoryModal
                open={Boolean(selectedCategory)}
                onClose={() => setSelectedCategory(null)}
                onSubmit={handleUpdateCategory}
                mode="edit"
                initialData={selectedCategory}
                loading={isSubmitting}
            />

            <DialogModal
                open={dialogState.open}
                variant={dialogState.variant}
                title={dialogState.title}
                message={dialogState.message}
                confirmText={dialogState.confirmText}
                cancelText="Cancelar"
                showCancel={dialogState.showCancel}
                loading={dialogState.loading}
                onConfirm={dialogState.onConfirm}
                onClose={() =>
                    setDialogState((prev) => ({
                        ...prev,
                        open: false,
                        loading: false,
                    }))
                }
            />
        </>
    );
}