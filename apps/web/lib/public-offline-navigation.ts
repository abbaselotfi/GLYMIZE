export const publicOfflineNavigationEnabled = process.env.NEXT_PUBLIC_OFFLINE_BUNDLE_ENABLED === "true";

export function publicDocumentPath(href: string): string | null {
  if (href === "/") return href;
  return /^\/(type-1|type-2|pregnancy|offline)\/?$/.test(href)
    ? `${href.replace(/\/$/, "")}/`
    : null;
}
