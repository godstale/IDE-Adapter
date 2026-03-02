#!/usr/bin/env node
/**
 * IDEA Adapter — Interactive CLI Test Tool
 *
 * Usage:
 *   node test/test.js find       <pattern>               [options]
 *   node test/test.js replace    <pattern> <replacement>  [options]
 *   node test/test.js def        <symbol>                [options]
 *   node test/test.js ref        <symbol>                [options]
 *   node test/test.js diag       [filePath...]            [options]
 *   node test/test.js sym        <filePath>              [options]
 *   node test/test.js history    <filePath>              [options]
 *   node test/test.js diff       <filePath>              [options]
 *   node test/test.js search     <query>                 [options]
 *   node test/test.js rollback   <filePath> <toIndex>    [options]
 *   node test/test.js lhlist     <filePath>              [options]
 *   node test/test.js lhdiff     <filePath>              [options]
 *   node test/test.js lhrollback <filePath> <id>         [options]
 *
 * Options:
 *   --include=<glob>      File filter (default: all .ts files)
 *   --exclude=<glob>      Exclusion pattern
 *   --regex               Regex mode
 *   --case                Case-sensitive matching
 *   --severity=<level>    For diag: error|warning|information|hint|all (default: all)
 *   --query=<name>        For sym: symbol name filter (case-insensitive)
 *   --max=<n>             For history: max commit count (default: 20)
 *   --from=<n>            For diff: fromIndex (0=working tree, 1=HEAD, 2=HEAD~1, ...)
 *   --to=<n>              For diff: toIndex (1=HEAD, 2=HEAD~1, ...)
 *   --fromId=<id>         For lhdiff: local history save ID to use as "from"
 *   --toId=<id>           For lhdiff: local history save ID to use as "to"
 *   --port=<n>            WebSocket port (default: 7200)
 *   --help                Show help
 */

const WebSocket = require('ws');
const { randomUUID } = require('crypto');
const readline = require('readline');
const fs   = require('fs');
const path = require('path');

// ─── Settings.json 자동 읽기 ─────────────────────────────────────────────────

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

// ─── Color helpers ─────────────────────────────────────────────────────────────

function colorize(str, code) {
  if (!process.stdout.isTTY) return str;
  return `\x1b[${code}m${str}\x1b[0m`;
}
const cyan   = (s) => colorize(s, '36');
const yellow = (s) => colorize(s, '33');
const green  = (s) => colorize(s, '32');
const red    = (s) => colorize(s, '31');
const gray   = (s) => colorize(s, '90');

