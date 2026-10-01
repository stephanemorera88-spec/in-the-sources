import type React from "react";
import Link from "next/link";
import { Button, PageShell } from "@/components/ui";
import { PRODUCT } from "@/lib/product";

/*
 * Marketing building blocks for the landing and thanks pages (builder D).
 * Server-safe: no hooks, no "use client". Same design rules as the ui
 * primitives (SPEC.md, "Design"): paper and ink, hairlines instead of cards,
 * 44px pills, no kickers, no gradients. Everything stacks at 390px.
 */

export const SUPPORT_MAILTO = `mailto:${PRODUCT.supportEmail}`;

/* ---------- Header and footer ---------- */

export function SiteHeader() {
  return (
    <header className="border-b border-hairline">
      <PageShell className="flex flex-wrap items-center gap-x-6 gap-y-3 py-4">
        <Link href="/" className="font-serif text-[1.25rem] font-medium tracking-[-0.02em] text-ink no-underline">
          {PRODUCT.name}
        </Link>
        <nav aria-label="Primary" className="ml-auto flex items-center gap-5">
          <Link href="/activate" className="text-[15px] text-ink-70 no-underline hover:underline">
            Sign in
          </Link>
          <Button href="/#pricing">Get a founder key</Button>
        </nav>
      </PageShell>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t border-hairline">
      <PageShell className="py-10">
        <div className="flex flex-wrap items-baseline justify-between gap-x-8 gap-y-4">
          <div>
            <p className="font-serif text-[1.125rem] font-medium tracking-[-0.02em] text-ink">{PRODUCT.name}</p>
            <p className="mt-1 text-[14px] text-ink-50">Built by {PRODUCT.company}</p>
          </div>
          <nav aria-label="Footer" className="flex flex-wrap gap-x-6 gap-y-2 text-[15px]">
            <a href={PRODUCT.companyUrl}>evoix.io</a>
            <Link href="/activate">Sign in</Link>
            <a href={SUPPORT_MAILTO}>Support</a>
          </nav>
        </div>
        <p className="mt-8 max-w-2xl text-[14px] leading-relaxed text-ink-50">
          EVOIX lists this product in the tools roundup it publishes on evoix.io, so treat that listing as the
          maker&apos;s own page rather than an independent review.
        </p>
      </PageShell>
    </footer>
  );
}

/* ---------- Sections ---------- */

/**
 * A hairline-topped section. "split" puts the heading in a left column and
 * the content on the right from md up; "stack" keeps the content full width.
 */
export function Section({
  id,
  title,
  layout = "split",
  children,
}: {
  id: string;
  title: string;
  layout?: "split" | "stack";
  children: React.ReactNode;
}) {
  const headingId = `${id}-title`;
  return (
    <section id={id} aria-labelledby={headingId} className="scroll-mt-4 border-t border-hairline py-12 md:py-16">
      <PageShell>
        <div
          className={
            layout === "split" ? "md:grid md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] md:gap-x-12 lg:gap-x-20" : undefined
          }
        >
          <h2 id={headingId}>{title}</h2>
          <div className="mt-6 md:mt-0">{children}</div>
        </div>
      </PageShell>
    </section>
  );
}

/** Ink bezel (#111110, 18px radius, 10px inset) around a real screenshot. The only dark surface on the page. */
export function ProofBezel({ children }: { children: React.ReactNode }) {
  return <div className="overflow-hidden rounded-[18px] bg-ink p-[10px]">{children}</div>;
}

/* ---------- Lists ---------- */

export interface EngineRow {
  engine: string;
  provider: string;
  model: string;
  source: string;
}

/** Hairline rows, one per engine: name and provider, model id in mono, where the citation comes from. */
export function EngineRows({ rows }: { rows: EngineRow[] }) {
  return (
    <ul className="border-t border-hairline">
      {rows.map((row) => (
        <li
          key={row.engine}
          className="border-b border-hairline py-5 md:grid md:grid-cols-[140px_190px_minmax(0,1fr)] md:gap-x-8"
        >
          <div>
            <p className="font-serif text-[1.125rem] font-medium tracking-[-0.015em] text-ink">{row.engine}</p>
            <p className="text-[14px] text-ink-50">{row.provider}</p>
          </div>
          <p className="mt-2 font-mono text-[14px] text-ink-70 md:mt-1">{row.model}</p>
          <p className="mt-2 text-ink-70 md:mt-0">{row.source}</p>
        </li>
      ))}
    </ul>
  );
}

export interface DefinitionItem {
  term: string;
  detail: React.ReactNode;
}

/** Definition list in hairline rows. Used for the FAQ. */
export function DefinitionList({ items }: { items: DefinitionItem[] }) {
  return (
    <dl className="border-t border-hairline">
      {items.map((item) => (
        <div
          key={item.term}
          className="border-b border-hairline py-5 md:grid md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] md:gap-x-8"
        >
          <dt className="font-serif text-[1.125rem] font-medium tracking-[-0.015em] text-ink">{item.term}</dt>
          <dd className="mt-2 text-ink-70 md:mt-0">{item.detail}</dd>
        </div>
      ))}
    </dl>
  );
}

/* ---------- Buy button ---------- */

/**
 * The Stripe Payment Link, or null when STRIPE_PAYMENT_LINK_URL is unset or
 * not an https URL. Read at render time; the landing page is prerendered, so
 * adding the variable on Vercel needs a redeploy to flip the button.
 */
export function getPaymentLink(): string | null {
  const raw = process.env.STRIPE_PAYMENT_LINK_URL?.trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

/** Primary pill to the Payment Link when it exists, otherwise a secondary pill that opens a support email. */
export function BuyButton({ className }: { className?: string }) {
  const link = getPaymentLink();
  if (link) {
    return (
      <Button href={link} className={className}>
        Buy a founder key
      </Button>
    );
  }
  return (
    <Button variant="secondary" href={`${SUPPORT_MAILTO}?subject=${encodeURIComponent("Founder key")}`} className={className}>
      Founder keys open this week
    </Button>
  );
}
