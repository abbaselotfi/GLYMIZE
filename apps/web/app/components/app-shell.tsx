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
import {
  firstAllowedAdminPath,
  permissionForClinicalPath,
} from "../../lib/runtime-permissions";
import GlymizeLanguageSwitch from "./glymize-language-switch";
import PwaInstall from "./pwa-install";
import ThemeControls from "./theme-controls";
import { useGlymizeLocale } from "./use-glymize-locale";
import runtimeStyles from "./runtime-shell.module.css";

type NavGroup = "clinical" | "workflow";
type LocalQaLayoutPreset = "auto" | "command_center" | "focused_workflow" | "compact_cards" | "evidence_trace";
const LOCAL_QA_LAYOUT_KEY = "glymize-local-layout-preset";
const LOCAL_QA_LAYOUT_EVENT = "glymize-local-layout-preset-change";

type NavItem = {
  href: string;
  icon: string;
  fa: string;
  en: string;
  permission: AssistantPermission;
  group: NavGroup;
};

const NAVIGATION: readonly NavItem[] = [
  { href: "/dashboard", icon: "⌂", fa: "داشبورد", en: "Dashboard", permission: "dashboard", group: "clinical" },
  { href: "/type-2", icon: "T2", fa: "دیابت نوع ۲", en: "Type 2 diabetes", permission: "type2", group: "clinical" },
  { href: "/type-1", icon: "T1", fa: "دیابت نوع ۱", en: "Type 1 diabetes", permission: "type1", group: "clinical" },
  { href: "/pregnancy", icon: "◇", fa: "دیابت بارداری", en: "Gestational diabetes", permission: "pregnancy", group: "clinical" },
  { href: "/insulin-tools", icon: "IU", fa: "ابزارهای انسولین", en: "Insulin tools", permission: "insulin_tools", group: "workflow" },
  { href: "/care-team", icon: "RN", fa: "تیم مراقبت", en: "Care team", permission: "care_team", group: "workflow" },
  { href: "/records", icon: "AR", fa: "\u0622\u0631\u0634\u06cc\u0648 \u067e\u0631\u0648\u0646\u062f\u0647\u200c\u0647\u0627", en: "Patient archive", permission: "handoff.read", group: "workflow" },
  { href: "/evidence-assistant", icon: "AI", fa: "دستیار علمی AI", en: "Evidence AI", permission: "evidence", group: "workflow" },
];

const COPY = {
  fa: {
    navLabel: "ناوبری اصلی", workspace: "GLYMIZE Clinical Command Center", subtitle: "تصمیم‌یار دیابت برای پزشک",
    brandSubtitle: "فضای کار بالینی", installable: "نسخهٔ قابل نصب GLYMIZE",
    privacy: "داده بیمار فقط در مسیر handoff کنترل‌شده ذخیره می‌شود", contact: "ارتباط با GLYMIZE",
    menu: "نمایش منو", close: "بستن منو", login: "ورود", profile: "پروفایل",
    clinical: "مسیرهای بالینی", workflow: "ابزار و همکاری",
    loading: "در حال بازیابی نشست امن…", signInTitle: "ورود به GLYMIZE لازم است",
    signInText: "برای استفاده از فضای کار بالینی، با حساب پزشک یا دستیار/پرستار وارد شوید.",
    deniedTitle: "این بخش برای حساب شما فعال نیست", deniedText: "مدیر سیستم می‌تواند دسترسی این صفحه را از بخش کاربران و دسترسی‌ها تغییر دهد.",
    modes: { auto: "Auto", command_center: "Command Center", focused_workflow: "Guided Focus", compact_cards: "Visual Flow", evidence_trace: "Evidence Trace" },
  },
  en: {
    navLabel: "Primary navigation", workspace: "GLYMIZE Clinical Command Center", subtitle: "Decision support for diabetes prescribing",
    brandSubtitle: "Clinical workspace", installable: "Installable GLYMIZE version",
    privacy: "Patient data is stored only in the controlled handoff pathway", contact: "Contact GLYMIZE",
    menu: "Open navigation", close: "Close navigation", login: "Sign in", profile: "Profile",
    clinical: "Clinical pathways", workflow: "Tools & collaboration",
    loading: "Restoring secure session…", signInTitle: "Sign in to GLYMIZE",
    signInText: "Use a physician or independent assistant/nurse account to access the clinical workspace.",
    deniedTitle: "This section is not enabled for your account", deniedText: "A system administrator can change this page permission from Users & access.",
    modes: { auto: "Auto", command_center: "Command Center", focused_workflow: "Guided Focus", compact_cards: "Visual Flow", evidence_trace: "Evidence Trace" },
  },
} as const;

