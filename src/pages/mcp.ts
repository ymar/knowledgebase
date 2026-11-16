import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { createMcpHandler } from '@modelcontextprotocol/server';
import { buildMcpServer } from '../lib/mcp/server';
import { verifyAccessJwt } from '../lib/access';

/**
 * MCP endpoint (Streamable HTTP, stateless). Cloudflare Access sits in front: with Managed
 * OAuth on, MCP clients like Claude sign in through Access and every request reaches us with
 * a `Cf-Access-Jwt-Assertion` header, which we verify here (signature, audience, issuer,
 * expiry). Without a valid token nothing is served. Local dev (`astro dev`) skips the check.
 */
const handle: APIRoute = async ({ request, url }) => {
  if (!import.meta.env.DEV) {
    const identity = await verifyAccessJwt(request.headers.get('cf-access-jwt-assertion'), env.ACCESS_TEAM_DOMAIN, env.ACCESS_AUD);
    if (!identity) return new Response('Unauthorized', { status: 401 });
  }
  const handler = createMcpHandler(() => buildMcpServer({ origin: url.origin, timeZone: env.TIMEZONE }));
  return handler.fetch(request);
};

export const GET = handle;
export const POST = handle;
export const DELETE = handle;
