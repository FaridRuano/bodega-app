import { auth } from "@auth";
import { hasAnyRole } from "./access";
import { forbidden, unauthorized } from "./apiResponses";
import { normalizeUserRole } from "./userRoles";

export async function getAuthenticatedUser() {
    const session = await auth();
    if (!session?.user) return null;

    return {
        ...session.user,
        role: normalizeUserRole(session.user.role, session.user.role || ""),
    };
}

export async function getAuthenticatedUserId() {
    const session = await auth();
    return session?.user?.id || null;
}

export async function requireAuthenticatedUser() {
    const user = await getAuthenticatedUser();

    if (!user?.id) {
        return {
            user: null,
            response: unauthorized(),
        };
    }

    return {
        user,
        response: null,
    };
}

export async function requireUserRole(allowedRoles = []) {
    const { user, response } = await requireAuthenticatedUser();

    if (response) {
        return {
            user: null,
            response,
        };
    }

    if (!hasAnyRole(user?.role, allowedRoles)) {
        return {
            user,
            response: forbidden(),
        };
    }

    return {
        user,
        response: null,
    };
}
