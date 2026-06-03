import { spawn } from 'node:child_process';
import process from 'node:process';

/**
 * Best-effort: open `url` in the user's default browser without blocking.
 *
 * Returns true if the launcher was spawned, false if no launcher is known
 * for this platform. Callers should always include the URL in their return
 * value too — this is a convenience, not a guarantee.
 */
export function openBrowser(url) {
  let cmd, args;
  switch (process.platform) {
    case 'darwin':
      cmd = 'open';   args = [url]; break;
    case 'win32':
      cmd = 'cmd';    args = ['/c', 'start', '""', url]; break;
    default:
      cmd = 'xdg-open'; args = [url]; break;
  }
  try {
    const child = spawn(cmd, args, { detached: true, stdio: 'ignore' });
    child.unref();
    return true;
  } catch {
    return false;
  }
}
