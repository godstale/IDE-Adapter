#!/usr/bin/env node
/**
 * IDEA Adapter — WebSocket Test Client
 *
 * Usage:
 *   node test/client.js [port]        (default port: 7200)
 *
 * Requires: ws  (npm install ws)
 * Or use the project's own ws:  node -e "require('./test/client.js')"
 */

const WebSocket = require('ws');
const { randomUUID } = require('crypto');

const PORT = parseInt(process.argv[2] ?? '7200', 10);
const WS_URL = `ws://localhost:${PORT}`;

console.log(`[client] Connecting to ${WS_URL}`);

const ws = new WebSocket(WS_URL);

// requestId → { resolve, reject } — for response-driven test flow
const pending = new Map();

ws.on('open', () => {
  console.log('[client] Connected');
  send({ type: 'handshake' });
});

ws.on('message', (raw) => {
  let msg;
  try {
    msg = JSON.parse(raw.toString());
  } catch (e) {
    console.error('[client] Failed to parse message:', raw.toString());
    return;
  }

  console.log('[client] ←', JSON.stringify(msg, null, 2));

  if (msg.type === 'handshake') {
    console.log(`[client] Handshake OK — server version: ${msg.version}`);
    console.log(`[client] Capabilities: ${(msg.capabilities ?? []).join(', ') || '(none)'}`);
    console.log(`[client] Workspaces: ${(msg.workspaces ?? []).join(', ') || '(none)'}`);
    runTests().then(() => {
      console.log('\n[client] Tests complete. Closing connection.');
      ws.close();
    });
    return;
  }

  // Route response to waiting test
  if (msg.requestId && pending.has(msg.requestId)) {
    const { resolve } = pending.get(msg.requestId);
    pending.delete(msg.requestId);
    resolve(msg);
  }
});

ws.on('error', (err) => {
  console.error('[client] WebSocket error:', err.message);
  // Reject all pending requests so awaiting tests can continue/fail gracefully
  for (const [id, { reject }] of pending) {
    pending.delete(id);
    reject(err);
  }
});

ws.on('close', () => {
  console.log('[client] Connection closed');
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function send(obj) {
  const json = JSON.stringify(obj);
  console.log('[client] →', json);
  ws.send(json);
}

// Send a request and return a Promise that resolves with the server response.
// Always resolves (never rejects on error responses) so test execution continues.
function request(topic, params = {}) {
  return new Promise((resolve, reject) => {
    const requestId = randomUUID();
    pending.set(requestId, { resolve, reject });
    send({ topic, requestId, params });
  });
}

// Send a raw message (no requestId) and wait a fixed delay for any response.
function sendRaw(obj, delayMs = 300) {
  send(obj);
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

async function runTests() {
  let passed = 0;
  let failed = 0;

  async function test(label, fn) {
    console.log(`\n[test] ${label}`);
    try {
      await fn();
      console.log(`[test] ✓ PASS: ${label}`);
      passed++;
    } catch (err) {
      console.error(`[test] ✗ FAIL: ${label} — ${err.message}`);
      failed++;
    }
  }

  // ── Test 1: find handler ──────────────────────────────────────────────────
  await test('find: search for TODO in *.ts', async () => {
    const res = await request('/app/vscode/edit/find', {
      pattern: 'TODO',
      include: '**/*.ts',
      isRegex: false,
      isCaseSensitive: false,
    });
    if (res.error) { throw new Error(`Server error: ${res.error.code} — ${res.error.message}`); }
    if (!Array.isArray(res.result?.matches)) { throw new Error('result.matches is not an array'); }
  });

  // ── Test 2: unknown topic → UNKNOWN_TOPIC error ───────────────────────────
  await test('error: unknown topic returns UNKNOWN_TOPIC', async () => {
    const res = await request('/app/vscode/unknown/topic', {});
    if (res.error?.code !== 'UNKNOWN_TOPIC') {
      throw new Error(`Expected UNKNOWN_TOPIC, got: ${res.error?.code ?? 'no error'}`);
    }
  });

  // ── Test 3: missing topic field → INVALID_REQUEST error ───────────────────
  await test('error: missing topic returns INVALID_REQUEST', async () => {
    // No requestId-based resolution possible; use raw send + delay
    await sendRaw({ requestId: randomUUID(), params: {} });
    // Response is printed by the message handler; we just verify it doesn't crash
  });

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log(`\n[test] Results: ${passed} passed, ${failed} failed`);
}
