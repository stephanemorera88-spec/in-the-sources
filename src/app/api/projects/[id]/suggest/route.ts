import type { ProjectInput } from "@/lib/contracts";
import { getEngineKeys, getProject } from "@/lib/db";
import { fetchSiteText, suggestPrompts } from "@/lib/engines";
import { errorMessage, json, jsonError, jsonNotFound, scrubSecrets, withLicense } from "../../../_lib/with-license";

/*
 * Budget: the site read is capped at SITE_FETCH_TIMEOUT_MS (10 s, every hop
 * included) and suggestPrompts makes at most two model attempts of
 * SUGGEST_TIMEOUT_MS (30 s, no SDK retries), 70 s worst case. The route test
 * pins this arithmetic (review fix, 2026-10-01).
 */
export const maxDuration = 120;

type Params = { id: string };

/**
 * POST /api/projects/[id]/suggest: reads the site, asks the user's engine for
 * 10 prompts and returns { prompts }. Nothing is saved; the user reviews the
 * list and posts the ones they keep to /prompts.
 *
 * The decrypted keys from getEngineKeys are passed to suggestPrompts and to
 * nothing else; they never enter a response.
 */
export const POST = withLicense<Params>(async ({ license, params }) => {
  const project = await getProject(license.id, params.id);
  if (!project) return jsonNotFound();

  const keys = await getEngineKeys(license.id);
  if (!keys.openai && !keys.anthropic && !keys.gemini) {
    return jsonError("Add at least one engine API key in Settings before asking for suggestions.", 400);
  }

  let siteText: string;
  try {
    siteText = await fetchSiteText(project.domain);
  } catch (err) {
    return jsonError(`Could not read ${project.domain}. ${scrubSecrets(errorMessage(err))}`, 400);
  }

  const input: ProjectInput = {
    brandName: project.brandName,
    domain: project.domain,
    aliases: project.aliases,
    competitorDomains: project.competitorDomains,
    dailyRun: project.dailyRun,
  };

  let prompts: string[];
  try {
    prompts = await suggestPrompts(keys, input, siteText);
  } catch (err) {
    return jsonError(`Could not generate suggestions. ${scrubSecrets(errorMessage(err))}`, 400);
  }

  return json({ prompts });
});
