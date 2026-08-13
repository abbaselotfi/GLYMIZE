"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useGlymizeLocale } from "../components/use-glymize-locale";
import styles from "./admin-workspace-nav.module.css";

const ITEMS = [
  { href: "/admin", icon: "AD", fa: "مرکز مدیریت", en: "Admin center" },
  { href: "/admin/medications", icon: "RX", fa: "دارو و برندها", en: "Medicines & brands" },
  { href: "/admin/data-updates", icon: "DT", fa: "به‌روزرسانی داده", en: "Data updates" },
  { href: "/admin/master-registry", icon: "MR", fa: "رجیستری مرجع", en: "Master registry" },
  { href: "/admin/users", icon: "ID", fa: "کاربران و دسترسی", en: "Users & access" },
  { href: "/admin/ai-models", icon: "AI", fa: "مدل‌های AI", en: "AI models" },
  { href: "/admin/communications", icon: "CM", fa: "ارتباطات", en: "Communications" },
  { href: "/admin/notifications", icon: "NT", fa: "اعلان‌ها", en: "Notifications" },
] as const;

export default function AdminWorkspaceNav() {
  const pathname = usePathname();
  const { locale } = useGlymizeLocale();
  return (
    <nav className={styles.nav} aria-label={locale === "fa" ? "بخش‌های مدیریت GLYMIZE" : "GLYMIZE admin sections"}>
      <div className={styles.title}>
        <span>GLYMIZE OPS</span>
        <strong>{locale === "fa" ? "کنترل و انتشار" : "Control & publishing"}</strong>
      </div>
      <div className={styles.items}>
        {ITEMS.map((item) => {
          const active = item.href === "/admin" ? pathname === item.href : pathname.startsWith(item.href);
          return (
            <Link href={item.href} className={active ? styles.active : styles.item} key={item.href}>
              <span className={styles.icon}>{item.icon}</span>
              <span>{item[locale]}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
