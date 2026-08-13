"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import {
  type AssistantPermission,
  type RuntimeUser,
  getCachedRuntimeUser,
  initializeRuntimeSession,
  runtimeAuthEventName,
} from "../../lib/runtime-client";
import GlymizeLanguageSwitch from "./glymize-language-switch";
import PwaInstall from "./pwa-install";
import ThemeControls from "./theme-controls";
import { useGlymizeLocale } from "./use-glymize-locale";
import runtimeStyles from "./runtime-shell.module.css";

const NAVIGATION = [
  { href: "/dashboard", icon: "⌂", fa: "داشبورد", en: "Dashboard", permission: "dashboard" },
  { href: "/type-2", icon: "T2", fa: "دیابت نوع ۲", en: "Type 2 diabetes", permission: "type2" },
  { href: "/type-1", icon: "T1", fa: "دیابت نوع ۱", en: "Type 1 diabetes", permission: "type1" },
  { href: "/pregnancy", icon: "◇", fa: "دیابت بارداری", en: "Gestational diabetes", permission: "pregnancy" },
  { href: "/insulin-tools", icon: "IU", fa: "ابزارهای انسولین", en: "Insulin tools", permission: "insulin_tools" },
  { href: "/evidence-assistant", icon: "AI", fa: "دستیار علمی AI", en: "Evidence AI", permission: "evidence" },
  { href: "/care-team", icon: "RN", fa: "دستیار / پرستار", en: "Assistant / nurse", permission: "care_team" },
] as const satisfies ReadonlyArray<{
  href: string; icon: string; fa: string; en: string; permission: AssistantPermission;
}>;

const COPY = {
  fa: {
    navLabel: "ناوبری اصلی", workspace: "فضای کار بالینی GLYMIZE", subtitle: "تصمیم‌یار دیابت برای پزشک",
    brandSubtitle: "فضای کار بالینی", installable: "نسخهٔ قابل نصب GLYMIZE",
    privacy: "داده بیمار فقط در مسیر handoff کنترل‌شده ذخیره می‌شود", contact: "ارتباط با GLYMIZE",
    menu: "نمایش منو", close: "بستن منو", login: "ورود", profile: "پروفایل",
    loading: "در حال بازیابی نشست امن…", signInTitle: "ورود به GLYMIZE لازم است",
    signInText: "برای استفاده از فضای کار بالینی، با حساب پزشک یا دستیار/پرستار وارد شوید.",
    deniedTitle: "این بخش برای حساب شما فعال نیست", deniedText: "پزشک می‌تواند این دسترسی را از پروفایل و بخش تیم مراقبت تغییر دهد.",
  },
  en: {
    navLabel: "Primary navigation", workspace: "GLYMIZE Clinical Workspace", subtitle: "Decision support for diabetes prescribing",
    brandSubtitle: "Clinical workspace", installable: "Installable GLYMIZE version",
    privacy: "Patient data is stored only in the controlled handoff pathway", contact: "Contact GLYMIZE",
    menu: "Open navigation", close: "Close navigation", login: "Sign in", profile: "Profile",
    loading: "Restoring secure session…", signInTitle: "Sign in to GLYMIZE",
    signInText: "Use a physician or independent assistant/nurse account to access the clinical workspace.",
    deniedTitle: "This section is not enabled for your account", deniedText: "The physician can change this permission from Profile → Care Team.",
  },
} as const;

function permissionForPath(pathname: string): AssistantPermission | null {
  return NAVIGATION.find((item) => pathname === item.href || pathname.startsWith(`${item.href}/`))?.permission ?? null;
}

