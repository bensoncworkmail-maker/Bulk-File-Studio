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

/** Ensure all paths exist and no source/destination collisions exist. */
function validateMoves(moves) {
  if (moves.length > MAX_FILES) throw new Error('檔案數量超過安全上限');
  const sources = new Set(); const targets = new Set();
  for (const { source, destination } of moves) {
    if (path.dirname(source) !== path.dirname(destination)) throw new Error('只允許在原來資料夾內重新命名');
    const problem = filenameProblem(path.basename(destination));
    if (problem) throw new Error(`${path.basename(destination)}：${problem}`);
    if (sources.has(key(source)) || targets.has(key(destination))) throw new Error('原始路徑或目標路徑重複');
    sources.add(key(source)); targets.add(key(destination));
    if (!fs.lstatSync(source).isFile()) throw new Error(`找不到檔案：${source}`);
  }
  for (const { destination } of moves) {
    if (!sources.has(key(destination)) && pathExists(destination)) {
      throw new Error(`目標檔案已存在，操作已取消：${destination}`);
    }
  }
}

/** Stage all names first, allowing A→B / B→A swaps. Roll back on errors. */
function executeMoves(moves) {
  if (!moves.length) return 0;
  validateMoves(moves);
  const staged = []; const completed = [];
  try {
    for (const move of moves) {
      let temp;
      do { temp = path.join(path.dirname(move.source), `.brs-${crypto.randomUUID()}.tmp`); }
      while (pathExists(temp));
      fs.renameSync(move.source, temp);
      staged.push({ ...move, temp });
    }
    for (const move of staged) {
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
        fs.renameSync(move.destination, move.temp);
      } catch (e) { rollbackErrors.push(`${move.destination}: ${e.message}`); }
    }
    for (const move of [...staged].reverse()) {
      try {
        if (!pathExists(move.temp)) continue;
        if (pathExists(move.source)) throw new Error('原始位置被占用');
        fs.renameSync(move.temp, move.source);
      } catch (e) { rollbackErrors.push(`${move.source}: ${e.message}`); }
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

module.exports = { MAX_FILES, splitName, normalizeOptions, renameOne, filenameProblem, createPreview, executeMoves, listPaths };
