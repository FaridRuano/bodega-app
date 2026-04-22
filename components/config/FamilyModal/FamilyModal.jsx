"use client";

import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";

const EMPTY_FORM = {
    name: "",
    description: "",
};

function buildInitialForm(initialData, isEdit) {
    if (!isEdit || !initialData) {
        return EMPTY_FORM;
    }

    return {
        name: initialData.name || "",
        description: initialData.description || "",
    };
}

export default function FamilyModal({
    open,
    onClose,
    onSubmit,
    mode = "create",
    initialData = null,
    loading = false,
    submitError = "",
}) {
    const isEdit = mode === "edit";
    const initialForm = useMemo(
        () => buildInitialForm(initialData, isEdit),
        [initialData, isEdit]
    );
    const [form, setForm] = useState(initialForm);

    useEffect(() => {
        setForm(initialForm);
    }, [initialForm, open]);

    useEffect(() => {
        function handleEscape(event) {
            if (event.key === "Escape" && !loading) {
                onClose();
            }
        }

        window.addEventListener("keydown", handleEscape);

        return () => {
            window.removeEventListener("keydown", handleEscape);
        };
    }, [loading, onClose]);

    function handleChange(event) {
        const { name, value } = event.target;

        setForm((prev) => ({
            ...prev,
            [name]: value,
        }));
    }

    function handleSubmit(event) {
        event.preventDefault();

        if (isDisabled) return;

        onSubmit(form);
    }

    const isDirty =
        form.name !== initialForm.name || form.description !== initialForm.description;
    const isValid = form.name.trim().length > 0;
    const isDisabled = loading || !isValid || (isEdit && !isDirty);

    if (!open) return null;

    return (
        <div className="modal-overlay" onClick={loading ? undefined : onClose}>
            <div
                className="modal-container"
                onClick={(event) => event.stopPropagation()}
            >
                <div className="modal-top">
                    <div className="modal-headerBlock">
                        <h3 className="modal-title">
                            {isEdit ? "Editar familia" : "Nueva familia"}
                        </h3>
                        <p className="modal-description">
                            {isEdit
                                ? "Actualiza la familia que agrupa categorias relacionadas."
                                : "Crea una familia para organizar mejor las categorias de productos."}
                        </p>
                    </div>

                    <button
                        type="button"
                        className="modal-close"
                        onClick={onClose}
                        disabled={loading}
                    >
                        <X size={18} />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="modal-body">
                    <div className="form-field">
                        <label className="form-label" htmlFor="family-name">
                            Nombre
                        </label>
                        <input
                            id="family-name"
                            name="name"
                            value={form.name}
                            onChange={handleChange}
                            placeholder="Ej: Bebidas"
                            className="form-input"
                            required
                            disabled={loading}
                        />
                    </div>

                    <div className="form-field">
                        <label className="form-label" htmlFor="family-description">
                            Descripcion
                        </label>
                        <textarea
                            id="family-description"
                            name="description"
                            value={form.description}
                            onChange={handleChange}
                            placeholder="Opcional"
                            className="form-textarea"
                            disabled={loading}
                        />
                    </div>

                    {submitError ? (
                        <div className="form-error-message" role="alert">
                            {submitError}
                        </div>
                    ) : null}

                    <div className="modal-footer">
                        <button
                            type="button"
                            className="btn btn-secondary"
                            onClick={onClose}
                            disabled={loading}
                        >
                            Cancelar
                        </button>

                        <button
                            type="submit"
                            className="btn btn-primary"
                            disabled={isDisabled}
                        >
                            {loading
                                ? "Guardando..."
                                : isEdit
                                    ? "Guardar cambios"
                                    : "Crear familia"}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
