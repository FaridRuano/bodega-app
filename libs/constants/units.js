export const PRODUCT_UNITS = [
    "unit",
    "kg",
    "g",
    "lb",
    "l",
    "ml",
    "package",
    "box",
];

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

export const PRODUCTION_BASE_UNITS = ["unit", "kg"];

export function getUnitLabel(unit) {
    return UNIT_LABELS[unit] || unit;
}

export const PRODUCT_UNIT_OPTIONS = Object.entries(UNIT_LABELS).map(
    ([value, label]) => ({
        value,
        label,
    })
);

export const PRODUCTION_BASE_UNIT_OPTIONS = PRODUCTION_BASE_UNITS.map((value) => ({
    value,
    label: getUnitLabel(value),
}));
