import { getRequestStatusLabel } from "@libs/constants/domainLabels";
import { PRODUCTION_STATUS_LABELS } from "@libs/constants/productionStatus";

export function formatDate(value) {
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

export function formatQuantity(value) {
    return new Intl.NumberFormat("es-EC", {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
    }).format(Number(value || 0));
}

export function getRequestDate(request) {
    return request?.requestedAt || request?.updatedAt || request?.createdAt || null;
}

export function buildRequestPurpose(request) {
    return request?.justification || request?.notes || "Solicitud operativa";
}

export function getRequestSummaryLabel(request) {
    return `${getRequestStatusLabel(request.status)} · ${buildRequestPurpose(request)}`;
}

export function getProductionSummaryLabel(production) {
    const templateName = production?.templateSnapshot?.name || "Sin plantilla";
    const statusLabel =
        PRODUCTION_STATUS_LABELS[production?.status] || production?.status || "Sin estado";

    return `${templateName} · ${statusLabel}`;
}
