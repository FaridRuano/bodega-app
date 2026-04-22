import Link from "next/link";
import styles from "./page.module.scss";

export default function HomePage() {
  return (
    <main className={styles.homePage}>
      <div className={styles.glowOne} />
      <div className={styles.glowTwo} />

      <section className={styles.heroCard}>
        <div className={styles.topLine} />

        <span className={styles.badge}>Sistema interno</span>

        <h1 className={styles.title}>Doble Filo</h1>

        <p className={styles.description}>
          Accede de forma segura al sistema de gestión interna para operar
          inventario, control y procesos de bodega.
        </p>

        <div className={styles.actions}>
          <Link href="/login" className={styles.primaryButton}>
            Iniciar sesión
          </Link>
        </div>
      </section>
    </main>
  );
}