// Strip ANSI codes for length calculation
function visibleLen(str) {
  return str.replace(/\x1b\[[0-9;]*m/g, '').length;
}

// ─── CLI Argument Parsing ───────────────────────────────────────────────────────

function parseArgs(defaultPort = 7200) {
  const argv = process.argv.slice(2);

  if (argv.length === 0 || argv.includes('--help') || argv.includes('-h')) {
    printHelp();
    process.exit(0);
  }

  const opts = {
    include: undefined,
    exclude: undefined,
    regex: false,
    case: false,
    port: defaultPort,
    severity: 'all',
    query: undefined,
    maxCount: undefined,
    from: undefined,
    to: undefined,
    fromId: undefined,
    toId: undefined,
  };

  const positional = [];

  for (const arg of argv) {
    if (arg.startsWith('--include=')) {
      opts.include = arg.slice('--include='.length);
    } else if (arg.startsWith('--exclude=')) {
      opts.exclude = arg.slice('--exclude='.length);
    } else if (arg === '--regex') {
      opts.regex = true;
    } else if (arg === '--case') {
      opts.case = true;
    } else if (arg.startsWith('--port=')) {
      opts.port = parseInt(arg.slice('--port='.length), 10);
    } else if (arg.startsWith('--severity=')) {
      opts.severity = arg.slice('--severity='.length);
    } else if (arg.startsWith('--query=')) {
      opts.query = arg.slice('--query='.length);
    } else if (arg.startsWith('--max=')) {
      opts.maxCount = parseInt(arg.slice('--max='.length), 10);
    } else if (arg.startsWith('--from=')) {
      opts.from = parseInt(arg.slice('--from='.length), 10);
    } else if (arg.startsWith('--to=')) {
      opts.to = parseInt(arg.slice('--to='.length), 10);
    } else if (arg.startsWith('--fromId=')) {
      opts.fromId = arg.slice('--fromId='.length);
    } else if (arg.startsWith('--toId=')) {
      opts.toId = arg.slice('--toId='.length);
    } else if (arg.startsWith('--')) {
      console.error(red(`Unknown option: ${arg}`));
      printHelp();
      process.exit(1);
    } else {
      positional.push(arg);
    }
  }

  const [topic, ...rest] = positional;
  const validTopics = ['find', 'replace', 'def', 'ref', 'diag', 'sym', 'history', 'diff', 'search', 'rollback', 'lhlist', 'lhdiff', 'lhrollback'];

  if (!topic || !validTopics.includes(topic)) {
    console.error(red(`Unknown topic: ${topic ?? '(none)'}`));
    printHelp();
    process.exit(1);
  }

  if (topic === 'replace') {
    if (rest.length < 2) {
      console.error(red(`'replace' requires <pattern> and <replacement> arguments`));
      printHelp();
      process.exit(1);
    }
    return { topic, pattern: rest[0], replacement: rest[1], opts };
  }

  if (topic === 'diag') {
    // filePath is optional; multiple files can be specified
    return { topic, filePaths: rest.length > 0 ? rest : null, opts };
  }

  if (topic === 'sym') {
    if (rest.length === 0) {
      console.error(red(`'sym' requires a <filePath> argument`));
      printHelp();
      process.exit(1);
    }
    return { topic, filePath: rest[0], opts };
  }

  if (topic === 'history') {
    if (rest.length === 0) {
      console.error(red(`'history' requires a <filePath> argument`));
      printHelp();
      process.exit(1);
    }
    return { topic, filePath: rest[0], opts };
  }

  if (topic === 'diff') {
    if (rest.length === 0) {
      console.error(red(`'diff' requires a <filePath> argument`));
      printHelp();
      process.exit(1);
    }
    return { topic, filePath: rest[0], opts };
  }

  if (topic === 'search') {
    if (rest.length === 0) {
      console.error(red(`'search' requires a <query> argument`));
      printHelp();
      process.exit(1);
    }
    return { topic, pattern: rest[0], opts };
  }

  if (topic === 'rollback') {
    if (rest.length < 2) {
      console.error(red(`'rollback' requires <filePath> and <toIndex> arguments`));
      printHelp();
      process.exit(1);
    }
    const toIndex = parseInt(rest[1], 10);
    if (isNaN(toIndex)) {
      console.error(red(`'rollback' <toIndex> must be an integer`));
      process.exit(1);
    }
    return { topic, filePath: rest[0], toIndex, opts };
  }

  if (topic === 'lhlist') {
    if (rest.length === 0) {
      console.error(red(`'lhlist' requires a <filePath> argument`));
      printHelp();
      process.exit(1);
    }
    return { topic, filePath: rest[0], opts };
  }

  if (topic === 'lhdiff') {
    if (rest.length === 0) {
      console.error(red(`'lhdiff' requires a <filePath> argument`));
      printHelp();
      process.exit(1);
    }
    return { topic, filePath: rest[0], opts };
  }

  if (topic === 'lhrollback') {
    if (rest.length < 2) {
      console.error(red(`'lhrollback' requires <filePath> and <id> arguments`));
      printHelp();
      process.exit(1);
    }
    return { topic, filePath: rest[0], toId: rest[1], opts };
  }

  // find / def / ref
  if (rest.length === 0) {
    console.error(red(`Missing pattern argument for '${topic}'`));
    printHelp();
    process.exit(1);
  }
  return { topic, pattern: rest[0], opts };
}

// ─── WebSocket helpers ──────────────────────────────────────────────────────────

function connect(port, token = '') {
  return new Promise((resolve, reject) => {
    const url = `ws://localhost:${port}`;
    const ws = new WebSocket(url);

    const timer = setTimeout(() => {
      ws.terminate();
      reject(new Error(`Connection timed out (port ${port})`));
    }, 5000);

    ws.on('open', () => {
      const hsMsg = token ? { type: 'handshake', token } : { type: 'handshake' };
      ws.send(JSON.stringify(hsMsg));
    });

    ws.once('message', (raw) => {
      clearTimeout(timer);
      let msg;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        reject(new Error('Invalid handshake response from server'));
        return;
      }
      if (msg.type === 'handshake') {
        if (msg.error) {
          ws.close();
          reject(new Error(`Handshake failed: [${msg.error.code}] ${msg.error.message}`));
          return;
        }
        resolve({ ws, workspaces: msg.workspaces ?? [] });
      } else {
        reject(new Error(`Unexpected first message: ${JSON.stringify(msg)}`));
      }
    });

    ws.on('error', (err) => {
      clearTimeout(timer);
      reject(new Error(
        `Cannot connect to ws://localhost:${port} — ${err.message}\n` +
        `Is the IDE Adapter extension running?`
      ));
    });
  });
}

