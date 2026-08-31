export const CLINICAL_PAGE_PERMISSIONS = [
  { key: "dashboard", href: "/dashboard", fa: "داشبورد", en: "Dashboard" },
  { key: "type2", href: "/type-2", fa: "دیابت نوع ۲", en: "Type 2 diabetes" },
  { key: "type1", href: "/type-1", fa: "دیابت نوع ۱", en: "Type 1 diabetes" },
  { key: "pregnancy", href: "/pregnancy", fa: "دیابت بارداری", en: "Gestational diabetes" },
  { key: "insulin_tools", href: "/insulin-tools", fa: "ابزارهای انسولین", en: "Insulin tools" },
  { key: "care_team", href: "/care-team", fa: "تیم مراقبت / دستیار پزشک", en: "Care team / physician assistant" },
  { key: "evidence", href: "/evidence-assistant", fa: "دستیار علمی AI", en: "Evidence AI" },
] as const;

export const DATA_ACTION_PERMISSIONS = [
  { key: "handoff.read", fa: "مشاهده handoff بیمار", en: "Read patient handoff" },
  { key: "handoff.write", fa: "ثبت/ویرایش handoff بیمار", en: "Write patient handoff" },
] as const;

export const ADMIN_PAGE_PERMISSIONS = [
  { key: "admin.center", href: "/admin", fa: "مرکز مدیریت", en: "Admin center" },
  { key: "admin.medications", href: "/admin/medications", fa: "دارو و برندها", en: "Medicines & brands" },
  { key: "admin.data_updates", href: "/admin/data-updates", fa: "به‌روزرسانی داده", en: "Data updates" },
  { key: "admin.master_registry", href: "/admin/master-registry", fa: "رجیستری مرجع", en: "Master registry" },
  { key: "admin.users", href: "/admin/users", fa: "کاربران و دسترسی‌ها", en: "Users & access" },
  { key: "admin.ai_models", href: "/admin/ai-models", fa: "مدل‌های AI مدیریت", en: "Admin AI models" },
  { key: "admin.communications", href: "/admin/communications", fa: "ارتباطات", en: "Communications" },
  { key: "admin.notifications", href: "/admin/notifications", fa: "اعلان‌ها", en: "Notifications" },
] as const;

export type AssistantPermission =
  | "dashboard"
  | "type2"
  | "type1"
  | "pregnancy"
  | "insulin_tools"
  | "evidence"
  | "care_team"
  | "handoff.read"
  | "handoff.write";

export type AdminPermission =
  | "admin.center"
  | "admin.medications"
  | "admin.data_updates"
  | "admin.master_registry"
  | "admin.users"
  | "admin.ai_models"
  | "admin.communications"
  | "admin.notifications";

export type RuntimePermission = AssistantPermission | AdminPermission;

export const ASSISTANT_PERMISSION_KEYS: readonly AssistantPermission[] = [
  "dashboard",
  "type2",
  "type1",
  "pregnancy",
  "insulin_tools",
  "evidence",
  "care_team",
  "handoff.read",
  "handoff.write",
];

export const ADMIN_PERMISSION_KEYS: readonly AdminPermission[] =
  ADMIN_PAGE_PERMISSIONS.map((item) => item.key);

export const RUNTIME_PERMISSION_KEYS: readonly RuntimePermission[] = [
  ...ASSISTANT_PERMISSION_KEYS,
  ...ADMIN_PERMISSION_KEYS,
];

export const DEFAULT_PHYSICIAN_PERMISSIONS: RuntimePermission[] = [
  ...ASSISTANT_PERMISSION_KEYS,
];

export const RUNTIME_PERMISSION_GROUPS = [
  {
    id: "clinical",
    fa: "صفحات بالینی و ابزارها",
    en: "Clinical pages & tools",
    items: CLINICAL_PAGE_PERMISSIONS,
  },
  {
    id: "data",
    fa: "دسترسی به handoff بیمار",
    en: "Patient handoff access",
    items: DATA_ACTION_PERMISSIONS,
  },
  {
    id: "admin",
    fa: "بخش‌های مدیریت",
    en: "Administration sections",
    items: ADMIN_PAGE_PERMISSIONS,
  },
] as const;

export function permissionForClinicalPath(
  pathname: string,
): AssistantPermission | null {
  if (
    pathname === "/records" ||
    pathname.startsWith("/records/")
  ) {
    return "handoff.read";
  }
  const item = CLINICAL_PAGE_PERMISSIONS.find(
    (entry) => pathname === entry.href || pathname.startsWith(`${entry.href}/`),
  );
  return item?.key ?? null;
}

export function permissionForAdminPath(
  pathname: string,
): AdminPermission | null {
  if (pathname === "/admin" || pathname === "/admin/") return "admin.center";
  const item = ADMIN_PAGE_PERMISSIONS
    .filter((entry) => entry.href !== "/admin")
    .find(
      (entry) =>
        pathname === entry.href || pathname.startsWith(`${entry.href}/`),
    );
  return item?.key ?? null;
}

export function hasAnyAdminPermission(
  permissions: readonly RuntimePermission[],
) {
  return ADMIN_PERMISSION_KEYS.some((permission) =>
    permissions.includes(permission),
  );
}

export function firstAllowedAdminPath(
  permissions: readonly RuntimePermission[],
) {
  return (
    ADMIN_PAGE_PERMISSIONS.find((item) => permissions.includes(item.key))
      ?.href ?? null
  );
}

export function firstAllowedRuntimePath(
  permissions: readonly RuntimePermission[],
) {
  return (
    CLINICAL_PAGE_PERMISSIONS.find((item) => permissions.includes(item.key))
      ?.href ??
    (permissions.includes("handoff.read") ? "/records" : null) ??
    firstAllowedAdminPath(permissions) ??
    "/profile"
  );
}
