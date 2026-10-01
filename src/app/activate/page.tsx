import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentLicense } from "@/lib/license";
import { PRODUCT } from "@/lib/product";
import { PageShell } from "@/components/ui";
import { ActivateForm } from "@/components/app/ActivateForm";

export const metadata: Metadata = { title: "Activate" };
export const dynamic = "force-dynamic";

/** Paste the license key. `?k=` pre-fills it (the email links here). A valid cookie skips straight to /app. */
export default async function ActivatePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const license = await getCurrentLicense();
  if (license) redirect("/app");

  const { k } = await searchParams;
  const initialKey = typeof k === "string" ? k.trim() : "";

  return (
    <main>
      <PageShell className="py-16 md:py-24">
        <div className="max-w-md">
          <p className="text-[14px] text-ink-50">
            <Link href="/">{PRODUCT.name}</Link>
          </p>
          <h1 className="mt-2">Activate your license</h1>
          <p className="mt-4 text-ink-70">
            Paste the key from your email. It stays in a cookie on this browser for a year, so you do this once per
            device.
          </p>
          <ActivateForm initialKey={initialKey} />
          <p className="mt-10 text-[15px] text-ink-50">
            No key yet? <Link href="/">Get one on the home page</Link>. Questions go to {PRODUCT.supportEmail}.
          </p>
        </div>
      </PageShell>
    </main>
  );
}
