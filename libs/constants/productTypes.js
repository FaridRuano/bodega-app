const PRODUCT_TYPES = [
    "raw_material",
    "processed",
    "prepared",
    "supply",
    "resale"
];

const PRODUCT_TYPE_LABELS = {
    raw_material: "Materia Prima",
    processed: "Procesado",
    prepared: "Preparado",
    supply: "Insumos y Empaques",
    resale: "Producto para Reventa"
};

const PURCHASE_PRODUCT_TYPES = ["raw_material", "supply", "resale"];

function getProductTypeLabel(type) {
    if (!type) return "";
    return PRODUCT_TYPE_LABELS[type] || type;
}

function isPurchaseEligibleProductType(type) {
    return PURCHASE_PRODUCT_TYPES.includes(type);
}

export {
    PRODUCT_TYPES,
    PRODUCT_TYPE_LABELS,
    PURCHASE_PRODUCT_TYPES,
    getProductTypeLabel,
    isPurchaseEligibleProductType,
};
