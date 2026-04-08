"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import styles from "./pagination-bar.module.scss";

export default function PaginationBar({
    page = 1,
    totalPages = 1,
    totalItems = 0,
    fromItem = 0,
    toItem = 0,
    itemLabel = "elementos",
    onPageChange,
}) {
    if (totalItems <= 0) return null;

    return (
        <div className={styles.paginationBar}>
            <div className={styles.paginationInfo}>
                Mostrando <strong>{fromItem}</strong> - <strong>{toItem}</strong> de{" "}
                <strong>{totalItems}</strong> {itemLabel}
            </div>

            <div className={styles.paginationControls}>
                <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => onPageChange?.(Math.max(page - 1, 1))}
                    disabled={page <= 1}
                >
                    <ChevronLeft size={16} />
                    Anterior
                </button>

                <span className={styles.pageIndicator}>
                    Página {page} de {Math.max(totalPages, 1)}
                </span>

                <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => onPageChange?.(Math.min(page + 1, Math.max(totalPages, 1)))}
                    disabled={page >= totalPages}
                >
                    Siguiente
                    <ChevronRight size={16} />
                </button>
            </div>
        </div>
    );
}
