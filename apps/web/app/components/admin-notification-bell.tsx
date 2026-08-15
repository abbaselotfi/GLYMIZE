"use client";

import type { AdminNotification } from "@glymize/contracts";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "../../lib/api-client";
import { getAdminSession } from "../../lib/admin-auth";
import { initializeRuntimeSession } from "../../lib/runtime-client";

export default function AdminNotificationBell() {
  const [notifications, setNotifications] = useState<AdminNotification[]>([]);
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    if (getAdminSession()) {
      setAllowed(true);
      return;
    }
    void initializeRuntimeSession(true).then((user) =>
      setAllowed(Boolean(user?.permissions.includes("admin.notifications"))),
    );
  }, []);

  const refresh = useCallback(async () => {
    try {
      const response = await apiFetch("/v1/admin/notifications");
      if (!response.ok) return;
      setNotifications(await response.json() as AdminNotification[]);
    } catch {
      // The admin can still use the catalogue if notification refresh fails.
    }
  }, []);

  useEffect(() => {
    if (!allowed) return;
    void refresh();
    const onCatalogChange = () => void refresh();
    window.addEventListener("glymize-catalog-change", onCatalogChange);
    const timer = window.setInterval(refresh, 30_000);
    return () => {
      window.removeEventListener("glymize-catalog-change", onCatalogChange);
      window.clearInterval(timer);
    };
  }, [allowed, refresh]);

  if (!allowed) return null;

  const open = notifications.filter((item) => item.status !== "resolved");
  const unread = open.filter((item) => item.status === "unread").length;
  const hasError = open.some((item) => item.severity === "error");

  return (
    <Link
      aria-label={unread ? `${unread} اعلان مدیریت خوانده‌نشده` : "اعلان‌های مدیریت"}
      className={`admin-notification-bell${hasError ? " has-error" : unread ? " has-warning" : ""}`}
      href="/admin/notifications"
      title="اعلان‌های به‌روزرسانی و بازبینی"
    >
      <span aria-hidden="true">♢</span>
      {unread > 0 && <b>{unread > 99 ? "99+" : unread}</b>}
    </Link>
  );
}
