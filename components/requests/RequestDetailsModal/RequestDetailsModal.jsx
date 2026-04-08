"use client";

import { useEffect, useMemo } from "react";
import {
    ArrowRightLeft,
    CheckCircle2,
    ClipboardList,
    Clock3,
    PackageCheck,
    Truck,
    X,
    XCircle,
} from "lucide-react";

import styles from "./request-details-modal.module.scss";
import { getUnitLabel } from "@libs/constants/units";
import { getPurposeLabel } from "@libs/constants/purposes";
import { getRequestTypeLabel } from "@libs/constants/domainLabels";

const STATUS_CONFIG = {
    pending: {
        label: "Pendiente",
        className: styles.statusPending,
        icon: Clock3,
    },
    approved: {
        label: "Aprobada",
        className: styles.statusApproved,
        icon: CheckCircle2,
    },
    partially_fulfilled: {
        label: "Parcialmente atendida",
        className: styles.statusPartial,
        icon: Truck,
    },
    fulfilled: {
        label: "Completada",
        className: styles.statusFulfilled,
        icon: PackageCheck,
    },
    rejected: {
        label: "Rechazada",
        className: styles.statusRejected,
        icon: XCircle,
    },
    cancelled: {
        label: "Cancelada",
        className: styles.statusCancelled,
        icon: XCircle,
    },
};

function formatDate(date) {
    if (!date) return "—";

    try {
        return new Intl.DateTimeFormat("es-EC", {
            dateStyle: "medium",
            timeStyle: "short",
        }).format(new Date(date));
    } catch {
        return "—";
    }
}

function getPersonLabel(user) {
    return user || "—";
}

function toNumber(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
}

function getActivityTitle(activity) {
    if (activity?.title) return activity.title;

    switch (activity?.type) {
        case "request_created":
            return "Solicitud creada";
        case "approved":
            return "Solicitud aprobada";
        case "dispatch":
            return "Despacho registrado";
        case "receive":
            return "Recepción registrada";
        case "rejected":
            return "Solicitud rechazada";
        case "cancelled":
            return "Solicitud cancelada";
        case "edited":
            return "Solicitud editada";
        default:
            return "Movimiento registrado";
    }
}

