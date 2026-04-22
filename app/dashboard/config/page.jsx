import styles from "./page.module.scss";

export default function ConfigPage() {
  return (
    <div className={styles.container}>
      <section className="hero fadeSlideIn">
        <div className="heroCopy">
          <div>
            <p className="eyebrow">Configuración</p>
            <h2 className="title">Ajustes generales</h2>
            <p className="description">
              Administra la información básica del negocio y algunos parámetros
              generales del sistema.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}