function request(ws, topic, params) {
  return new Promise((resolve, reject) => {
    const requestId = randomUUID();

    const timer = setTimeout(() => {
      ws.off('message', handler);
      reject(new Error(`Request timed out: ${topic}`));
    }, 15000);

    function handler(raw) {
      let msg;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return;
      }
      if (msg.requestId === requestId) {
        clearTimeout(timer);
        ws.off('message', handler);
        resolve(msg);
      }
    }

    ws.on('message', handler);
    ws.send(JSON.stringify({ topic, requestId, params }));
  });
}

// ─── Interactive prompt ─────────────────────────────────────────────────────────

function promptSelect(count) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(`\nSelect [1-${count}]: `, (answer) => {
      rl.close();
      const n = parseInt(answer.trim(), 10);
      if (isNaN(n) || n < 1 || n > count) {
        console.error(red('Invalid selection'));
        process.exit(1);
      }
      resolve(n - 1); // 0-indexed
    });
  });
}

// ─── Utilities ─────────────────────────────────────────────────────────────────

function relativePath(absPath) {
  const cwd = process.cwd().replace(/\\/g, '/');
  const normalized = absPath.replace(/\\/g, '/');
  // Case-insensitive prefix match for Windows paths
  if (normalized.toLowerCase().startsWith(cwd.toLowerCase() + '/')) {
    return normalized.slice(cwd.length + 1);
  }
  return normalized;
}

// Format "file:line" with color, padded to targetLen visible chars
function fmtLoc(filePath, line, targetLen = 50) {
  const rel = relativePath(filePath);
  const loc = `${cyan(rel)}:${yellow(String(line + 1))}`;
  const pad = ' '.repeat(Math.max(2, targetLen - visibleLen(loc)));
  return loc + pad;
}

function buildFindParams(pattern, opts) {
  const p = {
    pattern,
    isRegex: opts.regex,
    isCaseSensitive: opts.case,
  };
  if (opts.include) p.include = opts.include;
  if (opts.exclude) p.exclude = opts.exclude;
  return p;
}

// ─── Command implementations ───────────────────────────────────────────────────

async function cmdFind(ws, pattern, opts) {
  const res = await request(ws, '/app/vscode/edit/find', buildFindParams(pattern, opts));

  if (res.error) {
    console.error(red(`✗ find error: ${res.error.code} — ${res.error.message}`));
    return null;
  }

  const { matches, totalCount } = res.result;
  const label = totalCount === 1 ? 'match' : 'matches';
  console.log(`\n${green('✓')} find ${JSON.stringify(pattern)}  →  ${yellow(String(totalCount))} ${label}\n`);

  for (const m of matches) {
    console.log(`  ${fmtLoc(m.filePath, m.line)}${m.lineText.trimEnd()}`);
  }

  return matches;
}

async function cmdReplace(ws, pattern, replacement, opts) {
  const params = { ...buildFindParams(pattern, opts), replacement };
  const res = await request(ws, '/app/vscode/edit/replace', params);

  if (res.error) {
    console.error(red(`✗ replace error: ${res.error.code} — ${res.error.message}`));
    return;
  }

  const { replacedCount, affectedFiles } = res.result;
  const occ   = replacedCount === 1 ? 'occurrence' : 'occurrences';
  const files = affectedFiles.length === 1 ? 'file' : 'files';
  console.log(`\n${green('✓')} Replaced ${yellow(String(replacedCount))} ${occ} in ${yellow(String(affectedFiles.length))} ${files}:\n`);

  for (const f of affectedFiles) {
    console.log(`  ${cyan(relativePath(f))}`);
  }
}

