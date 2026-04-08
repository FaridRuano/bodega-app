"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Box,
  Plus,
  Search,
  Tag,
  ThermometerSnowflake,
} from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";


import styles from "./page.module.scss";
import ProductModal from "@components/products/ProductModal/ProductModal";
import ProductViewModal from "@components/products/ProductViewModal/ProductViewModal";
import DialogModal from "@components/shared/DialogModal/DialogModal";
import PaginationBar from "@components/shared/PaginationBar/PaginationBar";
import { getUnitLabel } from "@libs/constants/units";
import { PAGE_LIMITS } from "@libs/constants/pagination";
import { buildSearchParams, getPositiveIntParam, getStringParam } from "@libs/urlParams";

const PAGE_SIZE = PAGE_LIMITS.products;

const PRODUCT_TYPE_LABELS = {
  raw_material: "Materia prima",
  processed: "Procesado",
  prepared: "Preparado",
  supply: "Insumo",
};

const STORAGE_TYPE_LABELS = {
  ambient: "Ambiente",
  refrigerated: "Refrigerado",
  frozen: "Congelado",
};

function formatNumber(value) {
  const numericValue = Number(value || 0);

  if (Number.isInteger(numericValue)) {
    return String(numericValue);
  }

  return numericValue.toFixed(2);
}

