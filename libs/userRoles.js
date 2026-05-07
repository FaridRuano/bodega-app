export const USER_ROLES = ["admin", "warehouse", "kitchen", "loung"];

const USER_ROLE_ALIASES = {
    lounge: "loung",
    salon: "loung",
    mesero: "loung",
    waiter: "loung",
};

export function normalizeUserRole(role, fallback = "") {
    const normalized = String(role || "").trim().toLowerCase();

    if (!normalized) {
        return fallback;
    }

    const canonicalRole = USER_ROLE_ALIASES[normalized] || normalized;
    return USER_ROLES.includes(canonicalRole) ? canonicalRole : fallback;
}

export function isValidUserRole(role) {
    return Boolean(normalizeUserRole(role));
}
