import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sendSpy = vi.fn();
vi.mock("resend", () => ({
  Resend: class {
    emails = { send: sendSpy };
    constructor(public key?: string) {}
  },
}));
import { activateUrl, licenseKeyEmailBody, sendLicenseKeyEmail } from "./index";

const KEY = "its_ABCDEFGHIJKLMNOPQRSTUVWXYZ012345";

describe("license key email", () => {
  beforeEach(() => {
    sendSpy.mockReset();
    sendSpy.mockResolvedValue({ data: { id: "em_1" }, error: null, headers: null });
    process.env.RESEND_API_KEY = "re_test";
    process.env.NEXT_PUBLIC_BASE_URL = "https://inthesources.evoix.io/";
    delete process.env.EMAIL_FROM;
  });
  afterEach(() => {
    delete process.env.RESEND_API_KEY;
    delete process.env.NEXT_PUBLIC_BASE_URL;
    delete process.env.EMAIL_FROM;
  });

  it("builds the activate link from NEXT_PUBLIC_BASE_URL without a double slash", () => {
    expect(activateUrl(KEY)).toBe(`https://inthesources.evoix.io/activate#k=${KEY}`);
  });

  it("carries the key in the URL fragment only, never in the query string", () => {
    // A fragment is not sent to the server, so the key stays out of request logs and off any analytics script.
    const url = new URL(activateUrl(KEY));
    expect(url.pathname).toBe("/activate");
    expect(url.search).toBe("");
    expect(url.hash).toBe(`#k=${KEY}`);
    expect(activateUrl(KEY)).not.toContain("?");
  });

  it("has the subject, the key in a monospace block, the link and the lifetime line, with no em dash or rhetorical colon", () => {
    const { subject, html, text } = licenseKeyEmailBody({ to: "buyer@example.com", key: KEY });
    expect(subject).toBe("Your In the Sources license key");
    expect(html).toContain(`<pre style="font-family: 'Geist Mono'`);
    expect(html).toContain(KEY);
    expect(html).toContain(`href="https://inthesources.evoix.io/activate#k=${KEY}"`);
    expect(html).toContain("lifetime license tied to buyer@example.com");
    expect(text).toContain(KEY);
    expect(text).toContain(`https://inthesources.evoix.io/activate#k=${KEY}`);
    expect(text).toContain("lifetime license tied to buyer@example.com");
    for (const body of [subject, html, text]) {
      expect(body).not.toContain("—");
      for (const word of ["delve", "leverage", "seamless", "robust", "unlock", "elevate"]) {
        expect(body.toLowerCase()).not.toContain(word);
      }
    }
  });

  it("sends through Resend with the default from and surfaces SDK errors", async () => {
    await sendLicenseKeyEmail({ to: "buyer@example.com", key: KEY });
    expect(sendSpy).toHaveBeenCalledTimes(1);
    const payload = sendSpy.mock.calls[0][0];
    expect(payload.from).toBe("In the Sources <noreply@evoix.io>");
    expect(payload.to).toBe("buyer@example.com");
    expect(payload.subject).toBe("Your In the Sources license key");
    expect(payload.html).toContain(KEY);
    expect(payload.text).toContain(KEY);

    process.env.EMAIL_FROM = "Custom <hi@example.com>";
    await sendLicenseKeyEmail({ to: "buyer@example.com", key: KEY });
    expect(sendSpy.mock.calls[1][0].from).toBe("Custom <hi@example.com>");

    sendSpy.mockResolvedValueOnce({ data: null, error: { message: "domain not verified", statusCode: 403, name: "validation_error" }, headers: null });
    await expect(sendLicenseKeyEmail({ to: "buyer@example.com", key: KEY })).rejects.toThrow(/validation_error \(403\): domain not verified/);
  });

  it("fails before calling Resend when RESEND_API_KEY is unset", async () => {
    delete process.env.RESEND_API_KEY;
    await expect(sendLicenseKeyEmail({ to: "x@example.com", key: KEY })).rejects.toThrow(/RESEND_API_KEY/);
    expect(sendSpy).not.toHaveBeenCalled();
  });
});
