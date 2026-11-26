/**
 * Saving a URL as a Weblink object: one function for the palette, the @ menu, quick capture, type pages
 * and MCP. Same URL in the same workspace returns the existing object instead of a duplicate.
 */
import { createObject, findWeblinkByUrl, getObject, getSummaries, saveProperties, setObjectMeta, weblinkTypeFor, getTypeById, renameObject } from './db';
import { fetchMeta, normalizeUrl } from './weblink';
import type { ObjectSummary } from './schema';

const DEV = import.meta.env.DEV;

export type SaveResult =
  | { ok: true; summary: ObjectSummary; existed: boolean }
  | { ok: false; error: string };

export async function saveWeblink(ws: string, raw: string): Promise<SaveResult> {
  const url = normalizeUrl(raw);
  if (!url) return { ok: false, error: 'That is not a web address.' };
  const typeId = await weblinkTypeFor(ws);
  if (!typeId) return { ok: false, error: 'The Weblink type is off in this workspace.' };
  const existing = await findWeblinkByUrl(ws, url);
  if (existing) return { ok: true, summary: (await getSummaries([existing]))[existing]!, existed: true };

  const meta = await fetchMeta(url, DEV);
  const id = await createObject({
    workspaceId: ws,
    typeId,
    title: meta.title,
    properties: { url, site: meta.site, description: meta.description || null },
  });
  if (meta.image) await setObjectMeta(id, '_cover', meta.image);
  return { ok: true, summary: (await getSummaries([id]))[id]!, existed: false };
}

/** Fetches the page again and updates site, description and cover. The title too, unless you renamed it. */
export async function refreshWeblink(id: string): Promise<boolean> {
  const o = await getObject(id);
  const url = typeof o?.properties.url === 'string' ? normalizeUrl(o.properties.url) : null;
  if (!o || !url) return false;
  const type = await getTypeById(o.type_id);
  if (!type) return false;
  const old = { title: o.title };
  const meta = await fetchMeta(url, DEV);
  await saveProperties(id, type.properties, { ...o.properties, site: meta.site, description: meta.description || null });
  await setObjectMeta(id, '_cover', meta.image);
  // Keep a title you typed yourself; replace one that was only the host-name fallback.
  const host = new URL(url).hostname.replace(/^www\./, '');
  if (!old.title || old.title.startsWith(host)) await renameObject(id, meta.title);
  return true;
}
