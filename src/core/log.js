const LEVELS = Object.freeze({ debug: 10, info: 20, warn: 30, error: 40 });

let debugEnabled = false;
let sink = console;

export function setDebugLogging(enabled) {
  debugEnabled = Boolean(enabled);
}

export function setLogSink(target) {
  sink = target ?? console;
}

export function createLogger(module) {
  const prefix = `[MarketPulse:${module}]`;
  const write = (level) => (...args) => {
    if (LEVELS[level] < LEVELS.info && !debugEnabled) return;
    sink[level](prefix, ...args);
  };
  return Object.freeze({
    debug: write('debug'),
    info: write('info'),
    warn: write('warn'),
    error: write('error'),
  });
}
