export const USER_ROLES = ["admin", "warehouse", "kitchen"];

export const ACCESS_RULES = [
    { pattern: "/dashboard/config", roles: ["admin"] },
    { pattern: "/dashboard/products", roles: ["admin", "warehouse"] },
    { pattern: "/dashboard/inventory", roles: ["admin", "warehouse"] },
    { pattern: "/dashboard/kitchen", roles: ["admin", "kitchen"] },
    { pattern: "/dashboard/movements", roles: ["admin", "warehouse"] },
    { pattern: "/dashboard/production", roles: ["admin", "kitchen"] },
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
            return "Administrador";
        case "warehouse":
            return "Bodega";
        case "kitchen":
            return "Cocina";
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
