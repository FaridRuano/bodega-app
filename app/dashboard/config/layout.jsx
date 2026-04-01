import ConfigTabs from "@components/config/ConfigTabs/ConfigTabs";
import styles from "./page.module.scss";

export default function ConfigLayout({ children }) {
    return (
        <div className={styles.container}>
            <ConfigTabs />
            <div className={styles.content}>{children}</div>
        </div>
    );
}