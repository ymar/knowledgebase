import { execSync } from 'node:child_process';

const URL = 'http://localhost:4321';

/** Fresh local database, then `astro dev` (it backgrounds itself; teardown stops it). */
export default async function globalSetup() {
  if (process.env.KB_TEST_REUSE) return; // point the tests at a server you started yourself
  const run = (cmd: string) => execSync(cmd, { stdio: 'pipe' });
  try { run('npx astro dev stop'); } catch { /* not running */ }
  run('npm run db:reset');
  run('npx astro dev --port 4321');
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(URL);
      if (res.ok) return;
    } catch { /* starting */ }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`Dev server did not come up at ${URL}`);
}