function routeToken(pathname: string) {
  if (pathname === "/admin" || pathname.startsWith("/admin/")) return "admin";
  if (pathname === "/type-2" || pathname.startsWith("/type-2/")) return "type-2";
  if (pathname === "/insulin-tools" || pathname.startsWith("/insulin-tools/")) return "insulin-tools";
  if (pathname === "/care-team" || pathname.startsWith("/care-team/")) return "care-team";
  if (pathname === "/records" || pathname.startsWith("/records/")) return "records";
  if (pathname === "/evidence-assistant" || pathname.startsWith("/evidence-assistant/")) return "evidence";
  if (pathname === "/profile" || pathname.startsWith("/profile/")) return "profile";
  if (pathname === "/account" || pathname.startsWith("/account/")) return "account";
  return pathname.split("/").filter(Boolean)[0] || "workspace";
}

export default function AppShell({ children }: Readonly<{ children: React.ReactNode }>) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [user, setUser] = useState<RuntimeUser | null>(getCachedRuntimeUser());
  const [authReady, setAuthReady] = useState(false);
  const [localQaPreset, setLocalQaPreset] = useState<LocalQaLayoutPreset>("auto");
  const { locale, isRtl } = useGlymizeLocale();
  const copy = COPY[locale];
  const localUiBypass = process.env.NODE_ENV !== "production" && process.env.NEXT_PUBLIC_LOCAL_UI_BYPASS === "1";

  useEffect(() => {
    let active = true;
    void initializeRuntimeSession(true).then((next) => {
      if (active) { setUser(next); setAuthReady(true); }
    });
    const onAuth = () => { setUser(getCachedRuntimeUser()); setAuthReady(true); };
    window.addEventListener(runtimeAuthEventName(), onAuth);
    return () => { active = false; window.removeEventListener(runtimeAuthEventName(), onAuth); };
  }, []);

  useEffect(() => { setMenuOpen(false); }, [pathname]);

  useEffect(() => {
    if (!localUiBypass) return;
    function readLocalQaPreset() {
      const value = window.localStorage.getItem(LOCAL_QA_LAYOUT_KEY);
      if (value === "auto" || value === "command_center" || value === "focused_workflow" || value === "compact_cards" || value === "evidence_trace" || value === "evidence_trace" || value === "evidence_trace" || value === "evidence_trace" || value === "evidence_trace") {
        setLocalQaPreset(value);
      } else {
        setLocalQaPreset("auto");
      }
    }
    readLocalQaPreset();
    window.addEventListener(LOCAL_QA_LAYOUT_EVENT, readLocalQaPreset);
    return () => window.removeEventListener(LOCAL_QA_LAYOUT_EVENT, readLocalQaPreset);
  }, [localUiBypass]);

  const visibleNavigation = useMemo(() => user
    ? NAVIGATION.filter((item) => user.permissions.includes(item.permission))
    : NAVIGATION, [user]);

  const groupedNavigation = useMemo(() => ({
    clinical: visibleNavigation.filter((item) => item.group === "clinical"),
    workflow: visibleNavigation.filter((item) => item.group === "workflow"),
  }), [visibleNavigation]);

  const mobileNavigation = useMemo(() => {
    const preferred = ["/dashboard", "/type-2", "/care-team", "/evidence-assistant"];
    return preferred.map((href) => visibleNavigation.find((item) => item.href === href)).filter((item): item is NavItem => Boolean(item));
  }, [visibleNavigation]);

  const adminHref = useMemo(
    () => user ? firstAllowedAdminPath(user.permissions) : null,
    [user],
  );
  const homeHref = user
    ? (visibleNavigation[0]?.href ?? adminHref ?? "/profile")
    : "/account";
  const requiredPermission = permissionForClinicalPath(pathname);
  const isAdminPath = pathname === "/admin" || pathname.startsWith("/admin/");
  const isPublicRuntimePath = pathname === "/account" || pathname.startsWith("/account/");
  const permissionDenied = Boolean(user && requiredPermission && !user.permissions.includes(requiredPermission));

  if (pathname === "/") return <>{children}</>;

  let renderedChildren = children;
  if (!localUiBypass && !isAdminPath && !isPublicRuntimePath && pathname !== "/profile") {
    if (!authReady) {
      renderedChildren = <section className={runtimeStyles.gate}><strong>{copy.loading}</strong></section>;
    } else if (!user) {
      renderedChildren = <section className={runtimeStyles.gate}><strong>{copy.signInTitle}</strong><p>{copy.signInText}</p><Link href="/account">{copy.login}</Link></section>;
    } else if (permissionDenied) {
      renderedChildren = <section className={runtimeStyles.gate}><strong>{copy.deniedTitle}</strong><p>{copy.deniedText}</p><Link href="/profile">{copy.profile}</Link></section>;
    }
  }

  const preset = localUiBypass ? localQaPreset : (user?.layoutPreset ?? "auto");

  return (
    <div
      className="app-shell glymize-internal-shell"
      dir={isRtl ? "rtl" : "ltr"}
      data-layout-preset={preset}
      data-route={routeToken(pathname)}
      data-role={user?.role ?? "guest"}
    >
      <aside className={menuOpen ? "sidebar open" : "sidebar"} aria-label={copy.navLabel}>
        <Link className="brand" href={homeHref}>
          <span className="brand-mark" aria-hidden="true">Y</span>
          <span><strong>GLYMIZE</strong><small>{copy.brandSubtitle}</small></span>
        </Link>

        <nav className="main-nav">
          <span className="nav-section-label">{copy.clinical}</span>
          {groupedNavigation.clinical.map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return <Link className={active ? "nav-item active" : "nav-item"} href={item.href} key={item.href}><span>{item.icon}</span><span>{item[locale]}</span></Link>;
          })}
          <span className="nav-section-label">{copy.workflow}</span>
          {groupedNavigation.workflow.map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return <Link className={active ? "nav-item active" : "nav-item"} href={item.href} key={item.href}><span>{item.icon}</span><span>{item[locale]}</span></Link>;
          })}
          <Link className={pathname.startsWith("/profile") ? "nav-item active" : "nav-item"} href={user ? "/profile" : "/account"}><span>ID</span><span>{user ? copy.profile : copy.login}</span></Link>
          {adminHref && <Link className={pathname.startsWith("/admin") ? "nav-item active" : "nav-item"} href={adminHref}><span>AD</span><span>{locale === "fa" ? "مدیریت" : "Admin"}</span></Link>}
        </nav>

        <div className="sidebar-note"><span className="status-dot" /><div><strong>{copy.installable}</strong><small>{copy.privacy}</small><a className="support-email" href="mailto:info@glymize.ir?subject=GLYMIZE%20Feedback" title={copy.contact}>info@glymize.ir</a></div></div>
      </aside>

      <div className="content-shell">
        <header className="global-topbar glymize-shared-topbar">
          <button className="mobile-menu" onClick={() => setMenuOpen((value) => !value)} type="button" aria-label={copy.menu} aria-expanded={menuOpen}>☰</button>
          <div className="topbar-title"><strong>{copy.workspace}</strong><span>{copy.subtitle}</span></div>
          {user && <span className="workspace-mode-badge" title={locale === "fa" ? "چیدمان از پروفایل قابل تغییر است" : "Change workspace layout from Profile"}>{copy.modes[preset]}</span>}
          <div className="topbar-actions">
            {user ? <Link className={runtimeStyles.profileChip} href="/profile" title={copy.profile}>{user.profilePhoto ? <img src={user.profilePhoto} alt="" /> : <span>{user.firstName.slice(0, 1)}{user.lastName.slice(0, 1)}</span>}<b>{user.firstName} {user.lastName}</b></Link> : <Link className={runtimeStyles.profileChip} href="/account"><span>ID</span><b>{copy.login}</b></Link>}
            <ThemeControls /><PwaInstall /><GlymizeLanguageSwitch />
          </div>
        </header>
        <div className="page-content">{renderedChildren}</div>
      </div>

      {user && !isAdminPath && !isPublicRuntimePath && <nav className="shell-mobile-nav" aria-label={copy.navLabel}>
        {mobileNavigation.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return <Link className={active ? "active" : ""} href={item.href} key={item.href}><span>{item.icon}</span><span>{item[locale]}</span></Link>;
        })}
        <Link className={pathname.startsWith("/profile") ? "active" : ""} href="/profile"><span>ID</span><span>{copy.profile}</span></Link>
        {adminHref && <Link className={pathname.startsWith("/admin") ? "active" : ""} href={adminHref}><span>AD</span><span>{locale === "fa" ? "مدیریت" : "Admin"}</span></Link>}
      </nav>}

      {menuOpen && <button className="sidebar-overlay" onClick={() => setMenuOpen(false)} type="button" aria-label={copy.close} />}
    </div>
  );
}
