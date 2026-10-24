import type { Metadata } from "next";
import Image from "next/image";
import { Button, PageShell } from "@/components/ui";
import { MetaPixel } from "@/components/MetaPixel";
import {
  BuyButton,
  DefinitionList,
  EngineRows,
  ProofBezel,
  Section,
  SiteFooter,
  SiteHeader,
  SUPPORT_MAILTO,
  getPaymentLink,
  type DefinitionItem,
  type EngineRow,
} from "@/components/marketing";
import { ANTHROPIC_MODEL, GEMINI_MODEL, OPENAI_MODEL } from "@/lib/engines/models";
import { PRODUCT } from "@/lib/product";

/*
 * Landing page (builder D). Server component, statically prerendered. All
 * copy lives in this file so a review is one file long. Design per SPEC.md:
 * paper and ink, hairline-separated sections, no cards, no kickers, one ink
 * proof bezel around the dashboard image.
 */

const TITLE = `${PRODUCT.name} | AI visibility tracker, bring your own keys`;
const DESCRIPTION =
  "See whether ChatGPT, Claude and Gemini cite your site. Bring your own API keys, pay once, and track every prompt on three engines daily.";
const LEDGER_URL = "https://evoix.io/blog/who-is-the-king-of-aeo-dark-horse-entry";

/* A PNG goes through next/image optimization automatically, while an SVG is
   served as-is (node_modules/next/dist/shared/lib/get-img-props.js line 280). */
const SAMPLE_IMAGE = "/sample-dashboard.png";
const SAMPLE_ALT =
  "Sample dashboard for one project. Source-set inclusion and mention rates for ChatGPT, Claude and Gemini, a trend across runs, and a prompt table.";

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    url: "/",
    siteName: PRODUCT.name,
    title: TITLE,
    description: DESCRIPTION,
    images: [{ url: SAMPLE_IMAGE, width: 1567, height: 709, alt: SAMPLE_ALT }],
  },
};

/* Model ids come from src/lib/engines/models.ts, so an env override shows here too. */
const ENGINE_ROWS: EngineRow[] = [
  {
    engine: "ChatGPT",
    provider: "OpenAI",
    model: OPENAI_MODEL,
    source: "Responses API with the web_search tool. A citation is a url_citation annotation on the answer text.",
  },
  {
    engine: "Claude",
    provider: "Anthropic",
    model: ANTHROPIC_MODEL,
    source:
      "Messages API with the web search tool. A citation is a web_search_result_location on the answer text. The search results the model saw are kept as well.",
  },
  {
    engine: "Gemini",
    provider: "Google",
    model: GEMINI_MODEL,
    source:
      "generateContent with Google Search grounding. A citation is a grounding chunk, with its redirect resolved to the real page.",
  },
];

const INCLUDED = [
  "Unlimited projects",
  `Up to ${PRODUCT.maxPromptsPerProject} prompts per project`,
  "Three engines, ChatGPT, Claude and Gemini",
  "Daily automatic runs",
  "Every raw answer saved",
];

const FAQ: DefinitionItem[] = [
  {
    term: "Do I need my own API keys?",
    detail:
      "Yes. Every query runs on your own OpenAI, Anthropic and Gemini accounts. You paste the keys once in Settings; they are encrypted at rest and never shown again. Add one engine or all three; a run covers the engines you have keys for.",
  },
  {
    term: "What does a run cost me?",
    detail:
      "A run sends each prompt to each engine once, billed by the providers at their rates. On the default models that is about a cent a query, a little more when an engine runs several searches for one answer, so a project with 25 prompts on three engines costs roughly a dollar a day. Those are estimates; your provider dashboards have the real numbers.",
  },
  {
    term: "Which models?",
    detail: (
      <>
        <code className="text-[15px]">{OPENAI_MODEL}</code> through the OpenAI Responses API,{" "}
        <code className="text-[15px]">{ANTHROPIC_MODEL}</code> through the Anthropic Messages API and{" "}
        <code className="text-[15px]">{GEMINI_MODEL}</code> through the Gemini API, each with web search on. The ids are
        fixed per deployment and change only when a provider retires a model.
      </>
    ),
  },
  {
    term: "Does it track Perplexity or Google AI Overviews?",
    detail:
      "No. Version 1 covers ChatGPT, Claude and Gemini through their APIs. Perplexity and AI Overviews are not in it, and we would rather say so than show you a made-up number.",
  },
  {
    term: "Can I export the data?",
    detail:
      "Every run page shows the raw answer and the full source list for each prompt on each engine, so nothing is hidden behind a summary. CSV export is on the roadmap.",
  },
  {
    term: "Who builds this?",
    detail: (
      <>
        EVOIX, an AI company in DeLand, Florida. Read about the company and its AEO work at{" "}
        <a href={PRODUCT.companyUrl}>evoix.io</a>.
      </>
    ),
  },
];

