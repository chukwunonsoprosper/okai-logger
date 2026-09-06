'use strict';
const { safeJson } = require('../utils/serialization');
function sendJson(res, statusCode, body) {
  const encoded = Buffer.from(safeJson(body));
  const headers = { 'content-type': 'application/json; charset=utf-8', 'content-length': String(encoded.length), 'x-request-id': body.requestId || undefined };
  Object.entries(headers).forEach(([name, value]) => { if (value !== undefined) res.setHeader(name, value); });
  res.writeHead(statusCode); res.end(encoded);
  return { statusCode, headers: Object.fromEntries(Object.entries(headers).filter(([, value]) => value !== undefined)), body, size: encoded.length, startedAt: new Date().toISOString() };
}
module.exports = { sendJson };
