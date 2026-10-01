import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import Stripe from "stripe";
import { findLicenseByKey, licenseExistsForStripeSession } from "@/lib/db";
import { TEST_KEY_ENCRYPTION_SECRET, createTestDb } from "@/lib/db/test-db";

vi.mock("@/lib/email", () => ({
  sendLicenseKeyEmail: vi.fn(async () => undefined),
}));
import { sendLicenseKeyEmail } from "@/lib/email";
import { POST } from "./route";

const SECRET = "whsec_test_secret_for_vitest";
const sendMock = vi.mocked(sendLicenseKeyEmail);

let db: PGlite;
beforeAll(async () => {
  process.env.KEY_ENCRYPTION_SECRET = TEST_KEY_ENCRYPTION_SECRET;
  process.env.STRIPE_WEBHOOK_SECRET = SECRET;
  delete process.env.STRIPE_FOUNDER_PRICE_ID;
  db = await createTestDb();
});
afterAll(async () => {
  await db.close();
});
beforeEach(() => {
  sendMock.mockClear();
  sendMock.mockResolvedValue(undefined);
});

function checkoutEvent(sessionId: string, overrides: Record<string, unknown> = {}, type = "checkout.session.completed") {
  return {
    id: `evt_${sessionId}`,
    object: "event",
    api_version: "2025-01-27.acacia",
    created: Math.floor(Date.now() / 1000),
    livemode: false,
    pending_webhooks: 1,
    request: { id: null, idempotency_key: null },
    type,
    data: {
      object: {
        id: sessionId,
        object: "checkout.session",
        customer_details: { email: "buyer@example.com" },
        customer_email: null,
        ...overrides,
      },
    },
  };
}

function signedRequest(payloadObj: unknown, secret = SECRET): Request {
  const payload = JSON.stringify(payloadObj);
  // generateTestHeaderString({ payload, secret }): node_modules/stripe/esm/Webhooks.d.ts line 74.
  const header = Stripe.webhooks.generateTestHeaderString({ payload, secret });
  return new Request("http://localhost/api/stripe/webhook", {
    method: "POST",
    headers: { "content-type": "application/json", "stripe-signature": header },
    body: payload,
  });
}

describe("POST /api/stripe/webhook", () => {
  it("accepts a correctly signed checkout.session.completed, mints a key and emails it", async () => {
    const res = await POST(signedRequest(checkoutEvent("cs_test_ok")));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, emailed: true });
    expect(await licenseExistsForStripeSession("cs_test_ok")).toBe(true);
    expect(sendMock).toHaveBeenCalledTimes(1);
    const { to, key } = sendMock.mock.calls[0][0];
    expect(to).toBe("buyer@example.com");
    expect(key).toMatch(/^its_[A-Za-z0-9]{32}$/);
    const license = await findLicenseByKey(key);
    expect(license).toMatchObject({ email: "buyer@example.com", plan: "founder", status: "active" });
  });

  it("rejects a bad signature with 400 and mints nothing", async () => {
    const res = await POST(signedRequest(checkoutEvent("cs_test_bad"), "whsec_wrong"));
    expect(res.status).toBe(400);
    expect(await licenseExistsForStripeSession("cs_test_bad")).toBe(false);
    expect(sendMock).not.toHaveBeenCalled();

    const missing = await POST(new Request("http://localhost/api/stripe/webhook", { method: "POST", body: "{}" }));
    expect(missing.status).toBe(400);
  });

  it("mints one key for the same session id delivered twice", async () => {
    const first = await POST(signedRequest(checkoutEvent("cs_test_dup")));
    expect(first.status).toBe(200);
    const second = await POST(signedRequest(checkoutEvent("cs_test_dup")));
    expect(second.status).toBe(200);
    expect(await second.json()).toEqual({ duplicate: true });
    const count = (await db.query<{ c: number }>("SELECT count(*)::int AS c FROM licenses WHERE stripe_session_id = $1", ["cs_test_dup"])).rows[0].c;
    expect(count).toBe(1);
    expect(sendMock).toHaveBeenCalledTimes(1);
  });

  it("falls back to customer_email and skips a session with no email", async () => {
    const res = await POST(signedRequest(checkoutEvent("cs_test_fallback", { customer_details: null, customer_email: "fallback@example.com" })));
    expect(await res.json()).toEqual({ ok: true, emailed: true });
    expect(sendMock.mock.calls[0][0].to).toBe("fallback@example.com");

    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const none = await POST(signedRequest(checkoutEvent("cs_test_noemail", { customer_details: { email: null }, customer_email: null })));
    expect(none.status).toBe(200);
    expect(await none.json()).toEqual({ skipped: "no email" });
    expect(await licenseExistsForStripeSession("cs_test_noemail")).toBe(false);
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it("still returns 200 when the email fails, because the key is in the db", async () => {
    sendMock.mockRejectedValueOnce(new Error("Resend down"));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await POST(signedRequest(checkoutEvent("cs_test_emailfail")));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, emailed: false });
    expect(await licenseExistsForStripeSession("cs_test_emailfail")).toBe(true);
    // The log line must not leak the key.
    const logged = errorSpy.mock.calls.map((c) => c.map(String).join(" ")).join("\n");
    expect(logged).not.toMatch(/its_[A-Za-z0-9]{32}/);
    errorSpy.mockRestore();
  });

  it("ignores other event types", async () => {
    const res = await POST(signedRequest(checkoutEvent("cs_test_other", {}, "payment_intent.succeeded")));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ignored: "payment_intent.succeeded" });
    expect(sendMock).not.toHaveBeenCalled();
  });
});