// Shared step 1: find matches and show numbered list; returns matches array
async function findAndList(ws, symbol, opts) {
  const res = await request(ws, '/app/vscode/edit/find', buildFindParams(symbol, opts));

  if (res.error) {
    console.error(red(`✗ find error: ${res.error.code} — ${res.error.message}`));
    return null;
  }

  const { matches } = res.result;

  if (matches.length === 0) {
    console.log(yellow(`No matches for "${symbol}"`));
    return null;
  }

  console.log('');
  matches.forEach((m, i) => {
    console.log(`${gray(`[${i + 1}]`)} ${fmtLoc(m.filePath, m.line)}${m.lineText.trimEnd()}`);
  });

  return matches;
}

async function cmdDef(ws, symbol, opts) {
  const matches = await findAndList(ws, symbol, opts);
  if (!matches) return;

  const idx = await promptSelect(matches.length);
  const sel = matches[idx];

  const res = await request(ws, '/app/vscode/nav/definition', {
    filePath: sel.filePath,
    line: sel.line,
    character: sel.character,
  });

  if (res.error) {
    console.error(red(`✗ definition error: ${res.error.code} — ${res.error.message}`));
    return;
  }

  const { locations } = res.result;

  if (locations.length === 0) {
    console.log(yellow('No definition found'));
    return;
  }

  for (const loc of locations) {
    const rel    = relativePath(loc.filePath);
    const header = `${cyan(rel)}:${yellow(String(loc.line + 1))}-${yellow(String(loc.endLine + 1))}`;
    console.log(`\n${green('✓')} definition  ${header}\n`);
    for (const line of (loc.code ?? '').split('\n')) {
      console.log(`  ${line}`);
    }
  }
}

async function cmdRef(ws, symbol, opts) {
  const matches = await findAndList(ws, symbol, opts);
  if (!matches) return;

  const idx = await promptSelect(matches.length);
  const sel = matches[idx];

  const res = await request(ws, '/app/vscode/nav/references', {
    filePath: sel.filePath,
    line: sel.line,
    character: sel.character,
    includeDeclaration: true,
  });

  if (res.error) {
    console.error(red(`✗ references error: ${res.error.code} — ${res.error.message}`));
    return;
  }

  const { locations, totalCount } = res.result;
  const label = totalCount === 1 ? 'reference' : 'references';
  console.log(`\n${green('✓')} references  →  ${yellow(String(totalCount))} ${label}\n`);

  for (const loc of locations) {
    console.log(`  ${fmtLoc(loc.filePath, loc.line)}`);
  }
}

// ─── diag / sym ────────────────────────────────────────────────────────────────

const SEVERITY_COLOR = {
  error:       (s) => colorize(s, '31'),   // red
  warning:     (s) => colorize(s, '33'),   // yellow
  information: (s) => colorize(s, '36'),   // cyan
  hint:        (s) => colorize(s, '90'),   // gray
};

async function cmdDiag(ws, filePaths, opts) {
  const params = { severity: opts.severity };
  if (filePaths && filePaths.length === 1) {
    params.filePath = filePaths[0];
  } else if (filePaths && filePaths.length > 1) {
    params.filePath = filePaths;
  }

  const res = await request(ws, '/app/vscode/diag/list', params);

  if (res.error) {
    console.error(red(`✗ diag error: ${res.error.code} — ${res.error.message}`));
    return;
  }

  const { diagnostics, totalCount } = res.result;

  let errors = 0, warnings = 0;
  for (const d of diagnostics) {
    if (d.severity === 'error')   errors++;
    if (d.severity === 'warning') warnings++;
  }

  const label = totalCount === 1 ? 'diagnostic' : 'diagnostics';
  console.log(`\n${green('✓')} diag  →  ${yellow(String(totalCount))} ${label} (${red(String(errors))} errors, ${colorize(String(warnings), '33')} warnings)\n`);

  for (const d of diagnostics) {
    const col  = SEVERITY_COLOR[d.severity] ?? gray;
    const rel  = relativePath(d.filePath);
    const loc  = `${cyan(rel)}:${yellow(String(d.line + 1))}`;
    const sev  = col(d.severity.padEnd(11));
    console.log(`  ${sev} ${loc}  ${d.message}`);
  }
}

