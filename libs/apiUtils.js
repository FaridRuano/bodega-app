import mongoose from "mongoose";

export function isValidObjectId(value) {
    return mongoose.Types.ObjectId.isValid(value);
}

export function normalizeText(value, maxLength = 300) {
    return String(value || "").trim().slice(0, maxLength);
}

export function normalizeNumber(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : NaN;
}

export function parsePositiveNumber(value, fallback = 1) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
    return parsed;
}