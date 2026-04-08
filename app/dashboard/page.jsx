"use client";

import { useEffect, useState } from "react";

import styles from "./page.module.scss";
import { useDashboardUser } from "@context/dashboard-user-context";
import AdminDashboard from "@components/dashboard/AdminDashboard/AdminDashboard";
import WarehouseDashboard from "@components/dashboard/WarehouseDashboard/WarehouseDashboard";
import KitchenDashboard from "@components/dashboard/KitchenDashboard/KitchenDashboard";

export default function DashboardPage() {
    const user = useDashboardUser();
    const [inventoryItems, setInventoryItems] = useState([]);
    const [requests, setRequests] = useState([]);
    const [productions, setProductions] = useState([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        let ignore = false;

        async function loadData() {
            try {
                setIsLoading(true);

                const [inventoryResponse, requestsResponse, productionsResponse] = await Promise.all([
                    fetch("/api/inventory", { cache: "no-store" }),
                    fetch("/api/requests", { cache: "no-store" }),
                    fetch("/api/productions", { cache: "no-store" }),
                ]);

                const [inventoryResult, requestsResult, productionsResult] = await Promise.all([
                    inventoryResponse.json(),
                    requestsResponse.json(),
                    productionsResponse.json(),
                ]);

                if (!ignore) {
                    setInventoryItems(Array.isArray(inventoryResult?.data) ? inventoryResult.data : []);
                    setRequests(Array.isArray(requestsResult?.data) ? requestsResult.data : []);
                    setProductions(
                        Array.isArray(productionsResult?.data?.items)
                            ? productionsResult.data.items
                            : []
                    );
                }
            } catch (error) {
                console.error("[DASHBOARD_PAGE_LOAD_ERROR]", error);

                if (!ignore) {
                    setInventoryItems([]);
                    setRequests([]);
                    setProductions([]);
                }
            } finally {
                if (!ignore) {
                    setIsLoading(false);
                }
            }
        }

        loadData();

        return () => {
            ignore = true;
        };
    }, []);

    if (isLoading) {
        return <section className={styles.loadingState}>Cargando dashboard...</section>;
    }

    if (user?.role === "kitchen") {
        return (
            <section className={styles.wrapper}>
                <KitchenDashboard
                    inventoryItems={inventoryItems}
                    requests={requests}
                    productions={productions}
                />
            </section>
        );
    }

    if (user?.role === "warehouse") {
        return (
            <section className={styles.wrapper}>
                <WarehouseDashboard inventoryItems={inventoryItems} requests={requests} />
            </section>
        );
    }

    if (user?.role === "admin") {
        return (
            <section className={styles.wrapper}>
                <AdminDashboard
                    inventoryItems={inventoryItems}
                    requests={requests}
                    productions={productions}
                />
            </section>
        );
    }

    return (
        <section className={styles.loadingState}>
            No se pudo cargar el rol del usuario.
        </section>
    );
}
