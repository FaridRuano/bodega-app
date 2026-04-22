"use client";

import { useEffect, useMemo, useState } from "react";
import {
    ChevronDown,
    FolderTree,
    PencilLine,
    Plus,
    Power,
    Trash2,
} from "lucide-react";

import styles from "./page.module.scss";
import CategoryModal from "@components/config/CategoryModal/CategoryModal";
import FamilyModal from "@components/config/FamilyModal/FamilyModal";
import DialogModal from "@components/shared/DialogModal/DialogModal";

function sortByName(items = []) {
    return [...items].sort((a, b) => a.name.localeCompare(b.name));
}

function ActionButton({ icon, label, tone = "neutral", onClick }) {
    return (
        <button
            type="button"
            className={`action-button ${
                tone === "danger" ? "action-button--danger" : "action-button--neutral"
            }`}
            onClick={onClick}
            aria-label={label}
            title={label}
        >
            <span className="action-button__icon">{icon}</span>
            <span className="action-button__label">{label}</span>
        </button>
    );
}

function LoadingCards({ count = 4, withSecondaryLine = false }) {
    return (
        <div className={styles.loadingStack}>
            {Array.from({ length: count }).map((_, index) => (
                <div key={index} className={styles.skeletonCard}>
                    <div className={styles.skeletonRow}>
                        <span className={styles.skeletonTitle} />
                        <span className={styles.skeletonBadge} />
                    </div>
                    {withSecondaryLine ? <span className={styles.skeletonLine} /> : null}
                </div>
            ))}
        </div>
    );
}

