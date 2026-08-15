"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { getAdminSession } from "../../lib/admin-auth";
import {
  ADMIN_PAGE_PERMISSIONS,
  type AdminPermission,
} from "../../lib/runtime-permissions";
import {
  getCachedRuntimeUser,
  initializeRuntimeSession,
} from "../../lib/runtime-client";
import { useGlymizeLocale } from "../components/use-glymize-locale";
import styles from "./admin-workspace-nav.module.css";

const ICONS: Record<AdminPermission, string> = {
  "admin.center": "AD",
  "admin.medications": "RX",
  "admin.data_updates": "DT",
  "admin.master_registry": "MR",
  "admin.users": "ID",
  "admin.ai_models": "AI",
  "admin.communications": "CM",
  "admin.notifications": "NT",
};

export default function AdminWorkspaceNav() {
  const pathname = usePathname();
  const { locale } = useGlymizeLocale();
  const [permissions, setPermissions] = useState(
    () => getCachedRuntimeUser()?.permissions ?? [],
  );
  const [githubSuperadmin, setGithubSuperadmin] = useState(false);

  useEffect(() => {
    const github = Boolean(getAdminSession());
    setGithubSuperadmin(github);
    if (github) return;
    void initializeRuntimeSession(true).then((user) =>
      setPermissions(user?.permissions ?? []),
    );
  }, [pathname]);

  const items = useMemo(
    () =>
      ADMIN_PAGE_PERMISSIONS.filter(
        (item) => githubSuperadmin || permissions.includes(item.key),
      ),
    [githubSuperadmin, permissions],
  );

  return (
    <nav
      className={styles.nav}
      aria-label={
        locale === "fa" ? "بخش‌های مدیریت GLYMIZE" : "GLYMIZE admin sections"
      }
    >
      <div className={styles.title}>
        <span>GLYMIZE OPS</span>
        <strong>
          {locale === "fa" ? "کنترل و انتشار" : "Control & publishing"}
        </strong>
      </div>
      <div className={styles.items}>
        {items.map((item) => {
          const active =
            item.href === "/admin"
              ? pathname === item.href
              : pathname.startsWith(item.href);
          return (
            <Link
              href={item.href}
              className={active ? styles.active : styles.item}
              key={item.key}
            >
              <span className={styles.icon}>{ICONS[item.key]}</span>
              <span>{item[locale]}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
