export const INTEGER_QUANTITY_UNITS = ["unit", "package", "box"];
export const MAX_DECIMAL_QUANTITY_PLACES = 2;

export function requiresIntegerQuantity(unit) {
    return INTEGER_QUANTITY_UNITS.includes(String(unit || "").trim());
}

export function getQuantityInputStep(unit) {
    return requiresIntegerQuantity(unit) ? "1" : "0.01";
}

function truncateDecimalPlaces(value, maxDecimalPlaces = MAX_DECIMAL_QUANTITY_PLACES) {
    const textValue = String(value ?? "").trim();
    const [integerPart, decimalPart] = textValue.split(".");

    if (typeof decimalPart === "undefined") {
        return textValue;
    }

    return `${integerPart}.${decimalPart.slice(0, maxDecimalPlaces)}`;
}

function getDecimalPlaces(value) {
    const textValue = String(value ?? "").trim();

    if (!textValue.includes(".")) return 0;

    return textValue.split(".")[1]?.length || 0;
}

export function normalizeQuantityInput(value, unit, { allowZero = true } = {}) {
    const rawValue = String(value ?? "").trim();

    if (!rawValue) return "";

    const numericValue = Number(rawValue);
    if (!Number.isFinite(numericValue)) return "";

    if (!allowZero && numericValue <= 0) return "";
    if (allowZero && numericValue < 0) return "";

    if (requiresIntegerQuantity(unit)) {
        return String(Math.floor(numericValue));
    }

    return truncateDecimalPlaces(rawValue);
}

export function isValidQuantityForUnit(value, unit, { allowZero = false } = {}) {
    const quantity = Number(value);

    if (!Number.isFinite(quantity)) return false;
    if (allowZero ? quantity < 0 : quantity <= 0) return false;

    if (requiresIntegerQuantity(unit) && !Number.isInteger(quantity)) {
        return false;
    }

    if (!requiresIntegerQuantity(unit) && getDecimalPlaces(value) > MAX_DECIMAL_QUANTITY_PLACES) {
        return false;
    }

    return true;
}

export function assertValidQuantityForUnit(value, unit, label = "La cantidad") {
    if (!isValidQuantityForUnit(value, unit)) {
        throw new Error(
            requiresIntegerQuantity(unit)
                ? `${label} debe ser un numero entero para esta unidad.`
                : `${label} debe ser mayor a cero y tener maximo ${MAX_DECIMAL_QUANTITY_PLACES} decimales.`
        );
    }
}

export function formatQuantity(value) {
    const quantity = Number(value || 0);

    if (!Number.isFinite(quantity)) return "0";

    return new Intl.NumberFormat("es-EC", {
        minimumFractionDigits: 0,
        maximumFractionDigits: MAX_DECIMAL_QUANTITY_PLACES,
    }).format(quantity);
}
