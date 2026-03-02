#!/usr/bin/env node
/**
 * IDEA Adapter — Full Protocol Test Suite
 *
 * Usage:
 *   node test/suite.js [port]       (default: .vscode/settings.json → idea.server.port → 7200)
 *
 * 포트와 인증 토큰은 .vscode/settings.json에서 자동으로 읽어옵니다.
 * 네비게이션 테스트는 test/src/stub.ts를 사용하므로 어느 워크스페이스에서도 동작합니다.
 *
 * Prerequisite:
 *   - VS Code에서 F5 로 Extension Development Host 실행
 *   - 워크스페이스에 test/ 폴더가 포함되어 있을 것
 */
'use strict';

const WebSocket = require('ws');
const { randomUUID } = require('crypto');
const path = require('path');
const fs = require('fs');

// ─── Settings.json 자동 읽기 ────────────────────────────────────────────────────

function readWorkspaceSettings() {
  const settingsPath = path.join(__dirname, '..', '.vscode', 'settings.json');
  try {
    let raw = fs.readFileSync(settingsPath, 'utf8');
    // 기본적인 JSONC 처리 (// 주석 및 trailing comma 제거)
    raw = raw.replace(/^\s*\/\/.*$/gm, '').replace(/,(\s*[}\]])/g, '$1');
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

// ─── Configuration ─────────────────────────────────────────────────────────────

const settings = readWorkspaceSettings();
const PORT  = parseInt(process.argv[2] ?? settings['idea.server.port'] ?? '7200', 10);
const TOKEN = settings['idea.server.authToken'] ?? '';

// Navigation 테스트에 사용할 소스 파일 (test/src/ 안의 스텁 파일 — 워크스페이스 독립)
//
//   stub.ts 심볼 위치 (0-indexed):
//   Line  2, char 17 → IStubService 인터페이스 선언
//   Line  7, char 13 → StubServiceError 클래스 선언
//   Line 11, char 13 → StubServiceImpl 클래스 선언
//   Line 21, char 16 → createStubService 함수 선언
const SRC = {
  stub: path.join(__dirname, 'src', 'stub.ts'),
};

// ─── WebSocket 연결 ────────────────────────────────────────────────────────────

let ws;
const pending     = new Map();   // requestId → resolve
let   noIdResolve = null;        // requestId가 없는 응답용 one-shot 콜백

async function connectAndHandshake() {
  // 연결
  await new Promise((resolve, reject) => {
    ws = new WebSocket(`ws://localhost:${PORT}`);
    ws.on('error', reject);
    ws.on('open', resolve);
  });

  // 단일 메시지 핸들러 등록 (handshake + 이후 모든 응답)
  const hsPromise = new Promise((resolve, reject) => {
    ws.on('message', (raw) => {
      const msg = JSON.parse(raw.toString());

      if (msg.type === 'handshake') {
        if (msg.error) {
          ws.close();
          reject(new Error(`Handshake failed: [${msg.error.code}] ${msg.error.message}`));
          return;
        }
        resolve(msg);
        return;
      }
      // requestId 매칭
      if (msg.requestId && pending.has(msg.requestId)) {
        const cb = pending.get(msg.requestId);
        pending.delete(msg.requestId);
        cb(msg);
      } else if (noIdResolve) {
        // requestId가 '' 이거나 누락된 응답 (INVALID_REQUEST 에러 처리)
        const cb = noIdResolve;
        noIdResolve = null;
        cb(msg);
      }
    });
  });

  const hsMsg = TOKEN ? { type: 'handshake', token: TOKEN } : { type: 'handshake' };
  ws.send(JSON.stringify(hsMsg));
  return hsPromise;
}

const REQ_TIMEOUT_MS = 8000;

// 일반 요청: topic + params
function req(topic, params = {}) {
  const requestId = randomUUID();
  console.log(`       \x1b[90m[requestId] ${requestId}\x1b[0m`);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(requestId);
      reject(new Error(`Timeout (${REQ_TIMEOUT_MS}ms) waiting for response — topic: ${topic}`));
    }, REQ_TIMEOUT_MS);

    pending.set(requestId, (msg) => {
      clearTimeout(timer);
      resolve(msg);
    });
    ws.send(JSON.stringify({ topic, requestId, params }));
  });
}

// 임의 페이로드 전송 (파라미터 누락 에러 케이스용)
function rawReq(obj) {
  const hasId = typeof obj.requestId === 'string' && obj.requestId.length > 0;
  if (hasId) {
    console.log(`       \x1b[90m[requestId] ${obj.requestId}\x1b[0m`);
  }
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      if (hasId) { pending.delete(obj.requestId); }
      else        { noIdResolve = null; }
      reject(new Error(`Timeout (${REQ_TIMEOUT_MS}ms) waiting for response`));
    }, REQ_TIMEOUT_MS);

    const cb = (msg) => { clearTimeout(timer); resolve(msg); };
    if (hasId) {
      pending.set(obj.requestId, cb);
    } else {
      noIdResolve = cb;
    }
    ws.send(JSON.stringify(obj));
  });
}

