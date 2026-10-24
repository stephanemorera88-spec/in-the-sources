import type { MetadataRoute } from "next";
import { siteOrigin } from "@/components/marketing/site-url";

/*
 * robots.txt (module D). Everything public is crawlable; the app and the
 * API are not. /thanks stays crawlable and carries a noindex in its metadata,
 * so crawlers can read the directive. Return shape: MetadataRoute.Robots,
 * node_modules/next/dist/lib/metadata/types/metadata-interface.d.ts line 568.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/app", "/api"],
    },
    sitemap: `${siteOrigin()}/sitemap.xml`,
  };
}
