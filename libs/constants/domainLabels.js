export const LOCATION_LABELS = {
    warehouse: "Bodega",
    kitchen: "Cocina",
    production: "Producción",
    system: "Sistema",
};

export const MOVEMENT_TYPE_LABELS = {
    adjustment_in: "Ajuste de entrada",
    adjustment_out: "Ajuste de salida",
    waste: "Merma",
    transfer: "Transferencia",
    request_dispatch: "Despacho de solicitud",
    request_return: "Retorno de solicitud",
    production_consumption: "Consumo de producción",
    production_output: "Salida de producción",
    purchase_entry: "Ingreso por compra",
};

export const REQUEST_TYPE_LABELS = {
    operation: "Operación",
    production: "Producción",
    return: "Devolución",
};

export const REQUEST_STATUS_LABELS = {
    pending: "Pendiente",
    approved: "Aprobada",
    partially_fulfilled: "Parcialmente atendida",
    fulfilled: "Completada",
    rejected: "Rechazada",
    cancelled: "Cancelada",
};

export const PRODUCT_TYPE_LABELS = {
    raw_material: "Materia prima",
    processed: "Procesado",
    prepared: "Preparado",
    supply: "Insumo",
};

export const STORAGE_TYPE_LABELS = {
    ambient: "Ambiente",
    refrigerated: "Refrigerado",
    frozen: "Congelado",
};

export const INVENTORY_STATUS_LABELS = {
    ok: "Disponible",
    low: "Stock bajo",
    warning: "Reposición",
    out: "Sin stock",
    inactive: "Inactivo",
    no_tracking: "Sin seguimiento",
};

export const REFERENCE_TYPE_LABELS = {
    purchase_entry: "Compra",
    request: "Solicitud",
    production: "Producción",
    manual_adjustment: "Ajuste manual",
    system: "Sistema",
};

export function getLabel(map, value, fallback = "—") {
    if (!value) return fallback;
    return map[value] || value;
}

export function getLocationLabel(value, fallback = "Sistema") {
    return getLabel(LOCATION_LABELS, value, fallback);
}

export function getMovementTypeLabel(value, fallback = "Movimiento") {
    return getLabel(MOVEMENT_TYPE_LABELS, value, fallback);
}

export function getRequestTypeLabel(value, fallback = "Solicitud") {
    return getLabel(REQUEST_TYPE_LABELS, value, fallback);
}

export function getRequestStatusLabel(value, fallback = "Estado") {
    return getLabel(REQUEST_STATUS_LABELS, value, fallback);
}

export function getProductTypeLabel(value, fallback = "Tipo") {
    return getLabel(PRODUCT_TYPE_LABELS, value, fallback);
}

export function getStorageTypeLabel(value, fallback = "Almacenamiento") {
    return getLabel(STORAGE_TYPE_LABELS, value, fallback);
}

export function getInventoryStatusLabel(value, fallback = "Disponible") {
    return getLabel(INVENTORY_STATUS_LABELS, value, fallback);
}

export function getReferenceTypeLabel(value, fallback = "Sistema") {
    return getLabel(REFERENCE_TYPE_LABELS, value, fallback);
}