// ─── Assertion helpers ─────────────────────────────────────────────────────────

function fail(msg) { throw new Error(msg); }

function assertSuccess(res, label) {
  if (res.error) {
    fail(`${label}: expected success but got [${res.error.code}] ${res.error.message}`);
  }
  if (!res.result) { fail(`${label}: result field is missing`); }
}

function assertError(res, code, label) {
  if (!res.error)               { fail(`${label}: expected error [${code}] but got success`); }
  if (res.error.code !== code)  { fail(`${label}: expected [${code}] but got [${res.error.code}]`); }
}

function assertHas(obj, ...keys) {
  for (const k of keys) {
    if (!(k in obj)) { fail(`missing key "${k}" in ${JSON.stringify(obj)}`); }
  }
}

function assertTrue(cond, msg) { if (!cond) { fail(msg); } }

// ─── Test runner ───────────────────────────────────────────────────────────────

const results = [];

async function test(name, fn) {
  try {
    await fn();
    results.push({ name, pass: true });
    console.log(`  \x1b[32m✓\x1b[0m  ${name}`);
  } catch (err) {
    results.push({ name, pass: false, error: err.message });
    console.log(`  \x1b[31m✗\x1b[0m  ${name}`);
    console.log(`       \x1b[90m→ ${err.message}\x1b[0m`);
  }
}

function section(title) {
  console.log(`\n\x1b[1m${'─'.repeat(64)}\x1b[0m`);
  console.log(`\x1b[1m ${title}\x1b[0m`);
  console.log(`\x1b[1m${'─'.repeat(64)}\x1b[0m`);
}

// ═══════════════════════════════════════════════════════════════════════════════
//  TEST CASES
// ═══════════════════════════════════════════════════════════════════════════════

