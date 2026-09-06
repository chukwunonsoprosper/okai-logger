'use strict';
const { randomUUID } = require('node:crypto');
function createRequestId() { return `REQ_${randomUUID().replaceAll('-', '')}`; }
module.exports = { createRequestId };
