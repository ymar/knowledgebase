import { execSync } from 'node:child_process';

export default async function globalTeardown() {
  if (process.env.KB_TEST_REUSE) return;
  try { execSync('npx astro dev stop', { stdio: 'pipe' }); } catch { /* already stopped */ }
}
