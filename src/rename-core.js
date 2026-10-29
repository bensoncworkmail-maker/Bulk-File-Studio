'use strict';

/** Pure planning/validation and a rollback-capable two-phase rename engine. */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const MAX_FILES = 5000;
const collator = new Intl.Collator('zh-Hant', { numeric: true, sensitivity: 'base' });

function splitName(name) {
  const ext = path.extname(name);
  return { stem: name.slice(0, name.length - ext.length), ext };
}

function normalizeOptions(input = {}) {
  const safe = (v) => typeof v === 'string' ? v.slice(0, 500) : '';
  const mode = ['none', 'lower', 'upper', 'title'].includes(input.caseMode) ? input.caseMode : 'none';
  const whitespace = ['none', 'underscore', 'dash'].includes(input.whitespace) ? input.whitespace : 'none';
  return {
    find: safe(input.find), replace: safe(input.replace),
    regex: Boolean(input.regex), matchCase: Boolean(input.matchCase),
    replaceAll: input.replaceAll !== false,
    prefix: safe(input.prefix), suffix: safe(input.suffix),
    numberEnabled: Boolean(input.numberEnabled),
    numberStart: Math.min(999999, Math.max(0, Number.isSafeInteger(Number(input.numberStart)) ? Number(input.numberStart) : 1)),
    numberStep: Math.min(99999, Math.max(1, Number.isSafeInteger(Number(input.numberStep)) ? Number(input.numberStep) : 1)),
    numberWidth: Math.min(10, Math.max(1, Number(input.numberWidth) || 3)),
    numberSeparator: safe(input.numberSeparator).slice(0, 12),
    numberPosition: input.numberPosition === 'prefix' ? 'prefix' : 'suffix',
    caseMode: mode, whitespace,
    trim: Boolean(input.trim), includeExtension: Boolean(input.includeExtension)
  };
}

function renameOne(name, input, sequence = 0) {
  const opts = normalizeOptions(input);
  const { stem, ext } = splitName(name);
  let newName = opts.includeExtension ? name : stem;

  if (opts.find) {
    if (opts.regex) {
      const flags = `${opts.matchCase ? '' : 'i'}${opts.replaceAll ? 'g' : ''}`;
      const re = new RegExp(opts.find, flags);
      newName = newName.replace(re, opts.replace);
    } else {
      const escaped = opts.find.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const flags = `${opts.matchCase ? '' : 'i'}${opts.replaceAll ? 'g' : ''}`;
      newName = newName.replace(new RegExp(escaped, flags), () => opts.replace);
    }
  }

  if (opts.trim) newName = newName.trim();
  if (opts.whitespace !== 'none') {
    newName = newName.replace(/\s+/g, opts.whitespace === 'dash' ? '-' : '_');
  }
  if (opts.caseMode === 'lower') newName = newName.toLocaleLowerCase();
  if (opts.caseMode === 'upper') newName = newName.toLocaleUpperCase();
  if (opts.caseMode === 'title') {
    newName = newName.toLocaleLowerCase().replace(/(^|[\s_\-.])([^\s_\-.])/gu, (_, sep, ch) => sep + ch.toLocaleUpperCase());
  }
  newName = opts.prefix + newName + opts.suffix;
  if (opts.numberEnabled) {
    const num = String(opts.numberStart + sequence * opts.numberStep).padStart(opts.numberWidth, '0');
    if (opts.numberPosition === 'prefix') newName = num + opts.numberSeparator + newName;
    else newName = newName + opts.numberSeparator + num;
  }
  return opts.includeExtension ? newName : newName + ext;
}

