import type { Metadata, Viewport } from "next";

import { withBasePath } from "../lib/base-path";
import AppShell from "./components/app-shell";
import "./globals.css";
import "./internal-shell.css";
import "./theme-overrides.css";
import "./dark-readability.css";
import "./design-system-v2.css";
import "./design-system-v2-a11y.css";
import "./design-system-v2-legacy.css";
import "./design-system-v2-smoke-fixes.css";
import "./design-tokens-v3-core.css";
import "./design-tokens-v3-semantic.css";
import "./design-tokens-v3-dark.css";
import "./redesign-v3-entry.css";
import "./type-2/type2-command-center-v3.css";
import "./type-2/type2-focused-workflow-v3.css";
import "./type-2/type2-visual-flow-v3.css";
import "./type-2/type2-evidence-trace-v3.css";
import "./type-2/type2-adaptive-cards-v3.css";
import "./type-2/type2-final-ux-v4.css";

export const metadata: Metadata = {
  title: "GLYMIZE | Diabetes Prescribing Intelligence",
  description: "A bilingual clinical decision-support platform for diabetes prescribing.",
  manifest: withBasePath("/manifest.webmanifest"),
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "GLYMIZE",
  },
  icons: {
    icon: withBasePath("/glymize-favicon.svg"),
    shortcut: withBasePath("/glymize-favicon.svg"),
    apple: withBasePath("/glymize-app-icon.png"),
  },
};

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
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
