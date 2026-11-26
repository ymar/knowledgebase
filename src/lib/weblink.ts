/**
 * Weblinks: turn a URL into page metadata (title, site, description, preview image).
 * The parser is a plain function over HTML so it runs anywhere and can be tested; the fetch reads at most
 * 512 KB with a timeout, follows redirects, and only goes to public http(s) hosts (localhost in dev only).
 */

export interface PageMeta {
  url: string;
  title: string;
  site: string;
  description: string;
  image: string | null;
}

/** Looks like one URL or bare domain, nothing else ("example.com/x", "https://a.b"). */
export const isUrlLike = (s: string): boolean => /^(https?:\/\/)?([a-z0-9-]+\.)+[a-z]{2,}(:\d+)?(\/\S*)?$/i.test(s.trim()) || /^https?:\/\/\S+$/i.test(s.trim());

/** Canonical form for storing and de-duplicating: http(s) only, no fragment. Null if it isn't a usable URL. */
export function normalizeUrl(raw: string): string | null {
  const s = raw.trim();
  if (!s || /\s/.test(s)) return null;
  let u: URL;
  try {
    u = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`);
  } catch {
    return null;
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
  if (!u.hostname.includes('.') && u.hostname !== 'localhost') return null;
  u.hash = '';
  return u.toString();
}

const PRIVATE_HOST = /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|0\.|\[?::1\]?$|\[?f[cd][0-9a-f]{2}:)/i;

/** Hosts we fetch from: public ones, plus localhost while developing (for the test fixture). */
export const fetchable = (url: string, dev: boolean): boolean => {
  const host = new URL(url).hostname;
  return dev || !PRIVATE_HOST.test(host);
};

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
const decode = (s: string) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
const clean = (s: string | undefined, max: number) => (s ? decode(s).replace(/\s+/g, ' ').trim().slice(0, max) : '');

/** The content of <meta property|name="key" content="…"> (either attribute order). */
function meta(html: string, keys: string[]): string | undefined {
  for (const key of keys) {
    const k = key.replace(/[.:]/g, (c) => `\\${c}`);
    const a = html.match(new RegExp(`<meta[^>]+(?:property|name)\\s*=\\s*["']${k}["'][^>]*content\\s*=\\s*["']([^"']*)["']`, 'i'));
    if (a) return a[1];
    const b = html.match(new RegExp(`<meta[^>]+content\\s*=\\s*["']([^"']*)["'][^>]*(?:property|name)\\s*=\\s*["']${k}["']`, 'i'));
    if (b) return b[1];
  }
  return undefined;
}

/** Title, site, description and image from a page's HTML. Falls back to the host name. */
export function parseMeta(html: string, url: string): PageMeta {
  const u = new URL(url);
  const host = u.hostname.replace(/^www\./, '');
  const head = html.slice(0, 200_000);
  const title = clean(meta(head, ['og:title', 'twitter:title']) ?? head.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1], 300);
  const site = clean(meta(head, ['og:site_name', 'application-name']), 120) || host;
  const description = clean(meta(head, ['og:description', 'twitter:description', 'description']), 600);
  let image: string | null = null;
  const rawImage = meta(head, ['og:image:secure_url', 'og:image', 'twitter:image', 'twitter:image:src']);
  if (rawImage) {
    try {
      const abs = new URL(decode(rawImage.trim()), url);
      if (abs.protocol === 'https:' || abs.protocol === 'http:') image = abs.toString();
    } catch { /* ignore */ }
  }
  return { url, title: title || host + (u.pathname !== '/' ? u.pathname : ''), site, description, image };
}

/** Fetches a page and reads its metadata. Never throws: on any failure it returns the host-name fallback. */
export async function fetchMeta(url: string, dev = false): Promise<PageMeta> {
  const fallback = parseMeta('', url);
  if (!fetchable(url, dev)) return fallback;
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      headers: { accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.5', 'user-agent': 'Mozilla/5.0 (compatible; KB link preview)' },
      signal: AbortSignal.timeout(6000),
    });
    const finalUrl = res.url || url;
    if (!res.ok || !/html/i.test(res.headers.get('content-type') ?? '')) {
      await res.body?.cancel();
      return { ...parseMeta('', finalUrl), url };
    }
    // Read at most 512 KB: the <head> is all we need.
    const reader = res.body!.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (size < 512_000) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      size += value.byteLength;
    }
    await reader.cancel().catch(() => {});
    const bytes = new Uint8Array(size);
    let at = 0;
    for (const c of chunks) { bytes.set(c.subarray(0, Math.min(c.byteLength, size - at)), at); at += c.byteLength; }
    const html = new TextDecoder().decode(bytes);
    return { ...parseMeta(html, finalUrl), url };
  } catch {
    return fallback;
  }
}
