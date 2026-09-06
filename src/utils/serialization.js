'use strict';
function safeJson(value) {
  const seen = new WeakSet();
  return JSON.stringify(value, (_key, item) => {
    if (typeof item === 'bigint') return item.toString();
    if (typeof item === 'object' && item !== null) { if (seen.has(item)) return '[Circular]'; seen.add(item); }
    return item;
  });
}
function contentType(headers) { return String(headers['content-type'] || '').split(';', 1)[0].trim().toLowerCase(); }
function isTextual(type) { return type.startsWith('text/') || type.includes('json') || type.includes('xml') || type === 'application/x-www-form-urlencoded' || type.endsWith('+json'); }
module.exports = { safeJson, contentType, isTextual };
