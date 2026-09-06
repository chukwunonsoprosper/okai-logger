'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const { safeJson } = require('../utils/serialization');
class FileWriter {
  constructor(baseDir) { this.baseDir = baseDir; this.pending = new Set(); }
  async initialize() { await Promise.all(['requests', 'errors', 'connections'].map((kind) => fs.mkdir(path.join(this.baseDir, kind), { recursive: true }))); }
  write(kind, record) {
    const date = new Date().toISOString().slice(0, 10);
    const operation = fs.appendFile(path.join(this.baseDir, kind, `${date}.jsonl`), `${safeJson(record)}\n`, 'utf8');
    this.pending.add(operation); operation.finally(() => this.pending.delete(operation));
    return operation;
  }
  async close() { await Promise.allSettled([...this.pending]); }
}
module.exports = { FileWriter };