async function main() {
  // 연결
  let hs;
  try {
    const portInfo = TOKEN ? `${PORT} (token: ${TOKEN.slice(0,8)}...)` : `${PORT} (no auth)`;
    console.log(`\n[suite] Connecting to ws://localhost:${portInfo} ...`);
    hs = await connectAndHandshake();
    console.log(`[suite] Handshake OK  version=${hs.version}  authRequired=${hs.authRequired}`);
    console.log(`[suite] Capabilities: ${hs.capabilities.join(', ') || '(none)'}`);
    console.log(`[suite] Workspaces:   ${hs.workspaces?.join(', ') || '(none)'}`);
    if (!hs.workspaces || hs.workspaces.length === 0) {
      console.warn('\x1b[33m[suite] WARNING: 워크스페이스가 설정되지 않았습니다.\x1b[0m');
      console.warn('        Extension Development Host가 올바른 폴더로 열려있는지 확인하세요.');
      console.warn('        → Navigation/Find 일부 테스트가 실패할 수 있습니다.\n');
    }
    console.log('[suite] Running tests...');
  } catch (err) {
    console.error(`\n[suite] Connection failed: ${err.message}`);
    console.error('        Extension Development Host 가 실행 중인지 확인하세요 (F5).');
    if (!TOKEN) {
      console.error('        .vscode/settings.json 에서 idea.server.authToken 을 확인하세요.');
    }
    process.exit(1);
  }

  // ════════════════════════════════════════════════════════════════════════════
  //  /app/vscode/edit/find
  // ════════════════════════════════════════════════════════════════════════════
  section('/app/vscode/edit/find');

  await test('pattern(필수): 기본 리터럴 검색 → matches/totalCount 반환', async () => {
    // test/src/stub.ts 안에서 IStubService 검색 (3회 등장)
    const res = await req('/app/vscode/edit/find', {
      pattern: 'IStubService',
      include: 'test/src/**/*.ts',
    });
    assertSuccess(res, 'find-basic');
    assertHas(res.result, 'matches', 'totalCount');
    assertTrue(Array.isArray(res.result.matches),         'matches must be array');
    assertTrue(typeof res.result.totalCount === 'number', 'totalCount must be number');
    assertTrue(res.result.totalCount === res.result.matches.length, 'totalCount must match matches.length');
    if (res.result.matches.length > 0) {
      const m = res.result.matches[0];
      assertHas(m, 'filePath', 'line', 'character', 'lineText');
      assertTrue(typeof m.line === 'number',      'match.line must be number');
      assertTrue(typeof m.character === 'number', 'match.character must be number');
      assertTrue(m.lineText.toLowerCase().includes('istubservice'), 'lineText must contain match');
    }
  });

  await test('include: 특정 glob 패턴 파일만 검색 → 결과가 해당 파일 타입만 포함', async () => {
    const res = await req('/app/vscode/edit/find', {
      pattern: 'IStubService',
      include: '**/*.ts',
    });
    assertSuccess(res, 'find-include');
    assertTrue(Array.isArray(res.result.matches), 'matches must be array');
    for (const m of res.result.matches) {
      assertTrue(m.filePath.endsWith('.ts'), `all matches must be .ts: got ${m.filePath}`);
    }
  });

  await test('include: *.js 지정 → .ts 파일은 포함되지 않음', async () => {
    const res = await req('/app/vscode/edit/find', {
      pattern: 'IStubService',
      include: '**/*.js',
    });
    assertSuccess(res, 'find-include-js');
    for (const m of res.result.matches) {
      assertTrue(!m.filePath.endsWith('.ts'), `ts file must not appear: ${m.filePath}`);
    }
  });

  await test('exclude: glob 제외 적용 → 제외 경로 매치 수 감소', async () => {
    // stub.ts만 있으므로 해당 파일을 exclude → 0건
    const resAll  = await req('/app/vscode/edit/find', {
      pattern: 'IStubService',
      include: 'test/src/**/*.ts',
    });
    const resExcl = await req('/app/vscode/edit/find', {
      pattern: 'IStubService',
      include: 'test/src/**/*.ts',
      exclude: 'test/src/stub.ts',
    });
    assertSuccess(resAll,  'find-exclude-all');
    assertSuccess(resExcl, 'find-exclude-excl');
    assertTrue(typeof resAll.result.totalCount  === 'number', 'totalCount must be number');
    assertTrue(typeof resExcl.result.totalCount === 'number', 'totalCount must be number');
    if (resAll.result.totalCount > 0) {
      assertTrue(
        resExcl.result.totalCount < resAll.result.totalCount,
        `exclude should reduce results (${resExcl.result.totalCount} < ${resAll.result.totalCount})`,
      );
    }
    for (const m of resExcl.result.matches) {
      assertTrue(
        !m.filePath.replace(/\\/g, '/').endsWith('test/src/stub.ts'),
        `excluded path still appears: ${m.filePath}`,
      );
    }
  });

  await test('isRegex: true → 정규식 패턴 검색', async () => {
    // test/src/stub.ts에 "class StubServiceError"와 "class StubServiceImpl" 존재
    const res = await req('/app/vscode/edit/find', {
      pattern: 'class\\s+Stub\\w+',
      isRegex: true,
      include: 'test/src/**/*.ts',
    });
    assertSuccess(res, 'find-regex');
    assertTrue(Array.isArray(res.result.matches), 'matches must be array');
    for (const m of res.result.matches) {
      assertTrue(/class\s+Stub\w+/.test(m.lineText), `lineText must match regex: ${m.lineText}`);
    }
  });

  await test('isRegex: false (기본값) → 특수문자 리터럴 처리', async () => {
    // "interface(" 리터럴은 stub.ts에 존재하지 않음
    const res = await req('/app/vscode/edit/find', {
      pattern: 'interface(',
      isRegex: false,
      include: 'test/src/**/*.ts',
    });
    assertSuccess(res, 'find-regex-false');
    assertTrue(res.result.totalCount === 0, 'literal "interface(" should not match anything in test/src/');
  });

  await test('isCaseSensitive: false (기본값) → 대소문자 무시', async () => {
    const upper = await req('/app/vscode/edit/find', { pattern: 'ISTUBSERVICE', isCaseSensitive: false, include: 'test/src/**/*.ts' });
    const lower = await req('/app/vscode/edit/find', { pattern: 'istubservice', isCaseSensitive: false, include: 'test/src/**/*.ts' });
    assertSuccess(upper, 'find-ci-upper');
    assertSuccess(lower, 'find-ci-lower');
    assertTrue(
      upper.result.totalCount === lower.result.totalCount,
      `upper(${upper.result.totalCount}) vs lower(${lower.result.totalCount}) must be equal`,
    );
  });

  await test('isCaseSensitive: true → 대소문자 일치해야 매치', async () => {
    const exact = await req('/app/vscode/edit/find', { pattern: 'IStubService', isCaseSensitive: true, include: 'test/src/**/*.ts' });
    const wrong = await req('/app/vscode/edit/find', { pattern: 'ISTUBSERVICE', isCaseSensitive: true, include: 'test/src/**/*.ts' });
    assertSuccess(exact, 'find-cs-exact');
    assertSuccess(wrong, 'find-cs-wrong');
    assertTrue(
      exact.result.totalCount >= wrong.result.totalCount,
      `exact case(${exact.result.totalCount}) must be >= wrong case(${wrong.result.totalCount})`,
    );
    assertTrue(wrong.result.totalCount === 0, '"ISTUBSERVICE" (wrong case) must not be found');
  });

  await test('pattern 누락 → INVALID_REQUEST', async () => {
    const res = await req('/app/vscode/edit/find', { include: 'test/src/**/*.ts' });
    assertError(res, 'INVALID_REQUEST', 'find-no-pattern');
  });

  await test('매치 없는 pattern → 빈 배열 + totalCount: 0 반환', async () => {
    const res = await req('/app/vscode/edit/find', { pattern: 'xXx_NONEXISTENT_xXx', include: 'test/src/**/*.ts' });
    assertSuccess(res, 'find-no-match');
    assertTrue(res.result.totalCount === 0,     'totalCount must be 0');
    assertTrue(res.result.matches.length === 0, 'matches must be empty array');
  });

  await test('isRegex: true, 잘못된 정규식 → HANDLER_ERROR', async () => {
    const res = await req('/app/vscode/edit/find', {
      pattern: '[unclosed(regex',
      isRegex: true,
    });
    assertError(res, 'HANDLER_ERROR', 'find-bad-regex');
  });

  // ════════════════════════════════════════════════════════════════════════════
  //  /app/vscode/edit/replace
  //  주의: 파일 수정을 방지하기 위해 프로젝트에 존재하지 않는 패턴을 사용한다.
  // ════════════════════════════════════════════════════════════════════════════
  section('/app/vscode/edit/replace');

  const SAFE_PAT = 'xXx_NONEXISTENT_PATTERN_xXx';
  const SAFE_REP = 'replacement_value';
  const SAFE_INC = 'test/src/**/*.ts';

  await test('pattern + replacement(필수): 응답 구조 검증 → replacedCount/affectedFiles 반환', async () => {
    const res = await req('/app/vscode/edit/replace', { pattern: SAFE_PAT, replacement: SAFE_REP, include: SAFE_INC });
    assertSuccess(res, 'replace-basic');
    assertHas(res.result, 'replacedCount', 'affectedFiles');
    assertTrue(typeof res.result.replacedCount === 'number', 'replacedCount must be number');
    assertTrue(Array.isArray(res.result.affectedFiles),      'affectedFiles must be array');
    assertTrue(res.result.replacedCount === 0,               'non-existent pattern: replacedCount must be 0');
    assertTrue(res.result.affectedFiles.length === 0,        'non-existent pattern: affectedFiles must be empty');
  });

  await test('include: 대상 파일 glob 지정 → 성공 응답', async () => {
    const res = await req('/app/vscode/edit/replace', {
      pattern: SAFE_PAT, replacement: SAFE_REP, include: SAFE_INC,
    });
    assertSuccess(res, 'replace-include');
    assertHas(res.result, 'replacedCount', 'affectedFiles');
  });

  await test('exclude: 제외 파일 glob 지정 → 성공 응답', async () => {
    const res = await req('/app/vscode/edit/replace', {
      pattern: SAFE_PAT, replacement: SAFE_REP, include: SAFE_INC, exclude: '**/node_modules/**',
    });
    assertSuccess(res, 'replace-exclude');
    assertHas(res.result, 'replacedCount', 'affectedFiles');
  });

  await test('isRegex: true → 정규식 모드 성공 응답', async () => {
    const res = await req('/app/vscode/edit/replace', {
      pattern: 'xXx\\d+NONEXISTENT', replacement: SAFE_REP, isRegex: true, include: SAFE_INC,
    });
    assertSuccess(res, 'replace-regex');
    assertHas(res.result, 'replacedCount', 'affectedFiles');
  });

  await test('isRegex: false (기본값) → 리터럴 모드 성공 응답', async () => {
    const res = await req('/app/vscode/edit/replace', {
      pattern: SAFE_PAT, replacement: SAFE_REP, isRegex: false, include: SAFE_INC,
    });
    assertSuccess(res, 'replace-no-regex');
    assertHas(res.result, 'replacedCount', 'affectedFiles');
  });

  await test('isCaseSensitive: true → 성공 응답', async () => {
    const res = await req('/app/vscode/edit/replace', {
      pattern: SAFE_PAT, replacement: SAFE_REP, isCaseSensitive: true, include: SAFE_INC,
    });
    assertSuccess(res, 'replace-cs');
    assertHas(res.result, 'replacedCount', 'affectedFiles');
  });

  await test('isCaseSensitive: false (기본값) → 성공 응답', async () => {
    const res = await req('/app/vscode/edit/replace', {
      pattern: SAFE_PAT, replacement: SAFE_REP, isCaseSensitive: false, include: SAFE_INC,
    });
    assertSuccess(res, 'replace-ci');
    assertHas(res.result, 'replacedCount', 'affectedFiles');
  });

  await test('pattern 누락 → INVALID_REQUEST', async () => {
    const res = await req('/app/vscode/edit/replace', { replacement: 'bar' });
    assertError(res, 'INVALID_REQUEST', 'replace-no-pattern');
  });

  await test('replacement 누락 → INVALID_REQUEST', async () => {
    const res = await req('/app/vscode/edit/replace', { pattern: 'foo' });
    assertError(res, 'INVALID_REQUEST', 'replace-no-replacement');
  });

  await test('isRegex: true, 잘못된 정규식 → HANDLER_ERROR', async () => {
    const res = await req('/app/vscode/edit/replace', {
      pattern: '[unclosed(regex', replacement: 'x', isRegex: true,
    });
    assertError(res, 'HANDLER_ERROR', 'replace-bad-regex');
  });

  // ════════════════════════════════════════════════════════════════════════════
  //  /app/vscode/nav/definition
  //  test/src/stub.ts 심볼 위치 (0-indexed):
  //    Line  2, char 17 → IStubService 선언
  //    Line  7, char 13 → StubServiceError 선언
  //    Line 11, char 13 → StubServiceImpl 선언
  // ════════════════════════════════════════════════════════════════════════════
  section('/app/vscode/nav/definition');

  await test('filePath + line + character: IStubService 정의 검색 → stub.ts 반환', async () => {
    // stub.ts line 2 (0-indexed): export interface IStubService {
    //                                              ^ char 17
    const res = await req('/app/vscode/nav/definition', {
      filePath:  SRC.stub,
      line:      2,
      character: 17,
    });
    assertSuccess(res, 'def-IStubService');
    assertHas(res.result, 'locations');
    assertTrue(Array.isArray(res.result.locations), 'locations must be array');
    assertTrue(res.result.locations.length > 0,     'IStubService definition must be found');
    const loc = res.result.locations.find(
      (l) => l.filePath.replace(/\\/g, '/').includes('/test/src/stub'),
    );
    assertTrue(
      loc !== undefined,
      `definition should be in stub.ts, got: ${res.result.locations.map((l) => l.filePath).join(', ')}`,
    );
    assertHas(loc, 'filePath', 'line', 'character', 'endLine', 'endCharacter', 'code');
    assertTrue(typeof loc.line === 'number',         'loc.line must be number');
    assertTrue(typeof loc.character === 'number',    'loc.character must be number');
    assertTrue(typeof loc.endLine === 'number',      'loc.endLine must be number');
    assertTrue(typeof loc.endCharacter === 'number', 'loc.endCharacter must be number');
    assertTrue(typeof loc.code === 'string' && loc.code.length > 0, 'code must be non-empty');
    assertTrue(loc.code.includes('IStubService'), 'code must contain IStubService declaration');
  });

  await test('StubServiceImpl 정의 검색 → stub.ts 반환 + 코드 포함', async () => {
    // stub.ts line 11 (0-indexed): export class StubServiceImpl implements IStubService {
    //                                            ^ char 13
    const res = await req('/app/vscode/nav/definition', {
      filePath:  SRC.stub,
      line:      11,
      character: 13,
    });
    assertSuccess(res, 'def-StubServiceImpl');
    assertTrue(res.result.locations.length > 0, 'StubServiceImpl definition must be found');
    const loc = res.result.locations.find(
      (l) => l.filePath.replace(/\\/g, '/').includes('/test/src/stub'),
    );
    assertTrue(
      loc !== undefined,
      `definition must be in stub.ts, got: ${res.result.locations.map((l) => l.filePath).join(', ')}`,
    );
    assertTrue(loc.code.includes('StubServiceImpl'), 'code must contain class StubServiceImpl');
    assertTrue(loc.endLine >= loc.line, 'endLine must be >= line (multi-line definition)');
  });

  await test('code 필드: 멀티 라인 클래스 → endLine >= line 항상 성립', async () => {
    // stub.ts line 7 (0-indexed): export class StubServiceError {
    //                                           ^ char 13
    const res = await req('/app/vscode/nav/definition', {
      filePath:  SRC.stub,
      line:      7,
      character: 13,
    });
    assertSuccess(res, 'def-multiline');
    for (const loc of res.result.locations) {
      assertTrue(loc.endLine >= loc.line, `endLine(${loc.endLine}) must be >= line(${loc.line})`);
    }
  });

  await test('filePath 누락 → INVALID_REQUEST', async () => {
    const res = await req('/app/vscode/nav/definition', { line: 0, character: 0 });
    assertError(res, 'INVALID_REQUEST', 'def-no-filePath');
  });

  await test('line 누락 → INVALID_REQUEST', async () => {
    const res = await req('/app/vscode/nav/definition', { filePath: SRC.stub, character: 0 });
    assertError(res, 'INVALID_REQUEST', 'def-no-line');
  });

  await test('character 누락 → INVALID_REQUEST', async () => {
    const res = await req('/app/vscode/nav/definition', { filePath: SRC.stub, line: 0 });
    assertError(res, 'INVALID_REQUEST', 'def-no-character');
  });

  await test('line 이 string 타입 → INVALID_REQUEST (number 만 허용)', async () => {
    const res = await req('/app/vscode/nav/definition', {
      filePath: SRC.stub, line: '1', character: 0,
    });
    assertError(res, 'INVALID_REQUEST', 'def-line-wrong-type');
  });

  await test('character 가 string 타입 → INVALID_REQUEST (number 만 허용)', async () => {
    const res = await req('/app/vscode/nav/definition', {
      filePath: SRC.stub, line: 0, character: '0',
    });
    assertError(res, 'INVALID_REQUEST', 'def-character-wrong-type');
  });

  await test('주석 위치 (심볼 없음) → 빈 locations 배열 반환', async () => {
    // stub.ts line 0: "// ─── Stub types ..."  — 심볼 없음
    const res = await req('/app/vscode/nav/definition', {
      filePath:  SRC.stub,
      line:      0,
      character: 5,
    });
    assertSuccess(res, 'def-comment');
    assertTrue(Array.isArray(res.result.locations), 'locations must be array');
    assertTrue(res.result.locations.length === 0, 'comment position must return no locations');
  });

  // ════════════════════════════════════════════════════════════════════════════
  //  /app/vscode/nav/references
  //  IStubService 선언 위치 (stub.ts):
  //    Line 2, char 17: 선언
  //    Line 11, char 40: implements IStubService
  //    Line 21, char 37: ): IStubService 반환타입
  // ════════════════════════════════════════════════════════════════════════════
  section('/app/vscode/nav/references');

  const STUB_FILE = SRC.stub;
  const STUB_LINE = 2;   // IStubService 선언 라인
  const STUB_CHAR = 17;  // IStubService 선언 컬럼

  await test('filePath + line + character: IStubService 참조 검색 → locations/totalCount 반환', async () => {
    const res = await req('/app/vscode/nav/references', {
      filePath: STUB_FILE, line: STUB_LINE, character: STUB_CHAR,
    });
    assertSuccess(res, 'refs-basic');
    assertHas(res.result, 'locations', 'totalCount');
    assertTrue(Array.isArray(res.result.locations),         'locations must be array');
    assertTrue(typeof res.result.totalCount === 'number',   'totalCount must be number');
    assertTrue(res.result.totalCount > 0,                   'IStubService must have references');
    const loc = res.result.locations[0];
    assertHas(loc, 'filePath', 'line', 'character', 'endLine', 'endCharacter');
    assertTrue(typeof loc.line === 'number',         'loc.line must be number');
    assertTrue(typeof loc.character === 'number',    'loc.character must be number');
    assertTrue(typeof loc.endLine === 'number',      'loc.endLine must be number');
    assertTrue(typeof loc.endCharacter === 'number', 'loc.endCharacter must be number');
    assertTrue(loc.endLine >= loc.line,              'endLine must be >= line');
  });

  await test('includeDeclaration: true → 선언부 포함', async () => {
    const res = await req('/app/vscode/nav/references', {
      filePath: STUB_FILE, line: STUB_LINE, character: STUB_CHAR, includeDeclaration: true,
    });
    assertSuccess(res, 'refs-with-decl');
    assertTrue(res.result.totalCount > 0, 'should find references with declaration');
    // 선언이 포함됐는지: stub.ts STUB_LINE 위치가 결과에 있어야 함
    const hasDecl = res.result.locations.some(
      (loc) => loc.filePath.replace(/\\/g, '/').includes('/test/src/stub') && loc.line === STUB_LINE,
    );
    assertTrue(hasDecl, 'declaration location must be present when includeDeclaration=true');
  });

  await test('includeDeclaration: false → 선언부 제외, 결과 수 ≤ true 케이스', async () => {
    const withDecl    = await req('/app/vscode/nav/references', {
      filePath: STUB_FILE, line: STUB_LINE, character: STUB_CHAR, includeDeclaration: true,
    });
    const withoutDecl = await req('/app/vscode/nav/references', {
      filePath: STUB_FILE, line: STUB_LINE, character: STUB_CHAR, includeDeclaration: false,
    });
    assertSuccess(withDecl,    'refs-decl-with');
    assertSuccess(withoutDecl, 'refs-decl-without');
    assertTrue(
      withoutDecl.result.totalCount <= withDecl.result.totalCount,
      `without(${withoutDecl.result.totalCount}) must be <= with(${withDecl.result.totalCount})`,
    );
    // 선언 위치가 제외됐는지 확인
    const declStillPresent = withoutDecl.result.locations.some(
      (loc) => loc.filePath.replace(/\\/g, '/').includes('/test/src/stub') && loc.line === STUB_LINE,
    );
    assertTrue(!declStillPresent, 'declaration must be absent when includeDeclaration=false');
  });

  await test('includeDeclaration 생략 → true 와 동일한 결과 수', async () => {
    const omitted  = await req('/app/vscode/nav/references', {
      filePath: STUB_FILE, line: STUB_LINE, character: STUB_CHAR,
    });
    const explicit = await req('/app/vscode/nav/references', {
      filePath: STUB_FILE, line: STUB_LINE, character: STUB_CHAR, includeDeclaration: true,
    });
    assertSuccess(omitted,  'refs-omit');
    assertSuccess(explicit, 'refs-explicit');
    assertTrue(
      omitted.result.totalCount === explicit.result.totalCount,
      `omitted(${omitted.result.totalCount}) must equal explicit(${explicit.result.totalCount})`,
    );
  });

  await test('filePath 누락 → INVALID_REQUEST', async () => {
    const res = await req('/app/vscode/nav/references', { line: STUB_LINE, character: STUB_CHAR });
    assertError(res, 'INVALID_REQUEST', 'refs-no-filePath');
  });

  await test('line 누락 → INVALID_REQUEST', async () => {
    const res = await req('/app/vscode/nav/references', { filePath: STUB_FILE, character: STUB_CHAR });
    assertError(res, 'INVALID_REQUEST', 'refs-no-line');
  });

  await test('character 누락 → INVALID_REQUEST', async () => {
    const res = await req('/app/vscode/nav/references', { filePath: STUB_FILE, line: STUB_LINE });
    assertError(res, 'INVALID_REQUEST', 'refs-no-character');
  });

  await test('line 이 string 타입 → INVALID_REQUEST', async () => {
    const res = await req('/app/vscode/nav/references', {
      filePath: STUB_FILE, line: String(STUB_LINE), character: STUB_CHAR,
    });
    assertError(res, 'INVALID_REQUEST', 'refs-line-wrong-type');
  });

  await test('character 가 string 타입 → INVALID_REQUEST', async () => {
    const res = await req('/app/vscode/nav/references', {
      filePath: STUB_FILE, line: STUB_LINE, character: String(STUB_CHAR),
    });
    assertError(res, 'INVALID_REQUEST', 'refs-character-wrong-type');
  });

  // ════════════════════════════════════════════════════════════════════════════
  //  /app/vscode/diag/list
  // ════════════════════════════════════════════════════════════════════════════
  section('/app/vscode/diag/list');

  await test('workspace-wide: diagnostics 배열 + totalCount 반환', async () => {
    const res = await req('/app/vscode/diag/list', {});
    assertSuccess(res, 'diag-workspace');
    assertHas(res.result, 'diagnostics', 'totalCount');
    assertTrue(Array.isArray(res.result.diagnostics),         'diagnostics must be array');
    assertTrue(typeof res.result.totalCount === 'number',     'totalCount must be number');
    assertTrue(res.result.totalCount === res.result.diagnostics.length, 'totalCount must match array length');
  });

  await test('filePath: 특정 파일 진단 결과만 반환', async () => {
    const res = await req('/app/vscode/diag/list', { filePath: SRC.stub });
    assertSuccess(res, 'diag-file');
    assertTrue(Array.isArray(res.result.diagnostics), 'diagnostics must be array');
    const normalizedStub = SRC.stub.replace(/\\/g, '/').toLowerCase();
    for (const d of res.result.diagnostics) {
      assertTrue(
        d.filePath.replace(/\\/g, '/').toLowerCase() === normalizedStub,
        `all diagnostics must be from stub.ts, got: ${d.filePath}`,
      );
    }
  });

  await test('severity: error → error만 반환', async () => {
    const res = await req('/app/vscode/diag/list', { severity: 'error' });
    assertSuccess(res, 'diag-error-only');
    for (const d of res.result.diagnostics) {
      assertTrue(d.severity === 'error', `severity must be 'error', got '${d.severity}'`);
    }
  });

  await test('severity: all (기본값) → 모든 severity 포함', async () => {
    const resAll      = await req('/app/vscode/diag/list', { severity: 'all' });
    const resDefault  = await req('/app/vscode/diag/list', {});
    assertSuccess(resAll,     'diag-all-explicit');
    assertSuccess(resDefault, 'diag-all-default');
    assertTrue(
      resAll.result.totalCount === resDefault.result.totalCount,
      `severity:'all' should equal default (${resAll.result.totalCount} vs ${resDefault.result.totalCount})`,
    );
  });

  await test('diagnostics 구조: 필수 필드 존재 확인', async () => {
    const res = await req('/app/vscode/diag/list', {});
    assertSuccess(res, 'diag-structure');
    if (res.result.diagnostics.length > 0) {
      const d = res.result.diagnostics[0];
      assertHas(d, 'filePath', 'line', 'character', 'severity', 'message');
      assertHas(d, 'endLine', 'endCharacter', 'source', 'code');
      assertTrue(typeof d.line === 'number',      'd.line must be number');
      assertTrue(typeof d.character === 'number', 'd.character must be number');
      assertTrue(typeof d.message === 'string',   'd.message must be string');
    }
  });

  await test('invalid severity → INVALID_REQUEST', async () => {
    const res = await req('/app/vscode/diag/list', { severity: 'critical' });
    assertError(res, 'INVALID_REQUEST', 'diag-invalid-severity');
  });

  await test('non-existent filePath → 빈 배열 반환 (오류 아님)', async () => {
    const res = await req('/app/vscode/diag/list', {
      filePath: '/nonexistent/path/to/file_xXx.ts',
    });
    assertSuccess(res, 'diag-nonexistent-file');
    assertTrue(Array.isArray(res.result.diagnostics),     'diagnostics must be array');
    assertTrue(res.result.diagnostics.length === 0,       'non-existent file must return empty array');
    assertTrue(res.result.totalCount === 0,               'totalCount must be 0');
  });

  // ════════════════════════════════════════════════════════════════════════════
  //  /app/vscode/nav/symbols
  //  test/src/stub.ts 심볼: IStubService, StubServiceError, StubServiceImpl, createStubService
  // ════════════════════════════════════════════════════════════════════════════
  section('/app/vscode/nav/symbols');

  await test('basic: stub.ts symbols → 배열 + totalCount > 0', async () => {
    const res = await req('/app/vscode/nav/symbols', { filePath: SRC.stub });
    assertSuccess(res, 'sym-basic');
    assertHas(res.result, 'symbols', 'totalCount');
    assertTrue(Array.isArray(res.result.symbols),         'symbols must be array');
    assertTrue(typeof res.result.totalCount === 'number', 'totalCount must be number');
    assertTrue(res.result.totalCount > 0,                 'stub.ts must have symbols');
  });

  await test('result includes IStubService', async () => {
    const res = await req('/app/vscode/nav/symbols', { filePath: SRC.stub });
    assertSuccess(res, 'sym-istubservice');
    const found = res.result.symbols.some((s) => s.name === 'IStubService');
    assertTrue(found, 'IStubService symbol must be present in stub.ts');
  });

  await test('symbol 구조: 필수 필드 존재 확인', async () => {
    const res = await req('/app/vscode/nav/symbols', { filePath: SRC.stub });
    assertSuccess(res, 'sym-structure');
    assertTrue(res.result.symbols.length > 0, 'symbols must not be empty');
    const s = res.result.symbols[0];
    assertHas(s, 'name', 'kind', 'line', 'character', 'endLine', 'endCharacter');
    assertHas(s, 'selectionLine', 'selectionCharacter', 'containerName');
    assertTrue(typeof s.name === 'string',          's.name must be string');
    assertTrue(typeof s.kind === 'string',          's.kind must be string');
    assertTrue(typeof s.line === 'number',          's.line must be number');
    assertTrue(typeof s.selectionLine === 'number', 's.selectionLine must be number');
  });

  await test('query filter: StubServiceError 관련 심볼만 반환', async () => {
    const res = await req('/app/vscode/nav/symbols', { filePath: SRC.stub, query: 'Error' });
    assertSuccess(res, 'sym-query');
    assertTrue(res.result.totalCount > 0, 'query "Error" must return results');
    for (const s of res.result.symbols) {
      assertTrue(
        s.name.toLowerCase().includes('error'),
        `all symbols must match query 'Error', got: ${s.name}`,
      );
    }
  });

  await test('query no match → totalCount: 0', async () => {
    const res = await req('/app/vscode/nav/symbols', {
      filePath: SRC.stub,
      query: 'xXx_NONEXISTENT_SYMBOL_xXx',
    });
    assertSuccess(res, 'sym-query-no-match');
    assertTrue(res.result.totalCount === 0,         'no match query must return 0');
    assertTrue(res.result.symbols.length === 0,     'symbols must be empty array');
  });

  await test('filePath 누락 → INVALID_REQUEST', async () => {
    const res = await req('/app/vscode/nav/symbols', {});
    assertError(res, 'INVALID_REQUEST', 'sym-no-filePath');
  });

  await test('non-string filePath → INVALID_REQUEST', async () => {
    const res = await req('/app/vscode/nav/symbols', { filePath: 123 });
    assertError(res, 'INVALID_REQUEST', 'sym-wrong-type-filePath');
  });

  await test('non-existent file → 빈 symbols 배열 반환 (오류 아님)', async () => {
    const res = await req('/app/vscode/nav/symbols', {
      filePath: '/nonexistent/path/to/file_xXx.ts',
    });
    assertSuccess(res, 'sym-nonexistent-file');
    assertTrue(Array.isArray(res.result.symbols),   'symbols must be array');
    assertTrue(res.result.symbols.length === 0,     'non-existent file must return empty array');
    assertTrue(res.result.totalCount === 0,         'totalCount must be 0');
  });

  // ════════════════════════════════════════════════════════════════════════════
  //  프로토콜 에러 처리
  // ════════════════════════════════════════════════════════════════════════════
  section('Protocol — 에러 처리');

  await test('미등록 topic → UNKNOWN_TOPIC', async () => {
    const res = await req('/app/vscode/unknown/topic', {});
    assertError(res, 'UNKNOWN_TOPIC', 'err-unknown-topic');
  });

  await test('topic 필드 없음 (requestId 있음) → INVALID_REQUEST', async () => {
    const res = await rawReq({ requestId: randomUUID(), params: {} });
    assertError(res, 'INVALID_REQUEST', 'err-no-topic');
  });

  await test('requestId 필드 없음 (topic 있음) → INVALID_REQUEST', async () => {
    const res = await rawReq({ topic: '/app/vscode/edit/find', params: {} });
    assertError(res, 'INVALID_REQUEST', 'err-no-requestId');
  });

  await test('topic + requestId 모두 없음 → INVALID_REQUEST', async () => {
    const res = await rawReq({ params: { pattern: 'test' } });
    assertError(res, 'INVALID_REQUEST', 'err-no-topic-no-requestId');
  });

  // ─── Summary ────────────────────────────────────────────────────────────────

  ws.close();

  const total  = results.length;
  const passed = results.filter(r => r.pass).length;
  const failed = total - passed;

  console.log(`\n\x1b[1m${'═'.repeat(64)}\x1b[0m`);
  if (failed === 0) {
    console.log(`\x1b[1m\x1b[32m  All ${total} tests passed\x1b[0m`);
  } else {
    console.log(`\x1b[1m  ${passed}/${total} passed  \x1b[31m(${failed} failed)\x1b[0m`);
    console.log('\n  Failed:');
    for (const r of results.filter(r => !r.pass)) {
      console.log(`  \x1b[31m✗\x1b[0m  ${r.name}`);
      console.log(`       \x1b[90m${r.error}\x1b[0m`);
    }
  }
  console.log(`\x1b[1m${'═'.repeat(64)}\x1b[0m\n`);

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('[suite] Unexpected error:', err);
  process.exit(1);
});
