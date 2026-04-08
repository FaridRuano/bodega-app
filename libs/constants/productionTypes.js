export const PRODUCTION_TEMPLATE_TYPES = [
    "transformation",
    "cutting",
    "preparation",
    "portioning",
];

export const getProductionTypeLabel = (type) => {
    switch (type) {
        case "transformation":
            return "Transformación";
        case "cutting":
            return "Corte";
        case "preparation":
            return "Preparación";
        case "portioning":
            return "Porcionado";
        default:
            return "Desconocido";
    }
}