export default function HierarchyPage() {
    const [families, setFamilies] = useState([]);
    const [categories, setCategories] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const [isCreateFamilyOpen, setIsCreateFamilyOpen] = useState(false);
    const [isCreateCategoryOpen, setIsCreateCategoryOpen] = useState(false);
    const [selectedFamily, setSelectedFamily] = useState(null);
    const [selectedCategory, setSelectedCategory] = useState(null);
    const [createFamilyError, setCreateFamilyError] = useState("");
    const [editFamilyError, setEditFamilyError] = useState("");
    const [createCategoryError, setCreateCategoryError] = useState("");
    const [editCategoryError, setEditCategoryError] = useState("");
    const [expandedFamilyId, setExpandedFamilyId] = useState(null);
    const [expandedCategoryId, setExpandedCategoryId] = useState(null);

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

    async function fetchHierarchy() {
        try {
            setIsLoading(true);

            const [familiesResponse, categoriesResponse] = await Promise.all([
                fetch("/api/families", {
                    method: "GET",
                    cache: "no-store",
                }),
                fetch("/api/categories", {
                    method: "GET",
                    cache: "no-store",
                }),
            ]);

            const [familiesResult, categoriesResult] = await Promise.all([
                familiesResponse.json(),
                categoriesResponse.json(),
            ]);

            if (!familiesResponse.ok || !familiesResult.success) {
                throw new Error(
                    familiesResult.message || "No se pudieron cargar las familias."
                );
            }

            if (!categoriesResponse.ok || !categoriesResult.success) {
                throw new Error(
                    categoriesResult.message || "No se pudieron cargar las categorias."
                );
            }

            setFamilies(familiesResult.data || []);
            setCategories(categoriesResult.data || []);
        } catch (error) {
            console.error(error);

            openMessageDialog({
                variant: "danger",
                title: "Error al cargar la jerarquia",
                message:
                    error.message ||
                    "Ocurrio un problema al cargar familias y categorias.",
            });
        } finally {
            setIsLoading(false);
        }
    }

    useEffect(() => {
        fetchHierarchy();
    }, []);

    const sortedFamilies = useMemo(() => sortByName(families), [families]);
    const sortedCategories = useMemo(() => sortByName(categories), [categories]);

    const familySections = useMemo(() => {
        const categoriesByFamily = new Map();

        sortedCategories.forEach((category) => {
            const familyKey = category.familyId?._id || "unassigned";

            if (!categoriesByFamily.has(familyKey)) {
                categoriesByFamily.set(familyKey, []);
            }

            categoriesByFamily.get(familyKey).push(category);
        });

        return {
            familyCards: sortedFamilies.map((family) => ({
                ...family,
                categories: categoriesByFamily.get(family._id) || [],
            })),
            uncategorized: categoriesByFamily.get("unassigned") || [],
        };
    }, [sortedCategories, sortedFamilies]);

    const visibleCategorySections = useMemo(() => {
        if (!expandedFamilyId) {
            return {
                families: familySections.familyCards,
                uncategorized: familySections.uncategorized,
                showUncategorized: true,
            };
        }

        return {
            families: familySections.familyCards.filter(
                (family) => family._id === expandedFamilyId
            ),
            uncategorized: [],
            showUncategorized: false,
        };
    }, [expandedFamilyId, familySections]);

    function openMessageDialog({
        variant = "info",
        title,
        message,
        confirmText = "Aceptar",
    }) {
        setDialogState({
            open: true,
            variant,
            title,
            message,
            confirmText,
            showCancel: false,
            loading: false,
            onConfirm: () =>
                setDialogState((prev) => ({
                    ...prev,
                    open: false,
                })),
        });
    }

    function toggleFamilyExpansion(familyId) {
        setExpandedFamilyId((prev) => (prev === familyId ? null : familyId));
        setExpandedCategoryId(null);
    }

    function toggleCategoryExpansion(categoryId) {
        setExpandedCategoryId((prev) => (prev === categoryId ? null : categoryId));
    }

    async function handleCreateFamily(formData) {
        try {
            setIsSubmitting(true);
            setCreateFamilyError("");

            const response = await fetch("/api/families", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(formData),
            });

            const result = await response.json();

            if (!response.ok || !result.success) {
                setCreateFamilyError(result.message || "No se pudo crear la familia.");
                return;
            }

            setFamilies((prev) => sortByName([...prev, result.data]));
            setIsCreateFamilyOpen(false);
            setCreateFamilyError("");

            openMessageDialog({
                variant: "success",
                title: "Familia creada",
                message: result.message || "La familia se creo correctamente.",
            });
        } catch (error) {
            console.error(error);
            setCreateFamilyError("");

            openMessageDialog({
                variant: "danger",
                title: "No se pudo crear la familia",
                message: error.message || "Ocurrio un problema al crear la familia.",
                confirmText: "Cerrar",
            });
        } finally {
            setIsSubmitting(false);
        }
    }

    async function handleUpdateFamily(formData) {
        if (!selectedFamily?._id) return;

        try {
            setIsSubmitting(true);
            setEditFamilyError("");

            const response = await fetch(`/api/families/${selectedFamily._id}`, {
                method: "PATCH",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(formData),
            });

            const result = await response.json();

            if (!response.ok || !result.success) {
                setEditFamilyError(result.message || "No se pudo actualizar la familia.");
                return;
            }

            setFamilies((prev) =>
                sortByName(
                    prev.map((family) =>
                        family._id === selectedFamily._id ? result.data : family
                    )
                )
            );
            setSelectedFamily(null);
            setEditFamilyError("");

            openMessageDialog({
                variant: "success",
                title: "Familia actualizada",
                message: result.message || "Los cambios se guardaron correctamente.",
            });
        } catch (error) {
            console.error(error);
            setEditFamilyError("");

            openMessageDialog({
                variant: "danger",
                title: "No se pudo actualizar la familia",
                message:
                    error.message || "Ocurrio un problema al actualizar la familia.",
                confirmText: "Cerrar",
            });
        } finally {
            setIsSubmitting(false);
        }
    }

    function handleDeleteFamily(family) {
        setDialogState({
            open: true,
            variant: "danger",
            title: "Eliminar familia",
            message: `Se eliminara la familia "${family.name}". Esta accion no se puede deshacer.`,
            confirmText: "Eliminar",
            showCancel: true,
            loading: false,
            onConfirm: async () => {
                try {
                    setDialogState((prev) => ({
                        ...prev,
                        loading: true,
                    }));

                    const response = await fetch(`/api/families/${family._id}`, {
                        method: "DELETE",
                    });

                    const result = await response.json();

                    if (!response.ok || !result.success) {
                        throw new Error(result.message || "No se pudo eliminar la familia.");
                    }

                    setFamilies((prev) =>
                        prev.filter((currentFamily) => currentFamily._id !== family._id)
                    );

                    if (expandedFamilyId === family._id) {
                        setExpandedFamilyId(null);
                    }

                    openMessageDialog({
                        variant: "success",
                        title: "Familia eliminada",
                        message: result.message || "La familia fue eliminada correctamente.",
                    });
                } catch (error) {
                    console.error(error);

                    openMessageDialog({
                        variant: "danger",
                        title: "No se pudo eliminar la familia",
                        message:
                            error.message || "Ocurrio un problema al eliminar la familia.",
                        confirmText: "Cerrar",
                    });
                }
            },
        });
    }

    async function handleCreateCategory(formData) {
        try {
            setIsSubmitting(true);
            setCreateCategoryError("");

            const response = await fetch("/api/categories", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(formData),
            });

            const result = await response.json();

            if (!response.ok || !result.success) {
                setCreateCategoryError(result.message || "No se pudo crear la categoria.");
                return;
            }

            setCategories((prev) => sortByName([...prev, result.data]));
            setFamilies((prev) =>
                prev.map((family) =>
                    family._id === result.data.familyId?._id
                        ? {
                              ...family,
                              categoriesCount: (family.categoriesCount || 0) + 1,
                          }
                        : family
                )
            );
            setIsCreateCategoryOpen(false);
            setCreateCategoryError("");

            openMessageDialog({
                variant: "success",
                title: "Categoria creada",
                message: result.message || "La categoria se creo correctamente.",
            });
        } catch (error) {
            console.error(error);
            setCreateCategoryError("");

            openMessageDialog({
                variant: "danger",
                title: "No se pudo crear la categoria",
                message: error.message || "Ocurrio un problema al crear la categoria.",
                confirmText: "Cerrar",
            });
        } finally {
            setIsSubmitting(false);
        }
    }

    async function handleUpdateCategory(formData) {
        if (!selectedCategory?._id) return;

        try {
            setIsSubmitting(true);
            setEditCategoryError("");

            const previousFamilyId = selectedCategory.familyId?._id || null;

            const response = await fetch(`/api/categories/${selectedCategory._id}`, {
                method: "PATCH",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(formData),
            });

            const result = await response.json();

            if (!response.ok || !result.success) {
                setEditCategoryError(result.message || "No se pudo actualizar la categoria.");
                return;
            }

            const nextFamilyId = result.data.familyId?._id || null;

            setCategories((prev) =>
                sortByName(
                    prev.map((category) =>
                        category._id === selectedCategory._id ? result.data : category
                    )
                )
            );
            setFamilies((prev) =>
                prev.map((family) => {
                    let categoriesCount = family.categoriesCount || 0;

                    if (previousFamilyId && family._id === previousFamilyId) {
                        categoriesCount -= 1;
                    }

                    if (nextFamilyId && family._id === nextFamilyId) {
                        categoriesCount += 1;
                    }

                    return {
                        ...family,
                        categoriesCount: Math.max(categoriesCount, 0),
                    };
                })
            );
            setSelectedCategory(null);
            setEditCategoryError("");

            openMessageDialog({
                variant: "success",
                title: "Categoria actualizada",
                message: result.message || "Los cambios se guardaron correctamente.",
            });
        } catch (error) {
            console.error(error);
            setEditCategoryError("");

            openMessageDialog({
                variant: "danger",
                title: "No se pudo actualizar la categoria",
                message:
                    error.message || "Ocurrio un problema al actualizar la categoria.",
                confirmText: "Cerrar",
            });
        } finally {
            setIsSubmitting(false);
        }
    }

    function handleToggleCategory(category) {
        setDialogState({
            open: true,
            variant: category.isActive ? "warning" : "success",
            title: category.isActive ? "Desactivar categoria" : "Activar categoria",
            message: category.isActive
                ? `La categoria "${category.name}" dejara de estar disponible para nuevas asignaciones.`
                : `La categoria "${category.name}" volvera a estar disponible.`,
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
                            result.message || "No se pudo cambiar el estado de la categoria."
                        );
                    }

                    setCategories((prev) =>
                        prev.map((item) =>
                            item._id === category._id ? result.data : item
                        )
                    );

                    openMessageDialog({
                        variant: "success",
                        title: "Estado actualizado",
                        message:
                            result.message ||
                            "El estado de la categoria se actualizo correctamente.",
                    });
                } catch (error) {
                    console.error(error);

                    openMessageDialog({
                        variant: "danger",
                        title: "No se pudo actualizar el estado",
                        message:
                            error.message ||
                            "Ocurrio un problema al cambiar el estado de la categoria.",
                        confirmText: "Cerrar",
                    });
                }
            },
        });
    }

    function handleDeleteCategory(category) {
        setDialogState({
            open: true,
            variant: "danger",
            title: "Eliminar categoria",
            message: `Se eliminara la categoria "${category.name}". Esta accion no se puede deshacer.`,
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
                        throw new Error(result.message || "No se pudo eliminar la categoria.");
                    }

                    setCategories((prev) =>
                        prev.filter((item) => item._id !== category._id)
                    );
                    setFamilies((prev) =>
                        prev.map((family) =>
                            family._id === category.familyId?._id
                                ? {
                                      ...family,
                                      categoriesCount: Math.max(
                                          (family.categoriesCount || 1) - 1,
                                          0
                                      ),
                                  }
                                : family
                        )
                    );

                    if (expandedCategoryId === category._id) {
                        setExpandedCategoryId(null);
                    }

                    openMessageDialog({
                        variant: "success",
                        title: "Categoria eliminada",
                        message:
                            result.message || "La categoria fue eliminada correctamente.",
                    });
                } catch (error) {
                    console.error(error);

                    openMessageDialog({
                        variant: "danger",
                        title: "No se pudo eliminar la categoria",
                        message:
                            error.message || "Ocurrio un problema al eliminar la categoria.",
                        confirmText: "Cerrar",
                    });
                }
            },
        });
    }

    return (
        <>
            <div className="page">
                <section className="hero fadeSlideIn">
                    <div className="heroCopy">
                        <span className="eyebrow">Organizacion de productos</span>
                        <h2 className="title">Jerarquia de productos</h2>
                        <p className="description">
                            Gestiona familias y categorias.
                        </p>
                    </div>

                    <div className="heroStatsCompact">
                        <span className="compactStat">
                            <strong>{families.length}</strong>
                            Familias
                        </span>
                        <span className="compactStat">
                            <strong>{categories.length}</strong>
                            Categorias
                        </span>
                    </div>
                </section>

                <section className={`${styles.toolbar} ${styles.fadeSlideIn} ${styles.delayOne}`}>
                    <button
                        type="button"
                        className="miniAction"
                        onClick={() => setIsCreateFamilyOpen(true)}
                    >
                        <FolderTree size={16} />
                        <span>Nueva familia</span>
                    </button>

                    <button
                        type="button"
                        className="miniAction miniActionPrimary"
                        onClick={() => setIsCreateCategoryOpen(true)}
                    >
                        <Plus size={16} />
                        <span>Nueva categoria</span>
                    </button>
                </section>

                <div className={styles.grid}>
                    <section className={`${styles.panel} ${styles.fadeSlideIn} ${styles.delayTwo}`}>
                        <div className={styles.panelHeader}>
                            <div>
                                <p className={styles.panelEyebrow}>Nivel 1</p>
                                <h3 className={styles.panelTitle}>Familias</h3>
                            </div>
                            <span className={styles.panelMeta}>
                                {families.length} registradas
                            </span>
                        </div>

                        {isLoading ? (
                            <LoadingCards count={4} withSecondaryLine />
                        ) : sortedFamilies.length === 0 ? (
                            <div className={styles.emptyState}>
                                <p className={styles.emptyTitle}>No hay familias registradas</p>
                                <p className={styles.emptyDescription}>
                                    Crea familias como Carnes o Bebidas para agrupar
                                    categorias relacionadas.
                                </p>
                            </div>
                        ) : (
                            <div className={styles.familyList}>
                                {familySections.familyCards.map((family) => {
                                    const isExpanded = expandedFamilyId === family._id;

                                    return (
                                        <article
                                            key={family._id}
                                            className={`${styles.familyCard} ${
                                                isExpanded ? styles.cardExpanded : ""
                                            }`}
                                        >
                                            <button
                                                type="button"
                                                className={styles.cardToggle}
                                                onClick={() => toggleFamilyExpansion(family._id)}
                                            >
                                                <div className={styles.cardSummary}>
                                                    <div className={styles.cardSummaryText}>
                                                        <h4 className={styles.cardTitle}>
                                                            {family.name}
                                                        </h4>
                                                        <p className={styles.cardCountText}>
                                                            {family.categories.length} categorias
                                                        </p>
                                                    </div>

                                                    <ChevronDown
                                                        size={16}
                                                        className={`${styles.chevron} ${
                                                            isExpanded ? styles.chevronOpen : ""
                                                        }`}
                                                    />
                                                </div>
                                            </button>

                                            <div
                                                className={`${styles.cardDetails} ${
                                                    isExpanded ? styles.cardDetailsOpen : ""
                                                }`}
                                            >
                                                <div className={styles.cardDetailsInner}>
                                                    <p className={styles.cardDescription}>
                                                        {family.description ||
                                                            "Sin descripcion registrada."}
                                                    </p>

                                                    {family.categories.length > 0 ? (
                                                        <div className={styles.tagsRow}>
                                                            {family.categories.map((category) => (
                                                                <span
                                                                    key={category._id}
                                                                    className={styles.dataTag}
                                                                >
                                                                    {category.name}
                                                                </span>
                                                            ))}
                                                        </div>
                                                    ) : (
                                                        <span className={styles.emptyChip}>
                                                            Sin categorias asociadas
                                                        </span>
                                                    )}

                                                    <div className={styles.cardActions}>
                                                        <ActionButton
                                                            icon={<PencilLine size={15} />}
                                                            label="Editar"
                                                            onClick={() => setSelectedFamily(family)}
                                                        />
                                                        <ActionButton
                                                            icon={<Trash2 size={15} />}
                                                            label="Eliminar"
                                                            tone="danger"
                                                            onClick={() => handleDeleteFamily(family)}
                                                        />
                                                    </div>
                                                </div>
                                            </div>
                                        </article>
                                    );
                                })}
                            </div>
                        )}
                    </section>

                    <section className={`${styles.panel} ${styles.fadeSlideIn} ${styles.delayThree}`}>
                        <div className={styles.panelHeader}>
                            <div>
                                <p className={styles.panelEyebrow}>Nivel 2</p>
                                <h3 className={styles.panelTitle}>Categorias</h3>
                            </div>
                            <span className={styles.panelMeta}>
                                {expandedFamilyId
                                    ? "Filtradas por familia"
                                    : `${categories.length} registradas`}
                            </span>
                        </div>

                        {isLoading ? (
                            <LoadingCards count={5} />
                        ) : sortedCategories.length === 0 ? (
                            <div className={styles.emptyState}>
                                <p className={styles.emptyTitle}>No hay categorias registradas</p>
                                <p className={styles.emptyDescription}>
                                    Agrega categorias y relaciona cada una con su familia
                                    cuando corresponda.
                                </p>
                            </div>
                        ) : (
                            <div className={styles.categorySections}>
                                {visibleCategorySections.families.map((family) => (
                                    <div key={family._id} className={styles.categorySection}>
                                        <div className={styles.sectionHeader}>
                                            <div className={styles.sectionHeading}>
                                                <FolderTree size={16} />
                                                <h4>{family.name}</h4>
                                            </div>
                                            <span>{family.categories.length}</span>
                                        </div>

                                        {family.categories.length > 0 ? (
                                            <div className={styles.categoryList}>
                                                {family.categories.map((category) => {
                                                    const isExpanded =
                                                        expandedCategoryId === category._id;

                                                    return (
                                                        <article
                                                            key={category._id}
                                                            className={`${styles.categoryCard} ${
                                                                isExpanded ? styles.cardExpanded : ""
                                                            }`}
                                                        >
                                                            <button
                                                                type="button"
                                                                className={styles.cardToggle}
                                                                onClick={() =>
                                                                    toggleCategoryExpansion(category._id)
                                                                }
                                                            >
                                                                <div className={styles.cardSummary}>
                                                                    <div className={styles.cardSummaryText}>
                                                                        <h5 className={styles.cardTitle}>
                                                                            {category.name}
                                                                        </h5>
                                                                    </div>

                                                                    <ChevronDown
                                                                        size={16}
                                                                        className={`${styles.chevron} ${
                                                                            isExpanded
                                                                                ? styles.chevronOpen
                                                                                : ""
                                                                        }`}
                                                                    />
                                                                </div>
                                                            </button>

                                                            <div
                                                                className={`${styles.cardDetails} ${
                                                                    isExpanded
                                                                        ? styles.cardDetailsOpen
                                                                        : ""
                                                                }`}
                                                            >
                                                                <div className={styles.cardDetailsInner}>
                                                                    <div
                                                                        className={
                                                                            styles.categoryMetaRow
                                                                        }
                                                                    >
                                                                        <span
                                                                            className={`${
                                                                                styles.statusBadge
                                                                            } ${
                                                                                category.isActive
                                                                                    ? styles.statusActive
                                                                                    : styles.statusInactive
                                                                            }`}
                                                                        >
                                                                            {category.isActive
                                                                                ? "Activa"
                                                                                : "Inactiva"}
                                                                        </span>
                                                                    </div>

                                                                    <p
                                                                        className={
                                                                            styles.cardDescription
                                                                        }
                                                                    >
                                                                        {category.description ||
                                                                            "Sin descripcion registrada."}
                                                                    </p>

                                                                    <div className={styles.cardActions}>
                                                                        <ActionButton
                                                                            icon={
                                                                                <PencilLine size={15} />
                                                                            }
                                                                            label="Editar"
                                                                            onClick={() =>
                                                                                setSelectedCategory(
                                                                                    category
                                                                                )
                                                                            }
                                                                        />
                                                                        <ActionButton
                                                                            icon={<Power size={15} />}
                                                                            label={
                                                                                category.isActive
                                                                                    ? "Desactivar"
                                                                                    : "Activar"
                                                                            }
                                                                            onClick={() =>
                                                                                handleToggleCategory(
                                                                                    category
                                                                                )
                                                                            }
                                                                        />
                                                                        <ActionButton
                                                                            icon={<Trash2 size={15} />}
                                                                            label="Eliminar"
                                                                            tone="danger"
                                                                            onClick={() =>
                                                                                handleDeleteCategory(
                                                                                    category
                                                                                )
                                                                            }
                                                                        />
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </article>
                                                    );
                                                })}
                                            </div>
                                        ) : (
                                            <div className={styles.inlineEmptyState}>
                                                Esta familia aun no tiene categorias relacionadas.
                                            </div>
                                        )}
                                    </div>
                                ))}

                                {visibleCategorySections.showUncategorized && (
                                    <div className={styles.categorySection}>
                                        <div className={styles.sectionHeader}>
                                            <div className={styles.sectionHeading}>
                                                <FolderTree size={16} />
                                                <h4>Sin familia</h4>
                                            </div>
                                            <span>{visibleCategorySections.uncategorized.length}</span>
                                        </div>

                                        {visibleCategorySections.uncategorized.length > 0 ? (
                                            <div className={styles.categoryList}>
                                                {visibleCategorySections.uncategorized.map(
                                                    (category) => {
                                                        const isExpanded =
                                                            expandedCategoryId === category._id;

                                                        return (
                                                            <article
                                                                key={category._id}
                                                                className={`${styles.categoryCard} ${
                                                                    isExpanded
                                                                        ? styles.cardExpanded
                                                                        : ""
                                                                }`}
                                                            >
                                                                <button
                                                                    type="button"
                                                                    className={styles.cardToggle}
                                                                    onClick={() =>
                                                                        toggleCategoryExpansion(
                                                                            category._id
                                                                        )
                                                                    }
                                                                >
                                                                    <div className={styles.cardSummary}>
                                                                        <div
                                                                            className={
                                                                                styles.cardSummaryText
                                                                            }
                                                                        >
                                                                            <h5
                                                                                className={
                                                                                    styles.cardTitle
                                                                                }
                                                                            >
                                                                                {category.name}
                                                                            </h5>
                                                                        </div>

                                                                        <ChevronDown
                                                                            size={16}
                                                                            className={`${styles.chevron} ${
                                                                                isExpanded
                                                                                    ? styles.chevronOpen
                                                                                    : ""
                                                                            }`}
                                                                        />
                                                                    </div>
                                                                </button>

                                                                <div
                                                                    className={`${styles.cardDetails} ${
                                                                        isExpanded
                                                                            ? styles.cardDetailsOpen
                                                                            : ""
                                                                    }`}
                                                                >
                                                                    <div
                                                                        className={
                                                                            styles.cardDetailsInner
                                                                        }
                                                                    >
                                                                        <div
                                                                            className={
                                                                                styles.categoryMetaRow
                                                                            }
                                                                        >
                                                                            <span
                                                                                className={`${
                                                                                    styles.statusBadge
                                                                                } ${
                                                                                    category.isActive
                                                                                        ? styles.statusActive
                                                                                        : styles.statusInactive
                                                                                }`}
                                                                            >
                                                                                {category.isActive
                                                                                    ? "Activa"
                                                                                    : "Inactiva"}
                                                                            </span>
                                                                        </div>

                                                                        <p
                                                                            className={
                                                                                styles.cardDescription
                                                                            }
                                                                        >
                                                                            {category.description ||
                                                                                "Sin descripcion registrada."}
                                                                        </p>

                                                                        <div className={styles.cardActions}>
                                                                            <ActionButton
                                                                                icon={
                                                                                    <PencilLine size={15} />
                                                                                }
                                                                                label="Editar"
                                                                                onClick={() =>
                                                                                    setSelectedCategory(
                                                                                        category
                                                                                    )
                                                                                }
                                                                            />
                                                                            <ActionButton
                                                                                icon={
                                                                                    <Power size={15} />
                                                                                }
                                                                                label={
                                                                                    category.isActive
                                                                                        ? "Desactivar"
                                                                                        : "Activar"
                                                                                }
                                                                                onClick={() =>
                                                                                    handleToggleCategory(
                                                                                        category
                                                                                    )
                                                                                }
                                                                            />
                                                                            <ActionButton
                                                                                icon={
                                                                                    <Trash2 size={15} />
                                                                                }
                                                                                label="Eliminar"
                                                                                tone="danger"
                                                                                onClick={() =>
                                                                                    handleDeleteCategory(
                                                                                        category
                                                                                    )
                                                                                }
                                                                            />
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            </article>
                                                        );
                                                    }
                                                )}
                                            </div>
                                        ) : (
                                            <div className={styles.inlineEmptyState}>
                                                Todas las categorias ya estan relacionadas con una
                                                familia.
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}
                    </section>
                </div>
            </div>

            <FamilyModal
                open={isCreateFamilyOpen}
                onClose={() => {
                    setIsCreateFamilyOpen(false);
                    setCreateFamilyError("");
                }}
                onSubmit={handleCreateFamily}
                mode="create"
                loading={isSubmitting}
                submitError={createFamilyError}
            />

            <FamilyModal
                open={Boolean(selectedFamily)}
                onClose={() => {
                    setSelectedFamily(null);
                    setEditFamilyError("");
                }}
                onSubmit={handleUpdateFamily}
                mode="edit"
                initialData={selectedFamily}
                loading={isSubmitting}
                submitError={editFamilyError}
            />

            <CategoryModal
                open={isCreateCategoryOpen}
                onClose={() => {
                    setIsCreateCategoryOpen(false);
                    setCreateCategoryError("");
                }}
                onSubmit={handleCreateCategory}
                mode="create"
                families={sortedFamilies}
                loading={isSubmitting}
                submitError={createCategoryError}
            />

            <CategoryModal
                open={Boolean(selectedCategory)}
                onClose={() => {
                    setSelectedCategory(null);
                    setEditCategoryError("");
                }}
                onSubmit={handleUpdateCategory}
                mode="edit"
                initialData={selectedCategory}
                families={sortedFamilies}
                loading={isSubmitting}
                submitError={editCategoryError}
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
