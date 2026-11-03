import { type ChildProcess, execFileSync, spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { dirname, join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { chromium } from '@playwright/test';

const DASHBOARD_ORIGIN = 'http://localhost:3100';
const LOGIN_TIMEOUT_MS = 5 * 60_000;
const CHROME_PATH =
  process.platform === 'darwin'
    ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
    : 'google-chrome';

// The main checkout owns the login, and Orca setup links its .playwright/auth into every
// worktree, so one login covers them all.
const mainCheckout = dirname(
  execFileSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], {
    encoding: 'utf8',
  }).trim()
);
const stateFile = join(mainCheckout, '.playwright', 'auth', 'state.json');
const profileDir = join(mainCheckout, '.playwright', 'profiles', 'discord-login');

function say(message: string) {
  process.stdout.write(`${message}\n`);
}

function freePort() {
  return new Promise<number>((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      server.close(() => resolve(typeof address === 'object' && address ? address.port : 0));
    });
  });
}

function isSignedInUrl(url: string) {
  if (!url.startsWith(DASHBOARD_ORIGIN)) return false;
  const { pathname } = new URL(url);
  return !pathname.startsWith('/login') && !pathname.startsWith('/api/auth');
}

// Only the DevTools HTTP endpoint is polled while the person is on discord.com: it lists tabs
// without attaching to them, so nothing automated touches Discord's login or CAPTCHA.
async function waitForDashboardTab(port: number, chrome: ChildProcess) {
  const deadline = Date.now() + LOGIN_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (chrome.exitCode !== null) throw new Error('Chrome was closed before the login finished.');
    const urls = await fetch(`http://127.0.0.1:${port}/json/list`)
      .then(response => response.json() as Promise<{ url: string }[]>)
      .then(targets => targets.map(target => target.url))
      .catch(() => [] as string[]);
    if (urls.some(isSignedInUrl)) return;
    await sleep(500);
  }
  throw new Error('Timed out waiting for the login. Run it again when ready.');
}

async function signedInUsername(cookieHeader: string) {
  const response = await fetch(`${DASHBOARD_ORIGIN}/api/auth/session`, {
    headers: { cookie: cookieHeader },
  });
  const session = (await response.json()) as { user?: { username?: string } } | null;
  return session?.user?.username;
}

async function login() {
  const dashboardUp = await fetch(`${DASHBOARD_ORIGIN}/login`, { redirect: 'manual' }).then(
    () => true,
    () => false
  );
  if (!dashboardUp) {
    throw new Error(`Nothing answers on ${DASHBOARD_ORIGIN}. Start the dashboard: pnpm dev:web`);
  }

  const port = await freePort();
  const chrome = spawn(
    CHROME_PATH,
    [
      `--user-data-dir=${profileDir}`,
      `--remote-debugging-port=${port}`,
      '--no-first-run',
      '--no-default-browser-check',
      `${DASHBOARD_ORIGIN}/login`,
    ],
    { stdio: 'ignore' }
  );
  const exited = new Promise(resolve => chrome.once('exit', resolve));
  chrome.once('error', () => {
    say(`Could not start Google Chrome at ${CHROME_PATH}.`);
    process.exit(1);
  });

  try {
    say('Log in to Discord with the test account in the Chrome window, then click Authorize.');
    // The profile remembers the Block, so this comes up on the first login only.
    say('If Chrome asks to let discord.com access other apps, click Block, then Continue to Discord.');
    await waitForDashboardTab(port, chrome);

    const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
    const context = browser.contexts()[0];
    if (!context) throw new Error('Chrome has no browser context to read the login from.');
    const cookies = await context.cookies(DASHBOARD_ORIGIN);
    if (!cookies.some(cookie => cookie.name.startsWith('authjs.session-token'))) {
      throw new Error('The dashboard opened, but no Auth.js session cookie was set.');
    }
    const username = await signedInUsername(
      cookies.map(cookie => `${cookie.name}=${cookie.value}`).join('; ')
    );
    if (!username) throw new Error('The saved cookie does not sign in to the dashboard.');

    mkdirSync(dirname(stateFile), { recursive: true });
    writeFileSync(stateFile, `${JSON.stringify({ cookies, origins: [] }, null, 2)}\n`, {
      mode: 0o600,
    });

    // The profile keeps only the Discord login. Left in place, the dashboard cookie would be
    // captured again by the next run, even after its Discord token has expired.
    await context.clearCookies({ domain: 'localhost' });
    // Closing through DevTools lets Chrome write the profile to disk before it exits.
    await (await browser.newBrowserCDPSession()).send('Browser.close').catch(() => {});
    say(`Signed in as ${username}. Saved to ${stateFile}`);
  } finally {
    await Promise.race([exited, sleep(5_000)]);
    if (chrome.exitCode === null) chrome.kill();
  }
}

try {
  await login();
} catch (error) {
  say(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
