/**
 * Verifies the Cloudflare Access JWT (`Cf-Access-Jwt-Assertion`) that Access adds to
 * every request it lets through, including MCP clients signed in via Managed OAuth.
 * RS256 against the team's public keys, plus audience, issuer and expiry checks.
 */
interface Jwk extends JsonWebKey { kid: string }
let keys: { at: number; byKid: Map<string, CryptoKey> } | null = null;

async function publicKeys(teamDomain: string): Promise<Map<string, CryptoKey>> {
  if (keys && Date.now() - keys.at < 60 * 60 * 1000) return keys.byKid;
  const res = await fetch(`${teamDomain}/cdn-cgi/access/certs`);
  if (!res.ok) throw new Error(`Access certs: ${res.status}`);
  const { keys: list } = (await res.json()) as { keys: Jwk[] };
  const byKid = new Map<string, CryptoKey>();
  for (const k of list) {
    byKid.set(k.kid, await crypto.subtle.importKey('jwk', k, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']));
  }
  keys = { at: Date.now(), byKid };
  return byKid;
}

const b64urlToBytes = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(s.length / 4) * 4, '=')), (c) => c.charCodeAt(0));

export interface AccessIdentity {
  email?: string;
  sub?: string;
}

/** Returns the identity in a valid token, or null. Never throws for a bad token. */
export async function verifyAccessJwt(token: string | null, teamDomain: string, aud: string): Promise<AccessIdentity | null> {
  if (!token || !teamDomain || !aud) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const header = JSON.parse(new TextDecoder().decode(b64urlToBytes(parts[0]))) as { alg?: string; kid?: string };
    const payload = JSON.parse(new TextDecoder().decode(b64urlToBytes(parts[1]))) as {
      aud?: string | string[]; iss?: string; exp?: number; nbf?: number; email?: string; sub?: string;
    };
    if (header.alg !== 'RS256' || !header.kid) return null;
    let key = (await publicKeys(teamDomain)).get(header.kid);
    if (!key) {
      keys = null; // keys rotated: refetch once
      key = (await publicKeys(teamDomain)).get(header.kid);
      if (!key) return null;
    }
    const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64urlToBytes(parts[2]), new TextEncoder().encode(`${parts[0]}.${parts[1]}`));
    if (!ok) return null;
    const now = Math.floor(Date.now() / 1000);
    const auds = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
    if (!auds.includes(aud)) return null;
    if (payload.iss !== teamDomain) return null;
    if (!payload.exp || payload.exp < now - 30) return null;
    if (payload.nbf && payload.nbf > now + 30) return null;
    return { email: payload.email, sub: payload.sub };
  } catch {
    return null;
  }
}
