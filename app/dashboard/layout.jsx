import { auth } from "@/auth";
import DashboardShell from "@components/dashboard/shell/DashboardShell";
import { redirect } from "next/navigation";
import { normalizeUserRole } from "@libs/userRoles";


export default async function DashboardLayout({ children }) {
    const session = await auth();

    if (!session?.user) {
        redirect("/login");
    }

    return (
        <DashboardShell
            user={{
                ...session.user,
                role: normalizeUserRole(session.user.role, session.user.role || ""),
            }}
        >
            {children}
        </DashboardShell>
    );
}
