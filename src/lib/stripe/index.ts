import "../server-only";
import Stripe from "stripe";

/*
 * Stripe webhook verification (module B). The app holds no Stripe secret
 * key in v1, so nothing here constructs a Stripe client.
 *
 * `Stripe.webhooks` is a static on the class (node_modules/stripe/esm/stripe.core.d.ts
 * line 144, `static webhooks: ReturnType<typeof createWebhooks>`), populated by
 * `Stripe.initialize(new NodePlatformFunctions())` at module load
 * (node_modules/stripe/esm/stripe.esm.node.js line 678). So
 * `Stripe.webhooks.constructEvent(payload, header, secret)`
 * (node_modules/stripe/esm/Webhooks.d.ts line 46) needs no instance and no API key.
 * Return type `Stripe.Event` is exported from the namespace at stripe.core.d.ts line 384.
 */

/** Reads STRIPE_WEBHOOK_SECRET at call time; throws when it is unset. */
export function constructWebhookEvent(rawBody: string, signature: string): Stripe.Event {
  const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!secret) {
    throw new Error("STRIPE_WEBHOOK_SECRET is not set; add the signing secret from the Stripe webhook endpoint.");
  }
  return Stripe.webhooks.constructEvent(rawBody, signature, secret);
}

/** True for the error constructEvent throws on a bad or stale signature (Error.d.ts line 150). */
export function isSignatureError(err: unknown): boolean {
  return err instanceof Stripe.errors.StripeSignatureVerificationError;
}

/**
 * Plan for a completed checkout session.
 *
 * Limitation, documented on purpose: a webhook payload carries `line_items`
 * only when the event was retrieved with `expand`, which a plain webhook
 * delivery never is, and v1 holds no Stripe secret key to fetch them. So:
 *  - STRIPE_FOUNDER_PRICE_ID unset: "founder" (the only product on sale).
 *  - set and line_items present (expanded): "founder" when any line item's
 *    price id matches, otherwise "standard".
 *  - set but line_items absent: "founder", since we cannot tell.
 * Fields: Session.line_items?: ApiList<LineItem> (resources/Checkout/Sessions.d.ts line 186),
 * ApiList.data (lib.d.ts line 183), LineItem.price: Price | null (resources/LineItems.d.ts line 50),
 * Price.id (resources/Prices.d.ts line 34).
 */
export function planForSession(session: Stripe.Checkout.Session): "founder" | "standard" {
  const founderPriceId = process.env.STRIPE_FOUNDER_PRICE_ID?.trim();
  if (!founderPriceId) return "founder";
  const items = session.line_items?.data;
  if (!items || items.length === 0) return "founder";
  return items.some((item) => item.price?.id === founderPriceId) ? "founder" : "standard";
}