export default function LandingPage() {
  const paymentLink = getPaymentLink();

  return (
    <>
      <MetaPixel />
      <SiteHeader />

      <main>
        {/* Hero */}
        <section className="py-14 md:py-24">
          <PageShell>
            <h1 className="max-w-4xl text-[2.25rem] leading-[1.08] md:text-[3.5rem]">
              Are you in the sources?
              <span className="block text-ink-70">See whether ChatGPT, Claude and Gemini cite your site.</span>
            </h1>
            <p className="mt-6 max-w-2xl text-ink-70 md:text-[19px]">
              Ask the questions your customers ask, on three engines with web search on, and see which answers name
              you and which answers cite your site. You bring your own OpenAI, Anthropic and Gemini keys, so the
              queries bill to your own provider accounts and there is no subscription on our side. One payment of $
              {PRODUCT.founderPriceUsd} buys a founder key for life.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button href="#pricing">Get a founder key</Button>
              <Button href="#sample" variant="secondary">
                See a sample dashboard
              </Button>
            </div>
          </PageShell>
        </section>

        {/* What it tracks */}
        <Section id="tracks" title="What it tracks" layout="stack">
          <p className="max-w-2xl text-ink-70">
            Every prompt runs on each engine with web search on, under one short system prompt that asks for current
            information and sources. Mentions are read from the answer text. Citations are read from the engine&apos;s
            own citation data, never guessed from the prose.
          </p>
          <div className="mt-8">
            <EngineRows rows={ENGINE_ROWS} />
          </div>
        </Section>

        {/* The metric */}
        <Section id="metric" title="Source-set inclusion first">
          <div className="space-y-4 text-ink-70">
            <p>
              Being named in an answer and being in the answer&apos;s sources are two different numbers. An engine can
              mention your brand from memory without opening your site, and it can cite a page of yours without naming
              you at all. Mention rate counts the first. Source-set inclusion rate counts the second, the share of
              answers whose cited sources include your domain.
            </p>
            <p>
              The dashboard leads with inclusion. The source set is where the engine actually went for its facts, and
              it is the number that moves when you change a page. The method comes from{" "}
              <a href={LEDGER_URL}>the experiment ledger EVOIX keeps on its own site</a>.
            </p>
          </div>
        </Section>

        {/* Sample dashboard */}
        <Section id="sample" title="A sample dashboard" layout="stack">
          <p className="max-w-2xl text-ink-70">
            One project, the latest run. Inclusion and mention rates per engine, the trend across runs, and the result
            for every prompt. The raw answer and the full source list for each one sit on the run page.
          </p>
          <div className="mt-8">
            <ProofBezel>
              <Image
                src={SAMPLE_IMAGE}
                alt={SAMPLE_ALT}
                width={1200}
                height={720}
                sizes="(min-width: 1320px) 1240px, 100vw"
                className="h-auto w-full rounded-[9px] bg-paper"
              />
            </ProofBezel>
          </div>
        </Section>

        {/* Bring your own keys */}
        <Section id="keys" title="Your keys, your bill">
          <div className="space-y-4 text-ink-70">
            <p>
              Every query runs on your own OpenAI, Anthropic and Gemini accounts and shows up on their invoices, not
              ours. On the default models that is about a cent a query, a little more when an engine runs several
              searches for one answer. Treat the figure as approximate; the provider dashboards have the real numbers.
            </p>
            <p>
              Keys are encrypted with AES-256-GCM before they reach the database, under a server-side secret that never
              leaves the deployment. The database holds the ciphertext and the last four characters, nothing else.
            </p>
            <p>
              Once saved, a key is never shown again, not in Settings and not in any response the browser can read.
              Replace it or remove it whenever you like.
            </p>
          </div>
        </Section>

        {/* Pricing */}
        <Section id="pricing" title="Pricing" layout="stack">
          <div className="border-y border-hairline py-6 md:grid md:grid-cols-[minmax(0,1fr)_auto] md:items-start md:gap-x-12">
            <div>
              <h3 className="text-[1.25rem]">Founder lifetime key</h3>
              <p className="mt-1 text-ink-70">
                First {PRODUCT.founderKeys} keys, then ${PRODUCT.standardPriceUsd}.
              </p>
            </div>
            <p className="mt-4 md:mt-0 md:text-right">
              <span className="font-serif text-[2.5rem] leading-none font-medium tracking-[-0.03em] text-ink">
                ${PRODUCT.founderPriceUsd}
              </span>
              <span className="mt-1 block text-[14px] text-ink-50">one payment, no subscription</span>
            </p>
          </div>
          <ul className="border-b border-hairline">
            {INCLUDED.map((line, index) => (
              <li key={line} className={index === 0 ? "py-3 text-ink-70" : "border-t border-hairline py-3 text-ink-70"}>
                {line}
              </li>
            ))}
          </ul>
          <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3">
            <BuyButton />
            <p className="max-w-md text-[14px] text-ink-50">
              {paymentLink
                ? "Pay once through Stripe. The key arrives by email within a minute."
                : "Write to us and you will get the key by email as soon as the first batch opens."}
            </p>
          </div>
        </Section>

        {/* FAQ */}
        <Section id="faq" title="Questions" layout="stack">
          <DefinitionList items={FAQ} />
          <p className="mt-6 text-[15px] text-ink-50">
            Something else? Write to <a href={SUPPORT_MAILTO}>{PRODUCT.supportEmail}</a>.
          </p>
        </Section>
      </main>

      <SiteFooter />
    </>
  );
}
