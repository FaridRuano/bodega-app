"use client";

import Link from "next/link";
import { signOut } from "next-auth/react";
import { usePathname } from "next/navigation";
import styles from "./dashboard-sidebar.module.scss";

import {
    LayoutGrid,
    Package,
    Factory,
    ArrowRightLeft,
    Boxes,
    SlidersHorizontal,
    ClipboardList,
    History,
    Undo2,
    Truck,
    Inbox,
    LogOut,
    X,
    ChefHat,
} from "lucide-react";

const adminNavigationItems = [
    {
        label: "Resumen",
        href: "/dashboard",
        icon: LayoutGrid,
    },
    {
        label: "Productos",
        href: "/dashboard/products",
        icon: Package,
    },
    {
        label: "Solicitudes",
        href: "/dashboard/requests",
        icon: ClipboardList,
    },
    {
        label: "Producción",
        href: "/dashboard/production",
        icon: Factory,
    },
    {
        label: "Cocina",
        href: "/dashboard/kitchen",
        icon: ChefHat,
    },
    {
        label: "Movimientos",
        href: "/dashboard/movements",
        icon: ArrowRightLeft,
    },
    {
        label: "Inventario",
        href: "/dashboard/inventory",
        icon: Boxes,
    },
    {
        label: "Configuración",
        href: "/dashboard/config",
        icon: SlidersHorizontal,
    },
];

const kitchenNavigationItems = [
    {
        label: "Solicitudes",
        href: "/dashboard/requests",
        icon: ClipboardList,
    },
    {
        label: "Producción",
        href: "/dashboard/production",
        icon: Factory,
    },
    {
        label: "Devoluciones",
        href: "/dashboard/returns",
        icon: Undo2,
    },
    {
        label: "Historial",
        href: "/dashboard/history",
        icon: History,
    },
];

const warehouseNavigationItems = [
    {
        label: "Solicitudes",
        href: "/dashboard/warehouse/requests",
        icon: ClipboardList,
    },
    {
        label: "Entregas",
        href: "/dashboard/warehouse/dispatches",
        icon: Truck,
    },
    {
        label: "Devoluciones",
        href: "/dashboard/warehouse/returns",
        icon: Inbox,
    },
    {
        label: "Movimientos",
        href: "/dashboard/movements",
        icon: ArrowRightLeft,
    },
    {
        label: "Inventario",
        href: "/dashboard/inventory",
        icon: Boxes,
    },
    {
        label: "Historial",
        href: "/dashboard/warehouse/history",
        icon: History,
    },
];

function getNavigationByRole(role) {
    switch (role) {
        case "kitchen":
            return kitchenNavigationItems;

        case "warehouse":
            return warehouseNavigationItems;

        case "admin":
        default:
            return adminNavigationItems;
    }
}

export default function DashboardSidebar({
    user,
    onNavigate,
    isMobile = false,
    collapsed = false,
}) {
    const pathname = usePathname();
    const navigationItems = getNavigationByRole(user?.role);

    function isActiveRoute(href) {
        // caso especial: dashboard raíz
        if (href === "/dashboard") {
            return pathname === "/dashboard";
        }

        return pathname.startsWith(href);
    }

    async function handleSignOut() {
        await signOut({
            callbackUrl: "/login",
        });
    }

    function getRole(role) {
        switch (role) {
            case "admin":
                return "Administrador";
            case "kitchen":
                return "Cocina";
            default:
                return "Usuario";
        }
    }


    return (
        <div
            className={[
                styles.sidebarCard,
                isMobile ? styles.mobileCard : "",
                collapsed ? styles.collapsed : "",
            ].join(" ")}
        >
            <div className={styles.sidebarInner}>
                <div className={styles.topSection}>
                    <div className={styles.brand}>
                        <div className={styles.brandMark}>DF</div>

                        <div className={styles.brandText}>
                            <p className={styles.brandTitle}>Doble Filo</p>
                            <p className={styles.brandSubtitle}>{getRole(user?.role)}</p>
                        </div>

                        {isMobile ? (
                            <button
                                type="button"
                                className={styles.closeButton}
                                onClick={onNavigate}
                                aria-label="Cerrar menú"
                            >
                                <X size={18} />
                            </button>
                        ) : null}
                    </div>
                </div>

                <nav className={styles.nav}>
                    {navigationItems.map((item) => {
                        const Icon = item.icon;
                        const isActive = isActiveRoute(item.href);

                        return (
                            <Link
                                key={item.href}
                                href={item.href}
                                className={`${styles.navItem} ${isActive ? styles.navItemActive : ""}`}
                                onClick={onNavigate}
                                title={collapsed ? item.label : undefined}
                            >
                                <span className={styles.navIcon}>
                                    <Icon size={18} />
                                </span>

                                <span className={styles.navLabel}>{item.label}</span>
                            </Link>
                        );
                    })}
                </nav>

                <div className={styles.footer}>
                    <button
                        type="button"
                        className={styles.logoutButton}
                        onClick={handleSignOut}
                        title={collapsed ? "Cerrar sesión" : undefined}
                    >
                        <LogOut size={17} />
                        <span>Cerrar sesión</span>
                    </button>
                </div>
            </div>
        </div>
    );
}