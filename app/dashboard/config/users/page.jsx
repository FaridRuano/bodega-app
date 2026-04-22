"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ChevronDown,
  PencilLine,
  Plus,
  Power,
  Trash2,
  UserRound,
} from "lucide-react";

import styles from "./page.module.scss";
import DialogModal from "@components/shared/DialogModal/DialogModal";
import UserModal from "@components/config/UserModal/UserModal";

const ROLE_LABELS = {
  admin: "Sistema",
  kitchen: "Chef",
  lounge: "Mesero",
  warehouse: "Bodeguero",
};

function ActionButton({
  label,
  icon: Icon,
  variant = "neutral",
  disabled = false,
  onClick,
}) {
  return (
    <button
      type="button"
      className={`action-button ${variant === "danger" ? "action-button--danger" : "action-button--neutral"}`}
      onClick={onClick}
      disabled={disabled}
      title={label}
    >
      <span className="action-button__icon">
        <Icon size={15} />
      </span>
      <span className="action-button__label">{label}</span>
    </button>
  );
}

function LoadingCard({ index }) {
  return (
    <article
      className={`${styles.card} ${styles.loadingCard}`}
      style={{ "--card-index": index }}
    >
      <div className={styles.summary}>
        <div className={styles.summaryMain}>
          <div className={styles.titleRow}>
            <div className={`${styles.avatar} ${styles.skeletonBlock}`} />
            <div className={styles.titleBlock}>
              <div className={`${styles.skeletonLine} ${styles.skeletonTitle}`} />
              <div className={`${styles.skeletonLine} ${styles.skeletonShort}`} />
            </div>
            <div className={`${styles.skeletonPill} ${styles.statusPill}`} />
            <div className={`${styles.skeletonPill} ${styles.rolePill}`} />
          </div>
          <div className={`${styles.skeletonLine} ${styles.skeletonMedium}`} />
        </div>
      </div>
    </article>
  );
}

