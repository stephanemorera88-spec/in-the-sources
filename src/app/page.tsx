import { Button, PageShell } from "@/components/ui";
import { PRODUCT } from "@/lib/product";

/* Placeholder landing so the build passes. Builder D replaces this page. */
export default function Home() {
  return (
    <main>
      <PageShell className="py-16 md:py-24">
        <h1 className="max-w-3xl">{PRODUCT.name}</h1>
        <p className="mt-4 max-w-2xl text-ink-70">{PRODUCT.tagline}</p>
        <div className="mt-8">
          <Button href="/app">Open the app</Button>
        </div>
      </PageShell>
    </main>
  );
}