function filenameProblem(name) {
  if (!name || name === '.' || name === '..') return '檔案名稱不可為空白或 . / ..';
  if (/[<>:"/\\|?*\x00-\x1f]/.test(name)) return '名稱包含 Windows 不允許的字元';
  if (/[. ]$/.test(name)) return '名稱不能以空白或句點結尾';
  if (/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\..*)?$/i.test(name)) return 'Windows 保留名稱不可使用';
  if (Buffer.byteLength(name, 'utf8') > 255 || name.length > 255) return '名稱超過 255 字元／位元組';
  return null;
}

function key(p) {
  return path.resolve(p).normalize('NFC').toLocaleLowerCase('en-US');
}

function pathExists(p) {
  try { fs.lstatSync(p); return true; } catch (e) { if (e.code === 'ENOENT') return false; throw e; }
}

/** Convert selected absolute paths into a safe, sortable preview. */
function createPreview(filePaths, inputOptions, options = {}) {
  const rules = normalizeOptions(inputOptions);
  const unique = [...new Map((filePaths || []).filter(p => typeof p === 'string').map(p => [key(p), path.resolve(p)])).values()];
  unique.sort((a, b) => collator.compare(a, b));
  if (unique.length > MAX_FILES) throw new Error(`每次最多處理 ${MAX_FILES} 個檔案`);
  const rows = [];
  let sequence = 0;
  let regexProblem = null;
  if (rules.regex && rules.find) {
    try { new RegExp(rules.find, `${rules.matchCase ? '' : 'i'}${rules.replaceAll ? 'g' : ''}`); }
    catch (e) { regexProblem = `正規表示式無效：${e.message}`; }
  }
  for (const source of unique) {
    const name = path.basename(source);
    const dir = path.dirname(source);
    let targetName = name;
    let error = regexProblem;
    if (!error) {
      try { targetName = renameOne(name, rules, sequence); }
      catch (e) { error = e.message; }
    }
    if (!error) error = filenameProblem(targetName);
    const destination = path.join(dir, targetName);
    if (!error && !options.skipStat) {
      try {
        if (!fs.lstatSync(source).isFile()) error = '原始檔案不存在或不是一般檔案';
      } catch { error = '原始檔案已不存在或無法讀取'; }
    }
    rows.push({ source, name, dir, targetName, destination,
      status: error ? 'error' : targetName === name ? 'same' : 'ready',
      message: error || (targetName === name ? '無需更改' : '可重新命名') });
    sequence++;
  }

  // Check both duplicate destinations and existing, non-moving occupants.
  const destCounts = new Map();
  for (const row of rows) {
    const k = key(row.destination);
    destCounts.set(k, (destCounts.get(k) || 0) + 1);
  }
  // Repeatedly resolve dependencies: A→B is invalid if B cannot vacate its name.
  // This matters for chains of several files, not only direct collisions.
  let changed;
  do {
    changed = false;
    const movingSources = new Set(rows.filter(r => r.status === 'ready').map(r => key(r.source)));
    for (const row of rows) {
      if (row.status !== 'ready') continue;
      let issue = null;
      if (destCounts.get(key(row.destination)) > 1) {
        issue = '多個檔案將使用相同名稱';
      } else if (!movingSources.has(key(row.destination)) && pathExists(row.destination)) {
        issue = '目標名稱已被其他檔案或資料夾使用';
      }
      if (issue) { row.status = 'error'; row.message = issue; changed = true; }
    }
  } while (changed);
  const counts = { total: rows.length, ready: 0, same: 0, error: 0 };
  for (const row of rows) counts[row.status]++;
  return { rows, counts };
}

const identityFields = ['dev', 'ino', 'birthtimeNs', 'size', 'mtimeNs'];
function fileIdentity(stat) {
  if (!stat.isFile()) throw new Error('不是一般檔案（不允許符號連結或資料夾）');
  return Object.fromEntries(identityFields.map(field => [field, String(stat[field])]));
}
function sameIdentity(a, b) {
  return identityFields.every(field => a[field] === b[field]);
}

/** Bound memory use even for large files. Reject a file changing while read. */
function fingerprintFile(filepath) {
  const before = fileIdentity(fs.lstatSync(filepath, { bigint: true }));
  const fd = fs.openSync(filepath, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0));
  try {
    if (!sameIdentity(before, fileIdentity(fs.fstatSync(fd, { bigint: true })))) throw new Error('檔案在檢查期間被替換');
    const hash = crypto.createHash('sha256');
    const buffer = Buffer.allocUnsafe(256 * 1024);
    let length;
    while ((length = fs.readSync(fd, buffer, 0, buffer.length, null)) > 0) hash.update(buffer.subarray(0, length));
    if (!sameIdentity(before, fileIdentity(fs.fstatSync(fd, { bigint: true }))) ||
        !sameIdentity(before, fileIdentity(fs.lstatSync(filepath, { bigint: true })))) throw new Error('檔案在檢查期間被修改或替換');
    return { ...before, sha256: hash.digest('hex') };
  } finally { fs.closeSync(fd); }
}

