"use client";

import { useEffect } from "react";
import {
    ClipboardList,
    Pencil,
    Power,
    Trash2,
    X,
} from "lucide-react";

import { getUnitLabel } from "@libs/constants/units";
import styles from "./production-template-review.module.scss";

const TEMPLATE_TYPE_LABELS = {
    transformation: "Transformación",
    cutting: "Despiece",
    preparation: "Preparación",
    portioning: "Porcionado",
};

const DESTINATION_LABELS = {
    kitchen: "Cocina",
    warehouse: "Bodega",
    none: "Sin destino por defecto",
};

function getProductName(product) {
    if (!product) return "—";

    if (typeof product === "string") return product;

    return product.code ? `${product.code} - ${product.name}` : product.name || "—";
}

function getBooleanLabel(value) {
    return value ? "Sí" : "No";
}

export default function ProductionTemplateReviewModal({
    open,
    onClose,
    onEdit,
    onToggleStatus,
    onDelete,
    template = null,
    loading = false,
}) {
    useEffect(() => {
        function handleEscape(event) {
            if (event.key === "Escape") {
                onClose();
            }
        }

        window.addEventListener("keydown", handleEscape);
        return () => window.removeEventListener("keydown", handleEscape);
    }, [onClose]);

    if (!open || !template) return null;

    const isActive = Boolean(template.isActive);

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div
                className={`modal-container modal-container--xl ${styles.modalContainer}`}
                onClick={(event) => event.stopPropagation()}
            >
                <div className="modal-header">
                    <div className="modal-headerContent">
                        <div className="modal-icon modal-icon--info">
                            <ClipboardList size={20} />
                        </div>

                        <div>
                            <h3 className="modal-title">
                                {template.name || "Ficha de producción"}
                            </h3>
                            <p className="modal-description">
                                Revisa toda la configuración de la ficha antes de editarla,
                                desactivarla o eliminarla.
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

                <div className={`modal-body ${styles.modalBody}`}>
                    <section className={styles.heroSection}>
                        <div className={styles.heroMain}>
                            <div className={styles.badgesRow}>
                                {template.code ? (
                                    <span className={styles.codeBadge}>{template.code}</span>
                                ) : null}

                                <span
                                    className={`${styles.statusBadge} ${isActive ? styles.active : styles.inactive
                                        }`}
                                >
                                    {isActive ? "Activa" : "Inactiva"}
                                </span>
                            </div>

                            <h4 className={styles.heroTitle}>{template.name || "Sin nombre"}</h4>

                            {template.description ? (
                                <p className={styles.heroDescription}>{template.description}</p>
                            ) : (
                                <p className={styles.heroDescriptionMuted}>
                                    Esta ficha no tiene descripción registrada.
                                </p>
                            )}
                        </div>
                    </section>

                    <section className={styles.section}>
                        <div className={styles.sectionHeader}>
                            <h4 className={styles.sectionTitle}>Información general</h4>
                        </div>

                        <div className={styles.metaGrid}>
                            <div className={styles.metaItem}>
                                <span className={styles.metaLabel}>Categoría</span>
                                <span className={styles.metaValue}>
                                    {template.category?.name || "—"}
                                </span>
                            </div>

                            <div className={styles.metaItem}>
                                <span className={styles.metaLabel}>Tipo</span>
                                <span className={styles.metaValue}>
                                    {TEMPLATE_TYPE_LABELS[template.type] || template.type || "—"}
                                </span>
                            </div>

                            <div className={styles.metaItem}>
                                <span className={styles.metaLabel}>Unidad base</span>
                                <span className={styles.metaValue}>
                                    {getUnitLabel(template.baseUnit)}
                                </span>
                            </div>

                            <div className={styles.metaItem}>
                                <span className={styles.metaLabel}>Destino por defecto</span>
                                <span className={styles.metaValue}>
                                    {DESTINATION_LABELS[template.defaultDestination] ||
                                        template.defaultDestination ||
                                        "—"}
                                </span>
                            </div>

                            <div className={styles.metaItem}>
                                <span className={styles.metaLabel}>Rendimiento esperado</span>
                                <span className={styles.metaValue}>
                                    {template.expectedYield ?? "—"}
                                </span>
                            </div>

                            <div className={styles.metaItem}>
                                <span className={styles.metaLabel}>Merma esperada</span>
                                <span className={styles.metaValue}>
                                    {template.expectedWaste ?? "—"}
                                </span>
                            </div>
                        </div>
                    </section>

                    <section className={styles.section}>
                        <div className={styles.sectionHeader}>
                            <h4 className={styles.sectionTitle}>Configuración operativa</h4>
                        </div>

                        <div className={styles.toggleSummaryGrid}>
                            <div className={styles.toggleSummaryCard}>
                                <span className={styles.metaLabel}>Múltiples resultados</span>
                                <span className={styles.metaValue}>
                                    {getBooleanLabel(template.allowsMultipleOutputs)}
                                </span>
                            </div>

                            <div className={styles.toggleSummaryCard}>
                                <span className={styles.metaLabel}>Registrar merma</span>
                                <span className={styles.metaValue}>
                                    {getBooleanLabel(template.requiresWasteRecord)}
                                </span>
                            </div>

                            <div className={styles.toggleSummaryCard}>
                                <span className={styles.metaLabel}>Ajuste real permitido</span>
                                <span className={styles.metaValue}>
                                    {getBooleanLabel(template.allowRealOutputAdjustment)}
                                </span>
                            </div>

                            <div className={styles.toggleSummaryCard}>
                                <span className={styles.metaLabel}>Estado</span>
                                <span className={styles.metaValue}>
                                    {isActive ? "Activa" : "Inactiva"}
                                </span>
                            </div>
                        </div>

                        <div className={styles.notesBlock}>
                            <span className={styles.metaLabel}>Notas</span>
                            <p className={styles.notesText}>
                                {template.notes || "Sin notas registradas."}
                            </p>
                        </div>
                    </section>

                    <section className={styles.section}>
                        <div className={styles.sectionHeader}>
                            <h4 className={styles.sectionTitle}>Insumos</h4>
                            <span className={styles.counterBadge}>
                                {template.inputs?.length || 0}
                            </span>
                        </div>

                        <div className={styles.listGroup}>
                            {template.inputs?.length ? (
                                template.inputs.map((item, index) => (
                                    <article key={item._id || index} className={styles.itemCard}>
                                        <div className={styles.itemHeader}>
                                            <div>
                                                <h5 className={styles.itemTitle}>
                                                    {getProductName(item.productId)}
                                                </h5>
                                                <p className={styles.itemSubtitle}>
                                                    {item.quantity} {getUnitLabel(item.unit)}
                                                </p>
                                            </div>

                                            {item.isPrimary ? (
                                                <span className={styles.primaryBadge}>Principal</span>
                                            ) : null}
                                        </div>

                                        {item.notes ? (
                                            <p className={styles.itemNotes}>{item.notes}</p>
                                        ) : null}
                                    </article>
                                ))
                            ) : (
                                <p className={styles.emptyText}>No hay insumos registrados.</p>
                            )}
                        </div>
                    </section>

                    <section className={styles.section}>
                        <div className={styles.sectionHeader}>
                            <h4 className={styles.sectionTitle}>Resultados</h4>
                            <span className={styles.counterBadge}>
                                {template.outputs?.length || 0}
                            </span>
                        </div>

                        <div className={styles.listGroup}>
                            {template.outputs?.length ? (
                                template.outputs.map((item, index) => (
                                    <article key={item._id || index} className={styles.itemCard}>
                                        <div className={styles.itemHeader}>
                                            <div>
                                                <h5 className={styles.itemTitle}>
                                                    {getProductName(item.productId)}
                                                </h5>
                                                <p className={styles.itemSubtitle}>
                                                    {item.quantity} {getUnitLabel(item.unit)}
                                                </p>
                                            </div>

                                            <div className={styles.badgesRow}>
                                                {item.isMain ? (
                                                    <span className={styles.mainBadge}>Principal</span>
                                                ) : null}

                                                {item.isWaste ? (
                                                    <span className={styles.wasteBadge}>Merma</span>
                                                ) : null}

                                                {item.isByProduct ? (
                                                    <span className={styles.byProductBadge}>
                                                        Subproducto
                                                    </span>
                                                ) : null}
                                            </div>
                                        </div>

                                        {item.notes ? (
                                            <p className={styles.itemNotes}>{item.notes}</p>
                                        ) : null}
                                    </article>
                                ))
                            ) : (
                                <p className={styles.emptyText}>No hay resultados registrados.</p>
                            )}
                        </div>
                    </section>

                    <section className={styles.section}>
                        <div className={styles.sectionHeader}>
                            <h4 className={styles.sectionTitle}>Auditoría</h4>
                        </div>

                        <div className={styles.metaGrid}>
                            <div className={styles.metaItem}>
                                <span className={styles.metaLabel}>Creado por</span>
                                <span className={styles.metaValue}>
                                    {template.createdBy || "—"}
                                </span>
                            </div>

                            <div className={styles.metaItem}>
                                <span className={styles.metaLabel}>Actualizado por</span>
                                <span className={styles.metaValue}>
                                    {template.updatedBy || "—"}
                                </span>
                            </div>

                            <div className={styles.metaItem}>
                                <span className={styles.metaLabel}>Fecha de creación</span>
                                <span className={styles.metaValue}>
                                    {template.createdAt
                                        ? new Date(template.createdAt).toLocaleString()
                                        : "—"}
                                </span>
                            </div>

                            <div className={styles.metaItem}>
                                <span className={styles.metaLabel}>Última actualización</span>
                                <span className={styles.metaValue}>
                                    {template.updatedAt
                                        ? new Date(template.updatedAt).toLocaleString()
                                        : "—"}
                                </span>
                            </div>
                        </div>
                    </section>
                </div>

                <div className="modal-footer">
                    <button
                        type="button"
                        className="btn btn-neutral"
                        onClick={onEdit}
                        disabled={loading}
                    >
                        <Pencil size={16} />
                        Editar
                    </button>

                    <button
                        type="button"
                        className="btn btn-ghost"
                        onClick={onToggleStatus}
                        disabled={loading}
                    >
                        <Power size={16} />
                        {isActive ? "Desactivar" : "Activar"}
                    </button>

                    <button
                        type="button"
                        className="btn btn-danger"
                        onClick={onDelete}
                        disabled={loading}
                    >
                        <Trash2 size={16} />
                        Eliminar
                    </button>
                </div>
            </div>
        </div>
    );
}