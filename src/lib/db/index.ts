import { env } from 'cloudflare:workers';

/** The only place that reaches for the D1 binding. */
export const db = (): D1Database => env.DB;

export const nowIso = (): string => new Date().toISOString();

export function parseJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export * from './types';
export * from './objects';
export * from './links';
export * from './days';
export * from './search';
