'use strict';
const fs = require('node:fs');
const http = require('node:http');
const https = require('node:https');
const { config } = require('./config');
const { FileWriter } = require('./logging/file-writer');
const { Logger } = require('./logging/logger');
const { createRequestId } = require('./utils/request-id');
const { captureRequest } = require('./inspector/request-capture');
const { sendJson } = require('./inspector/response-capture');
const { ConnectionTracker } = require('./inspector/connection-tracker');
const { health } = require('./inspector-endpoints/health');
const { stats } = require('./inspector-endpoints/stats');

const startedAt = Date.now();
const runtime = { totalRequests: 0, requestsToday: 0, date: new Date().toISOString().slice(0, 10) };
const writer = new FileWriter(config.logDir);
const logger = new Logger(writer);
const tracker = new ConnectionTracker(logger);
let shuttingDown = false;

function refreshToday() { const date = new Date().toISOString().slice(0, 10); if (runtime.date !== date) { runtime.date = date; runtime.requestsToday = 0; } }
function conciseTimestamp(iso) { return iso.replace('T', ' ').replace(/\.\d{3}Z$/, ''); }
function endpoint(req, res) {
  const pathname = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`).pathname;
  if (req.method === 'GET' && pathname === '/__inspector/health') { sendJson(res, 200, health(startedAt)); return true; }
  if (req.method === 'GET' && pathname === '/__inspector/stats') { sendJson(res, 200, stats(startedAt, runtime, tracker)); return true; }
  return false;
}
async function handleRequest(req, res) {
  if (shuttingDown) { sendJson(res, 503, { success: false, message: 'Server is shutting down' }); return; }
  if (endpoint(req, res)) return;
  const requestId = createRequestId(); const receivedAt = new Date().toISOString(); const start = process.hrtime.bigint();
  refreshToday(); runtime.totalRequests += 1; runtime.requestsToday += 1;
  const connection = tracker.received(req.socket);
  logger.connection({ event: 'request_received', connectionId: connection?.id, requestId, timestamp: receivedAt, method: req.method, url: req.url }).catch(() => {});
  let captured;
  try {
    captured = await captureRequest(req, requestId, receivedAt, config);
    const responseBody = { success: true, requestId, message: 'Request received' };
    const response = sendJson(res, 200, responseBody);
    const completedAt = new Date().toISOString(); const durationMs = Number(process.hrtime.bigint() - start) / 1e6;
    const record = { ...captured, response: config.logResponse ? { ...response, timestamp: completedAt } : undefined, timing: { receivedAt, responseStartedAt: response.startedAt, completedAt, durationMs: Number(durationMs.toFixed(3)) } };
    await logger.request(record);
    await logger.connection({ event: 'request_completed', connectionId: connection?.id, requestId, timestamp: completedAt, durationMs: record.timing.durationMs, keepAlive: req.shouldKeepAlive });
    console.log(`[${conciseTimestamp(completedAt)}] ${req.method} ${captured.request.path} → 200 (${Math.round(durationMs)}ms) [${requestId}]`);
  } catch (error) {
    const completedAt = new Date().toISOString(); const durationMs = Number(process.hrtime.bigint() - start) / 1e6;
    const errorRecord = { timestamp: completedAt, requestId, event: 'request_error', error: { message: error.message, code: error.code, stack: error.stack }, request: { method: req.method, url: req.url, remote: { address: req.socket.remoteAddress, port: req.socket.remotePort } }, timing: { receivedAt, completedAt, durationMs: Number(durationMs.toFixed(3)) } };
    await logger.error(errorRecord).catch(() => {});
    if (!res.headersSent && !res.destroyed) sendJson(res, error.code === 'REQUEST_ABORTED' ? 400 : 500, { success: false, requestId, message: error.code === 'REQUEST_ABORTED' ? 'Request aborted by client' : 'Unable to inspect request' });
    console.error(`[${conciseTimestamp(completedAt)}] ${req.method} ${req.url} → error (${Math.round(durationMs)}ms) [${requestId}] ${error.message}`);
  }
}
function configureServer(server) {
  server.requestTimeout = config.requestTimeoutMs;
  server.headersTimeout = Math.max(config.requestTimeoutMs + 1000, 60000);
  server.on('connection', (socket) => tracker.open(socket));
  server.on('clientError', (error, socket) => { logger.error({ timestamp: new Date().toISOString(), event: 'client_error', error: { message: error.message, code: error.code }, remote: { address: socket.remoteAddress, port: socket.remotePort } }).catch(() => {}); if (socket.writable) socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n'); });
  return server;
}
function listen(server, port, label) { return new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, config.host, () => { server.off('error', reject); console.log(`${label} listening on ${config.host}:${port}; logs: ${config.logDir}`); resolve(); }); }); }
async function start() {
  await writer.initialize();
  const servers = [configureServer(http.createServer(handleRequest))];
  await listen(servers[0], config.port, 'HTTP inspector');
  if (config.httpsEnabled) {
    if (!config.tlsKeyPath || !config.tlsCertPath) throw new Error('HTTPS_ENABLED requires TLS_KEY_PATH and TLS_CERT_PATH.');
    const secure = configureServer(https.createServer({ key: fs.readFileSync(config.tlsKeyPath), cert: fs.readFileSync(config.tlsCertPath) }, handleRequest)); servers.push(secure); await listen(secure, config.httpsPort, 'HTTPS inspector');
  }
  const shutdown = async (signal) => { if (shuttingDown) return; shuttingDown = true; console.log(`${signal} received; closing listeners...`); await Promise.all(servers.map((server) => new Promise((resolve) => server.close(resolve)))); await writer.close(); console.log('Inspector shut down cleanly.'); };
  process.once('SIGINT', () => shutdown('SIGINT')); process.once('SIGTERM', () => shutdown('SIGTERM'));
}
start().catch(async (error) => { console.error(`Unable to start inspector: ${error.stack || error.message}`); await writer.close(); process.exitCode = 1; });
