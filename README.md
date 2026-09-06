# OKAI HTTP Inspector

A backend-only Node.js HTTP inspection endpoint for controlled testing. It accepts every HTTP method and path, records request/connection/response information as JSON Lines, and returns a deterministic JSON acknowledgement. It uses Node's native `http` and optional native `https` modules—there is no UI, database, or routing framework.

## Requirements and installation

Requires Node.js 18 or newer.

```bash
npm install
cp .env.example .env
npm start
```

`npm install` has no production packages to download; it is included as the standard project setup command. By default the process listens on `0.0.0.0:8080`, not only localhost.

For restart-on-edit development:

```bash
npm run dev
```

## Configuration

Copy `.env.example` to `.env` and adjust as required:

| Variable | Default | Purpose |
| --- | --- | --- |
| `HOST` | `0.0.0.0` | Bind address. |
| `PORT` | `8080` | HTTP listener port. |
| `LOG_DIR` | `./logs` | Directory for JSONL log files. |
| `MAX_BODY_SIZE` | `10mb` | Maximum bytes retained in memory per request body. Extra bytes are drained and the body is marked `truncated`. |
| `REQUEST_TIMEOUT_MS` | `30000` | Node HTTP request timeout. |
| `LOG_HEADERS`, `LOG_BODY`, `LOG_RESPONSE` | `true` | Selectively omit data from request records. |
| `REDACT_SENSITIVE_HEADERS` | `true` | Redact sensitive values before they reach logs. |
| `SENSITIVE_HEADERS` | standard sensitive names | Comma-separated headers to redact. |
| `HTTPS_ENABLED` | `false` | Enable the optional native HTTPS listener. |
| `TLS_KEY_PATH`, `TLS_CERT_PATH`, `HTTPS_PORT` | empty, empty, `8443` | TLS files and listener port when HTTPS is enabled. |

Never disable redaction except in a trusted test environment. Header names remain present with a `[REDACTED]` value, preserving useful request shape without persisting credentials.

## Use it

Every non-internal path is captured, without predefined routes:

```bash
curl -v http://localhost:8080/test
curl -v "http://localhost:8080/test?a=1&b=hello"
curl -v http://localhost:8080/test -H "X-Custom-Header: test"
curl -v -X POST http://localhost:8080/api/device \
  -H "Content-Type: application/json" \
  -H "X-Test: hello" \
  -d '{"deviceId":"TEST-001","action":"connect"}'
```

The normal response is `200 application/json`:

```json
{"success":true,"requestId":"REQ_<unique-id>","message":"Request received"}
```

`REQ_…` is generated from a cryptographically strong UUID and appears in the response, the request record, and concise stdout output. `HEAD` requests are also captured; Node correctly suppresses their response payload on the wire.

## Logs

The server creates these directories automatically and appends one self-contained JSON document per line:

```text
logs/
├── requests/2026-09-06.jsonl
├── errors/2026-09-06.jsonl
└── connections/2026-09-06.jsonl
```

Request entries include URL/query, all configured headers, remote/local socket information, protocol, safely represented body, response metadata/body, and lifecycle timings. JSON bodies are parsed when valid; malformed JSON is retained as text with `parseError`; text, XML, and form bodies are represented safely; binary bodies contain type, content type, and size metadata rather than unsafe UTF-8 conversion. File appends are serialized as complete JSONL records, so concurrent requests do not create malformed JSON records.

Connection entries record open, request-received, request-completed, and close events, including request count and connection duration. This is HTTP/application-layer inspection only; it does not inspect raw packets.

## Internal endpoints

These endpoints are reserved and intentionally excluded from normal inspected-traffic records:

```bash
curl http://localhost:8080/__inspector/health
curl http://localhost:8080/__inspector/stats
```

They return health/uptime and runtime counters respectively.

## VPS and reverse proxies

Run the same process directly on a VPS, then access it at `http://SERVER_IP:8080`. Ensure the VPS firewall and cloud security group allow the configured port. A domain/reverse proxy can forward requests to the same HTTP listener; the forwarded request is captured at the application layer (configure your proxy to preserve any headers you need recorded).

Plain HTTP is directly inspectable: `Client → Node HTTP server`. HTTPS needs TLS termination: `Client → TLS → Node HTTPS server`. To have this process terminate TLS itself, set `HTTPS_ENABLED=true` and point `TLS_KEY_PATH` and `TLS_CERT_PATH` at valid private-key and certificate files. Alternatively, terminate TLS at a reverse proxy and forward HTTP to this server. An ordinary HTTP listener cannot decode encrypted HTTPS traffic.

## Operational behavior

- `SIGINT` and `SIGTERM` stop accepting new connections, allow active requests to finish, and wait for pending log appends.
- Oversized bodies are drained rather than buffered indefinitely and marked as truncated.
- Aborted requests, malformed JSON, HTTP parser errors, missing headers, and unusual methods are handled and logged rather than crashing the process.
- No request path is mapped to filesystem access, command execution, dynamic code, or log download.
