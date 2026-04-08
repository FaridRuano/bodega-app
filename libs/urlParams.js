export function getStringParam(searchParams, key, fallback = "") {
    return searchParams?.get?.(key) || fallback;
}

export function getPositiveIntParam(searchParams, key, fallback = 1) {
    const rawValue = searchParams?.get?.(key);
    const parsed = Number(rawValue);

    if (!Number.isFinite(parsed) || parsed <= 0) {
        return fallback;
    }

    return Math.floor(parsed);
}

export function buildSearchParams(searchParams, updates = {}) {
    const params = new URLSearchParams(searchParams?.toString?.() || "");

    Object.entries(updates).forEach(([key, value]) => {
        const shouldDelete =
            value === undefined ||
            value === null ||
            value === "" ||
            value === false;

        if (shouldDelete) {
            params.delete(key);
            return;
        }

        params.set(key, String(value));
    });

    return params.toString();
}
