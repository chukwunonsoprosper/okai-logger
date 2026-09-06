'use strict';
const { randomUUID } = require('node:crypto');
class ConnectionTracker {
  constructor(logger) { this.logger = logger; this.connections = new Map(); }
  open(socket) {
    const state = { id: `CONN_${randomUUID().replaceAll('-', '')}`, openedAt: new Date().toISOString(), started: Date.now(), requests: 0 };
    this.connections.set(socket, state);
    this.logger.connection({ event: 'connection_opened', connectionId: state.id, timestamp: state.openedAt, remote: { address: socket.remoteAddress, port: socket.remotePort }, local: { address: socket.localAddress, port: socket.localPort } }).catch(() => {});
    socket.once('close', (hadError) => { this.connections.delete(socket); this.logger.connection({ event: 'connection_closed', connectionId: state.id, timestamp: new Date().toISOString(), durationMs: Date.now() - state.started, requests: state.requests, hadError, remote: { address: socket.remoteAddress, port: socket.remotePort }, local: { address: socket.localAddress, port: socket.localPort } }).catch(() => {}); });
  }
  received(socket) { const state = this.connections.get(socket); if (state) state.requests += 1; return state; }
  get activeConnections() { return this.connections.size; }
}
module.exports = { ConnectionTracker };