async function cmdSym(ws, filePath, opts) {
  const params = { filePath };
  if (opts.query) { params.query = opts.query; }

  const res = await request(ws, '/app/vscode/nav/symbols', params);

  if (res.error) {
    console.error(red(`✗ sym error: ${res.error.code} — ${res.error.message}`));
    return;
  }

  const { symbols, totalCount } = res.result;
  const label = totalCount === 1 ? 'symbol' : 'symbols';
  console.log(`\n${green('✓')} sym  →  ${yellow(String(totalCount))} ${label}\n`);

  const rel = relativePath(filePath);
  for (const s of symbols) {
    const indent  = s.containerName ? '    ' : '  ';
    const kind    = cyan(s.kind.padEnd(14));
    const name    = s.name;
    const loc     = `${gray(rel)}:${yellow(String(s.line + 1))}`;
    console.log(`${indent}${kind}  ${name.padEnd(30)}  ${loc}`);
  }
}

async function cmdHistory(ws, filePath, opts) {
  const params = { filePath };
  if (opts.maxCount !== undefined) { params.maxCount = opts.maxCount; }

  const res = await request(ws, '/app/vscode/history/list', params);

  if (res.error) {
    console.error(red(`✗ history error: ${res.error.code} — ${res.error.message}`));
    return;
  }

  const { entries, totalCount } = res.result;
  const label = totalCount === 1 ? 'commit' : 'commits';
  console.log(`\n${green('✓')} history  ${cyan(relativePath(filePath))}  →  ${yellow(String(totalCount))} ${label}\n`);

  for (const e of entries) {
    const idx  = gray(`[${e.index}]`);
    const hash = yellow(e.shortHash);
    const date = e.authorDate ? gray(e.authorDate.slice(0, 10)) : gray('          ');
    const msg  = e.message.split('\n')[0];
    console.log(`  ${idx}  ${hash}  ${date}  ${msg}`);
  }
}

async function cmdDiff(ws, filePath, opts) {
  const params = { filePath };
  if (opts.from !== undefined) { params.fromIndex = opts.from; }
  if (opts.to   !== undefined) { params.toIndex   = opts.to; }

  const res = await request(ws, '/app/vscode/history/diff', params);

  if (res.error) {
    console.error(red(`✗ diff error: ${res.error.code} — ${res.error.message}`));
    return;
  }

  const { diff, fromRef, toRef } = res.result;
  console.log(`\n${green('✓')} diff  ${cyan(relativePath(filePath))}  ${gray(fromRef)} → ${gray(toRef)}\n`);

  if (!diff) {
    console.log(gray('  (no differences)'));
    return;
  }

  for (const line of diff.split('\n')) {
    if (line.startsWith('+') && !line.startsWith('+++')) {
      console.log(green(line));
    } else if (line.startsWith('-') && !line.startsWith('---')) {
      console.log(red(line));
    } else if (line.startsWith('@@')) {
      console.log(cyan(line));
    } else {
      console.log(line);
    }
  }
}

async function cmdSearch(ws, query, opts) {
  const params = { query };
  if (opts.include) { params.include = opts.include; }
  if (opts.exclude) { params.exclude = opts.exclude; }

  const res = await request(ws, '/app/vscode/fs/findFiles', params);

  if (res.error) {
    console.error(red(`✗ search error: ${res.error.code} — ${res.error.message}`));
    return;
  }

  const { files, totalCount } = res.result;
  const label = totalCount === 1 ? 'file' : 'files';
  console.log(`\n${green('✓')} search ${JSON.stringify(query)}  →  ${yellow(String(totalCount))} ${label}\n`);

  for (const f of files) {
    console.log(`  ${cyan(f.relativePath)}`);
  }
}

async function cmdRollback(ws, filePath, toIndex) {
  const res = await request(ws, '/app/vscode/history/rollback', { filePath, toIndex });

  if (res.error) {
    console.error(red(`✗ rollback error: ${res.error.code} — ${res.error.message}`));
    return;
  }

  const { filePath: absPath, toRef } = res.result;
  const rel = relativePath(absPath);
  console.log(`\n${green('✓')} rollback  ${cyan(rel)}  → restored to ${yellow(toRef)}\n`);
}

