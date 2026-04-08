
"use client";

import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";

const ROLE_OPTIONS = [
    { value: "admin", label: "Administrador" },
    { value: "kitchen", label: "Cocina" },
    { value: "warehouse", label: "Bodega" },
];

export default function UserModal({
    open,
    onClose,
    onSubmit,
    mode = "create",
    initialData = null,
    loading = false,
}) {
    const isEdit = mode === "edit";

    const emptyForm = useMemo(() => ({
        firstName: "",
        lastName: "",
        username: "",
        email: "",
        role: "kitchen",
        isActive: true,
        password: "",
    }), []);

    const [form, setForm] = useState(emptyForm);
    const [initialForm, setInitialForm] = useState(emptyForm);

    useEffect(() => {
        if (!open) return;

        if (isEdit && initialData) {
            const editForm = {
                firstName: initialData.firstName || "",
                lastName: initialData.lastName || "",
                username: initialData.username || "",
                email: initialData.email || "",
                role: initialData.role || "kitchen",
                isActive:
                    typeof initialData.isActive === "boolean"
                        ? initialData.isActive
                        : true,
                password: "",
            };

            // eslint-disable-next-line react-hooks/set-state-in-effect
            setForm(editForm);
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setInitialForm(editForm);
            return;
        }

        // eslint-disable-next-line react-hooks/set-state-in-effect
        setForm(emptyForm);
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setInitialForm(emptyForm);
    }, [open, isEdit, initialData, emptyForm]);

    function handleChange(event) {
        const { name, value, type, checked } = event.target;

        setForm((prev) => ({
            ...prev,
            [name]: type === "checkbox" ? checked : value,
        }));
    }

    const isDirty = useMemo(() => {
        return (
            form.firstName !== initialForm.firstName ||
            form.lastName !== initialForm.lastName ||
            form.username !== initialForm.username ||
            form.email !== initialForm.email ||
            form.role !== initialForm.role ||
            form.isActive !== initialForm.isActive ||
            form.password !== initialForm.password
        );
    }, [form, initialForm]);

    const isValid =
        form.firstName.trim().length > 0 &&
        form.lastName.trim().length > 0 &&
        form.username.trim().length > 0 &&
        form.role.trim().length > 0 &&
        (isEdit || form.password.trim().length >= 6);

    const isDisabled = loading || (isEdit ? !isDirty || !isValid : !isValid);

    function handleSubmit(event) {
        event.preventDefault();

        if (isDisabled) return;

        const payload = {
            firstName: form.firstName.trim(),
            lastName: form.lastName.trim(),
            username: form.username.trim().toLowerCase(),
            email: form.email.trim().toLowerCase(),
            role: form.role,
            isActive: form.isActive,
        };

        if (!isEdit) {
            payload.password = form.password;
        }

        onSubmit?.(payload);
    }

    useEffect(() => {
        function handleEscape(event) {
            if (event.key === "Escape") {
                onClose();
            }
        }

        window.addEventListener("keydown", handleEscape);

        return () => {
            window.removeEventListener("keydown", handleEscape);
        };
    }, [onClose]);

    if (!open) return null;

    return (
        <div className="modal-overlay" role="dialog" aria-modal="true" onClick={onClose}>
            <div className="modal-container" onClick={(event) => event.stopPropagation()}>
                <div className="modal-header">
                    <div>
                        <h3 className="modal-title">
                            {isEdit ? "Editar usuario" : "Nuevo usuario"}
                        </h3>
                        <p className="modal-description">
                            {isEdit
                                ? "Actualiza la información general del usuario."
                                : "Crea un nuevo usuario y asigna su rol dentro del sistema."}
                        </p>
                    </div>

                    <button
                        type="button"
                        className="modal-close"
                        onClick={onClose}
                        disabled={loading}
                        aria-label="Cerrar modal"
                    >
                        <X size={18} />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="modal-body">
                    <div className="form-grid">
                        <div className="form-field">
                            <label htmlFor="user-firstName" className="form-label">
                                Nombres
                            </label>
                            <input
                                id="user-firstName"
                                name="firstName"
                                value={form.firstName}
                                onChange={handleChange}
                                className="form-input"
                                placeholder="Ej: Juan"
                                disabled={loading}
                                required
                            />
                        </div>

                        <div className="form-field">
                            <label htmlFor="user-lastName" className="form-label">
                                Apellidos
                            </label>
                            <input
                                id="user-lastName"
                                name="lastName"
                                value={form.lastName}
                                onChange={handleChange}
                                className="form-input"
                                placeholder="Ej: Pérez"
                                disabled={loading}
                                required
                            />
                        </div>
                    </div>

                    <div className="form-grid">
                        <div className="form-field">
                            <label htmlFor="user-username" className="form-label">
                                Usuario
                            </label>
                            <input
                                id="user-username"
                                name="username"
                                value={form.username}
                                onChange={handleChange}
                                className="form-input"
                                placeholder="Ej: jperez"
                                autoCapitalize="none"
                                disabled={loading}
                                required
                            />
                        </div>

                        <div className="form-field">
                            <label htmlFor="user-email" className="form-label">
                                Correo electrónico
                            </label>
                            <input
                                id="user-email"
                                name="email"
                                type="email"
                                value={form.email}
                                onChange={handleChange}
                                className="form-input"
                                placeholder="Ej: juan@correo.com"
                                disabled={loading}
                            />
                        </div>
                    </div>

                    <div className="form-grid">
                        <div className="form-field">
                            <label htmlFor="user-role" className="form-label">
                                Rol
                            </label>
                            <select
                                id="user-role"
                                name="role"
                                value={form.role}
                                onChange={handleChange}
                                className="form-input"
                                disabled={loading}
                                required
                            >
                                {ROLE_OPTIONS.map((role) => (
                                    <option key={role.value} value={role.value}>
                                        {role.label}
                                    </option>
                                ))}
                            </select>
                        </div>

                        {!isEdit && (
                            <div className="form-field">
                                <label htmlFor="user-password" className="form-label">
                                    Contraseña
                                </label>
                                <input
                                    id="user-password"
                                    name="password"
                                    type="password"
                                    value={form.password}
                                    onChange={handleChange}
                                    className="form-input"
                                    placeholder="Mínimo 6 caracteres"
                                    disabled={loading}
                                    required
                                />
                            </div>
                        )}
                    </div>

                    <div className="form-switchRow">
                        <div>
                            <p className="form-switchLabel">Usuario activo</p>
                            <p className="form-switchDescription">
                                El usuario podrá ingresar y operar en el sistema.
                            </p>
                        </div>

                        <label className="switch">
                            <input
                                type="checkbox"
                                name="isActive"
                                checked={form.isActive}
                                onChange={handleChange}
                                disabled={loading}
                            />
                            <span className="switch-slider" />
                        </label>
                    </div>

                    <div className="modal-footer">
                        <button
                            type="button"
                            className="btn btn-secondary"
                            onClick={onClose}
                            disabled={loading}
                        >
                            Cancelar
                        </button>

                        <button type="submit" className="btn btn-primary" disabled={isDisabled}>
                            {loading
                                ? "Guardando..."
                                : isEdit
                                    ? "Guardar cambios"
                                    : "Crear usuario"}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
