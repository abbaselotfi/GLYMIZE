"use client";

import { useEffect, useState } from "react";
import { withBasePath } from "../../lib/base-path";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export default function PwaInstall() {
  const [installPrompt, setInstallPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null);
  const [availableVersion, setAvailableVersion] = useState<string | null>(null);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | undefined;
    let registration: ServiceWorkerRegistration | undefined;
    let lastVersionCheckAt = 0;
    const buildVersionKey = "glymize-build-version-v1";
    const minimumCheckIntervalMs = 60_000;

    const checkBuildVersion = async (force = false) => {
      const now = Date.now();
      if (!force && now - lastVersionCheckAt < minimumCheckIntervalMs) return;
      lastVersionCheckAt = now;
      try {
        const response = await fetch(`${withBasePath("/version.json")}?t=${now}`, { cache: "no-store" });
        if (!response.ok) return;
        const payload = await response.json() as { version?: string };
        const version = String(payload.version ?? "").trim();
        if (!version) return;
        const previous = window.localStorage.getItem(buildVersionKey);
        if (!previous) window.localStorage.setItem(buildVersionKey, version);
        else if (previous !== version) setAvailableVersion(version);
      } catch {
        // Offline PWA continues to use the last healthy cached application.
      }
    };

    const watchInstallingWorker = (worker: ServiceWorker | null) => {
      if (!worker) return;
      worker.addEventListener("statechange", () => {
        if (
          worker.state === "installed" &&
          navigator.serviceWorker.controller
        ) {
          setWaitingWorker(worker);
        }
      });
    };

    const localDevelopment =
      process.env.NODE_ENV !== "production" ||
      ["localhost", "127.0.0.1"].includes(window.location.hostname);

    if (localDevelopment) {
      const resetLocalPwa = async () => {
        if ("serviceWorker" in navigator) {
          const registrations = await navigator.serviceWorker.getRegistrations();
          await Promise.all(registrations.map((item) => item.unregister()));
        }

        if ("caches" in window) {
          const keys = await caches.keys();
          await Promise.all(keys.map((key) => caches.delete(key)));
        }

        const resetKey = "glymize-local-pwa-reset-v2";
        if (
          navigator.serviceWorker?.controller &&
          window.sessionStorage.getItem(resetKey) !== "done"
        ) {
          window.sessionStorage.setItem(resetKey, "done");
          window.location.reload();
        }
      };

      void resetLocalPwa();
    } else if ("serviceWorker" in navigator) {
      void navigator.serviceWorker
        .register(withBasePath("/sw.js"), {
          scope: withBasePath("/"),
          updateViaCache: "none",
        })
        .then((registered) => {
          registration = registered;
          if (
            registered.waiting &&
            navigator.serviceWorker.controller
          ) {
            setWaitingWorker(registered.waiting);
          }
          registered.addEventListener("updatefound", () =>
            watchInstallingWorker(registered.installing),
          );
          interval = setInterval(
            () => { void registered.update(); void checkBuildVersion(true); },
            5 * 60 * 1000,
          );
          void checkBuildVersion(true);
        });
    }

    const standalone = window.matchMedia("(display-mode: standalone)").matches;
    setInstalled(standalone);

    const handler = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    };

    const installedHandler = () => setInstalled(true);
    const visibilityHandler = () => {
      if (document.visibilityState === "visible") {
        void registration?.update();
        void checkBuildVersion();
      }
    };

    let reloading = false;
    const controllerHandler = () => {
      if (localDevelopment || reloading) return;
      reloading = true;
      window.location.reload();
    };

    window.addEventListener("beforeinstallprompt", handler);
    window.addEventListener("appinstalled", installedHandler, { once: true });
    document.addEventListener("visibilitychange", visibilityHandler);
    navigator.serviceWorker?.addEventListener(
      "controllerchange",
      controllerHandler,
    );

    return () => {
      if (interval) clearInterval(interval);
      window.removeEventListener("beforeinstallprompt", handler);
      window.removeEventListener("appinstalled", installedHandler);
      document.removeEventListener("visibilitychange", visibilityHandler);
      navigator.serviceWorker?.removeEventListener(
        "controllerchange",
        controllerHandler,
      );
    };
  }, []);

  if (waitingWorker) {
    return (
      <div className="update-toast" role="status">
        <span>
          <b>نسخهٔ جدید GLYMIZE آماده است</b>
          <small>داده‌ها و تنظیمات تازه دریافت می‌شوند.</small>
        </span>
        <button
          onClick={() =>
            waitingWorker.postMessage({ type: "SKIP_WAITING" })
          }
          type="button"
        >
          به‌روزرسانی
        </button>
      </div>
    );
  }

  if (availableVersion) {
    return (
      <div className="update-toast" role="status">
        <span><b>نسخهٔ جدید GLYMIZE آماده است</b><small>رابط و داده‌های نسخهٔ تازه آمادهٔ بارگذاری هستند.</small></span>
        <button onClick={() => { window.localStorage.setItem("glymize-build-version-v1", availableVersion); window.location.reload(); }} type="button">دریافت نسخه</button>
      </div>
    );
  }

  if (installed) {
    return <span className="install-status">✓ نصب شده</span>;
  }

  // No install prompt means there is nothing actionable to show. The old
  // circular "د" avatar was a prototype fallback and had no product meaning.
  if (!installPrompt) return null;

  return (
    <button
      className="install-button"
      onClick={async () => {
        await installPrompt.prompt();
        const choice = await installPrompt.userChoice;
        if (choice.outcome === "accepted") {
          setInstallPrompt(null);
        }
      }}
      type="button"
    >
      نصب برنامه
    </button>
  );
}
