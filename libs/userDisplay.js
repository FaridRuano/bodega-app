export function getUserDisplayName(user, fallback = "Usuario") {
    if (!user) return fallback;

    if (typeof user === "string") {
        const normalized = user.trim();
        return normalized || fallback;
    }

    const fullName = [user.firstName, user.lastName]
        .map((value) => String(value || "").trim())
        .filter(Boolean)
        .join(" ")
        .trim();

    if (fullName) return fullName;

    const username = String(user.username || "").trim();
    if (username) return username;

    const email = String(user.email || "").trim();
    if (email) return email;

    const name = String(user.name || "").trim();
    if (name) return name;

    return fallback;
}
