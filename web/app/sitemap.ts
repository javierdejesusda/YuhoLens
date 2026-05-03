import type { MetadataRoute } from "next";

export const dynamic = "force-static";

const BASE = "https://yuholens.site";
const ANCHORS = ["problem", "how", "demo", "kg2", "manifest", "faq"] as const;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  return [
    {
      url: `${BASE}/`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 1,
    },
    ...ANCHORS.map((anchor) => ({
      url: `${BASE}/#${anchor}`,
      lastModified: now,
      changeFrequency: "weekly" as const,
      priority: 0.7,
    })),
  ];
}
