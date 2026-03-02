#!/usr/bin/env node
/**
 * IDEA Adapter — Quick Smoke Test (read-only, no source modification)
 *
 * Automatically runs representative test commands from HOWTO_TEST.md,
 * excluding any commands that modify source files (replace, rollback, lhrollback).
 *
 * Usage:
 *   node test/test_auto.js [port]
 *
 * Prerequisites:
 *   - VS Code Extension Development Host running (F5)
 *   - npm install done in project root
 */
'use strict';

const WebSocket = require('ws');
const { randomUUID } = require('crypto');
const path = require('path');
const fs = require('fs');

// ─── Settings.json 자동 읽기 ─────────────────────────────────────────────────

function readWorkspaceSettings() {
  const settingsPath = path.join(__dirname, '..', '.vscode', 'settings.json');
  try {
    let raw = fs.readFileSync(settingsPath, 'utf8');
    raw = raw.replace(/^\s*\/\/.*$/gm, '').replace(/,(\s*[}\]])/g, '$1');
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

const settings = readWorkspaceSettings();
const PORT  = parseInt(process.argv[2] ?? settings['idea.server.port'] ?? '7200', 10);
const TOKEN = settings['idea.server.authToken'] ?? '';

const SRC = {
  stub:        path.join(__dirname, 'src', 'stub.ts'),
  app:         path.join(__dirname, 'src', 'App.tsx'),
  chatService: path.join(__dirname, 'src', 'ai', 'chatService.ts'),
};

// ─── Color helpers ────────────────────────────────────────────────────────────

function colorize(str, code) {
  if (!process.stdout.isTTY) return str;
  return `\x1b[${code}m${str}\x1b[0m`;
}
const green  = (s) => colorize(s, '32');
const red    = (s) => colorize(s, '31');
const yellow = (s) => colorize(s, '33');
const gray   = (s) => colorize(s, '90');
const bold   = (s) => colorize(s, '1');

// ─── WebSocket helpers ────────────────────────────────────────────────────────

let ws;
const pending = new Map();
const TIMEOUT_MS = 10000;

async function connect() {
  await new Promise((resolve, reject) => {
    ws = new WebSocket(`ws://localhost:${PORT}`);
    ws.on('error', reject);
    ws.on('open', resolve);
  });

  const hsPromise = new Promise((resolve, reject) => {
    ws.on('message', (raw) => {
      const msg = JSON.parse(raw.toString());
      if (msg.type === 'handshake') {
        if (msg.error) {
          reject(new Error(`Handshake failed: [${msg.error.code}] ${msg.error.message}`));
          return;
        }
        resolve(msg);
        return;
      }
      if (msg.requestId && pending.has(msg.requestId)) {
        const cb = pending.get(msg.requestId);
        pending.delete(msg.requestId);
        cb(msg);
      }
    });
  });

  const hsMsg = TOKEN ? { type: 'handshake', token: TOKEN } : { type: 'handshake' };
  ws.send(JSON.stringify(hsMsg));
  return hsPromise;
}

function req(topic, params = {}) {
  const requestId = randomUUID();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(requestId);
      reject(new Error(`Timeout (${TIMEOUT_MS}ms) — topic: ${topic}`));
    }, TIMEOUT_MS);
    pending.set(requestId, (msg) => { clearTimeout(timer); resolve(msg); });
    ws.send(JSON.stringify({ topic, requestId, params }));
  });
}

// ─── Test runner ──────────────────────────────────────────────────────────────

const results = [];

async function test(label, fn) {
  process.stdout.write(`  ${label} ... `);
  try {
    const info = await fn();
    const suffix = info ? gray(` (${info})`) : '';
    console.log(green('✓') + suffix);
    results.push({ label, pass: true });
  } catch (err) {
    console.log(red('✗') + ' ' + red(err.message));
    results.push({ label, pass: false, err: err.message });
  }
}

function section(name) {
  console.log('\n' + bold(yellow(`▶ ${name}`)));
}

// ─── Test cases ──────────────────────────────────────────────────────────────

