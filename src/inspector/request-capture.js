'use strict';
const { URLSearchParams } = require('node:url');
const { redactHeaders } = require('../utils/redact');
const { contentType, isTextual } = require('../utils/serialization');

function queryObject(searchParams) {
  const query = {};
  for (const [key, value] of searchParams) {
    if (!(key in query)) query[key] = value;
    else query[key] = Array.isArray(query[key]) ? [...query[key], value] : [query[key], value];
  }
  return query;
}
function parseBody(buffer, type, truncated, totalBytes) {
  const base = { size: totalBytes, capturedSize: buffer.length, truncated, contentType: type || undefined };
  if (!buffer.length) return { ...base, type: 'empty' };
  if (type.includes('json')) {
    const text = buffer.toString('utf8');
    try { return { ...base, type: 'json', value: JSON.parse(text) }; }
    catch (error) { return { ...base, type: 'json', value: text, parseError: error.message }; }
  }
  if (type === 'application/x-www-form-urlencoded') return { ...base, type: 'form', value: queryObject(new URLSearchParams(buffer.toString('utf8'))) };
  if (isTextual(type)) return { ...base, type: type.includes('xml') ? 'xml' : 'text', value: buffer.toString('utf8') };
  return { ...base, type: 'binary' };
}
function readBody(req, maxBodySize) {
  return new Promise((resolve, reject) => {
    const chunks = []; let captured = 0; let total = 0; let truncated = false;
    req.on('data', (chunk) => {
      total += chunk.length;
      if (captured < maxBodySize) {
        const remaining = maxBodySize - captured;
        chunks.push(chunk.subarray(0, remaining)); captured += Math.min(chunk.length, remaining);
      }
      if (total > maxBodySize) truncated = true;
    });
    req.once('end', () => resolve({ buffer: Buffer.concat(chunks), total, truncated }));
    req.once('aborted', () => reject(Object.assign(new Error('Client aborted request body'), { code: 'REQUEST_ABORTED', total })));
    req.once('error', reject);
  });
}
async function captureRequest(req, requestId, receivedAt, config) {
  const parsed = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  const bodyData = await readBody(req, config.maxBodySize);
  const socket = req.socket;
  return {
    requestId,
    timestamp: receivedAt,
    request: {
      method: req.method || 'UNKNOWN', url: req.url || '/', path: parsed.pathname, query: queryObject(parsed.searchParams),
      httpVersion: req.httpVersion, protocol: socket.encrypted ? 'https' : 'http', host: req.headers.host,
      userAgent: req.headers['user-agent'], contentType: req.headers['content-type'], contentLength: req.headers['content-length'],
      connection: req.headers.connection, keepAlive: req.headers['keep-alive'], headers: redactHeaders(req.headers, config),
      remote: { address: socket.remoteAddress, port: socket.remotePort }, local: { address: socket.localAddress, port: socket.localPort },
      body: config.logBody ? parseBody(bodyData.buffer, contentType(req.headers), bodyData.truncated, bodyData.total) : undefined
    }
  };
}
module.exports = { captureRequest };
