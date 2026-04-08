import { auth } from "@/auth";
import ConfigTabs from "@components/config/ConfigTabs/ConfigTabs";
import styles from "./page.module.scss";
import { redirect } from "next/navigation";

export default async function ConfigLayout({ children }) {
    const session = await auth();

    if (!session?.user) {
        redirect("/login");
    }

    if (session.user.role !== "admin") {
        redirect("/dashboard");
    }

    return (
        <div className={styles.container}>
            <ConfigTabs />
            <div className={styles.content}>{children}</div>
        </div>
    );
}
