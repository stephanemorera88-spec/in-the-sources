import { afterEach, describe, expect, it } from "vitest";
import Stripe from "stripe";
import { constructWebhookEvent, isSignatureError, planForSession } from "./index";

const SECRET = "whsec_unit";

describe("constructWebhookEvent", () => {
  afterEach(() => {
    delete process.env.STRIPE_WEBHOOK_SECRET;
    delete process.env.STRIPE_FOUNDER_PRICE_ID;
  });

  it("verifies a test-signed payload without a Stripe API key and rejects a bad one", () => {
    process.env.STRIPE_WEBHOOK_SECRET = SECRET;
    const payload = JSON.stringify({ id: "evt_1", object: "event", type: "ping", data: { object: {} } });
    const header = Stripe.webhooks.generateTestHeaderString({ payload, secret: SECRET });
    const event = constructWebhookEvent(payload, header);
    expect(event.id).toBe("evt_1");
    expect(event.type).toBe("ping");

    try {
      constructWebhookEvent(payload, Stripe.webhooks.generateTestHeaderString({ payload, secret: "whsec_other" }));
      expect.unreachable("bad signature must throw");
    } catch (err) {
      expect(isSignatureError(err)).toBe(true);
    }
    expect(isSignatureError(new Error("x"))).toBe(false);
  });

  it("throws a clear error when the secret is unset", () => {
    expect(() => constructWebhookEvent("{}", "t=1,v1=abc")).toThrow(/STRIPE_WEBHOOK_SECRET/);
  });

  it("maps the plan from STRIPE_FOUNDER_PRICE_ID only when line items are expanded", () => {
    const session = (lineItems?: Array<{ price: { id: string } | null }>) =>
      ({ id: "cs", line_items: lineItems ? { data: lineItems } : undefined }) as unknown as Stripe.Checkout.Session;
    expect(planForSession(session())).toBe("founder");
    expect(planForSession(session([{ price: { id: "price_x" } }]))).toBe("founder");

    process.env.STRIPE_FOUNDER_PRICE_ID = "price_founder";
    expect(planForSession(session())).toBe("founder"); // not expanded: cannot tell, documented limitation
    expect(planForSession(session([]))).toBe("founder");
    expect(planForSession(session([{ price: { id: "price_founder" } }]))).toBe("founder");
    expect(planForSession(session([{ price: { id: "price_other" } }, { price: null }]))).toBe("standard");
  });
});
