"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  clearAdminSession,
  consumeAdminSessionFromLocation,
  getAdminIdentity,
  getAdminLoginUrl,
  getAdminSession,
  isAdminApiConfigured,
  type AdminIdentity,
} from "../../lib/admin-auth";
import {
  firstAllowedAdminPath,
  permissionForAdminPath,
} from "../../lib/runtime-permissions";
import {
  initializeRuntimeSession,
  logoutRuntime,
  type RuntimeUser,
} from "../../lib/runtime-client";

type AuthState =
  | { status: "checking" }
  | { status: "local_preview" }
  | { status: "signed_out" }
  | { status: "misconfigured" }
  | {
      status: "denied";
      user: RuntimeUser;
      firstAllowedPath: string | null;
    }
  | { status: "signed_in"; identity: AdminIdentity };

interface PublishEventDetail {
  status: "pending" | "publishing" | "success" | "error";
  message: string;
}

export default function AdminAuthGuard({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const pathname = usePathname();
  const [auth, setAuth] = useState<AuthState>({ status: "checking" });
  const [publishMessage, setPublishMessage] = useState("");

  useEffect(() => {
    let active = true;

    async function check() {
      setAuth({ status: "checking" });

      if (process.env.NODE_ENV === "development") {
        clearAdminSession();
        if (active) setAuth({ status: "local_preview" });
        return;
      }

      if (!isAdminApiConfigured()) {
        if (active) setAuth({ status: "misconfigured" });
        return;
      }

      consumeAdminSessionFromLocation();

      if (getAdminSession()) {
        try {
          const identity = await getAdminIdentity();
          if (active) setAuth({ status: "signed_in", identity });
        } catch {
          if (active) setAuth({ status: "signed_out" });
        }
        return;
      }

      const user = await initializeRuntimeSession(true).catch(() => null);
      if (!active) return;
      if (!user) {
        setAuth({ status: "signed_out" });
        return;
      }

      const required = permissionForAdminPath(pathname);
      const firstAllowedPath = firstAllowedAdminPath(user.permissions);
      if (!required || !user.permissions.includes(required)) {
        setAuth({ status: "denied", user, firstAllowedPath });
        return;
      }

      try {
        const identity = await getAdminIdentity();
        if (!active) return;
        if (
          identity.source !== "runtime" ||
          !identity.permissions.includes(required)
        ) {
          setAuth({ status: "denied", user, firstAllowedPath });
          return;
        }
        setAuth({ status: "signed_in", identity });
      } catch {
        setAuth({ status: "denied", user, firstAllowedPath });
      }
    }

    void check();
    return () => {
      active = false;
    };
  }, [pathname]);

  useEffect(() => {
    const handler = (event: Event) => {
      setPublishMessage(
        (event as CustomEvent<PublishEventDetail>).detail.message,
      );
    };
    window.addEventListener("glymize-publish-status", handler);
    return () =>
      window.removeEventListener("glymize-publish-status", handler);
  }, []);

  if (auth.status === "checking") {
    return (
      <main className="admin-auth-page">
        <section className="admin-auth-card">
          <p>در حال بررسی دسترسی مدیریت…</p>
        </section>
      </main>
    );
  }

  if (auth.status === "local_preview") {
    return (
      <>
        <section className="admin-session-bar">
          <span>
            <b>Local Admin Preview</b> — فقط برای تست روی این دستگاه
          </span>
          <span>
            انتشار مرکزی و نشست مدیریت در حالت development غیرفعال است.
          </span>
        </section>
        {children}
      </>
    );
  }

  if (auth.status === "misconfigured") {
    return (
      <main className="admin-auth-page">
        <section className="admin-auth-card">
          <span className="eyebrow">Admin authentication</span>
          <h1>سرویس امن مدیریت هنوز متصل نشده است</h1>
          <p>
            سرویس امن مدیریت در این محیط پیکربندی نشده است.
            تنظیمات بخش مدیریت را بررسی کنید.
          </p>
        </section>
      </main>
    );
  }

  if (auth.status === "signed_out") {
    return (
      <main className="admin-auth-page">
        <section className="admin-auth-card">
          <span className="eyebrow">Admin access</span>
          <h1>ورود به بخش مدیریت GLYMIZE</h1>
          <p>
            مالک سیستم می‌تواند از مسیر امن مدیریت وارد شود. حساب‌های
            GLYMIZE نیز در صورت داشتن مجوز همان صفحه می‌توانند وارد بخش‌های
            مدیریت تعیین‌شده شوند.
          </p>
          <a
            className="primary-button"
            href={getAdminLoginUrl(window.location.href)}
          >
            ورود مالک سیستم
          </a>
          <p>
            <Link href="/account">ورود با حساب GLYMIZE</Link>
          </p>
        </section>
      </main>
    );
  }

  if (auth.status === "denied") {
    return (
      <main className="admin-auth-page">
        <section className="admin-auth-card">
          <span className="eyebrow">Permission required</span>
          <h1>این صفحه برای حساب شما فعال نیست</h1>
          <p>
            دسترسی صفحات مدیریت به‌صورت مستقل برای هر حساب تعیین می‌شود.
          </p>
          {auth.firstAllowedPath ? (
            <Link className="primary-button" href={auth.firstAllowedPath}>
              رفتن به بخش مدیریت مجاز
            </Link>
          ) : (
            <Link className="primary-button" href="/dashboard">
              بازگشت به فضای کار
            </Link>
          )}
        </section>
      </main>
    );
  }

  const runtimeAdmin = auth.identity.source === "runtime";

  return (
    <>
      <section className="admin-session-bar">
        <span>
          {runtimeAdmin ? "مدیر GLYMIZE" : "مالک سیستم"}:{" "}
          <b>@{auth.identity.login}</b>
        </span>
        {runtimeAdmin && (
          <span>
            سطح دسترسی این حساب محدود به صفحات انتخاب‌شده است. انتشار مستقیم
            تغییرات همچنان فقط برای مالک سیستم مجاز است.
          </span>
        )}
        {publishMessage && <span role="status">{publishMessage}</span>}
        <button
          className="secondary"
          onClick={() => {
            if (runtimeAdmin) {
              void logoutRuntime().finally(() =>
                setAuth({ status: "signed_out" }),
              );
            } else {
              clearAdminSession();
              setAuth({ status: "signed_out" });
            }
          }}
          type="button"
        >
          خروج از مدیریت
        </button>
      </section>
      {children}
    </>
  );
}
