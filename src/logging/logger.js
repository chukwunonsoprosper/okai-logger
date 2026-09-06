'use strict';
class Logger {
  constructor(writer) { this.writer = writer; }
  request(record) { return this.writer.write('requests', record); }
  connection(record) { return this.writer.write('connections', record); }
  error(record) { return this.writer.write('errors', record); }
}
module.exports = { Logger };