export default function RequestDetailsModal({
    open,
    request,
    currentUserRole,
    onClose,
    onApprove,
    onReject,
    onDispatch,
    onReceive,
    onEdit,
    onCancel,
}) {
    useEffect(() => {
        function handleEscape(event) {
            if (event.key === "Escape" && open) {
                onClose();
            }
        }

        window.addEventListener("keydown", handleEscape);

        return () => {
            window.removeEventListener("keydown", handleEscape);
        };
    }, [open, onClose]);

    const summary = useMemo(() => {
        const items = request?.items || [];

        const totals = items.reduce(
            (acc, item) => {
                const requested = toNumber(item.requestedQuantity);
                const approved = toNumber(item.approvedQuantity);
                const dispatched = toNumber(item.dispatchedQuantity);
                const received = toNumber(item.receivedQuantity);

                acc.requested += requested;
                acc.approved += approved;
                acc.dispatched += dispatched;
                acc.received += received;

                return acc;
            },
            {
                requested: 0,
                approved: 0,
                dispatched: 0,
                received: 0,
            }
        );

        const pendingDispatch = Math.max(totals.approved - totals.dispatched, 0);
        const pendingReceive = Math.max(totals.dispatched - totals.received, 0);
        const pendingCompletion = Math.max(totals.approved - totals.received, 0);

        const hasApprovedItems = totals.approved > 0;

        const isFullyReceived =
            hasApprovedItems &&
            pendingCompletion === 0 &&
            totals.received >= totals.approved;

        return {
            ...totals,
            pendingDispatch,
            pendingReceive,
            pendingCompletion,
            isFullyReceived,
        };
    }, [request]);

    const sortedActivityLog = useMemo(() => {
        return [...(request?.activityLog || [])].sort((a, b) => {
            const first = new Date(a?.performedAt || 0).getTime();
            const second = new Date(b?.performedAt || 0).getTime();
            return first - second;
        });
    }, [request]);

    const latestActivity = useMemo(() => {
        if (!sortedActivityLog.length) return null;
        return sortedActivityLog[sortedActivityLog.length - 1];
    }, [sortedActivityLog]);

    if (!open || !request) return null;

    const statusConfig = STATUS_CONFIG[request.status] || STATUS_CONFIG.pending;
    const StatusIcon = statusConfig.icon;

    const isAdmin = currentUserRole === "admin";
    const isWarehouse = currentUserRole === "warehouse";
    const isKitchen = currentUserRole === "kitchen";
    const isFinal =
        request.status === "fulfilled" ||
        request.status === "rejected" ||
        request.status === "cancelled";

    const isReturnRequest = request.requestType === "return";
    const canApprove =
        !isReturnRequest && (isAdmin || isWarehouse) && request.status === "pending";
    const canReject =
        !isReturnRequest && (isAdmin || isWarehouse) && request.status === "pending";
    const canEdit = (isAdmin || isKitchen) && request.status === "pending";

    const canDispatch =
        (isReturnRequest ? (isAdmin || isKitchen) : (isAdmin || isWarehouse)) &&
        !isFinal &&
        (
            isReturnRequest
                ? ["pending", "partially_fulfilled"].includes(request.status)
                : ["approved", "partially_fulfilled"].includes(request.status)
        ) &&
        summary.pendingDispatch > 0;

    const canReceive =
        (isReturnRequest ? (isAdmin || isWarehouse) : (isAdmin || isKitchen)) &&
        !isFinal &&
        (
            isReturnRequest
                ? ["pending", "partially_fulfilled"].includes(request.status)
                : ["approved", "partially_fulfilled"].includes(request.status)
        ) &&
        summary.pendingReceive > 0;

    const canCancel =
        !isFinal &&
        summary.dispatched === 0 &&
        (
            ((isAdmin || isKitchen) && request.status === "pending") ||
            ((isAdmin || isWarehouse) &&
                !isReturnRequest &&
                ["pending", "approved"].includes(request.status))
        );

    const showFooter =
        canEdit || canReject || canApprove || canDispatch || canReceive || canCancel;

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div
                className="modal-container modal-container--xl"
                onClick={(event) => event.stopPropagation()}
            >
                <div className="modal-header">
                    <div className="modal-headerContent">
                        <div className="modal-icon modal-icon--info">
                            <ClipboardList size={20} />
                        </div>

                        <div>
                            <h2 className="modal-title">Detalle de solicitud</h2>
                            <p className="modal-description">
                                Revisa el estado, los productos solicitados y el historial de la
                                solicitud.
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

                <div className="modal-body">
                    <div className={styles.summaryCard}>
                        <div className={styles.summaryHeader}>
                            <div>
                                <p className={styles.requestNumber}>
                                    {request.requestNumber || "Solicitud"}
                                </p>

                                <div className={styles.metaRow}>
                                    <span className={styles.requestType}>
                                        {getRequestTypeLabel(request.requestType)}
                                    </span>

                                    <span
                                        className={`${styles.statusBadge} ${statusConfig.className}`}
                                    >
                                        <StatusIcon size={14} />
                                        {statusConfig.label}
                                    </span>
                                </div>
                            </div>

                            <div className={styles.locationChip}>
                                <ArrowRightLeft size={16} />
                                <span>
                                    {request.sourceLocation === "warehouse" ? "Bodega" : "Cocina"}{" "}
                                    →{" "}
                                    {request.destinationLocation === "warehouse"
                                        ? "Bodega"
                                        : "Cocina"}
                                </span>
                            </div>
                        </div>

                        <div className={styles.infoGrid}>
                            <div className={styles.infoItem}>
                                <span className={styles.infoLabel}>Solicitado por</span>
                                <strong className={styles.infoValue}>
                                    {getPersonLabel(request.requestedBy)}
                                </strong>
                            </div>

                            <div className={styles.infoItem}>
                                <span className={styles.infoLabel}>Fecha de solicitud</span>
                                <strong className={styles.infoValue}>
                                    {formatDate(request.requestedAt || request.createdAt)}
                                </strong>
                            </div>

                            <div className={styles.infoItem}>
                                <span className={styles.infoLabel}>Aprobado por</span>
                                <strong className={styles.infoValue}>
                                    {getPersonLabel(request.approvedBy)}
                                </strong>
                            </div>

                            <div className={styles.infoItem}>
                                <span className={styles.infoLabel}>Última acción</span>
                                <strong className={styles.infoValue}>
                                    {latestActivity
                                        ? `${getActivityTitle(latestActivity)} · ${getPersonLabel(
                                            latestActivity.performedBy
                                        )}`
                                        : "—"}
                                </strong>
                            </div>

                            <div className={styles.infoItem}>
                                <span className={styles.infoLabel}>Última actualización</span>
                                <strong className={styles.infoValue}>
                                    {formatDate(request.updatedAt)}
                                </strong>
                            </div>

                            <div className={styles.infoItem}>
                                <span className={styles.infoLabel}>Pendiente por despachar</span>
                                <strong className={styles.infoValue}>
                                    {summary.pendingDispatch}
                                </strong>
                            </div>
                        </div>

                        {(request.justification || request.notes || request.statusReason) && (
                            <div className={styles.notesGrid}>
                                {request.justification ? (
                                    <div className={styles.noteBlock}>
                                        <span className={styles.noteTitle}>Justificación</span>
                                        <p className={styles.noteText}>
                                            {getPurposeLabel(request.justification)}
                                        </p>
                                    </div>
                                ) : null}

                                {request.notes ? (
                                    <div className={styles.noteBlock}>
                                        <span className={styles.noteTitle}>Notas</span>
                                        <p className={styles.noteText}>{request.notes}</p>
                                    </div>
                                ) : null}

                                {request.statusReason ? (
                                    <div className={styles.noteBlock}>
                                        <span className={styles.noteTitle}>Motivo de estado</span>
                                        <p className={styles.noteText}>{request.statusReason}</p>
                                    </div>
                                ) : null}
                            </div>
                        )}
                    </div>

                    <div className={styles.itemsCard}>
                        <div className={styles.sectionHeader}>
                            <h3 className={styles.sectionTitle}>Productos solicitados</h3>
                            <span className={styles.sectionCount}>
                                {request.items?.length || 0} item(s)
                            </span>
                        </div>

                        <div className={styles.itemsList}>
                            {(request.items || []).map((item) => {
                                const requested = toNumber(item.requestedQuantity);
                                const approved = toNumber(item.approvedQuantity);
                                const dispatched = toNumber(item.dispatchedQuantity);
                                const received = toNumber(item.receivedQuantity);

                                return (
                                    <article key={item._id} className={styles.itemRow}>
                                        <div className={styles.itemMain}>
                                            <div>
                                                <p className={styles.itemName}>
                                                    {item.product?.name || "Producto"}
                                                </p>
                                                <p className={styles.itemMeta}>
                                                    {item.product?.code || "Sin código"} ·{" "}
                                                    {getUnitLabel(
                                                        item.unitSnapshot || item.product?.unit
                                                    )}
                                                </p>
                                            </div>
                                        </div>

                                        <div className={styles.quantitiesGrid}>
                                            <div className={styles.quantityBox}>
                                                <span>Solicitado</span>
                                                <strong>{requested}</strong>
                                            </div>

                                            <div className={styles.quantityBox}>
                                                <span>Aprobado</span>
                                                <strong>{approved}</strong>
                                            </div>

                                            <div className={styles.quantityBox}>
                                                <span>Despachado</span>
                                                <strong>{dispatched}</strong>
                                            </div>

                                            <div className={styles.quantityBox}>
                                                <span>Recibido</span>
                                                <strong>{received}</strong>
                                            </div>
                                        </div>

                                        {item.notes ? (
                                            <p className={styles.itemNote}>{item.notes}</p>
                                        ) : null}
                                    </article>
                                );
                            })}
                        </div>
                    </div>

                    <div className={styles.timelineCard}>
                        <div className={styles.sectionHeader}>
                            <h3 className={styles.sectionTitle}>Historial</h3>
                        </div>

                        <div className={styles.timeline}>
                            {sortedActivityLog.length === 0 ? (
                                <div className={styles.timelineItem}>
                                    <div className={styles.timelineDot} />
                                    <div>
                                        <p className={styles.timelineTitle}>
                                            No hay historial disponible
                                        </p>
                                        <p className={styles.timelineMeta}>
                                            Aún no se registran movimientos.
                                        </p>
                                    </div>
                                </div>
                            ) : (
                                sortedActivityLog.map((activity) => (
                                    <div key={activity._id} className={styles.timelineItem}>
                                        <div className={`${styles.timelineDot} ${activity.type === "request_created"
                                            ? styles.positive
                                            : ["cancelled", "rejected"].includes(activity.type)
                                                ? styles.negative
                                                : ""
                                            }`} />

                                        <div style={{ width: "100%" }}>
                                            <div
                                                style={{
                                                    display: "flex",
                                                    justifyContent: "space-between",
                                                    gap: 8,
                                                    alignItems: "center",
                                                }}
                                            >
                                                <p className={styles.timelineTitle}>
                                                    {getActivityTitle(activity)}
                                                </p>

                                                <span
                                                    style={{
                                                        fontSize: 12,
                                                        opacity: 0.7,
                                                        whiteSpace: "nowrap",
                                                    }}
                                                >
                                                    {getPersonLabel(activity.performedBy)}
                                                </span>
                                            </div>

                                            <p className={styles.timelineMeta}>
                                                {formatDate(activity.performedAt)}
                                            </p>

                                            {activity.description ? (
                                                <p className={styles.noteText}>
                                                    {activity.description}
                                                </p>
                                            ) : null}
                                        </div>
                                    </div>
                                )
                                )
                            )}
                        </div>
                    </div>
                </div>

                {showFooter ? (
                    <div className="modal-footer">
                        {canEdit ? (
                            <button
                                type="button"
                                className="btn btn-secondary"
                                onClick={onEdit}
                            >
                                Editar
                            </button>
                        ) : null}

                        {canReject ? (
                            <button
                                type="button"
                                className="btn btn-secondary"
                                onClick={onReject}
                            >
                                Rechazar
                            </button>
                        ) : null}

                        {canApprove ? (
                            <button
                                type="button"
                                className="btn btn-primary"
                                onClick={onApprove}
                            >
                                Aprobar
                            </button>
                        ) : null}

                        {canDispatch ? (
                            <button
                                type="button"
                                className="btn btn-primary"
                                onClick={onDispatch}
                            >
                                {isReturnRequest ? "Despachar devolución" : "Despachar"}
                            </button>
                        ) : null}

                        {canReceive ? (
                            <button
                                type="button"
                                className="btn btn-primary"
                                onClick={onReceive}
                            >
                                {isReturnRequest ? "Confirmar ingreso en bodega" : "Confirmar recepción"}
                            </button>
                        ) : null}

                        {canCancel ? (
                            <button
                                type="button"
                                className="btn btn-secondary"
                                onClick={onCancel}
                            >
                                Cancelar solicitud
                            </button>
                        ) : null}
                    </div>
                ) : null}
            </div>
        </div>
    );
}
