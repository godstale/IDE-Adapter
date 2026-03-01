#!/usr/bin/env node
/**
 * IDEA Adapter — Full Protocol Test Suite
 *
 * Usage:
 *   node test/suite.js [port]       (default: 7200)
 *
 * 4개 토픽 전체 + 파라미터별 세부 케이스 + 프로토콜 에러 처리 테스트.
 *
 * Prerequisite:
 *   - VS Code에서 F5 로 Extension Development Host 실행
 *   - 워크스페이스 = IDEA Adapter 프로젝트 루트 (cwd)
 */
'use strict';

const WebSocket = require('ws');
const { randomUUID } = require('crypto');
const path = require('path');

// ─── Configuration ─────────────────────────────────────────────────────────────

const PORT      = parseInt(process.argv[2] ?? '7200', 10);
const WORKSPACE = process.cwd(); // navigation 테스트용 파일 경로 구성에만 사용

// Navigation 테스트에 사용할 소스 파일 (워크스페이스 내 고정 경로)
const SRC = {
  // FindHandler.ts
  //   line 1 (0-indexed): import { IHandler, HandlerError } from '../protocol/types.js';
  //                                  ^ char 9  → IHandler 심볼
  findHandler: path.join(WORKSPACE, 'src', 'handlers', 'FindHandler.ts'),

  // extension.ts
  //   line 5 (0-indexed): import { FindHandler } from './handlers/FindHandler.js';
  //                                  ^ char 9  → FindHandler 심볼
  extension: path.join(WORKSPACE, 'src', 'extension.ts'),

  // types.ts
  //   line  0 (0-indexed): // ─── Handshake ─── (주석, 정의 없음)
  //   line 44 (0-indexed): export interface IHandler {
  //                                          ^ char 17 → IHandler 선언
  types: path.join(WORKSPACE, 'src', 'protocol', 'types.ts'),
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
  const hsPromise = new Promise((resolve) => {
    ws.on('message', (raw) => {
      const msg = JSON.parse(raw.toString());

      if (msg.type === 'handshake') {
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

  ws.send(JSON.stringify({ type: 'handshake' }));
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
    console.log(`\n[suite] Connecting to ws://localhost:${PORT} ...`);
    hs = await connectAndHandshake();
    console.log(`[suite] Handshake OK  version=${hs.version}`);
    console.log(`[suite] Capabilities: ${hs.capabilities.join(', ') || '(none)'}`);
    console.log(`[suite] Workspaces:   ${hs.workspaces?.join(', ') || '(none)'}`);
    if (!hs.workspaces || hs.workspaces.length === 0) {
      console.warn('\x1b[33m[suite] WARNING: 워크스페이스가 설정되지 않았습니다.\x1b[0m');
      console.warn('        launch.json 의 "Run Extension" 설정으로 실행하거나');
      console.warn('        args 에 "${workspaceFolder}" 를 추가하세요.');
      console.warn('        → Find 테스트 5개가 실패할 수 있습니다.\n');
    }
    console.log('[suite] Running tests...');
  } catch (err) {
    console.error(`\n[suite] Connection failed: ${err.message}`);
    console.error('        Extension Development Host 가 실행 중인지 확인하세요 (F5).');
    process.exit(1);
  }

  // ════════════════════════════════════════════════════════════════════════════
  //  /app/vscode/edit/find
  // ════════════════════════════════════════════════════════════════════════════
  section('/app/vscode/edit/find');

  await test('pattern(필수): 기본 리터럴 검색 → matches/totalCount 반환', async () => {
    const res = await req('/app/vscode/edit/find', { pattern: 'IHandler' });
    assertSuccess(res, 'find-basic');
    assertHas(res.result, 'matches', 'totalCount');
    assertTrue(Array.isArray(res.result.matches),         'matches must be array');
    assertTrue(typeof res.result.totalCount === 'number', 'totalCount must be number');
    assertTrue(res.result.totalCount === res.result.matches.length, 'totalCount must match matches.length');
    // match 항목 형태 검증 (결과가 있을 때만)
    if (res.result.matches.length > 0) {
      const m = res.result.matches[0];
      assertHas(m, 'filePath', 'line', 'character', 'lineText');
      assertTrue(typeof m.line === 'number',      'match.line must be number');
      assertTrue(typeof m.character === 'number', 'match.character must be number');
      assertTrue(m.lineText.toLowerCase().includes('ihandler'), 'lineText must contain match');
    }
  });

  await test('include: 특정 glob 패턴 파일만 검색 → 결과가 해당 파일 타입만 포함', async () => {
    const res = await req('/app/vscode/edit/find', {
      pattern: 'import',
      include: '**/*.ts',
    });
    assertSuccess(res, 'find-include');
    assertTrue(Array.isArray(res.result.matches), 'matches must be array');
    assertTrue(typeof res.result.totalCount === 'number', 'totalCount must be number');
    // 결과가 있으면 .ts 파일만 포함되는지 검증
    for (const m of res.result.matches) {
      assertTrue(m.filePath.endsWith('.ts'), `all matches must be .ts: got ${m.filePath}`);
    }
  });

  await test('include: *.js 지정 → .ts 파일은 포함되지 않음', async () => {
    const res = await req('/app/vscode/edit/find', {
      pattern: 'import',
      include: '**/*.js',
    });
    assertSuccess(res, 'find-include-js');
    for (const m of res.result.matches) {
      assertTrue(!m.filePath.endsWith('.ts'), `ts file must not appear: ${m.filePath}`);
    }
  });

  await test('exclude: glob 제외 적용 → 제외 경로 매치 수 감소', async () => {
    const resAll  = await req('/app/vscode/edit/find', { pattern: 'export' });
    const resExcl = await req('/app/vscode/edit/find', {
      pattern: 'export',
      exclude: '**/protocol/**',
    });
    assertSuccess(resAll,  'find-exclude-all');
    assertSuccess(resExcl, 'find-exclude-excl');
    assertTrue(typeof resAll.result.totalCount  === 'number', 'totalCount must be number');
    assertTrue(typeof resExcl.result.totalCount === 'number', 'totalCount must be number');
    // 결과가 있을 때만 exclude 효과 검증
    if (resAll.result.totalCount > 0) {
      assertTrue(
        resExcl.result.totalCount < resAll.result.totalCount,
        `exclude should reduce results (${resExcl.result.totalCount} < ${resAll.result.totalCount})`,
      );
    }
    for (const m of resExcl.result.matches) {
      assertTrue(
        !m.filePath.replace(/\\/g, '/').includes('/protocol/'),
        `excluded path still appears: ${m.filePath}`,
      );
    }
  });

  await test('isRegex: true → 정규식 패턴 검색', async () => {
    const res = await req('/app/vscode/edit/find', {
      pattern: 'class\\s+\\w+Handler',
      isRegex: true,
    });
    assertSuccess(res, 'find-regex');
    assertTrue(Array.isArray(res.result.matches), 'matches must be array');
    assertTrue(typeof res.result.totalCount === 'number', 'totalCount must be number');
    // 결과가 있으면 각 매치가 정규식에 맞는지 검증
    for (const m of res.result.matches) {
      assertTrue(/class\s+\w+Handler/.test(m.lineText), `lineText must match regex: ${m.lineText}`);
    }
  });

  await test('isRegex: false (기본값) → 특수문자 리터럴 처리', async () => {
    // "class(" 는 리터럴로 취급 → src/ 소스 파일에는 매치 없어야 함
    // (test/ 파일은 제외: suite.js 자체에 이 패턴이 문자열로 존재)
    const res = await req('/app/vscode/edit/find', {
      pattern: 'class(',
      isRegex: false,
      include: 'src/**/*.ts',
    });
    assertSuccess(res, 'find-regex-false');
    assertTrue(res.result.totalCount === 0, 'literal "class(" should not match anything in src/');
  });

  await test('isCaseSensitive: false (기본값) → 대소문자 무시', async () => {
    const upper = await req('/app/vscode/edit/find', { pattern: 'IDEASERVER', isCaseSensitive: false });
    const lower = await req('/app/vscode/edit/find', { pattern: 'ideaserver', isCaseSensitive: false });
    assertSuccess(upper, 'find-ci-upper');
    assertSuccess(lower, 'find-ci-lower');
    assertTrue(
      upper.result.totalCount === lower.result.totalCount,
      `upper(${upper.result.totalCount}) vs lower(${lower.result.totalCount}) must be equal`,
    );
  });

  await test('isCaseSensitive: true → 대소문자 일치해야 매치', async () => {
    // src/ 내에서만 검색: test/ 파일(suite.js, TEST_RESULT.txt)에는 'IDEASERVER' 문자열이 존재함
    const exact = await req('/app/vscode/edit/find', { pattern: 'IdeaServer', isCaseSensitive: true, include: 'src/**/*.ts' });
    const wrong = await req('/app/vscode/edit/find', { pattern: 'IDEASERVER', isCaseSensitive: true, include: 'src/**/*.ts' });
    assertSuccess(exact, 'find-cs-exact');
    assertSuccess(wrong, 'find-cs-wrong');
    // 정확한 케이스는 잘못된 케이스보다 같거나 많이 매치돼야 함
    assertTrue(
      exact.result.totalCount >= wrong.result.totalCount,
      `exact case(${exact.result.totalCount}) must be >= wrong case(${wrong.result.totalCount})`,
    );
    assertTrue(wrong.result.totalCount === 0, '"IDEASERVER" (wrong case) must not be found');
  });

  await test('pattern 누락 → INVALID_REQUEST', async () => {
    const res = await req('/app/vscode/edit/find', { include: '**/*.ts' });
    assertError(res, 'INVALID_REQUEST', 'find-no-pattern');
  });

  await test('매치 없는 pattern → 빈 배열 + totalCount: 0 반환', async () => {
    // src/ 내에서만 검색: 패턴 문자열 자체가 test/suite.js 코드에 포함되어 있으므로 제외
    const res = await req('/app/vscode/edit/find', { pattern: 'xXx_NONEXISTENT_xXx', include: 'src/**/*.ts' });
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
  //  실제 교체 동작은 Extension Development Host 에서 수동 검증할 것.
  // ════════════════════════════════════════════════════════════════════════════
  section('/app/vscode/edit/replace');

  // src/**/*.ts 범위 내에서 존재하지 않는 안전한 패턴 — 파일이 실제로 수정되지 않음
  // 주의: 아래 상수 자체가 이 파일(suite.js)에 존재하므로 include로 src/만 지정해야 함
  const SAFE_PAT = 'xXx_NONEXISTENT_PATTERN_xXx';
  const SAFE_REP = 'replacement_value';
  const SAFE_INC = 'src/**/*.ts';

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
  // ════════════════════════════════════════════════════════════════════════════
  section('/app/vscode/nav/definition');

  await test('filePath + line + character: IHandler 정의 검색 → types.ts 반환', async () => {
    // types.ts line 44 (0-indexed): export interface IHandler {
    //                                                ^ char 17  → IHandler 선언 심볼
    const res = await req('/app/vscode/nav/definition', {
      filePath:  SRC.types,
      line:      44,
      character: 17,
    });
    assertSuccess(res, 'def-IHandler');
    assertHas(res.result, 'locations');
    assertTrue(Array.isArray(res.result.locations), 'locations must be array');
    assertTrue(res.result.locations.length > 0,     'IHandler definition must be found');
    const loc = res.result.locations.find(
      (l) => l.filePath.replace(/\\/g, '/').includes('/protocol/types'),
    );
    assertTrue(
      loc !== undefined,
      `definition should be in types.ts, got: ${res.result.locations.map((l) => l.filePath).join(', ')}`,
    );
    assertHas(loc, 'filePath', 'line', 'character', 'endLine', 'endCharacter', 'code');
    assertTrue(typeof loc.line === 'number',         'loc.line must be number');
    assertTrue(typeof loc.character === 'number',    'loc.character must be number');
    assertTrue(typeof loc.endLine === 'number',      'loc.endLine must be number');
    assertTrue(typeof loc.endCharacter === 'number', 'loc.endCharacter must be number');
    assertTrue(typeof loc.code === 'string' && loc.code.length > 0, 'code must be non-empty');
    assertTrue(loc.code.includes('IHandler'), 'code must contain IHandler declaration');
  });

  await test('FindHandler 정의 검색 → FindHandler.ts 반환 + 코드 포함', async () => {
    // FindHandler.ts line 10 (0-indexed): export class FindHandler implements IHandler {
    //                                                   ^ char 13  → FindHandler 클래스 선언
    const res = await req('/app/vscode/nav/definition', {
      filePath:  SRC.findHandler,
      line:      10,
      character: 13,
    });
    assertSuccess(res, 'def-FindHandler');
    assertTrue(res.result.locations.length > 0, 'FindHandler definition must be found');
    const loc = res.result.locations.find(
      (l) => l.filePath.replace(/\\/g, '/').includes('/FindHandler'),
    );
    assertTrue(
      loc !== undefined,
      `definition must be in FindHandler.ts, got: ${res.result.locations.map((l) => l.filePath).join(', ')}`,
    );
    assertTrue(loc.code.includes('FindHandler'), 'code must contain class FindHandler');
    assertTrue(loc.endLine >= loc.line, 'endLine must be >= line (multi-line definition)');
  });

  await test('code 필드: 단일 라인 vs 멀티 라인 → endLine >= line 항상 성립', async () => {
    const res = await req('/app/vscode/nav/definition', {
      filePath:  SRC.findHandler,
      line:      1,
      character: 9,
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
    const res = await req('/app/vscode/nav/definition', { filePath: SRC.types, character: 0 });
    assertError(res, 'INVALID_REQUEST', 'def-no-line');
  });

  await test('character 누락 → INVALID_REQUEST', async () => {
    const res = await req('/app/vscode/nav/definition', { filePath: SRC.types, line: 0 });
    assertError(res, 'INVALID_REQUEST', 'def-no-character');
  });

  await test('line 이 string 타입 → INVALID_REQUEST (number 만 허용)', async () => {
    const res = await req('/app/vscode/nav/definition', {
      filePath: SRC.types, line: '1', character: 0,
    });
    assertError(res, 'INVALID_REQUEST', 'def-line-wrong-type');
  });

  await test('character 가 string 타입 → INVALID_REQUEST (number 만 허용)', async () => {
    const res = await req('/app/vscode/nav/definition', {
      filePath: SRC.types, line: 0, character: '0',
    });
    assertError(res, 'INVALID_REQUEST', 'def-character-wrong-type');
  });

  await test('주석 위치 (심볼 없음) → 빈 locations 배열 반환', async () => {
    // types.ts line 0: "// ─── Handshake ───"  — 심볼 없음
    const res = await req('/app/vscode/nav/definition', {
      filePath:  SRC.types,
      line:      0,
      character: 5,
    });
    assertSuccess(res, 'def-comment');
    assertTrue(Array.isArray(res.result.locations), 'locations must be array');
    assertTrue(res.result.locations.length === 0, 'comment position must return no locations');
  });

  // ════════════════════════════════════════════════════════════════════════════
  //  /app/vscode/nav/references
  // ════════════════════════════════════════════════════════════════════════════
  section('/app/vscode/nav/references');

  // types.ts line 44 (0-indexed): "export interface IHandler {"
  //                                                  ^ char 17
  const IH_FILE = SRC.types;
  const IH_LINE = 44;
  const IH_CHAR = 17;

  await test('filePath + line + character: IHandler 참조 검색 → locations/totalCount 반환', async () => {
    const res = await req('/app/vscode/nav/references', {
      filePath: IH_FILE, line: IH_LINE, character: IH_CHAR,
    });
    assertSuccess(res, 'refs-basic');
    assertHas(res.result, 'locations', 'totalCount');
    assertTrue(Array.isArray(res.result.locations),         'locations must be array');
    assertTrue(typeof res.result.totalCount === 'number',   'totalCount must be number');
    assertTrue(res.result.totalCount > 0,                   'IHandler must have references');
    // location 항목 형태 검증
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
      filePath: IH_FILE, line: IH_LINE, character: IH_CHAR, includeDeclaration: true,
    });
    assertSuccess(res, 'refs-with-decl');
    assertTrue(res.result.totalCount > 0, 'should find references with declaration');
    // 선언이 포함됐는지: types.ts IH_LINE 행 위치가 결과에 있어야 함
    const hasDecl = res.result.locations.some(
      (loc) => loc.filePath.replace(/\\/g, '/').includes('/protocol/types') && loc.line === IH_LINE,
    );
    assertTrue(hasDecl, 'declaration location must be present when includeDeclaration=true');
  });

  await test('includeDeclaration: false → 선언부 제외, 결과 수 ≤ true 케이스', async () => {
    const withDecl    = await req('/app/vscode/nav/references', {
      filePath: IH_FILE, line: IH_LINE, character: IH_CHAR, includeDeclaration: true,
    });
    const withoutDecl = await req('/app/vscode/nav/references', {
      filePath: IH_FILE, line: IH_LINE, character: IH_CHAR, includeDeclaration: false,
    });
    assertSuccess(withDecl,    'refs-decl-with');
    assertSuccess(withoutDecl, 'refs-decl-without');
    assertTrue(
      withoutDecl.result.totalCount <= withDecl.result.totalCount,
      `without(${withoutDecl.result.totalCount}) must be <= with(${withDecl.result.totalCount})`,
    );
    // 선언 위치가 제외됐는지 확인
    const declStillPresent = withoutDecl.result.locations.some(
      (loc) => loc.filePath.replace(/\\/g, '/').includes('/protocol/types') && loc.line === IH_LINE,
    );
    assertTrue(!declStillPresent, 'declaration must be absent when includeDeclaration=false');
  });

  await test('includeDeclaration 생략 → true 와 동일한 결과 수', async () => {
    const omitted  = await req('/app/vscode/nav/references', {
      filePath: IH_FILE, line: IH_LINE, character: IH_CHAR,
    });
    const explicit = await req('/app/vscode/nav/references', {
      filePath: IH_FILE, line: IH_LINE, character: IH_CHAR, includeDeclaration: true,
    });
    assertSuccess(omitted,  'refs-omit');
    assertSuccess(explicit, 'refs-explicit');
    assertTrue(
      omitted.result.totalCount === explicit.result.totalCount,
      `omitted(${omitted.result.totalCount}) must equal explicit(${explicit.result.totalCount})`,
    );
  });

  await test('filePath 누락 → INVALID_REQUEST', async () => {
    const res = await req('/app/vscode/nav/references', { line: IH_LINE, character: IH_CHAR });
    assertError(res, 'INVALID_REQUEST', 'refs-no-filePath');
  });

  await test('line 누락 → INVALID_REQUEST', async () => {
    const res = await req('/app/vscode/nav/references', { filePath: IH_FILE, character: IH_CHAR });
    assertError(res, 'INVALID_REQUEST', 'refs-no-line');
  });

  await test('character 누락 → INVALID_REQUEST', async () => {
    const res = await req('/app/vscode/nav/references', { filePath: IH_FILE, line: IH_LINE });
    assertError(res, 'INVALID_REQUEST', 'refs-no-character');
  });

  await test('line 이 string 타입 → INVALID_REQUEST', async () => {
    const res = await req('/app/vscode/nav/references', {
      filePath: IH_FILE, line: String(IH_LINE), character: IH_CHAR,
    });
    assertError(res, 'INVALID_REQUEST', 'refs-line-wrong-type');
  });

  await test('character 가 string 타입 → INVALID_REQUEST', async () => {
    const res = await req('/app/vscode/nav/references', {
      filePath: IH_FILE, line: IH_LINE, character: String(IH_CHAR),
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
    const res = await req('/app/vscode/diag/list', { filePath: SRC.types });
    assertSuccess(res, 'diag-file');
    assertTrue(Array.isArray(res.result.diagnostics), 'diagnostics must be array');
    // 결과가 있으면 해당 파일만 포함되는지 확인
    const normalizedTypes = SRC.types.replace(/\\/g, '/').toLowerCase();
    for (const d of res.result.diagnostics) {
      assertTrue(
        d.filePath.replace(/\\/g, '/').toLowerCase() === normalizedTypes,
        `all diagnostics must be from types.ts, got: ${d.filePath}`,
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
  // ════════════════════════════════════════════════════════════════════════════
  section('/app/vscode/nav/symbols');

  await test('basic: types.ts symbols → 배열 + totalCount > 0', async () => {
    const res = await req('/app/vscode/nav/symbols', { filePath: SRC.types });
    assertSuccess(res, 'sym-basic');
    assertHas(res.result, 'symbols', 'totalCount');
    assertTrue(Array.isArray(res.result.symbols),       'symbols must be array');
    assertTrue(typeof res.result.totalCount === 'number', 'totalCount must be number');
    assertTrue(res.result.totalCount > 0,               'types.ts must have symbols');
  });

  await test('result includes IHandler', async () => {
    const res = await req('/app/vscode/nav/symbols', { filePath: SRC.types });
    assertSuccess(res, 'sym-ihandler');
    const found = res.result.symbols.some((s) => s.name === 'IHandler');
    assertTrue(found, 'IHandler symbol must be present in types.ts');
  });

  await test('symbol 구조: 필수 필드 존재 확인', async () => {
    const res = await req('/app/vscode/nav/symbols', { filePath: SRC.types });
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

  await test('query filter: IHandler 관련 심볼만 반환', async () => {
    const res = await req('/app/vscode/nav/symbols', { filePath: SRC.types, query: 'IHandler' });
    assertSuccess(res, 'sym-query');
    assertTrue(res.result.totalCount > 0, 'query "IHandler" must return results');
    for (const s of res.result.symbols) {
      assertTrue(
        s.name.toLowerCase().includes('ihandler'),
        `all symbols must match query 'IHandler', got: ${s.name}`,
      );
    }
  });

  await test('query no match → totalCount: 0', async () => {
    const res = await req('/app/vscode/nav/symbols', {
      filePath: SRC.types,
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