export default function UsersPage() {
  const [users, setUsers] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedId, setExpandedId] = useState(null);

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [createError, setCreateError] = useState("");
  const [editError, setEditError] = useState("");

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

  async function fetchUsers() {
    try {
      setIsLoading(true);

      const response = await fetch("/api/users", {
        method: "GET",
        cache: "no-store",
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.message || "No se pudieron cargar los usuarios.");
      }

      setUsers(result.data || []);
    } catch (error) {
      console.error(error);

      setDialogState({
        open: true,
        variant: "danger",
        title: "Error al cargar usuarios",
        message: error.message || "Ocurrió un problema al obtener los usuarios.",
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

  async function fetchCurrentUser() {
    try {
      const response = await fetch("/api/auth/me", {
        method: "GET",
        cache: "no-store",
      });

      const result = await response.json();

      if (!response.ok || !result?.success) {
        throw new Error(result?.message || "No se pudo obtener la sesión.");
      }

      setCurrentUser(result.user || null);
    } catch (error) {
      console.error(error);
      setCurrentUser(null);
    }
  }

  useEffect(() => {
    fetchCurrentUser();
    fetchUsers();
  }, []);

  const sortedUsers = useMemo(() => {
    return [...users].sort((a, b) => {
      const nameA = `${a.firstName || ""} ${a.lastName || ""}`.trim();
      const nameB = `${b.firstName || ""} ${b.lastName || ""}`.trim();
      return nameA.localeCompare(nameB);
    });
  }, [users]);

  function toggleExpanded(id) {
    setExpandedId((prev) => (prev === id ? null : id));
  }

  async function handleCreateUser(formData) {
    try {
      setIsSubmitting(true);
      setCreateError("");

      const response = await fetch("/api/users", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(formData),
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        setCreateError(result.message || "No se pudo crear el usuario.");
        return;
      }

      setUsers((prev) => [result.data, ...prev]);
      setIsCreateOpen(false);
      setCreateError("");

      setDialogState({
        open: true,
        variant: "success",
        title: "Usuario creado",
        message: result.message || "El usuario se creó correctamente.",
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
      console.error("Create user error:", error);
      setCreateError("");

      setDialogState({
        open: true,
        variant: "danger",
        title: "No se pudo crear el usuario",
        message: error.message || "Ocurrió un problema al crear el usuario.",
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

  function handleOpenEdit(user) {
    setEditError("");
    setSelectedUser(user);
  }

  async function handleUpdateUser(formData) {
    if (!selectedUser?._id) return;

    try {
      setIsSubmitting(true);
      setEditError("");

      const response = await fetch(`/api/users/${selectedUser._id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(formData),
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        setEditError(result.message || "No se pudo actualizar el usuario.");
        return;
      }

      setUsers((prev) =>
        prev.map((user) =>
          user._id === selectedUser._id ? result.data : user
        )
      );

      setSelectedUser(null);
      setEditError("");

      setDialogState({
        open: true,
        variant: "success",
        title: "Usuario actualizado",
        message: result.message || "Los cambios del usuario fueron guardados.",
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
      console.error("Update user error:", error);
      setEditError("");

      setDialogState({
        open: true,
        variant: "danger",
        title: "No se pudo actualizar el usuario",
        message:
          error.message || "Ocurrió un problema al actualizar el usuario.",
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

  function handleToggleUser(user) {
    setDialogState({
      open: true,
      variant: user.isActive ? "warning" : "success",
      title: user.isActive ? "Desactivar usuario" : "Activar usuario",
      message: user.isActive
        ? `El usuario "${user.firstName} ${user.lastName}" dejará de poder ingresar al sistema.`
        : `El usuario "${user.firstName} ${user.lastName}" volverá a estar activo.`,
      confirmText: user.isActive ? "Desactivar" : "Activar",
      showCancel: true,
      loading: false,
      onConfirm: async () => {
        try {
          setDialogState((prev) => ({
            ...prev,
            loading: true,
          }));

          const response = await fetch(`/api/users/${user._id}`, {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              isActive: !user.isActive,
            }),
          });

          const result = await response.json();

          if (!response.ok || !result.success) {
            throw new Error(
              result.message || "No se pudo cambiar el estado del usuario."
            );
          }

          setUsers((prev) =>
            prev.map((item) => (item._id === user._id ? result.data : item))
          );

          setDialogState({
            open: true,
            variant: "success",
            title: "Estado actualizado",
            message:
              result.message ||
              "El estado del usuario se actualizó correctamente.",
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
              "Ocurrió un problema al cambiar el estado del usuario.",
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

  function handleDeleteUser(user) {
    setDialogState({
      open: true,
      variant: "danger",
      title: "Eliminar usuario",
      message: `Se eliminará el usuario "${user.firstName} ${user.lastName}". Esta acción no se puede deshacer.`,
      confirmText: "Eliminar",
      showCancel: true,
      loading: false,
      onConfirm: async () => {
        try {
          setDialogState((prev) => ({
            ...prev,
            loading: true,
          }));

          const response = await fetch(`/api/users/${user._id}`, {
            method: "DELETE",
          });

          const result = await response.json();

          if (!response.ok || !result.success) {
            throw new Error(result.message || "No se pudo eliminar el usuario.");
          }

          setUsers((prev) => prev.filter((item) => item._id !== user._id));

          if (expandedId === user._id) {
            setExpandedId(null);
          }

          setDialogState({
            open: true,
            variant: "success",
            title: "Usuario eliminado",
            message: result.message || "El usuario fue eliminado correctamente.",
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
            title: "No se pudo eliminar el usuario",
            message:
              error.message || "Ocurrió un problema al eliminar el usuario.",
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
      <div className="page">

        <section className="hero fadeSlideIn">
          <div className="heroCopy">
            <span className="eyebrow">Acceso al sistema</span>
            <h2 className="title">Usuarios</h2>
            <p className="description">
              Administra accesos, roles y estado de los usuarios del sistema.
            </p>
          </div>

          <div className="heroStatsCompact">
            <span className="compactStat">
              <strong>{users.length}</strong>
              Usuarios
            </span>
          </div>
        </section>

        <div className={`${styles.headerRow} ${styles.enter}`}>

          <button
            type="button"
            className={`${styles.createButton} miniAction miniActionPrimary`}
            onClick={() => setIsCreateOpen(true)}
            title="Nuevo usuario"
          >
            <span className="action-button__icon">
              <Plus size={16} />
            </span>
            <span className="action-button__label">Nuevo usuario</span>
          </button>
        </div>

        {isLoading ? (
          <div className={`${styles.list} ${styles.loadingList}`}>
            {Array.from({ length: 4 }).map((_, index) => (
              <LoadingCard key={index} index={index} />
            ))}
          </div>
        ) : sortedUsers.length === 0 ? (
          <div className={`${styles.emptyState} ${styles.enter}`} style={{ "--enter-delay": "0.08s" }}>
            <p className={styles.emptyTitle}>No hay usuarios registrados</p>
            <p className={styles.emptyDescription}>
              Crea tu primer usuario para comenzar a asignar accesos al sistema.
            </p>
          </div>
        ) : (
          <div className={styles.list}>
            {sortedUsers.map((user) => {
              const isOpen = expandedId === user._id;
              const fullName = `${user.firstName} ${user.lastName}`.trim();
              const isCurrentUser = String(currentUser?.id || "") === String(user._id);

              return (
                <article
                  key={user._id}
                  className={`${styles.card} ${styles.enter} ${isOpen ? styles.cardOpen : ""}`}
                  style={{ "--enter-delay": `${Math.min(0.08 + sortedUsers.indexOf(user) * 0.04, 0.28)}s` }}
                >
                  <button
                    type="button"
                    className={styles.summary}
                    onClick={() => toggleExpanded(user._id)}
                  >
                    <div className={styles.summaryMain}>
                      <div className={styles.titleRow}>
                        <div className={styles.avatar}>
                          <UserRound size={16} />
                        </div>

                        <div className={styles.titleBlock}>
                          <h3 className={styles.cardTitle}>{fullName}</h3>
                          <p className={styles.username}>@{user.username}</p>
                        </div>

                        <span
                          className={`${styles.statusBadge} ${user.isActive
                            ? styles.statusActive
                            : styles.statusInactive
                            }`}
                        >
                          {user.isActive ? "Activo" : "Inactivo"}
                        </span>

                        <span className={styles.roleBadge}>
                          {ROLE_LABELS[user.role] || user.role}
                        </span>
                      </div>

                      <p className={styles.preview}>
                        {user.email || "Sin correo electrónico registrado."}
                      </p>
                    </div>

                    <div className={styles.summaryAside}>
                      <span className={styles.expandText}>
                        {isOpen ? "Ocultar" : "Ver más"}
                      </span>
                      <ChevronDown
                        size={18}
                        className={`${styles.chevron} ${isOpen ? styles.chevronOpen : ""
                          }`}
                      />
                    </div>
                  </button>

                  {isOpen && (
                    <div className={`${styles.details} ${styles.detailsEnter}`}>
                      <div className={styles.meta}>
                        <div className={styles.metaItem}>
                          <span className={styles.metaLabel}>Nombres</span>
                          <span className={styles.metaValue}>
                            {user.firstName}
                          </span>
                        </div>

                        <div className={styles.metaItem}>
                          <span className={styles.metaLabel}>Apellidos</span>
                          <span className={styles.metaValue}>
                            {user.lastName}
                          </span>
                        </div>

                        <div className={styles.metaItem}>
                          <span className={styles.metaLabel}>Usuario</span>
                          <span className={styles.metaValue}>
                            @{user.username}
                          </span>
                        </div>

                        <div className={styles.metaItem}>
                          <span className={styles.metaLabel}>Rol</span>
                          <span className={styles.metaValue}>
                            {ROLE_LABELS[user.role] || user.role}
                          </span>
                        </div>

                        <div
                          className={`${styles.metaItem} ${styles.metaDescription}`}
                        >
                          <span className={styles.metaLabel}>Correo</span>
                          <span className={styles.metaValue}>
                            {user.email || "Sin correo electrónico registrado."}
                          </span>
                        </div>
                      </div>

                      <div className={styles.actions}>
                        <ActionButton
                          label="Editar"
                          icon={PencilLine}
                          onClick={() => handleOpenEdit(user)}
                        />

                        <ActionButton
                          label={user.isActive ? "Desactivar" : "Activar"}
                          icon={Power}
                          onClick={() => handleToggleUser(user)}
                          disabled={isCurrentUser}
                        />

                        <ActionButton
                          label="Eliminar"
                          icon={Trash2}
                          variant="danger"
                          onClick={() => handleDeleteUser(user)}
                          disabled={isCurrentUser}
                        />
                      </div>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </div>

      <UserModal
        open={isCreateOpen}
        onClose={() => {
          setIsCreateOpen(false);
          setCreateError("");
        }}
        onSubmit={handleCreateUser}
        mode="create"
        loading={isSubmitting}
        submitError={createError}
      />

      <UserModal
        open={Boolean(selectedUser)}
        onClose={() => {
          setSelectedUser(null);
          setEditError("");
        }}
        onSubmit={handleUpdateUser}
        mode="edit"
        initialData={selectedUser}
        loading={isSubmitting}
        submitError={editError}
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
