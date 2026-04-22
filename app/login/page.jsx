"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import styles from "./page.module.scss";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState("login");

  const [formData, setFormData] = useState({
    username: "",
    password: "",
  });
  const [changePasswordData, setChangePasswordData] = useState({
    username: "",
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });

  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  function handleChange(event) {
    const { name, value } = event.target;

    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  }

  function handleChangePasswordFields(event) {
    const { name, value } = event.target;

    setChangePasswordData((prev) => ({
      ...prev,
      [name]: value,
    }));
  }

  function switchMode(nextMode) {
    setMode(nextMode);
    setErrorMessage("");
    setSuccessMessage("");
    setIsLoading(false);
  }

  async function handleSubmit(event) {
    event.preventDefault();

    setErrorMessage("");
    setSuccessMessage("");
    setIsLoading(true);

    try {
      const result = await signIn("credentials", {
        username: formData.username,
        password: formData.password,
        redirect: false,
      });

      if (!result) {
        setErrorMessage("No se pudo iniciar sesión.");
        return;
      }

      if (result.error) {
        setErrorMessage("Usuario o contraseña incorrectos.");
        return;
      }

      router.push("/dashboard");
      router.refresh();
    } catch (error) {
      console.error("Login error:", error);
      setErrorMessage("Ocurrió un error inesperado. Intenta nuevamente.");
    } finally {
      setIsLoading(false);
    }
  }

  async function handlePasswordChange(event) {
    event.preventDefault();

    setErrorMessage("");
    setSuccessMessage("");

    if (changePasswordData.newPassword.trim().length < 6) {
      setErrorMessage("La nueva contraseña debe tener al menos 6 caracteres.");
      return;
    }

    if (changePasswordData.newPassword !== changePasswordData.confirmPassword) {
      setErrorMessage("La confirmación no coincide con la nueva contraseña.");
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          username: changePasswordData.username,
          currentPassword: changePasswordData.currentPassword,
          newPassword: changePasswordData.newPassword,
        }),
      });

      const result = await response.json();

      if (!response.ok || !result?.success) {
        setErrorMessage(
          result?.message || "No se pudo actualizar la contraseña."
        );
        return;
      }

      setSuccessMessage(result.message);
      setFormData({
        username: changePasswordData.username,
        password: "",
      });
      setChangePasswordData({
        username: changePasswordData.username,
        currentPassword: "",
        newPassword: "",
        confirmPassword: "",
      });
      setMode("login");
    } catch (error) {
      console.error("Change password error:", error);
      setErrorMessage("Ocurrió un error inesperado. Intenta nuevamente.");
    } finally {
      setIsLoading(false);
    }
  }

  const isChangePasswordMode = mode === "change-password";

  return (
    <main className={styles.loginPage}>
      <div className={styles.glowOne} />
      <div className={styles.glowTwo} />

      <section className={styles.loginCard}>
        <div className={styles.topLine} />

        <div className={styles.header}>
          <span className={styles.badge}>Acceso interno</span>
          <h1 className={styles.title}>
            {isChangePasswordMode ? "Cambiar contraseña" : "Iniciar sesión"}
          </h1>
          <p className={styles.description}>
            {isChangePasswordMode
              ? "Ingresa tu usuario, tu contraseña anterior y define una nueva."
              : "Ingresa con tu usuario y contraseña para acceder al sistema."}
          </p>
        </div>

        <form
          className={styles.form}
          onSubmit={isChangePasswordMode ? handlePasswordChange : handleSubmit}
        >
          <div className={styles.field}>
            <label
              htmlFor={isChangePasswordMode ? "change-username" : "username"}
              className={styles.label}
            >
              Usuario
            </label>

            <input
              id={isChangePasswordMode ? "change-username" : "username"}
              name="username"
              type="text"
              autoComplete="username"
              placeholder="Ingresa tu usuario"
              className="form-input"
              value={
                isChangePasswordMode
                  ? changePasswordData.username
                  : formData.username
              }
              onChange={
                isChangePasswordMode
                  ? handleChangePasswordFields
                  : handleChange
              }
              disabled={isLoading}
              required
            />
          </div>

          {isChangePasswordMode ? (
            <>
              <div className={styles.field}>
                <label htmlFor="currentPassword" className={styles.label}>
                  Contraseña anterior
                </label>

                <input
                  id="currentPassword"
                  name="currentPassword"
                  type="password"
                  autoComplete="current-password"
                  placeholder="Ingresa tu contraseña anterior"
                  className="form-input"
                  value={changePasswordData.currentPassword}
                  onChange={handleChangePasswordFields}
                  disabled={isLoading}
                  required
                />
              </div>

              <div className={styles.field}>
                <label htmlFor="newPassword" className={styles.label}>
                  Nueva contraseña
                </label>

                <input
                  id="newPassword"
                  name="newPassword"
                  type="password"
                  autoComplete="new-password"
                  placeholder="Ingresa tu nueva contraseña"
                  className="form-input"
                  value={changePasswordData.newPassword}
                  onChange={handleChangePasswordFields}
                  disabled={isLoading}
                  required
                />
              </div>

              <div className={styles.field}>
                <label htmlFor="confirmPassword" className={styles.label}>
                  Confirmar nueva contraseña
                </label>

                <input
                  id="confirmPassword"
                  name="confirmPassword"
                  type="password"
                  autoComplete="new-password"
                  placeholder="Confirma tu nueva contraseña"
                  className="form-input"
                  value={changePasswordData.confirmPassword}
                  onChange={handleChangePasswordFields}
                  disabled={isLoading}
                  required
                />
              </div>
            </>
          ) : (
            <div className={styles.field}>
              <label htmlFor="password" className={styles.label}>
                Contraseña
              </label>

              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                placeholder="Ingresa tu contraseña"
                className="form-input"
                value={formData.password}
                onChange={handleChange}
                disabled={isLoading}
                required
              />
            </div>
          )}

          {errorMessage ? (
            <div className={styles.errorBox}>{errorMessage}</div>
          ) : null}

          {successMessage ? (
            <div className={styles.successBox}>{successMessage}</div>
          ) : null}

          {isChangePasswordMode ? (
            <button
              type="button"
              className={styles.secondaryLink}
              onClick={() => switchMode("login")}
              disabled={isLoading}
            >
              Volver al inicio de sesión
            </button>
          ) : (
            <button
              type="button"
              className={styles.secondaryLink}
              onClick={() => switchMode("change-password")}
              disabled={isLoading}
            >
              Olvidé mi contraseña
            </button>
          )}

          <button
            type="submit"
            className={styles.submitButton}
            disabled={isLoading}
          >
            {isLoading
              ? isChangePasswordMode
                ? "Actualizando..."
                : "Ingresando..."
              : isChangePasswordMode
                ? "Actualizar contraseña"
                : "Entrar al sistema"}
          </button>
        </form>

        <div className={styles.footer}>
          <Link href="/" className={styles.backLink}>
            Volver al inicio
          </Link>
        </div>
      </section>
    </main>
  );
}
