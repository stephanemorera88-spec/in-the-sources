import type { Metadata } from "next";
import type React from "react";
import { Geist_Mono, Schibsted_Grotesk, Source_Serif_4 } from "next/font/google";
import "./globals.css";
import { PRODUCT } from "@/lib/product";

/* No analytics here. The Meta pixel is rendered by the marketing pages only
   (src/app/page.tsx, src/app/thanks/page.tsx): a root-layout pixel would also
   fire on /activate and /app, where a PageView carries the page URL to a
   third party (review fix, 2026-10-01). */

/* Option types: node_modules/next/dist/compiled/@next/font/dist/google/index.d.ts
   (Source_Serif_4 line 17114, Schibsted_Grotesk line 16361, Geist_Mono line 5674).
   All three are variable fonts, so weight "variable" loads the full axis. */
const serifDisplay = Source_Serif_4({
  subsets: ["latin"],
  weight: "variable",
  display: "swap",
  variable: "--font-serif-display",
});

const sansBody = Schibsted_Grotesk({
  subsets: ["latin"],
  weight: "variable",
  display: "swap",
  variable: "--font-sans-body",
});

const geistMono = Geist_Mono({
  subsets: ["latin"],
  weight: "variable",
  display: "swap",
  variable: "--font-geist-mono",
});

function baseUrl(): URL {
  const fallback = "http://localhost:3000";
  try {
    return new URL(process.env.NEXT_PUBLIC_BASE_URL?.trim() || fallback);
  } catch {
    return new URL(fallback);
  }
}

export const metadata: Metadata = {
  metadataBase: baseUrl(),
  title: {
    template: `%s | ${PRODUCT.name}`,
    default: PRODUCT.name,
  },
  description: PRODUCT.tagline,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${serifDisplay.variable} ${sansBody.variable} ${geistMono.variable} antialiased`}>
        {children}
      </body>
    </html>
  );
}
