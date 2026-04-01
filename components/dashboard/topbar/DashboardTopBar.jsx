"use client";

import { Menu, Bell } from "lucide-react";
import { usePathname } from "next/navigation";
import styles from "./dashboard-topbar.module.scss";

const routeTitles = {
  "/dashboard": { eyebrow: "Panel de control", title: "Resumen" },
  "/dashboard/products": { eyebrow: "Inventario", title: "Productos" },
  "/dashboard/inventory": { eyebrow: "Bodega", title: "Inventario" },
  "/dashboard/movements": { eyebrow: "Auditoría", title: "Movimientos" },
  "/dashboard/config": { eyebrow: "Sistema", title: "Configuración" },
  "/dashboard/config/users": { eyebrow: "Sistema", title: "Usuarios" },
  "/dashboard/config/categories": { eyebrow: "Sistema", title: "Categorías" },
  "/dashboard/requests": { eyebrow: "Módulo", title: "Solicitudes" },
  "/dashboard/production": { eyebrow: "Módulo", title: "Producción" },
  "/dashboard/kitchen": { eyebrow: "Módulo", title: "Cocina" },
};

function getRouteInfo(pathname) {
  if (routeTitles[pathname]) {
    return routeTitles[pathname];
  }

  const match = Object.keys(routeTitles).find((route) =>
    pathname.startsWith(route)
  );

  return routeTitles[match] || {
    eyebrow: "Panel",
    title: "Dashboard",
  };
}

export default function DashboardTopbar({ user, onOpenSidebar }) {
  const pathname = usePathname();
  const { eyebrow, title } = getRouteInfo(pathname);

  return (
    <div className={styles.topbarCard}>
      <div className={styles.leftGroup}>
        <button
          type="button"
          className={styles.menuButton}
          onClick={onOpenSidebar}
          aria-label="Abrir menú"
        >
          <Menu size={20} />
        </button>

        <div>
          <p className={styles.eyebrow}>{eyebrow}</p>
          <h1 className={styles.title}>{title}</h1>
        </div>
      </div>

      <div className={styles.rightGroup}>
        <button
          type="button"
          className={styles.iconButton}
          aria-label="Notificaciones"
        >
          <Bell size={18} />
        </button>

      </div>
    </div>
  );
}