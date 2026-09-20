import type { Metadata, Viewport } from "next";

import { withBasePath } from "../lib/base-path";
import RouteAwareShell from "./components/route-aware-shell";
import LegacyPatientRouteBridge from "./components/legacy-patient-route-bridge";
import "./globals.css";
import "./internal-shell.css";
import "./theme-overrides.css";
import "./dark-readability.css";
import "./design-system-v2.css";
import "./design-tokens-v3.css";
import "./redesign-v3.css";
import "./type-2/type2-command-center-v3.css";
import "./type-2/type2-focused-workflow-v3.css";
import "./type-2/type2-visual-flow-v3.css";
import "./type-2/type2-evidence-trace-v3.css";
import "./type-2/type2-adaptive-cards-v3.css";
import "./type-2/type2-final-ux-v4.css";

const isDesktopReferenceBuild =
  process.env.NEXT_PUBLIC_DESKTOP_REFERENCE_PROFILE === "true";

export function generateMetadata(): Metadata {
  return {
    referrer: "no-referrer",
    title: "GLYMIZE | Patient-Centered Clinical Intelligence",
    description:
      "A bilingual physician workspace for longitudinal patient records, evidence, medication intelligence, and specialty clinical modules.",
    ...(isDesktopReferenceBuild ? {} : {
      manifest: withBasePath("/manifest.webmanifest"),
      appleWebApp: {
        capable: true,
        statusBarStyle: "default" as const,
        title: "GLYMIZE",
      },
    }),
    icons: {
      icon: withBasePath("/glymize-favicon.svg"),
      shortcut: withBasePath("/glymize-favicon.svg"),
      apple: withBasePath("/glymize-app-icon.png"),
    },
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f8fa" },
    { media: "(prefers-color-scheme: dark)", color: "#0d1719" },
  ],
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fa" dir="rtl" data-glymize-theme="clinical" data-glymize-mode="light">
      <body>
        {isDesktopReferenceBuild ? children : <>
          <LegacyPatientRouteBridge />
          <RouteAwareShell>{children}</RouteAwareShell>
        </>}
      </body>
    </html>
  );
}
