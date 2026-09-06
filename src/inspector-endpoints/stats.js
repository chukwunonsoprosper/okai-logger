'use strict';
function stats(startedAt, runtime, tracker) { return { uptime: Math.floor((Date.now() - startedAt) / 1000), totalRequests: runtime.totalRequests, activeConnections: tracker.activeConnections, requestsToday: runtime.requestsToday }; }
module.exports = { stats };
