export const REQUEST_PURPOSE_OPTIONS = [
    {
        value: "daily_operation",
        label: "Operacion diaria",
    },
    {
        value: "preparation",
        label: "Preparacion previa",
    },
    {
        value: "production",
        label: "Produccion",
    },
    {
        value: "other",
        label: "Otros",
    },
];

export const TRANSFER_PURPOSE_OPTIONS = [
    {
        value: "storage",
        label: "Guardar o reubicar",
    },
    {
        value: "space_release",
        label: "Liberar espacio",
    },
    {
        value: "production",
        label: "Produccion",
    },
    {
        value: "daily_operation",
        label: "Operacion diaria",
    },
    {
        value: "unused_stock",
        label: "No se necesita",
    },
    {
        value: "other",
        label: "Otros",
    },
];

const PURPOSE_LABELS = new Map(
    [
        ...REQUEST_PURPOSE_OPTIONS,
        ...TRANSFER_PURPOSE_OPTIONS,
        {
            value: "return_to_warehouse",
            label: "Guardar en bodega",
        },
    ].map((option) => [option.value, option.label])
);

export function getRequestPurposeOptions(flowKind = "request") {
    return flowKind === "transfer"
        ? TRANSFER_PURPOSE_OPTIONS
        : REQUEST_PURPOSE_OPTIONS;
}

export function getPurposeLabel(purpose) {
    return PURPOSE_LABELS.get(purpose) || purpose;
}
