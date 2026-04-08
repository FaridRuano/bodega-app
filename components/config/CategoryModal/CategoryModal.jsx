"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";

export default function CategoryModal({
    open,
    onClose,
    onSubmit,
    mode = "create",
    initialData = null,
}) {
    const [form, setForm] = useState({
        name: "",
        description: "",
    });

    const [initialForm, setInitialForm] = useState({
        name: "",
        description: "",
    });

    const isEdit = mode === "edit";

    // 🔁 cargar datos
    useEffect(() => {
        if (mode === "edit" && initialData) {
            const data = {
                name: initialData.name || "",
                description: initialData.description || "",
            };

            // eslint-disable-next-line react-hooks/set-state-in-effect
            setForm(data);
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setInitialForm(data);
        }

        if (mode === "create") {
            const empty = { name: "", description: "" };
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setForm(empty);
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setInitialForm(empty);
        }
    }, [mode, initialData, open]);

    function handleChange(e) {
        setForm({
            ...form,
            [e.target.name]: e.target.value,
        });
    }

    function handleSubmit(e) {
        e.preventDefault();
        if (!isDirty) return;
        onSubmit(form);
    }

    // 🧠 detectar cambios
    const isDirty =
        form.name !== initialForm.name ||
        form.description !== initialForm.description;

    // 🧠 validación mínima
    const isValid = form.name.trim().length > 0;

    const isDisabled = isEdit
        ? !isDirty || !isValid
        : !isValid;

    useEffect(() => {
        function handleEscape(e) {
            if (e.key === "Escape") {
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
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-container"
                onClick={(event) => event.stopPropagation()}>
                <div className="modal-header">
                    <div>
                        <h3 className="modal-title">
                            {isEdit ? "Editar categoría" : "Nueva categoría"}
                        </h3>
                        <p className="modal-description">
                            {isEdit
                                ? "Modifica la información de la categoría."
                                : "Crea una categoría para organizar los productos."}
                        </p>
                    </div>

                    <button className="modal-close" onClick={onClose}>
                        <X size={18} />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="modal-body">
                    <div className="form-field">
                        <label className="form-label">Nombre</label>
                        <input
                            name="name"
                            value={form.name}
                            onChange={handleChange}
                            placeholder="Ej: Carnes"
                            className="form-input"
                            required
                        />
                    </div>

                    <div className="form-field">
                        <label className="form-label">Descripción</label>
                        <textarea
                            name="description"
                            value={form.description}
                            onChange={handleChange}
                            placeholder="Opcional"
                            className="form-textarea"
                        />
                    </div>

                    <div className="modal-footer">
                        <button
                            type="button"
                            className="btn btn-secondary"
                            onClick={onClose}
                        >
                            Cancelar
                        </button>

                        <button
                            type="submit"
                            className="btn btn-primary"
                            disabled={isDisabled}
                            style={{
                                opacity: isDisabled ? 0.6 : 1,
                                cursor: isDisabled ? "not-allowed" : "pointer",
                            }}
                        >
                            {isEdit ? "Guardar cambios" : "Crear categoría"}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