async function main() {
  console.log(bold(`\nIDEA Adapter — Quick Smoke Test`));
  console.log(gray(`  Port: ${PORT}  |  Token: ${TOKEN ? TOKEN.slice(0, 8) + '...' : '(none)'}\n`));

  // Connect
  process.stdout.write('  Connecting to WebSocket server ... ');
  let hs;
  try {
    hs = await connect();
    console.log(green('✓') + gray(` capabilities: ${hs.capabilities?.length ?? 0}`));
  } catch (err) {
    console.log(red('✗') + ' ' + red(err.message));
    console.log(red('\nCould not connect. Is the Extension Development Host running (F5)?'));
    process.exit(1);
  }

  // ── find ──────────────────────────────────────────────────────────────────
  section('/app/vscode/edit/find');

  await test('find "getChatResponse" in test/src/**/*.ts', async () => {
    const res = await req('/app/vscode/edit/find', {
      pattern: 'getChatResponse',
      include: SRC.chatService.replace(/\\/g, '/'),
    });
    if (res.error) throw new Error(`[${res.error.code}] ${res.error.message}`);
    const count = res.result?.totalCount ?? 0;
    if (count === 0) throw new Error('Expected at least 1 match');
    return `${count} match(es)`;
  });

  await test('find "IStubService" in stub.ts', async () => {
    const res = await req('/app/vscode/edit/find', {
      pattern: 'IStubService',
      include: SRC.stub.replace(/\\/g, '/'),
    });
    if (res.error) throw new Error(`[${res.error.code}] ${res.error.message}`);
    const count = res.result?.totalCount ?? 0;
    if (count === 0) throw new Error('Expected at least 1 match');
    return `${count} match(es)`;
  });

  // ── definition ────────────────────────────────────────────────────────────
  section('/app/vscode/nav/definition');

  await test('definition of "IStubService" (stub.ts line 2, char 17)', async () => {
    const res = await req('/app/vscode/nav/definition', {
      filePath: SRC.stub,
      line: 2,
      character: 17,
    });
    if (res.error) throw new Error(`[${res.error.code}] ${res.error.message}`);
    const defs = res.result?.definitions ?? [];
    if (defs.length === 0) throw new Error('Expected at least 1 definition');
    return `${defs.length} definition(s)`;
  });

  // ── references ────────────────────────────────────────────────────────────
  section('/app/vscode/nav/references');

  await test('references of "IStubService" (stub.ts line 2, char 17)', async () => {
    const res = await req('/app/vscode/nav/references', {
      filePath: SRC.stub,
      line: 2,
      character: 17,
    });
    if (res.error) throw new Error(`[${res.error.code}] ${res.error.message}`);
    const refs = res.result?.references ?? [];
    if (refs.length === 0) throw new Error('Expected at least 1 reference');
    return `${refs.length} reference(s)`;
  });

  // ── diagnostics ───────────────────────────────────────────────────────────
  section('/app/vscode/diag/list');

  await test('diagnostics for App.tsx', async () => {
    const res = await req('/app/vscode/diag/list', {
      filePath: SRC.app,
    });
    if (res.error) throw new Error(`[${res.error.code}] ${res.error.message}`);
    const count = res.result?.totalCount ?? 0;
    return `${count} diagnostic(s)`;
  });

  // ── symbols ───────────────────────────────────────────────────────────────
  section('/app/vscode/nav/symbols');

  await test('symbols in App.tsx', async () => {
    const res = await req('/app/vscode/nav/symbols', {
      filePath: SRC.app,
    });
    if (res.error) throw new Error(`[${res.error.code}] ${res.error.message}`);
    const count = res.result?.totalCount ?? 0;
    if (count === 0) throw new Error('Expected at least 1 symbol');
    return `${count} symbol(s)`;
  });

  await test('symbols in chatService.ts', async () => {
    const res = await req('/app/vscode/nav/symbols', {
      filePath: SRC.chatService,
    });
    if (res.error) throw new Error(`[${res.error.code}] ${res.error.message}`);
    const count = res.result?.totalCount ?? 0;
    if (count === 0) throw new Error('Expected at least 1 symbol');
    return `${count} symbol(s)`;
  });

  // ── git history ───────────────────────────────────────────────────────────
  section('/app/vscode/history/list');

  await test('git history for stub.ts', async () => {
    const res = await req('/app/vscode/history/list', {
      filePath: SRC.stub,
      maxCount: 5,
    });
    if (res.error) throw new Error(`[${res.error.code}] ${res.error.message}`);
    const count = res.result?.totalCount ?? 0;
    return `${count} commit(s)`;
  });

  // ── git diff ──────────────────────────────────────────────────────────────
  section('/app/vscode/history/diff');

  await test('diff stub.ts working tree vs HEAD (index 0→1)', async () => {
    const res = await req('/app/vscode/history/diff', {
      filePath: SRC.stub,
      fromIndex: 0,
      toIndex: 1,
    });
    if (res.error) throw new Error(`[${res.error.code}] ${res.error.message}`);
    const diff = res.result?.diff ?? '';
    return `${diff.split('\n').length} lines`;
  });

  // ── file search ───────────────────────────────────────────────────────────
  section('/app/vscode/fs/findFiles');

  await test('search files by keyword "stub"', async () => {
    const res = await req('/app/vscode/fs/findFiles', {
      query: 'stub',
    });
    if (res.error) throw new Error(`[${res.error.code}] ${res.error.message}`);
    const count = res.result?.totalCount ?? 0;
    if (count === 0) throw new Error('Expected at least 1 file');
    return `${count} file(s)`;
  });

  await test('search files by keyword "chatService" in test/src/**', async () => {
    const res = await req('/app/vscode/fs/findFiles', {
      query: 'chatService',
      include: 'test/src/**',
    });
    if (res.error) throw new Error(`[${res.error.code}] ${res.error.message}`);
    const count = res.result?.totalCount ?? 0;
    if (count === 0) throw new Error('Expected at least 1 file');
    return `${count} file(s)`;
  });

  // ── local history ─────────────────────────────────────────────────────────
  section('/app/vscode/localhistory/list');

  await test('local history for App.tsx', async () => {
    const res = await req('/app/vscode/localhistory/list', {
      filePath: SRC.app,
    });
    if (res.error) throw new Error(`[${res.error.code}] ${res.error.message}`);
    const count = res.result?.totalCount ?? 0;
    return `${count} local history entry(ies)`;
  });

  // ─── Summary ──────────────────────────────────────────────────────────────

  ws.close();

  const passed = results.filter(r => r.pass).length;
  const failed = results.filter(r => !r.pass).length;

  console.log('\n' + '─'.repeat(50));
  if (failed === 0) {
    console.log(green(bold(`✓ All ${passed} tests passed`)));
  } else {
    console.log(red(bold(`✗ ${failed} failed`)) + gray(`, ${passed} passed`));
    console.log('\nFailed tests:');
    for (const r of results.filter(r => !r.pass)) {
      console.log(`  ${red('✗')} ${r.label}`);
      console.log(`    ${gray(r.err)}`);
    }
    process.exit(1);
  }
}

main().catch(err => {
  console.error(red('\nUnexpected error: ' + err.message));
  if (ws) ws.close();
  process.exit(1);
});
