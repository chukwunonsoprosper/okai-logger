'use strict';
function redactHeaders(headers, config) {
  if (!config.logHeaders) return undefined;
  const result = {};
  for (const [name, value] of Object.entries(headers || {})) {
    result[name] = config.redactSensitiveHeaders && config.sensitiveHeaders.includes(name.toLowerCase()) ? '[REDACTED]' : value;
  }
  return result;
}
module.exports = { redactHeaders };
