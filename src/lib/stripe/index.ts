import "../server-only";
import type Stripe from "stripe";

/*
 * Stripe webhook verification (builder B). Phase 1 stub.
 * Uses STRIPE_WEBHOOK_SECRET; the app needs no Stripe secret key in v1.
 *
 * Return type: `Stripe.Event`, exported from the Stripe namespace in
 * node_modules/stripe/esm/stripe.core.d.ts line 384 (type entry
 * esm/stripe.esm.node.d.ts). The verifying call is
 * `Stripe.webhooks.constructEvent(payload, header, secret)` at
 * node_modules/stripe/esm/Webhooks.d.ts line 46, which returns `Event`.
 */
export function constructWebhookEvent(rawBody: string, signature: string): Stripe.Event {
  void rawBody;
  void signature;
  throw new Error("not implemented: constructWebhookEvent");
}
