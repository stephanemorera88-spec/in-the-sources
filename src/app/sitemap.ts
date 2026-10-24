import type { MetadataRoute } from "next";
import { siteOrigin } from "@/components/marketing/site-url";

/*
 * sitemap.xml (module D). Only the two public pages. /thanks is noindex and
 * /app needs a license. No lastModified: a build-time date would change on
 * every deploy without the pages changing. Return shape: MetadataRoute.Sitemap,
 * node_modules/next/dist/lib/metadata/types/metadata-interface.d.ts line 577.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const origin = siteOrigin();
  return [
    { url: `${origin}/`, changeFrequency: "weekly", priority: 1 },
    { url: `${origin}/activate`, changeFrequency: "yearly", priority: 0.3 },
  ];
}
