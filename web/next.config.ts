import type { NextConfig } from "next";
import bundleAnalyzer from "@next/bundle-analyzer";
import { execFileSync } from "node:child_process";

const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === "true",
});

let buildCommit = "local";
try {
  buildCommit = execFileSync("git", ["rev-parse", "--short", "HEAD"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }).trim();
} catch {
  buildCommit = "local";
}

const config: NextConfig = {
  output: "export",
  images: { unoptimized: true },
  trailingSlash: true,
  reactStrictMode: true,
  env: {
    NEXT_PUBLIC_BUILD_COMMIT: buildCommit,
    NEXT_PUBLIC_BUILD_DATE: new Date().toISOString(),
  },
};

export default withBundleAnalyzer(config);
