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
    transformation: "Transformacion",
    cutting: "Despiece",
    preparation: "Preparacion",
    portioning: "Porcionado",
};

const DESTINATION_LABELS = {
    kitchen: "Cocina",
    warehouse: "Bodega",
    none: "Sin destino por defecto",
};

function getProductName(product) {
    if (!product) return "-";

    if (typeof product === "string") return product;

    return product.code ? `${product.code} - ${product.name}` : product.name || "-";
}

function getBooleanLabel(value) {
    return value ? "Si" : "No";
}

function getFlowLabel(template) {
    const inputsCount = template.inputs?.length || 0;
    const outputsCount = template.outputs?.length || 0;

    if (inputsCount === 1 && outputsCount === 1) {
        return "1 insumo -> 1 resultado";
    }

    return `${inputsCount} insumos -> ${outputsCount} resultados`;
}

function CompactMeta({ label, value }) {
    return (
        <div className={styles.metaItem}>
            <span className={styles.metaLabel}>{label}</span>
            <span className={styles.metaValue}>{value || "-"}</span>
        </div>
    );
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
                <div className="modal-top">
                    <div className={styles.topBlock}>
                        <div className="modal-headerContent">
                            <div className="modal-icon modal-icon--info">
                                <ClipboardList size={18} />
                            </div>

                            <div className={styles.topCopy}>
                                <div className={styles.badgesRow}>
                                    {template.code ? (
                                        <span className={styles.codeBadge}>{template.code}</span>
                                    ) : null}

                                    <span
                                        className={`${styles.statusBadge} ${isActive ? styles.active : styles.inactive}`}
                                    >
                                        {isActive ? "Activa" : "Inactiva"}
                                    </span>
                                </div>

                                <h3 className="modal-title">
                                    {template.name || "Ficha de produccion"}
                                </h3>
                                <p className="modal-description">
                                    {template.description || "Sin descripcion registrada."}
                                </p>
                            </div>
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
                    <section className={styles.summaryPanel}>
                        <CompactMeta
                            label="Tipo"
                            value={TEMPLATE_TYPE_LABELS[template.type] || template.type}
                        />
                        <CompactMeta
                            label="Base"
                            value={getUnitLabel(template.baseUnit)}
                        />
                        <CompactMeta
                            label="Flujo"
                            value={getFlowLabel(template)}
                        />
                        <CompactMeta
                            label="Destino"
                            value={
                                DESTINATION_LABELS[template.defaultDestination] ||
                                template.defaultDestination
                            }
                        />
                        <CompactMeta
                            label="Gramaje"
                            value={template.requiresWeightControl ? "Controlado" : "Libre"}
                        />
                        <CompactMeta
                            label="Categoria"
                            value={template.category?.name || "-"}
                        />
                    </section>

                    <section className={styles.section}>
                        <div className={styles.sectionHeader}>
                            <h4 className={styles.sectionTitle}>Configuracion</h4>
                        </div>

                        <div className={styles.metaRows}>
                            <CompactMeta
                                label="Rendimiento esperado"
                                value={template.expectedYield ?? "-"}
                            />
                            <CompactMeta
                                label="Merma esperada"
                                value={template.expectedWaste ?? "-"}
                            />
                            <CompactMeta
                                label="Multiples resultados"
                                value={getBooleanLabel(template.allowsMultipleOutputs)}
                            />
                            <CompactMeta
                                label="Registrar desperdicio"
                                value={getBooleanLabel(template.requiresWasteRecord)}
                            />
                            <CompactMeta
                                label="Ajuste real permitido"
                                value={getBooleanLabel(template.allowRealOutputAdjustment)}
                            />
                        </div>

                        {template.notes ? (
                            <div className={styles.notesBlock}>
                                <span className={styles.metaLabel}>Notas</span>
                                <p className={styles.notesText}>{template.notes}</p>
                            </div>
                        ) : null}
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
                                        <div className={styles.itemMain}>
                                            <h5 className={styles.itemTitle}>
                                                {getProductName(item.productId)}
                                            </h5>
                                            <p className={styles.itemSubtitle}>
                                                {item.quantity} {getUnitLabel(item.unit)}
                                            </p>
                                        </div>

                                        <div className={styles.badgesRow}>
                                            {item.isPrimary ? (
                                                <span className={styles.primaryBadge}>Principal</span>
                                            ) : null}
                                        </div>
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
                                        <div className={styles.itemMain}>
                                            <h5 className={styles.itemTitle}>
                                                {getProductName(item.productId)}
                                            </h5>
                                            <p className={styles.itemSubtitle}>
                                                {item.quantity ?? "-"} {getUnitLabel(item.unit)}
                                            </p>
                                        </div>

                                        <div className={styles.badgesRow}>
                                            {item.isMain ? (
                                                <span className={styles.mainBadge}>Principal</span>
                                            ) : null}

                                            {item.isByProduct ? (
                                                <span className={styles.byProductBadge}>
                                                    Subproducto
                                                </span>
                                            ) : null}
                                        </div>
                                    </article>
                                ))
                            ) : (
                                <p className={styles.emptyText}>No hay resultados registrados.</p>
                            )}
                        </div>
                    </section>
                </div>

                <div className={`modal-footer ${styles.footer}`}>
                    <button
                        type="button"
                        className="miniAction"
                        onClick={onEdit}
                        disabled={loading}
                    >
                        <Pencil size={14} />
                        Editar
                    </button>

                    <button
                        type="button"
                        className="miniAction"
                        onClick={onToggleStatus}
                        disabled={loading}
                    >
                        <Power size={14} />
                        {isActive ? "Desactivar" : "Activar"}
                    </button>

                    <button
                        type="button"
                        className="miniAction miniActionDanger"
                        onClick={onDelete}
                        disabled={loading}
                    >
                        <Trash2 size={14} />
                        Eliminar
                    </button>
                </div>
            </div>
        </div>
    );
}