async function cmdLhList(ws, filePath) {
  const res = await request(ws, '/app/vscode/localhistory/list', { filePath });

  if (res.error) {
    console.error(red(`✗ lhlist error: ${res.error.code} — ${res.error.message}`));
    return;
  }

  const { entries, totalCount } = res.result;
  const label = totalCount === 1 ? 'entry' : 'entries';
  console.log(`\n${green('✓')} lhlist  ${cyan(relativePath(filePath))}  →  ${yellow(String(totalCount))} ${label}\n`);

  for (const e of entries) {
    const src = e.source ? gray(` [${e.source}]`) : '';
    console.log(`  ${yellow(e.id)}  ${gray(e.timestampLabel)}${src}`);
  }
}

async function cmdLhDiff(ws, filePath, opts) {
  const params = { filePath };
  if (opts.fromId) { params.fromId = opts.fromId; }
  if (opts.toId)   { params.toId   = opts.toId; }

  const res = await request(ws, '/app/vscode/localhistory/diff', params);

  if (res.error) {
    console.error(red(`✗ lhdiff error: ${res.error.code} — ${res.error.message}`));
    return;
  }

  const { diff, fromLabel, toLabel } = res.result;
  console.log(`\n${green('✓')} lhdiff  ${cyan(relativePath(filePath))}  ${gray(fromLabel)} → ${gray(toLabel)}\n`);

  if (!diff) {
    console.log(gray('  (no differences)'));
    return;
  }

  for (const line of diff.split('\n')) {
    if (line.startsWith('+') && !line.startsWith('+++')) {
      console.log(green(line));
    } else if (line.startsWith('-') && !line.startsWith('---')) {
      console.log(red(line));
    } else if (line.startsWith('@@')) {
      console.log(cyan(line));
    } else {
      console.log(line);
    }
  }
}

async function cmdLhRollback(ws, filePath, toId) {
  const res = await request(ws, '/app/vscode/localhistory/rollback', { filePath, toId });

  if (res.error) {
    console.error(red(`✗ lhrollback error: ${res.error.code} — ${res.error.message}`));
    return;
  }

  const { filePath: absPath, restoredId, restoredLabel } = res.result;
  const rel = relativePath(absPath);
  console.log(`\n${green('✓')} lhrollback  ${cyan(rel)}  → restored to ${yellow(restoredId)} (${gray(restoredLabel)})\n`);
}

// ─── Help ──────────────────────────────────────────────────────────────────────

