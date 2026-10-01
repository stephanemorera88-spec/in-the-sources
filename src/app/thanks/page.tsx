import type { Metadata } from "next";
import { Button, PageShell } from "@/components/ui";
import { MetaPixel } from "@/components/MetaPixel";
import { SUPPORT_MAILTO, SiteFooter, SiteHeader } from "@/components/marketing";
import { PRODUCT } from "@/lib/product";

/*
 * /thanks (builder D). The Stripe Payment Link sends the buyer here after
 * checkout. The webhook mints the key and Resend emails it, so this page only
 * has to say where to look and where to paste it. Not indexed.
 */

export const metadata: Metadata = {
  title: "Check your email",
  description: `Your ${PRODUCT.name} founder key is on its way by email.`,
  robots: { index: false, follow: false },
};

/**
 * Address the license email is sent from. EMAIL_FROM is "Name <address>" or a
 * bare address; the default matches SPEC.md. Read at render time on the server.
 */
function senderAddress(): string {
  const raw = process.env.EMAIL_FROM?.trim() || "In the Sources <noreply@evoix.io>";
  const match = /<([^>]+)>/.exec(raw);
  return match ? match[1].trim() : raw;
}

export default function ThanksPage() {
  const sender = senderAddress();

  return (
    <>
      <MetaPixel />
      <SiteHeader />

      <main>
        <PageShell className="py-16 md:py-24">
          <div className="max-w-2xl">
            <h1>Check your email</h1>
            <p className="mt-5 text-ink-70">
              Your founder key is on its way from <span className="font-mono text-[15px] text-ink">{sender}</span>. It
              usually arrives within a minute. If it is not in your inbox, look in spam or promotions, then search for
              the sender address.
            </p>
            <p className="mt-4 text-ink-70">
              When it lands, open the email and follow the link, or paste the key on the activate page.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button href="/activate">Enter your key</Button>
            </div>
            <p className="mt-10 text-[15px] text-ink-50">
              Nothing after a few minutes? Write to{" "}
              <a href={`${SUPPORT_MAILTO}?subject=${encodeURIComponent("Founder key not received")}`}>
                {PRODUCT.supportEmail}
              </a>{" "}
              from the address you paid with and we will resend it.
            </p>
          </div>
        </PageShell>
      </main>

      <SiteFooter />
    </>
  );
}
