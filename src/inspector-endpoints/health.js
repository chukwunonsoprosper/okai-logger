'use strict';
function health(startedAt) { return { status: 'ok', uptime: Math.floor((Date.now() - startedAt) / 1000) }; }
module.exports = { health };
