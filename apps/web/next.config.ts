import type { NextConfig } from "next";

const isGitHubPages = process.env.GITHUB_PAGES === "true";
const isDesktopReference = process.env.GLYMIZE_DESKTOP_REFERENCE_PROFILE === "true";
const repositoryName = process.env.GITHUB_REPOSITORY?.split("/")[1] ?? "GLYMIZE";
const useCustomDomain = process.env.GITHUB_PAGES_CUSTOM_DOMAIN === "true";
const basePath = isGitHubPages && !useCustomDomain ? `/${repositoryName}` : "";
const distDir = process.env.GLYMIZE_NEXT_DIST_DIR?.trim() || undefined;

const nextConfig: NextConfig = {
  transpilePackages: ["@glymize/contracts", "@glymize/clinical-engine"],
  output: isGitHubPages || isDesktopReference ? "export" : undefined,
  distDir,
  basePath,
  assetPrefix: basePath || undefined,
  trailingSlash: isGitHubPages || isDesktopReference,
  images: { unoptimized: true },
  env: {
    NEXT_PUBLIC_BASE_PATH: basePath,
    NEXT_PUBLIC_OFFLINE_BUNDLE_ENABLED: String(isGitHubPages && process.env.GLYMIZE_OFFLINE_BUNDLE_ENABLED === "true"),
    NEXT_PUBLIC_DESKTOP_REFERENCE_PROFILE: String(isDesktopReference),
  }
};

export default nextConfig;