function assertFingerprint(filepath, expected, content = true) {
  try {
    const actual = content ? fingerprintFile(filepath) : fileIdentity(fs.lstatSync(filepath, { bigint: true }));
    if (!sameIdentity(actual, expected) || (content && actual.sha256 !== expected.sha256)) {
      throw new Error('檔案已被修改或替換，不能安全復原');
    }
  } catch (e) {
    const reason = e.code === 'ENOENT' ? '檔案已被移動或刪除' : e.message;
    throw new Error(`${filepath}\n${reason}`);
  }
}

function snapshotMoves(moves) {
  return moves.map(move => ({ ...move, expectedFingerprint: fingerprintFile(move.source) }));
}

function prepareUndo(history) {
  if (!history || history.version !== 2) throw new Error('舊版復原紀錄沒有檔案校驗資料，無法安全復原。請手動核對檔名；新版操作會建立可校驗的紀錄。');
  if (history.state !== 'completed') throw new Error('上次操作或復原未完整完成，不能自動復原。請依先前錯誤訊息核對原始、目標及 .brs- 暫存檔案。');
  if (!Array.isArray(history.moves) || !history.moves.length) throw new Error('沒有可復原的操作紀錄');
  const reversed = history.moves.map(move => {
    if (!move || typeof move !== 'object') throw new Error('復原紀錄不完整，操作已取消；請手動核對檔案。');
    const fp = move.expectedFingerprint;
    if (typeof move.source !== 'string' || typeof move.destination !== 'string' ||
        !path.isAbsolute(move.source) || !path.isAbsolute(move.destination) ||
        !fp || !identityFields.every(field => typeof fp[field] === 'string') || !/^[a-f0-9]{64}$/.test(fp.sha256)) {
      throw new Error('復原紀錄不完整，操作已取消；請手動核對檔案。');
    }
    return { source: move.destination, destination: move.source, expectedFingerprint: fp };
  });
  validateMoves(reversed);
  return reversed;
}

/** Validate the entire batch before touching any names. */
function validateMoves(moves) {
  if (moves.length > MAX_FILES) throw new Error('檔案數量超過安全上限');
  const sources = new Set(); const targets = new Set();
  for (const { source, destination } of moves) {
    if (path.dirname(source) !== path.dirname(destination)) throw new Error('只允許在原來資料夾內重新命名');
    const problem = filenameProblem(path.basename(destination));
    if (problem) throw new Error(`${path.basename(destination)}：${problem}`);
    if (sources.has(key(source)) || targets.has(key(destination))) throw new Error('原始路徑或目標路徑重複');
    sources.add(key(source)); targets.add(key(destination));
    try {
      if (!fs.lstatSync(source).isFile()) throw new Error('不是一般檔案或已被替換為符號連結');
    } catch (e) {
      throw new Error(`${source}\n${e.code === 'ENOENT' ? '檔案已被移動或刪除' : e.message}`);
    }
  }
  for (const { destination } of moves) {
    if (!sources.has(key(destination)) && pathExists(destination)) {
      throw new Error(`目標檔案已存在，操作已取消：${destination}`);
    }
  }
  for (const move of moves) {
    if (move.expectedFingerprint) assertFingerprint(move.source, move.expectedFingerprint);
  }
}

