import type { Metadata } from "next";

export function generateMetadata(): Metadata {
  return {
    manifest: null,
    appleWebApp: null,
  };
}

export default function OfflineLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