function printHelp() {
  console.log(`
IDEA Adapter — Interactive CLI Test Tool

Usage:
  node test/test.js find       <pattern>               [options]
  node test/test.js replace    <pattern> <replacement>  [options]
  node test/test.js def        <symbol>                [options]
  node test/test.js ref        <symbol>                [options]
  node test/test.js diag       [filePath...]            [options]
  node test/test.js sym        <filePath>              [options]
  node test/test.js history    <filePath>              [options]
  node test/test.js diff       <filePath>              [options]
  node test/test.js search     <query>                 [options]
  node test/test.js rollback   <filePath> <toIndex>    [options]
  node test/test.js lhlist     <filePath>              [options]
  node test/test.js lhdiff     <filePath>              [options]
  node test/test.js lhrollback <filePath> <id>         [options]

Commands:
  find       Search for pattern across workspace files
  replace    Replace pattern with replacement text
  def        Find symbol, pick a location, navigate to its definition
  ref        Find symbol, pick a location, list all references
  diag       List diagnostics (errors/warnings). Omit filePath for all known diagnostics.
             One or more filePaths can be specified to analyze specific files.
  sym        List symbols (functions/classes/etc.) in a file
  history    List git commit history for a file
  diff       Show unified diff between two versions of a file (default: working tree vs HEAD)
  search     Find files by filename keyword across the workspace
  rollback   Restore a file to a specific commit version (1=HEAD, 2=HEAD~1, ...)
  lhlist     List VS Code local save history entries for a file
  lhdiff     Show unified diff between two local history saves (use --fromId/--toId)
  lhrollback Restore a file to a specific local history save

Options:
  --include=<glob>      File filter  (default: **/*.ts)
  --exclude=<glob>      Exclusion pattern
  --regex               Use regex pattern
  --case                Case-sensitive matching
  --severity=<level>    For diag: error|warning|information|hint|all (default: all)
  --query=<name>        For sym: filter symbols by name (case-insensitive)
  --max=<n>             For history: max commit count (default: 20)
  --from=<n>            For diff: fromIndex (0=working tree, 1=HEAD, 2=HEAD~1, ...)
  --to=<n>              For diff: toIndex (1=HEAD, 2=HEAD~1, ...)
  --fromId=<id>         For lhdiff: local history save ID to use as "from"
  --toId=<id>           For lhdiff: local history save ID to use as "to"
  --port=<n>            WebSocket port (default: 7200)
  --help                Show this help

Examples:
  node test/test.js find "getChatResponse" --include=test/src/**/*.ts
  node test/test.js find "IStubService" --include=test/src/**/*.ts
  node test/test.js replace "oldText" "newText" --include=test/src/**/*.ts
  node test/test.js def "IStubService" --include=test/src/**/*.ts
  node test/test.js ref "IStubService" --include=test/src/**/*.ts
  node test/test.js diag
  node test/test.js diag test/src/App.tsx
  node test/test.js diag test/src/App.tsx --severity=error
  node test/test.js sym test/src/App.tsx
  node test/test.js sym test/src/ai/chatService.ts
  node test/test.js sym test/src/stub.ts --query=Service
  node test/test.js history test/src/ai/chatService.ts
  node test/test.js history test/src/stub.ts --max=5
  node test/test.js diff test/src/ai/chatService.ts
  node test/test.js diff test/src/stub.ts --from=1 --to=2
  node test/test.js search chatService --include=test/src/**
  node test/test.js search App
  node test/test.js lhlist test/src/stub.ts
  node test/test.js lhdiff test/src/stub.ts --toId=IOCb.ts
  node test/test.js lhrollback test/src/stub.ts IOCb.ts

Note:
  Port and auth token are read automatically from .vscode/settings.json.
  Use --port=<n> to override the port.
`.trim());
}

// ─── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const settings    = readWorkspaceSettings();
  const defaultPort = parseInt(settings['idea.server.port'] ?? '7200', 10);
  const token       = settings['idea.server.authToken'] ?? '';

  const { topic, pattern, replacement, filePath, filePaths, toIndex, toId, opts } = parseArgs(defaultPort);

  let ws;
  try {
    ({ ws } = await connect(opts.port, token));
  } catch (err) {
    console.error(red(`✗ ${err.message}`));
    if (err.message.includes('UNAUTHORIZED')) {
      console.error(red('  Check that idea.server.authToken in .vscode/settings.json is correct.'));
    }
    process.exit(1);
  }

  try {
    if (topic === 'find') {
      await cmdFind(ws, pattern, opts);
    } else if (topic === 'replace') {
      await cmdReplace(ws, pattern, replacement, opts);
    } else if (topic === 'def') {
      await cmdDef(ws, pattern, opts);
    } else if (topic === 'ref') {
      await cmdRef(ws, pattern, opts);
    } else if (topic === 'diag') {
      await cmdDiag(ws, filePaths, opts);
    } else if (topic === 'sym') {
      await cmdSym(ws, filePath, opts);
    } else if (topic === 'history') {
      await cmdHistory(ws, filePath, opts);
    } else if (topic === 'diff') {
      await cmdDiff(ws, filePath, opts);
    } else if (topic === 'search') {
      await cmdSearch(ws, pattern, opts);
    } else if (topic === 'rollback') {
      await cmdRollback(ws, filePath, toIndex);
    } else if (topic === 'lhlist') {
      await cmdLhList(ws, filePath);
    } else if (topic === 'lhdiff') {
      await cmdLhDiff(ws, filePath, opts);
    } else if (topic === 'lhrollback') {
      await cmdLhRollback(ws, filePath, toId);
    }
  } catch (err) {
    console.error(red(`✗ ${err.message}`));
    process.exit(1);
  } finally {
    ws.close();
  }
}

main();