export default function AppShell({ children }: Readonly<{ children: React.ReactNode }>) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [user, setUser] = useState<RuntimeUser | null>(getCachedRuntimeUser());
  const [authReady, setAuthReady] = useState(false);
  const { locale, isRtl } = useGlymizeLocale();
  const copy = COPY[locale];

  useEffect(() => {
    let active = true;
    void initializeRuntimeSession(true).then((next) => {
      if (active) { setUser(next); setAuthReady(true); }
    });
    const onAuth = () => { setUser(getCachedRuntimeUser()); setAuthReady(true); };
    window.addEventListener(runtimeAuthEventName(), onAuth);
    return () => { active = false; window.removeEventListener(runtimeAuthEventName(), onAuth); };
  }, []);

  const visibleNavigation = useMemo(() => user?.role === "assistant"
    ? NAVIGATION.filter((item) => user.permissions.includes(item.permission))
    : NAVIGATION, [user]);

  const requiredPermission = permissionForPath(pathname);
  const isAdminPath = pathname === "/admin" || pathname.startsWith("/admin/");
  const isPublicRuntimePath = pathname === "/account" || pathname.startsWith("/account/");
  const assistantDenied = Boolean(user?.role === "assistant" && requiredPermission && !user.permissions.includes(requiredPermission));

  if (pathname === "/") return <>{children}</>;

  let renderedChildren = children;
  if (!isAdminPath && !isPublicRuntimePath && pathname !== "/profile") {
    if (!authReady) {
      renderedChildren = <section className={runtimeStyles.gate}><strong>{copy.loading}</strong></section>;
    } else if (!user) {
      renderedChildren = <section className={runtimeStyles.gate}><strong>{copy.signInTitle}</strong><p>{copy.signInText}</p><Link href="/account">{copy.login}</Link></section>;
    } else if (assistantDenied) {
      renderedChildren = <section className={runtimeStyles.gate}><strong>{copy.deniedTitle}</strong><p>{copy.deniedText}</p><Link href="/profile">{copy.profile}</Link></section>;
    }
  }

  return (
    <div className="app-shell glymize-internal-shell" dir={isRtl ? "rtl" : "ltr"} data-layout-preset={user?.layoutPreset ?? "auto"}>
      <aside className={menuOpen ? "sidebar open" : "sidebar"} aria-label={copy.navLabel}>
        <Link className="brand" href={user ? "/dashboard" : "/account"} onClick={() => setMenuOpen(false)}>
          <span className="brand-mark" aria-hidden="true">Y</span>
          <span><strong>GLYMIZE</strong><small>{copy.brandSubtitle}</small></span>
        </Link>

        <nav className="main-nav">
          {visibleNavigation.map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return <Link className={active ? "nav-item active" : "nav-item"} href={item.href} key={item.href} onClick={() => setMenuOpen(false)}><span>{item.icon}</span><span>{item[locale]}</span></Link>;
          })}
          <Link className={pathname.startsWith("/profile") ? "nav-item active" : "nav-item"} href={user ? "/profile" : "/account"} onClick={() => setMenuOpen(false)}><span>ID</span><span>{user ? copy.profile : copy.login}</span></Link>
        </nav>

        <div className="sidebar-note"><span className="status-dot" /><div><strong>{copy.installable}</strong><small>{copy.privacy}</small><a className="support-email" href="mailto:info@glymize.ir?subject=GLYMIZE%20Feedback" title={copy.contact}>info@glymize.ir</a></div></div>
      </aside>

      <div className="content-shell">
        <header className="global-topbar glymize-shared-topbar">
          <button className="mobile-menu" onClick={() => setMenuOpen((value) => !value)} type="button" aria-label={copy.menu} aria-expanded={menuOpen}>☰</button>
          <div className="topbar-title"><strong>{copy.workspace}</strong><span>{copy.subtitle}</span></div>
          <div className="topbar-actions">
            {user ? <Link className={runtimeStyles.profileChip} href="/profile" title={copy.profile}>{user.profilePhoto ? <img src={user.profilePhoto} alt="" /> : <span>{user.firstName.slice(0, 1)}{user.lastName.slice(0, 1)}</span>}<b>{user.firstName} {user.lastName}</b></Link> : <Link className={runtimeStyles.profileChip} href="/account"><span>ID</span><b>{copy.login}</b></Link>}
            <ThemeControls /><PwaInstall /><GlymizeLanguageSwitch />
          </div>
        </header>
        <div className="page-content">{renderedChildren}</div>
      </div>
      {menuOpen && <button className="sidebar-overlay" onClick={() => setMenuOpen(false)} type="button" aria-label={copy.close} />}
    </div>
  );
}
