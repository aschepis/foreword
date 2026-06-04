import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import process from 'node:process';

function spawnDetached(cmd, args) {
  try {
    const child = spawn(cmd, args, { detached: true, stdio: 'ignore' });
    child.unref();
    return true;
  } catch {
    return false;
  }
}

/**
 * Locate a Chromium-family browser binary so we can launch in app-mode.
 * Returns a spawnable command (absolute path on macOS, command name found on
 * PATH elsewhere) or null if none is installed.
 */
function findChromium() {
  if (process.platform === 'darwin') {
    const apps = [
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
      '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
      '/Applications/Chromium.app/Contents/MacOS/Chromium',
    ];
    return apps.find((p) => fs.existsSync(p)) || null;
  }
  const candidates = process.platform === 'win32'
    ? ['chrome', 'msedge']
    : ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser', 'microsoft-edge', 'brave-browser'];
  const lookup = process.platform === 'win32' ? 'where' : 'which';
  for (const c of candidates) {
    const r = spawnSync(lookup, [c], { stdio: 'ignore' });
    if (r.status === 0) return c;
  }
  return null;
}

/**
 * Best-effort: open `url` in the user's browser without blocking.
 *
 * @param {string} url
 * @param {object} [opts]
 * @param {boolean} [opts.app=false]  Prefer a Chromium app-mode window
 *   (`--app=<url>`) — a chromeless window that the page is permitted to
 *   `window.close()`. Falls back to a normal tab if no Chromium browser is
 *   found. Used by the stdio MCP mode so "Send to agent" can auto-close.
 * @returns {{launched: boolean, appMode: boolean}} launched is whether a
 *   launcher was spawned; appMode is whether the app-mode window was used.
 *   Callers should always surface the URL too — this is a convenience.
 */
export function openBrowser(url, { app = false } = {}) {
  if (app) {
    const chromium = findChromium();
    if (chromium && spawnDetached(chromium, [`--app=${url}`, '--new-window'])) {
      return { launched: true, appMode: true };
    }
    /* No Chromium / launch failed — fall through to the default opener. */
  }

  let cmd, args;
  switch (process.platform) {
    case 'darwin':
      cmd = 'open';   args = [url]; break;
    case 'win32':
      cmd = 'cmd';    args = ['/c', 'start', '""', url]; break;
    default:
      cmd = 'xdg-open'; args = [url]; break;
  }
  return { launched: spawnDetached(cmd, args), appMode: false };
}
