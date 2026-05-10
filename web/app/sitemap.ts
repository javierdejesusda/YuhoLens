import type { MetadataRoute } from "next";

export const dynamic = "force-static";

const BASE = "https://yuholens.site";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  return [
    {
      url: `${BASE}/`,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 1,
    },
  ];
}
