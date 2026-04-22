export const USER_ROLES = ["admin", "warehouse", "kitchen", "lounge"];

export const ACCESS_RULES = [
    { pattern: "/dashboard/config", roles: ["admin"] },
    { pattern: "/dashboard/products", roles: ["admin", "warehouse"] },
    { pattern: "/dashboard/inventory", roles: ["admin", "warehouse", "kitchen", "lounge"] },
    { pattern: "/dashboard/kitchen", roles: ["admin", "kitchen"] },
    { pattern: "/dashboard/lounge", roles: ["admin", "lounge"] },
    { pattern: "/dashboard/movements", roles: ["admin", "warehouse"] },
    { pattern: "/dashboard/notifications", roles: ["admin", "warehouse", "kitchen", "lounge"] },
    { pattern: "/dashboard/receiving", roles: ["warehouse", "kitchen", "lounge"] },
    { pattern: "/dashboard/daily-control", roles: ["admin", "kitchen", "lounge"] },
    { pattern: "/dashboard/production", roles: ["admin", "kitchen"] },
    { pattern: "/dashboard/purchases/history", roles: ["admin"] },
    { pattern: "/dashboard/purchase-requests", roles: ["admin", "warehouse", "kitchen", "lounge"] },
    { pattern: "/dashboard/purchases", roles: ["admin", "warehouse", "kitchen", "lounge"] },
];

export function isValidRole(role) {
    return USER_ROLES.includes(role);
}

export function hasAnyRole(userRole, allowedRoles = []) {
    if (!allowedRoles.length) {
        return true;
    }

    return allowedRoles.includes(userRole);
}

export function getRoleLabel(role) {
    switch (role) {
        case "admin":
            return "Sistema";
        case "warehouse":
            return "Bodeguero";
        case "kitchen":
            return "Chef";
        case "lounge":
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
