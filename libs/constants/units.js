export const UNIT_LABELS = {
    unit: "Unidad",
    kg: "Kilogramo",
    g: "Gramo",
    lb: "Libra",
    l: "Litro",
    ml: "Mililitro",
    package: "Paquete",
    box: "Caja",
};

export const UNIT_VALUES = Object.keys(UNIT_LABELS);

export function getUnitLabel(unit) {
    return UNIT_LABELS[unit] || unit;
}

export const PRODUCT_UNIT_OPTIONS = Object.entries(UNIT_LABELS).map(
    ([value, label]) => ({
        value,
        label,
    })
);