/** Stage all names first, allowing A→B / B→A swaps. Roll back on errors. */
function executeMoves(moves) {
  if (!moves.length) return 0;
  validateMoves(moves);
  const staged = []; const completed = [];
  try {
    for (const move of moves) {
      if (move.expectedFingerprint) assertFingerprint(move.source, move.expectedFingerprint, false);
      let temp;
      do { temp = path.join(path.dirname(move.source), `.brs-${crypto.randomUUID()}.tmp`); }
      while (pathExists(temp));
      fs.renameSync(move.source, temp);
      staged.push({ ...move, temp });
    }
    for (const move of staged) {
      if (move.expectedFingerprint) assertFingerprint(move.temp, move.expectedFingerprint, false);
      if (pathExists(move.destination)) throw new Error(`目標名稱在執行期間已被建立：${move.destination}`);
      fs.renameSync(move.temp, move.destination);
      completed.push(move);
    }
    return moves.length;
  } catch (original) {
    const rollbackErrors = [];
    // First free destination names, then restore source names.
    for (const move of [...completed].reverse()) {
      try {
        if (pathExists(move.temp)) throw new Error('暫存位置被占用');
        if (move.expectedFingerprint) assertFingerprint(move.destination, move.expectedFingerprint);
        fs.renameSync(move.destination, move.temp);
      } catch (e) { rollbackErrors.push(`目前：${move.destination}；暫存：${move.temp}；原因：${e.message}`); }
    }
    for (const move of [...staged].reverse()) {
      try {
        if (!pathExists(move.temp)) continue;
        if (pathExists(move.source)) throw new Error('原始位置被占用');
        if (move.expectedFingerprint) assertFingerprint(move.temp, move.expectedFingerprint);
        fs.renameSync(move.temp, move.source);
      } catch (e) { rollbackErrors.push(`原始：${move.source}；暫存：${move.temp}；原因：${e.message}`); }
    }
    throw new Error(`重新命名失敗：${original.message}${rollbackErrors.length ? `；部分檔案無法自動復原：${rollbackErrors.join('；')}` : '；已嘗試還原所有變更'}`);
  }
}

function listPaths(inputs, recursive = false) {
  const found = new Map(); const visitedDirs = new Set(); let ignored = 0;
  const visit = (p) => {
    if (found.size >= MAX_FILES) { ignored++; return; }
    let stat;
    try { stat = fs.lstatSync(p); } catch { ignored++; return; }
    if (stat.isSymbolicLink()) { ignored++; return; }
    if (stat.isFile()) { found.set(key(p), path.resolve(p)); return; }
    if (!stat.isDirectory()) { ignored++; return; }
    const dir = path.resolve(p);
    if (visitedDirs.has(key(dir))) return;
    visitedDirs.add(key(dir));
    let children;
    try { children = fs.readdirSync(dir, { withFileTypes: true }); } catch { ignored++; return; }
    children.sort((a, b) => collator.compare(a.name, b.name));
    for (const child of children) {
      if (!recursive && child.isDirectory()) continue;
      visit(path.join(dir, child.name));
    }
  };
  (inputs || []).filter(p => typeof p === 'string' && path.isAbsolute(p)).forEach(visit);
  const paths = [...found.values()].sort((a, b) => collator.compare(a, b));
  return { paths, ignored, capped: ignored > 0 && paths.length >= MAX_FILES };
}

module.exports = { MAX_FILES, splitName, normalizeOptions, renameOne, filenameProblem, createPreview, executeMoves, listPaths, fingerprintFile, snapshotMoves, prepareUndo };
