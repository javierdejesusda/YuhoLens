import type { MetadataRoute } from "next";

export const dynamic = "force-static";

const BASE = "https://yuholens.site";

// Stable lastmod: derive from BUILD_DATE (set at build time via env), or
// fall back to today. Avoids "always now" timestamps that misrepresent
// content age to crawlers on every redeploy.
function buildDate(): string {
  const env = process.env.NEXT_PUBLIC_BUILD_DATE;
  const d = env ? new Date(env) : new Date();
  return d.toISOString();
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  return [
    {
      url: `${BASE}/`,
      lastModified: buildDate(),
      changeFrequency: "weekly",
      priority: 1,
    },
  ];
}
