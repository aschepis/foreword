/* tiny dependency-free logger w/ ANSI colors + request middleware */
import process from 'node:process';

const useColor = process.stdout.isTTY && !process.env.NO_COLOR;
const c = useColor
  ? {
      dim: (s) => `\x1b[2m${s}\x1b[0m`,
      gray: (s) => `\x1b[90m${s}\x1b[0m`,
      red: (s) => `\x1b[31m${s}\x1b[0m`,
      green: (s) => `\x1b[32m${s}\x1b[0m`,
      yellow: (s) => `\x1b[33m${s}\x1b[0m`,
      blue: (s) => `\x1b[34m${s}\x1b[0m`,
      magenta: (s) => `\x1b[35m${s}\x1b[0m`,
      cyan: (s) => `\x1b[36m${s}\x1b[0m`,
      bold: (s) => `\x1b[1m${s}\x1b[0m`,
    }
  : new Proxy({}, { get: () => (s) => String(s) });

function ts() {
  return c.dim(new Date().toISOString().slice(11, 23));
}

function fmt(parts) {
  return parts
    .map((p) => {
      if (typeof p === 'string') return p;
      if (p instanceof Error) return p.stack || p.message;
      try { return JSON.stringify(p); } catch { return String(p); }
    })
    .join(' ');
}

function lvl(label, color, ...parts) {
  // eslint-disable-next-line no-console
  console.log(`${ts()} ${color(label)} ${fmt(parts)}`);
}

export const log = {
  debug: (...p) => { if (process.env.DEBUG) lvl('DBG', c.gray, ...p); },
  info:  (...p) => lvl('INF', c.blue, ...p),
  warn:  (...p) => lvl('WRN', c.yellow, ...p),
  error: (...p) => lvl('ERR', c.red, ...p),
  ok:    (...p) => lvl('OK ', c.green, ...p),
  agent: (...p) => lvl('AGT', c.magenta, ...p),
  git:   (...p) => lvl('GIT', c.cyan, ...p),
};

export function requestLogger() {
  return function (req, res, next) {
    const start = Date.now();
    res.on('finish', () => {
      const ms = Date.now() - start;
      const status = res.statusCode;
      const statusColor = status >= 500 ? c.red : status >= 400 ? c.yellow : status >= 300 ? c.cyan : c.green;
      const len = res.getHeader('content-length');
      // eslint-disable-next-line no-console
      console.log(
        `${ts()} ${c.dim('HTTP')} ${statusColor(String(status))} ${c.bold(req.method.padEnd(4))} ${req.originalUrl} ${c.dim(`${ms}ms`)}${len ? c.dim(` ${len}b`) : ''}`
      );
    });
    next();
  };
}

export function banner(port, dbPath) {
  // eslint-disable-next-line no-console
  console.log(`
${c.bold(c.magenta('▌'))} ${c.bold('foreword')} ${c.dim('— self-review for the agentic era')}
  ${c.dim('server')}  http://localhost:${c.bold(port)}
  ${c.dim('db    ')}  ${dbPath}
  ${c.dim('pid   ')}  ${process.pid}
  ${c.dim('hint  ')}  set ${c.bold('DEBUG=1')} for verbose tracing
`);
}
