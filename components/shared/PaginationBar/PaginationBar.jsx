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

    const normalizedTotalPages = Math.max(totalPages, 1);
    const isSinglePage = normalizedTotalPages <= 1;
    const isPrevDisabled = isSinglePage || page <= 1;
    const isNextDisabled = isSinglePage || page >= normalizedTotalPages;

    return (
        <div className={styles.paginationBar}>
            <div className={styles.paginationInfo}>
                Mostrando <strong>{fromItem}</strong> - <strong>{toItem}</strong> de{" "}
                <strong>{totalItems}</strong> {itemLabel}
            </div>

            <div className={styles.paginationControls}>
                <button
                    type="button"
                    className={`action-button action-button--neutral ${isPrevDisabled ? styles.disabledControl : ""}`}
                    onClick={() => onPageChange?.(Math.max(page - 1, 1))}
                    disabled={isPrevDisabled}
                    aria-label="Pagina anterior"
                >
                    <span className="action-button__icon">
                        <ChevronLeft size={16} />
                    </span>
                    <span className="action-button__label">Anterior</span>
                </button>

                <span className={styles.pageIndicator}>
                    Pagina {page} de {normalizedTotalPages}
                </span>

                <button
                    type="button"
                    className={`action-button action-button--neutral ${isNextDisabled ? styles.disabledControl : ""}`}
                    onClick={() => onPageChange?.(Math.min(page + 1, normalizedTotalPages))}
                    disabled={isNextDisabled}
                    aria-label="Pagina siguiente"
                >
                    <span className="action-button__icon">
                        <ChevronRight size={16} />
                    </span>
                    <span className="action-button__label">Siguiente</span>
                </button>
            </div>
        </div>
    );
}
