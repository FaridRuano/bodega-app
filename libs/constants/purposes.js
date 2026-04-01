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
    }
];

export function getPurposeLabel(purpose) {
    return REQUEST_PURPOSE_OPTIONS.find((opt) => opt.value === purpose)?.label || purpose;
}
