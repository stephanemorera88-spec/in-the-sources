import { createLicense, licenseExistsForStripeSession } from "@/lib/db";
import { sendLicenseKeyEmail } from "@/lib/email";
import { constructWebhookEvent, isSignatureError, planForSession } from "@/lib/stripe";

/*
 * POST /api/stripe/webhook
 * Raw body + `stripe-signature` header, verified with STRIPE_WEBHOOK_SECRET.
 *   bad or missing signature          -> 400
 *   any event but checkout.session.completed -> 200 { ignored: type }
 *   session already minted a license  -> 200 { duplicate: true }
 *   session has no email              -> 200 { skipped: "no email" } (logged)
 *   license minted, email sent        -> 200 { ok: true, emailed: true }
 *   license minted, email failed      -> 200 { ok: true, emailed: false } (logged; the key is in the db)
 *   license insert failed             -> 500 so Stripe retries (no key exists yet)
 * The plaintext key is never logged.
 *
 * Event fields: CheckoutSessionCompletedEvent (stripe/esm/resources/Events.d.ts line 725),
 * data.object: Checkout.Session (line 731); Session.id line 52, customer_details line 150
 * (CustomerDetails.email line 495), customer_email line 158 of resources/Checkout/Sessions.d.ts.
 */
export async function POST(req: Request): Promise<Response> {
  const rawBody = await req.text();
  const signature = req.headers.get("stripe-signature");
  if (!signature) return Response.json({ error: "missing stripe-signature header" }, { status: 400 });

  let event;
  try {
    event = constructWebhookEvent(rawBody, signature);
  } catch (err: unknown) {
    if (!isSignatureError(err)) {
      console.error("[stripe] webhook verification failed:", err instanceof Error ? err.message : err);
    }
    return Response.json({ error: "invalid signature" }, { status: 400 });
  }

  if (event.type !== "checkout.session.completed") {
    return Response.json({ ignored: event.type });
  }

  const session = event.data.object;
  if (await licenseExistsForStripeSession(session.id)) {
    return Response.json({ duplicate: true });
  }

  const email = session.customer_details?.email ?? session.customer_email;
  if (!email) {
    console.error(`[stripe] checkout.session.completed ${session.id} has no customer email; no license minted.`);
    return Response.json({ skipped: "no email" });
  }

  let minted: Awaited<ReturnType<typeof createLicense>>;
  try {
    minted = await createLicense({ email, plan: planForSession(session), stripeSessionId: session.id });
  } catch (err: unknown) {
    // A concurrent delivery can win the unique index race on stripe_session_id.
    if (await licenseExistsForStripeSession(session.id)) return Response.json({ duplicate: true });
    console.error(`[stripe] createLicense failed for session ${session.id}:`, err instanceof Error ? err.message : err);
    return Response.json({ error: "license_create_failed" }, { status: 500 });
  }

  try {
    await sendLicenseKeyEmail({ to: email, key: minted.key });
  } catch (err: unknown) {
    console.error(
      `[stripe] license ${minted.license.id} minted for session ${session.id} but the email failed:`,
      err instanceof Error ? err.message : err
    );
    return Response.json({ ok: true, emailed: false });
  }
  return Response.json({ ok: true, emailed: true });
}
