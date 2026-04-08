export const REQUEST_PURPOSE_OPTIONS = [
    {
        value: "daily_operation",
        label: "Operación diaria",
    },
    {
        value: "preparation",
        label: "Preparación previa",
    },
    {
        value: "production",
        label: "Producción",
    },
    {
        value: "return_to_warehouse",
        label: "Devolución a bodega",
    },
];

export function getPurposeLabel(purpose) {
    return REQUEST_PURPOSE_OPTIONS.find((opt) => opt.value === purpose)?.label || purpose;
}
