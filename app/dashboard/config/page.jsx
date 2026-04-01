import styles from "./page.module.scss";

export default function ConfigPage() {
  return (
    <div className={styles.container}>
      <section className={styles.card}>
        <div className={styles.cardHeader}>
          <div>
            <p className={styles.eyebrow}>Configuración</p>
            <h2 className={styles.title}>Ajustes generales</h2>
            <p className={styles.description}>
              Administra la información básica del negocio y algunos parámetros
              generales del sistema.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}