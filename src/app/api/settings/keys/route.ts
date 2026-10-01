import { deleteEngineKey, getEngineKeyHints, setEngineKey } from "@/lib/db";
import { keyDeleteSchema, keyPutSchema } from "../../_lib/schemas";
import { json, readJson, withLicense } from "../../_lib/with-license";
import { projectHints } from "../hints";

/*
 * Engine key settings. These routes only ever read getEngineKeyHints; the
 * decrypted keys (getEngineKeys) are not imported here, and every hint goes
 * through projectHints (../hints.ts) before it is serialized.
 */

/** GET /api/settings/keys: { keys: { openai, anthropic, gemini } }, hints only. */
export const GET = withLicense(async ({ license }) => {
  const hints = await getEngineKeyHints(license.id);
  return json({ keys: projectHints(hints) });
});

/** PUT /api/settings/keys: body { engine, apiKey }. Encrypts and stores the key; returns the new hint. */
export const PUT = withLicense(async ({ license, request }) => {
  const { engine, apiKey } = keyPutSchema.parse(await readJson(request));
  await setEngineKey(license.id, engine, apiKey);
  const hints = projectHints(await getEngineKeyHints(license.id));
  return json({ ok: true, engine, key: hints[engine] });
});

/** DELETE /api/settings/keys: body { engine }. */
export const DELETE = withLicense(async ({ license, request }) => {
  const { engine } = keyDeleteSchema.parse(await readJson(request));
  await deleteEngineKey(license.id, engine);
  return json({ ok: true, engine });
});
