"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";

import styles from "./config-tabs.module.scss";

const configItems = [
    {
        label: "General",
        href: "/dashboard/config",
    },
    {
        label: "Categorías",
        href: "/dashboard/config/categories",
    },
    {
        label: "Usuarios",
        href: "/dashboard/config/users",
    },
    {
        label: "Fichas de Producción",
        href: "/dashboard/config/productionsheets",
    },
];

export default function ConfigTabs() {
    const pathname = usePathname();

    return (
        <div className={styles.wrapper}>
            <nav className={styles.tabs} aria-label="Navegación de configuración">
                {configItems.map((item) => {
                    const isActive = pathname === item.href;

                    return (
                        <Link
                            key={item.href}
                            href={item.href}
                            className={clsx(styles.tab, isActive && styles.active)}
                        >
                            {item.label}
                        </Link>
                    );
                })}
            </nav>
        </div>
    );
}