import { USER_ROLES, normalizeUserRole } from "@libs/userRoles";

export const ACCESS_RULES = [
    { pattern: "/dashboard/config", roles: ["admin"] },
    { pattern: "/dashboard/products", roles: ["admin", "manager", "warehouse"] },
    { pattern: "/dashboard/inventory", roles: ["admin", "manager", "warehouse", "kitchen", "loung"] },
    { pattern: "/dashboard/kitchen", roles: ["admin", "manager", "kitchen"] },
    { pattern: "/dashboard/lounge", roles: ["admin", "manager", "loung"] },
    { pattern: "/dashboard/movements", roles: ["admin", "manager", "warehouse"] },
    { pattern: "/dashboard/notifications", roles: ["admin", "manager", "warehouse", "kitchen", "loung"] },
    { pattern: "/dashboard/receiving", roles: ["warehouse", "kitchen", "loung"] },
    { pattern: "/dashboard/daily-control", roles: ["admin", "manager", "kitchen", "loung"] },
    { pattern: "/dashboard/production", roles: ["admin", "manager", "kitchen"] },
    { pattern: "/dashboard/purchases/history", roles: ["admin", "manager"] },
    { pattern: "/dashboard/purchases", roles: ["admin", "manager", "warehouse", "kitchen", "loung"] },
];

export function isValidRole(role) {
    return USER_ROLES.includes(normalizeUserRole(role));
}

export function hasAnyRole(userRole, allowedRoles = []) {
    if (!allowedRoles.length) {
        return true;
    }

    const normalizedRole = normalizeUserRole(userRole);
    return allowedRoles.map((role) => normalizeUserRole(role)).includes(normalizedRole);
}

export function getRoleLabel(role) {
    switch (normalizeUserRole(role)) {
        case "admin":
            return "Sistema";
        case "manager":
            return "Manager";
        case "warehouse":
            return "Bodeguero";
        case "kitchen":
            return "Chef";
        case "loung":
            return "Mesero";
        default:
            return "Usuario";
    }
}

export function getAccessRuleForPath(pathname = "") {
    const normalizedPath = String(pathname || "").trim();

    return (
        ACCESS_RULES.find((rule) => {
            if (normalizedPath === rule.pattern) {
                return true;
            }

            return normalizedPath.startsWith(`${rule.pattern}/`);
        }) || null
    );
}

export function canAccessPath(userRole, pathname = "") {
    const rule = getAccessRuleForPath(pathname);

    if (!rule) {
        return true;
    }

    return hasAnyRole(userRole, rule.roles);
}
