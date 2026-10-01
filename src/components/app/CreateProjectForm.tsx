"use client";

import { useRouter } from "next/navigation";
import { useId, useState, type FormEvent } from "react";
import type { Project } from "@/lib/contracts";
import { Button, Input, Label, Notice } from "@/components/ui";
import { useApi } from "./use-api";

function splitList(value: string): string[] {
  return value
    .split(/[,\n]/)
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

/** Brand, domain, aliases and competitor domains. On success it opens the new project. */
export function CreateProjectForm() {
  const router = useRouter();
  const api = useApi();
  const id = useId();
  const [brandName, setBrandName] = useState("");
  const [domain, setDomain] = useState("");
  const [aliases, setAliases] = useState("");
  const [competitors, setCompetitors] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    const result = await api<{ project: Project }>("/api/projects", {
      method: "POST",
      body: {
        brandName: brandName.trim(),
        domain: domain.trim(),
        aliases: splitList(aliases),
        competitorDomains: splitList(competitors),
      },
    });

    if (!result.ok) {
      setBusy(false);
      setError(result.error);
      return;
    }

    router.push(`/app/projects/${result.data.project.id}`);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} noValidate className="mt-6 space-y-5">
      <div>
        <Label htmlFor={`${id}-brand`}>Brand name</Label>
        <Input
          id={`${id}-brand`}
          value={brandName}
          onChange={(event) => setBrandName(event.target.value)}
          placeholder="Acme Dental"
          maxLength={120}
          autoComplete="organization"
        />
      </div>
      <div>
        <Label htmlFor={`${id}-domain`}>Domain</Label>
        <Input
          id={`${id}-domain`}
          value={domain}
          onChange={(event) => setDomain(event.target.value)}
          placeholder="acmedental.com"
          inputMode="url"
          autoCapitalize="none"
          autoComplete="url"
          spellCheck={false}
          className="font-mono"
        />
        <p className="mt-1.5 text-[14px] text-ink-50">The site you want to see cited. A full URL works too; we keep the domain.</p>
      </div>
      <div>
        <Label htmlFor={`${id}-aliases`}>Aliases</Label>
        <Input
          id={`${id}-aliases`}
          value={aliases}
          onChange={(event) => setAliases(event.target.value)}
          placeholder="Acme, Acme Dental Group"
        />
        <p className="mt-1.5 text-[14px] text-ink-50">Other ways the brand gets written, comma separated. Optional.</p>
      </div>
      <div>
        <Label htmlFor={`${id}-competitors`}>Competitor domains</Label>
        <Input
          id={`${id}-competitors`}
          value={competitors}
          onChange={(event) => setCompetitors(event.target.value)}
          placeholder="brightsmile.com, dentalone.com"
          autoCapitalize="none"
          spellCheck={false}
          className="font-mono"
        />
        <p className="mt-1.5 text-[14px] text-ink-50">Comma separated. Optional. They get a mark on the cited domains list.</p>
      </div>
      {error && <Notice tone="error">{error}</Notice>}
      <Button type="submit" disabled={busy}>
        {busy ? "Creating" : "Create project"}
      </Button>
    </form>
  );
}
