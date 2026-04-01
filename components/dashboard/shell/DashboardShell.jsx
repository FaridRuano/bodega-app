"use client";

import { useEffect, useState } from "react";

import styles from "./dashboard-shell.module.scss";
import DashboardSidebar from "../sidebar/DashboardSideBar";
import DashboardTopbar from "../topbar/DashboardTopBar";
import { DashboardUserProvider } from "@context/dashboard-user-context";

export default function DashboardShell({ user, children }) {
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

    function openSidebar() {
        setIsSidebarOpen(true);
    }

    function closeSidebar() {
        setIsSidebarOpen(false);
    }

    useEffect(() => {
        function handleEscape(event) {
            if (event.key === "Escape") {
                setIsSidebarOpen(false);
            }
        }

        window.addEventListener("keydown", handleEscape);

        return () => {
            window.removeEventListener("keydown", handleEscape);
        };
    }, []);

    useEffect(() => {
        if (isSidebarOpen) {
            document.body.style.overflow = "hidden";
        } else {
            document.body.style.overflow = "";
        }

        return () => {
            document.body.style.overflow = "";
        };
    }, [isSidebarOpen]);

    return (
        <DashboardUserProvider user={user}>
            <div
                className={styles.dashboardShell}
                data-collapsed={isSidebarCollapsed ? "true" : "false"}
            >
                <aside className={styles.desktopSidebar}>
                    <DashboardSidebar
                        user={user}
                        collapsed={isSidebarCollapsed}
                        onToggleCollapse={() => setIsSidebarCollapsed((prev) => !prev)}
                    />
                </aside>

                <div className={styles.mainArea}>
                    <header className={styles.topbar}>
                        <DashboardTopbar user={user} onOpenSidebar={openSidebar} />
                    </header>

                    <main className={styles.content}>{children}</main>
                </div>

                <div
                    className={`${styles.mobileSidebarWrapper} ${isSidebarOpen ? styles.mobileSidebarWrapperOpen : ""
                        }`}
                >
                    <button
                        type="button"
                        className={styles.mobileBackdrop}
                        onClick={closeSidebar}
                        aria-label="Cerrar menú"
                    />

                    <div className={styles.mobileSidebarPanel}>
                        {isSidebarOpen && (
                            <DashboardSidebar
                                user={user}
                                isMobile
                                onNavigate={closeSidebar}
                            />
                        )}
                    </div>
                </div>
            </div>
        </DashboardUserProvider>
    );
}