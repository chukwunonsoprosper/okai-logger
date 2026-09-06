'use strict';

const fs = require('node:fs');
const path = require('node:path');

function loadDotEnv(file = path.resolve(process.cwd(), '.env')) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match || match[1] in process.env) continue;
    let value = match[2];
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    process.env[match[1]] = value;
  }
}
function bool(value, fallback) {
  if (value === undefined || value === '') return fallback;
  return ['true', '1', 'yes', 'on'].includes(value.toLowerCase());
}
function positiveInt(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}
function bytes(value, fallback) {
  const match = String(value || '').trim().toLowerCase().match(/^(\d+)\s*(b|kb|mb|gb)?$/);
  if (!match) return fallback;
  const factors = { b: 1, kb: 1024, mb: 1024 ** 2, gb: 1024 ** 3 };
  return Number(match[1]) * factors[match[2] || 'b'];
}

loadDotEnv();
const config = Object.freeze({
  host: process.env.HOST || '0.0.0.0',
  port: positiveInt(process.env.PORT, 8080),
  logDir: path.resolve(process.cwd(), process.env.LOG_DIR || './logs'),
  maxBodySize: bytes(process.env.MAX_BODY_SIZE, 10 * 1024 * 1024),
  requestTimeoutMs: positiveInt(process.env.REQUEST_TIMEOUT_MS, 30000),
  logHeaders: bool(process.env.LOG_HEADERS, true),
  logBody: bool(process.env.LOG_BODY, true),
  logResponse: bool(process.env.LOG_RESPONSE, true),
  redactSensitiveHeaders: bool(process.env.REDACT_SENSITIVE_HEADERS, true),
  sensitiveHeaders: (process.env.SENSITIVE_HEADERS || 'authorization,proxy-authorization,cookie,set-cookie,x-api-key').split(',').map((name) => name.trim().toLowerCase()).filter(Boolean),
  httpsEnabled: bool(process.env.HTTPS_ENABLED, false),
  httpsPort: positiveInt(process.env.HTTPS_PORT, 8443),
  tlsKeyPath: process.env.TLS_KEY_PATH || '',
  tlsCertPath: process.env.TLS_CERT_PATH || ''
});
module.exports = { config, bytes };