export default function ProductsPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  const [search, setSearch] = useState(() => getStringParam(searchParams, "search"));
  const [categoryFilter, setCategoryFilter] = useState(() => getStringParam(searchParams, "categoryId"));
  const [statusFilter, setStatusFilter] = useState(() => getStringParam(searchParams, "status", "all"));
  const [typeFilter, setTypeFilter] = useState(() => getStringParam(searchParams, "productType", "all"));
  const [page, setPage] = useState(() => getPositiveIntParam(searchParams, "page", 1));

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [viewedProduct, setViewedProduct] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const totalProducts = products.length;
  const activeProducts = products.filter((product) => product.isActive).length;

  const [dialogState, setDialogState] = useState({
    open: false,
    variant: "info",
    title: "",
    message: "",
    confirmText: "Aceptar",
    showCancel: false,
    loading: false,
    onConfirm: null,
  });

  async function fetchProducts() {
    const response = await fetch("/api/products", {
      method: "GET",
      cache: "no-store",
    });

    const result = await response.json();

    if (!response.ok || !result.success) {
      throw new Error(result.message || "No se pudieron obtener los productos.");
    }

    return result.data || [];
  }

  async function fetchCategories() {
    const response = await fetch("/api/categories", {
      method: "GET",
      cache: "no-store",
    });

    const result = await response.json();

    if (!response.ok || !result.success) {
      throw new Error(result.message || "No se pudieron obtener las categorías.");
    }

    return result.data || [];
  }

  async function loadInitialData() {
    try {
      setIsLoading(true);

      const [productsData, categoriesData] = await Promise.all([
        fetchProducts(),
        fetchCategories(),
      ]);

      setProducts(productsData);
      setCategories(categoriesData.filter((category) => category.isActive));
    } catch (error) {
      console.error(error);

      setDialogState({
        open: true,
        variant: "danger",
        title: "Error al cargar productos",
        message:
          error.message || "Ocurrió un problema al cargar la información.",
        confirmText: "Cerrar",
        showCancel: false,
        loading: false,
        onConfirm: () =>
          setDialogState((prev) => ({
            ...prev,
            open: false,
          })),
      });
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadInitialData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setPage(1);
  }, [search, categoryFilter, statusFilter, typeFilter]);

  useEffect(() => {
    const nextQuery = buildSearchParams(searchParams, {
      search: search.trim() || null,
      categoryId: categoryFilter || null,
      status: statusFilter !== "all" ? statusFilter : null,
      productType: typeFilter !== "all" ? typeFilter : null,
      page: page > 1 ? page : null,
    });

    if (nextQuery !== searchParams.toString()) {
      router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname, { scroll: false });
    }
  }, [categoryFilter, page, pathname, router, search, searchParams, statusFilter, typeFilter]);

  const filteredProducts = useMemo(() => {
    const searchValue = search.trim().toLowerCase();

    return [...products]
      .filter((product) => {
        const matchesSearch =
          !searchValue ||
          product.name?.toLowerCase().includes(searchValue) ||
          product.code?.toLowerCase().includes(searchValue) ||
          product.categoryName?.toLowerCase().includes(searchValue);

        const matchesCategory =
          !categoryFilter || product.category?._id === categoryFilter;

        const matchesStatus =
          statusFilter === "all" ||
          (statusFilter === "active" && product.isActive) ||
          (statusFilter === "inactive" && !product.isActive);

        const matchesType =
          typeFilter === "all" || product.productType === typeFilter;

        return (
          matchesSearch &&
          matchesCategory &&
          matchesStatus &&
          matchesType
        );
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [products, search, categoryFilter, statusFilter, typeFilter]);

  const paginatedProducts = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filteredProducts.slice(start, start + PAGE_SIZE);
  }, [filteredProducts, page]);

  async function refreshViewedProduct(productId) {
    const response = await fetch(`/api/products/${productId}`, {
      method: "GET",
      cache: "no-store",
    });

    const result = await response.json();

    if (!response.ok || !result.success) {
      throw new Error(result.message || "No se pudo actualizar el producto.");
    }

    return result.data;
  }

  async function handleCreateProduct(formData) {
    try {
      setIsSubmitting(true);

      const response = await fetch("/api/products", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(formData),
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.message || "No se pudo crear el producto.");
      }

      setProducts((prev) => [result.data, ...prev]);
      setIsCreateOpen(false);

      setDialogState({
        open: true,
        variant: "success",
        title: "Producto creado",
        message: result.message || "El producto se creó correctamente.",
        confirmText: "Aceptar",
        showCancel: false,
        loading: false,
        onConfirm: () =>
          setDialogState((prev) => ({
            ...prev,
            open: false,
          })),
      });
    } catch (error) {
      console.error(error);

      setDialogState({
        open: true,
        variant: "danger",
        title: "No se pudo crear el producto",
        message: error.message || "Ocurrió un problema al crear el producto.",
        confirmText: "Cerrar",
        showCancel: false,
        loading: false,
        onConfirm: () =>
          setDialogState((prev) => ({
            ...prev,
            open: false,
          })),
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleOpenEdit(product) {
    setViewedProduct(null);
    setSelectedProduct(product);
  }

  async function handleUpdateProduct(formData) {
    if (!selectedProduct?._id) return;

    try {
      setIsSubmitting(true);

      const response = await fetch(`/api/products/${selectedProduct._id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(formData),
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.message || "No se pudo actualizar el producto.");
      }

      setProducts((prev) =>
        prev.map((product) =>
          product._id === selectedProduct._id ? result.data : product
        )
      );

      setSelectedProduct(null);

      setDialogState({
        open: true,
        variant: "success",
        title: "Producto actualizado",
        message: result.message || "Los cambios del producto fueron guardados.",
        confirmText: "Aceptar",
        showCancel: false,
        loading: false,
        onConfirm: () =>
          setDialogState((prev) => ({
            ...prev,
            open: false,
          })),
      });
    } catch (error) {
      console.error(error);

      setDialogState({
        open: true,
        variant: "danger",
        title: "No se pudo actualizar el producto",
        message:
          error.message || "Ocurrió un problema al actualizar el producto.",
        confirmText: "Cerrar",
        showCancel: false,
        loading: false,
        onConfirm: () =>
          setDialogState((prev) => ({
            ...prev,
            open: false,
          })),
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleOpenView(product) {
    try {
      const freshProduct = await refreshViewedProduct(product._id);
      setViewedProduct(freshProduct);
    } catch (error) {
      console.error(error);

      setDialogState({
        open: true,
        variant: "danger",
        title: "No se pudo abrir el producto",
        message:
          error.message || "Ocurrió un problema al cargar el detalle del producto.",
        confirmText: "Cerrar",
        showCancel: false,
        loading: false,
        onConfirm: () =>
          setDialogState((prev) => ({
            ...prev,
            open: false,
          })),
      });
    }
  }

  function handleToggleProduct(product) {
    setDialogState({
      open: true,
      variant: product.isActive ? "warning" : "success",
      title: product.isActive ? "Desactivar producto" : "Activar producto",
      message: product.isActive
        ? `El producto "${product.name}" dejará de estar disponible en el sistema.`
        : `El producto "${product.name}" volverá a estar disponible.`,
      confirmText: product.isActive ? "Desactivar" : "Activar",
      showCancel: true,
      loading: false,
      onConfirm: async () => {
        try {
          setDialogState((prev) => ({
            ...prev,
            loading: true,
          }));

          const response = await fetch(`/api/products/${product._id}`, {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              isActive: !product.isActive,
            }),
          });

          const result = await response.json();

          if (!response.ok || !result.success) {
            throw new Error(
              result.message || "No se pudo cambiar el estado del producto."
            );
          }

          setProducts((prev) =>
            prev.map((item) =>
              item._id === product._id ? result.data : item
            )
          );

          if (viewedProduct?._id === product._id) {
            setViewedProduct(result.data);
          }

          setDialogState({
            open: true,
            variant: "success",
            title: "Estado actualizado",
            message:
              result.message ||
              "El estado del producto se actualizó correctamente.",
            confirmText: "Aceptar",
            showCancel: false,
            loading: false,
            onConfirm: () =>
              setDialogState((prev) => ({
                ...prev,
                open: false,
              })),
          });
        } catch (error) {
          console.error(error);

          setDialogState({
            open: true,
            variant: "danger",
            title: "No se pudo actualizar el estado",
            message:
              error.message ||
              "Ocurrió un problema al cambiar el estado del producto.",
            confirmText: "Cerrar",
            showCancel: false,
            loading: false,
            onConfirm: () =>
              setDialogState((prev) => ({
                ...prev,
                open: false,
              })),
          });
        }
      },
    });
  }

  function handleDeleteProduct(product) {
    setDialogState({
      open: true,
      variant: "danger",
      title: "Eliminar producto",
      message: `Se eliminará el producto "${product.name}". Esta acción no se puede deshacer.`,
      confirmText: "Eliminar",
      showCancel: true,
      loading: false,
      onConfirm: async () => {
        try {
          setDialogState((prev) => ({
            ...prev,
            loading: true,
          }));

          const response = await fetch(`/api/products/${product._id}`, {
            method: "DELETE",
          });

          const result = await response.json();

          if (!response.ok || !result.success) {
            throw new Error(result.message || "No se pudo eliminar el producto.");
          }

          setProducts((prev) =>
            prev.filter((item) => item._id !== product._id)
          );

          if (viewedProduct?._id === product._id) {
            setViewedProduct(null);
          }

          setDialogState({
            open: true,
            variant: "success",
            title: "Producto eliminado",
            message: result.message || "El producto fue eliminado correctamente.",
            confirmText: "Aceptar",
            showCancel: false,
            loading: false,
            onConfirm: () =>
              setDialogState((prev) => ({
                ...prev,
                open: false,
              })),
          });
        } catch (error) {
          console.error(error);

          setDialogState({
            open: true,
            variant: "danger",
            title: "No se pudo eliminar el producto",
            message:
              error.message || "Ocurrió un problema al eliminar el producto.",
            confirmText: "Cerrar",
            showCancel: false,
            loading: false,
            onConfirm: () =>
              setDialogState((prev) => ({
                ...prev,
                open: false,
              })),
          });
        }
      },
    });
  }

  return (
    <>
      <div className={styles.page}>
        <div className={styles.headerRow}>
          <div className={styles.statsGroup}>
            <div className={styles.statCard}>
              <span className={styles.statLabel}>Total productos</span>
              <strong className={styles.statValue}>{totalProducts}</strong>
            </div>

            <div className={`${styles.statCard} ${styles.positive}`}>
              <span className={styles.statLabel}>Productos activos</span>
              <strong className={styles.statValue}>{activeProducts}</strong>
            </div>
          </div>

          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setIsCreateOpen(true)}
          >
            <Plus size={16} />
            Nuevo producto
          </button>
        </div>

        <div className={styles.filtersCard}>
          <div className={styles.searchField}>
            <Search size={16} />
            <input
              type="text"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar por nombre, código o categoría"
              className={styles.searchInput}
            />
          </div>

          <div className={styles.filtersGrid}>
            <select
              value={categoryFilter}
              onChange={(event) => setCategoryFilter(event.target.value)}
              className={styles.filterSelect}
            >
              <option value="">Todas las categorías</option>
              {categories.map((category) => (
                <option key={category._id} value={category._id}>
                  {category.name}
                </option>
              ))}
            </select>

            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className={styles.filterSelect}
            >
              <option value="all">Todos los estados</option>
              <option value="active">Activos</option>
              <option value="inactive">Inactivos</option>
            </select>

            <select
              value={typeFilter}
              onChange={(event) => setTypeFilter(event.target.value)}
              className={styles.filterSelect}
            >
              <option value="all">Todos los tipos</option>
              <option value="raw_material">Materia prima</option>
              <option value="processed">Procesado</option>
              <option value="prepared">Preparado</option>
              <option value="supply">Insumo</option>
            </select>
          </div>
        </div>

        {isLoading ? (
          <div className={styles.emptyState}>
            <p className={styles.emptyTitle}>Cargando productos...</p>
          </div>
        ) : filteredProducts.length === 0 ? (
          <div className={styles.emptyState}>
            <p className={styles.emptyTitle}>No se encontraron productos</p>
            <p className={styles.emptyDescription}>
              Ajusta los filtros o crea un nuevo producto para comenzar.
            </p>
          </div>
        ) : (
          <div className={styles.list}>
            {paginatedProducts.map((product) => (
              <button
                key={product._id}
                type="button"
                className={styles.card}
                onClick={() => handleOpenView(product)}
              >
                <div className={styles.cardTop}>
                  <div className={styles.cardMain}>
                    <div className={styles.titleLine}>
                      <h3 className={styles.cardTitle}>{product.name}</h3>

                      <span
                        className={`${styles.statusBadge} ${product.isActive
                          ? styles.statusActive
                          : styles.statusInactive
                          }`}
                      >
                        {product.isActive ? "Activo" : "Inactivo"}
                      </span>
                    </div>

                    <p className={styles.cardDescription}>
                      {product.description || "Sin descripción registrada."}
                    </p>
                  </div>

                  <div className={styles.inventoryBlock}>
                    <span className={styles.inventoryLabel}>Disponible</span>
                    <strong className={styles.inventoryValue}>
                      {formatNumber(product.inventory?.available)}
                    </strong>
                  </div>
                </div>

                <div className={styles.cardMeta}>
                  <span className={styles.metaPill}>
                    <Tag size={14} />
                    {product.category?.name || product.categoryName || "Sin categoría"}
                  </span>

                  <span className={styles.metaPill}>
                    <Box size={14} />
                    {getUnitLabel(product.unit)}
                  </span>

                  <span className={styles.metaPill}>
                    {PRODUCT_TYPE_LABELS[product.productType] || product.productType}
                  </span>

                  <span className={styles.metaPill}>
                    <ThermometerSnowflake size={14} />
                    {STORAGE_TYPE_LABELS[product.storageType] || product.storageType}
                  </span>
                </div>

                <div className={styles.cardFooter}>
                  <div className={styles.footerStats}>
                    <span className={styles.footerStat}>
                      Bodega: {formatNumber(product.inventory?.warehouse)}
                    </span>
                    <span className={styles.footerStat}>
                      Cocina: {formatNumber(product.inventory?.kitchen)}
                    </span>
                    <span className={styles.footerStat}>
                      Mínimo: {formatNumber(product.minStock)}
                    </span>
                  </div>

                  <span className={styles.viewHint}>Ver detalle</span>
                </div>
              </button>
            ))}
          </div>
        )}

        <PaginationBar
          page={page}
          totalPages={Math.max(Math.ceil(filteredProducts.length / PAGE_SIZE), 1)}
          totalItems={filteredProducts.length}
          fromItem={filteredProducts.length === 0 ? 0 : (page - 1) * PAGE_SIZE + 1}
          toItem={filteredProducts.length === 0 ? 0 : Math.min(page * PAGE_SIZE, filteredProducts.length)}
          itemLabel="productos"
          onPageChange={setPage}
        />
      </div>

      <ProductModal
        open={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        onSubmit={handleCreateProduct}
        mode="create"
        categories={categories}
        loading={isSubmitting}
      />

      <ProductModal
        open={Boolean(selectedProduct)}
        onClose={() => setSelectedProduct(null)}
        onSubmit={handleUpdateProduct}
        mode="edit"
        initialData={selectedProduct}
        categories={categories}
        loading={isSubmitting}
      />

      <ProductViewModal
        open={Boolean(viewedProduct)}
        product={viewedProduct}
        loading={isSubmitting}
        onClose={() => setViewedProduct(null)}
        onEdit={handleOpenEdit}
        onDelete={handleDeleteProduct}
        onToggleActive={handleToggleProduct}
      />

      <DialogModal
        open={dialogState.open}
        variant={dialogState.variant}
        title={dialogState.title}
        message={dialogState.message}
        confirmText={dialogState.confirmText}
        cancelText="Cancelar"
        showCancel={dialogState.showCancel}
        loading={dialogState.loading}
        onConfirm={dialogState.onConfirm}
        onClose={() =>
          setDialogState((prev) => ({
            ...prev,
            open: false,
            loading: false,
          }))
        }
      />
    </>
  );
}
