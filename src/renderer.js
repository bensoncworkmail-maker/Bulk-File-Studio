'use strict';

const api = window.renameAPI;
const $ = (id) => document.getElementById(id);
const collator = new Intl.Collator('zh-Hant', { numeric: true, sensitivity: 'base' });
const fieldIds = [
  'find','replace','regex','match-case','replace-all','prefix','suffix',
  'number-enabled','number-start','number-step','number-width',
  'number-position','number-separator','case-mode','whitespace','trim','include-extension'
];
const defaults = {
  find:'', replace:'', regex:false, matchCase:false, replaceAll:true,
  prefix:'', suffix:'', numberEnabled:false, numberStart:1, numberStep:1,
  numberWidth:3, numberPosition:'suffix', numberSeparator:'_',
  caseMode:'none', whitespace:'none', trim:false, includeExtension:false
};
const optionsMap = {
  'find':'find', 'replace':'replace', 'regex':'regex', 'match-case':'matchCase',
  'replace-all':'replaceAll', 'prefix':'prefix', 'suffix':'suffix',
  'number-enabled':'numberEnabled', 'number-start':'numberStart', 'number-step':'numberStep',
  'number-width':'numberWidth', 'number-position':'numberPosition',
  'number-separator':'numberSeparator', 'case-mode':'caseMode',
  'whitespace':'whitespace', 'trim':'trim', 'include-extension':'includeExtension'
};

let files = [];
let selected = new Set();
let latest = { rows: [], counts: { total:0, ready:0, same:0, error:0 } };
let history = null;
let rules = { ...defaults };
let busy = false;
let debounceTimer = null;
let revision = 0;
let noticeTimeout;
let pendingAction = 'rename';

const norm = (s) => s.normalize('NFC').toLocaleLowerCase('en-US');
const basename = (p) => p.split(/[\\/]/).pop();
const dirname = (p) => p.slice(0, p.length - basename(p).length).replace(/[\\/]$/, '');
const shortDir = (p) => {
  const d = dirname(p).split(/[\\/]/).filter(Boolean);
  return d.length >= 2 ? '… / ' + d.slice(-2).join(' / ') : (dirname(p) || '/');
};
const withoutPrefix = (error) => String(error?.message ?? error ?? '未知錯誤').replace(/^Error invoking remote method '[^']+': (?:Error: )?/i,'');

function getRules() {
  const out = {};
  for (const id of fieldIds) {
    const el = $('rule-' + id); const key = optionsMap[id];
    out[key] = el.type === 'checkbox' ? el.checked : el.type === 'number' ? Number(el.value) : el.value;
  }
  return out;
}
function applyRules(r) {
  for (const id of fieldIds) {
    const el = $('rule-' + id), key = optionsMap[id];
    const value = r[key] ?? defaults[key];
    if (el.type === 'checkbox') el.checked = Boolean(value);
    else el.value = value;
  }
  $('number-details').classList.toggle('disabled-group', !$('rule-number-enabled').checked);
  rules = getRules();
}
function showToast(message, type = '') {
  const node = document.createElement('div');
  node.className = 'toast ' + type;
  node.textContent = message;
  $('toast-container').appendChild(node);
  setTimeout(() => node.remove(), 5300);
}
function showFailure(title, error) {
  $('error-title').textContent = title;
  $('error-details').textContent = withoutPrefix(error);
  if (!$('error-dialog').open) $('error-dialog').showModal();
}
function applyTheme(theme) {
  const value = theme === 'light' ? 'light' : 'dark';
  document.documentElement.dataset.theme = value;
  $('theme-select').value = value;
  try { localStorage.setItem('brs-theme', value); } catch { /* Session-only choice. */ }
  api.setTheme(value).catch(e => showToast('原生視窗主題未能更新：' + withoutPrefix(e), 'error'));
}
function saveRulePreferences() {
  try { localStorage.setItem('brs-rules-v1', JSON.stringify(rules)); } catch {} 
}
function enqueuePreview() {
  rules = getRules(); saveRulePreferences();
  $('number-details').classList.toggle('disabled-group', !rules.numberEnabled);
  revision++;
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(updatePreview, 140);
}
async function updatePreview() {
  const request = ++revision;
  const paths = files.filter(p => selected.has(norm(p)));
  if (!paths.length) {
    latest = { rows: [], counts: { total:0, ready:0, same:0, error:0 } };
    render(); return;
  }
  try {
    const data = await api.preview(paths, rules);
    if (request !== revision) return;
    latest = data; render();
  } catch (e) {
    if (request !== revision) return;
    showToast('預覽失敗：' + withoutPrefix(e), 'error');
  }
}
function setBusy(value) {
  busy = value;
  render();
}
function addFromResult(result) {
  const paths = result?.paths ?? [];
  const seen = new Set(files.map(norm));
  let count = 0;
  for (const p of paths) {
    if (seen.has(norm(p))) continue;
    if (seen.size >= 5000) { showToast("已達 5,000 個檔案上限，無法繼續加入", "error"); break; }
    files.push(p); selected.add(norm(p)); seen.add(norm(p)); count++;
  }
  files.sort((a,b) => collator.compare(a,b));
  if (count) {
    enqueuePreview();
    showToast(`已加入 ${count} 個檔案`, 'success');
  } else if (paths.length) showToast('這些檔案已經在清單中');
  if (result?.capped) showToast('已達 5,000 個檔案上限，部分檔案未加入', 'error');
  else if (result?.ignored) showToast(`有 ${result.ignored} 個項目因無法存取或不是一般檔案而略過`);
  render();
}
async function chooseFiles() {
  if (busy) return;
  try { addFromResult(await api.chooseFiles()); } catch (e) { showToast(withoutPrefix(e), 'error'); }
}
async function chooseFolder() {
  if (busy) return;
  try { addFromResult(await api.chooseFolder($('recursive').checked)); } catch (e) { showToast(withoutPrefix(e), 'error'); }
}
function clearFiles() {
  if (busy) return;
  files = []; selected.clear(); enqueuePreview(); render();
}
function filterFiles() {
  const q = $('search').value.trim().toLocaleLowerCase();
  const byPath = new Map(latest.rows.map(row => [norm(row.source), row]));
  const filtered = files.map(p => {
    const row = byPath.get(norm(p));
    return row || { source:p, name:basename(p), dir:dirname(p), targetName:basename(p), status:'off', message:'未選取' };
  }).filter(row => !q || row.name.toLocaleLowerCase().includes(q) || row.targetName.toLocaleLowerCase().includes(q) || row.dir.toLocaleLowerCase().includes(q));
  return filtered;
}
function element(tag, className, text, title) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text !== undefined && text !== null) e.textContent = text;
  if (title) e.title = title;
  return e;
}
function renderFiles() {
  const container = $('file-list'); container.replaceChildren();
  $('file-counter').textContent = files.length;
  if (!files.length) { container.appendChild(element('div','list-empty','尚未加入任何檔案')); return; }
  const fragment = document.createDocumentFragment();
  const list = files.slice(0,180);
  for (const p of list) {
    const name = basename(p); const isChecked = selected.has(norm(p));
    const row = element('div', 'file-item' + (isChecked ? '' : ' unselected'));
    row.title = p;
    const check = element('input','file-check'); check.type = 'checkbox'; check.checked = isChecked;
    check.setAttribute('aria-label', '選取 ' + name);
    check.addEventListener('change', () => selectOne(p, check.checked));
    const ext = (name.includes('.') ? name.split('.').pop() : 'FILE').slice(0,4).toUpperCase();
    row.append(check, element('div','file-item-icon',ext));
    const label = element('div','file-item-text');
    label.append(element('div','file-name',name), element('div','file-dir', shortDir(p)));
    row.append(label); row.addEventListener('click', ev => { if (ev.target !== check) selectOne(p, !selected.has(norm(p))); });
    fragment.appendChild(row);
  }
  if (files.length > list.length) fragment.appendChild(element('div','list-empty',`檔案清單只展示前 ${list.length} 筆，預覽與改名仍會處理全部選取檔案`));
  container.appendChild(fragment);
}
function renderTable() {
  const tbody = $('preview-body'); tbody.replaceChildren();
  const filtered = filterFiles();
  if (!files.length) {
    const tr = document.createElement('tr'); const td = document.createElement('td'); td.colSpan = 5;
    const empty = element('div','empty-preview');
    const graphic = element('div','empty-graphic');
    graphic.append(element('span','', 'Abc'), element('span','graphic-arrow','→'), element('span','','ABC'));
    empty.append(graphic,element('h3','','先加入檔案，開始整理'),element('p','','你將在這裡看到每一個檔名變更，包含錯誤與重複名稱提醒。'));
    const btn = element('button','btn btn-primary','＋ 選取檔案'); btn.addEventListener('click',chooseFiles);
    empty.appendChild(btn);td.appendChild(empty); tr.appendChild(td);tbody.appendChild(tr);
    $('table-showing').textContent = '尚未加入檔案';
    return;
  }
  if (!filtered.length) {
    const tr = document.createElement('tr'), td = document.createElement('td'); td.colSpan = 5;
    td.appendChild(element('div','list-empty','沒有符合搜尋條件的檔案'));tr.appendChild(td);tbody.appendChild(tr);
    $('table-showing').textContent = '沒有符合搜尋條件的檔案';return;
  }
  const fragment = document.createDocumentFragment();
  const visible = filtered.slice(0,300);
  for (const row of visible) {
    const on = selected.has(norm(row.source));
    const tr = element('tr', on ? '' : 'row-off');
    const checkTd = document.createElement('td');
    const checkbox = element('input');checkbox.type='checkbox';checkbox.checked=on;checkbox.setAttribute('aria-label','選取 ' + row.name);
    checkbox.addEventListener('change',() => selectOne(row.source, checkbox.checked));checkTd.appendChild(checkbox);
    const originalTd = document.createElement('td');
    originalTd.append(element('span','filename',row.name,row.source),element('div','full-dir',shortDir(row.source),row.dir));
    const arrowTd = document.createElement('td'); arrowTd.appendChild(element('span','row-arrow','→'));
    const newTd = document.createElement('td');newTd.appendChild(element('span','filename target',row.targetName,row.destination));
    const stateTd = document.createElement('td');
    const tag = element('span','status-tag status-' + row.status, ({ready:'可執行',same:'不變',error:'衝突',off:'未選取'})[row.status] || '不明');
    tag.title = row.message;
    stateTd.appendChild(tag);
    if (row.status === 'error') newTd.appendChild(element('div','full-dir',row.message));
    tr.append(checkTd,originalTd,arrowTd,newTd,stateTd);fragment.appendChild(tr);
  }
  tbody.appendChild(fragment);
  $('table-showing').textContent = `顯示 ${visible.length} / ${filtered.length} 個檔案${filtered.length > visible.length ? '（搜尋可縮小範圍）' : ''}`;
}
function render() {
  const counts = latest.counts;
  $('stat-total').textContent = files.length;
  $('stat-ready').textContent = counts.ready;
  $('stat-error').textContent = counts.error;
  const selCount = selected.size;
  const canRun = !busy && counts.ready > 0 && counts.error === 0;
  const blocker = counts.error > 0;
  $('btn-run').disabled = !canRun;
  $('btn-undo').disabled = busy || !history;
  $('btn-export').disabled = busy || !selCount;
  $('btn-clear').disabled = busy || !files.length;
  $('btn-select-all').disabled = busy || !files.length;
  $('btn-select-none').disabled = busy || !selCount;
  $('check-all').disabled = busy || !files.length;
  const filtered = filterFiles();
  $('check-all').checked = filtered.length > 0 && filtered.every(r => selected.has(norm(r.source)));
  $('check-all').indeterminate = filtered.some(r => selected.has(norm(r.source))) && !$('check-all').checked;
  $('file-counter').textContent = files.length;
  $('footer-count').textContent = `${counts.ready} 個檔案待處理`;
  $('footer-check').classList.toggle('invalid',blocker);
  if (busy) {
    $('footer-title').textContent = '正在處理檔案…';
    $('footer-desc').textContent = '請勿在操作期間移動或修改相關檔案';
  } else if (blocker) {
    $('footer-title').textContent = `發現 ${counts.error} 個衝突`;
    $('footer-desc').textContent = '請修改規則或取消選取有衝突的檔案';
  } else if (counts.ready) {
    $('footer-title').textContent = '預覽檢查通過';
    $('footer-desc').textContent = '已檢查目標名稱，現在可執行批次重新命名';
  } else if (files.length && !selCount) {
    $('footer-title').textContent = '尚未選取檔案';
    $('footer-desc').textContent = '選取清單中的檔案後即可預覽變更';
  } else if (files.length) {
    $('footer-title').textContent = '沒有需要更改的檔名';
    $('footer-desc').textContent = '你可以在右方調整搜尋、編號或其他規則';
  } else {
    $('footer-title').textContent = '準備開始';
    $('footer-desc').textContent = '請先選擇檔案並設定重新命名規則';
  }
  renderFiles(); renderTable();
}
function selectOne(p, enabled) {
  if (busy) return;
  if (enabled) selected.add(norm(p)); else selected.delete(norm(p));
  enqueuePreview();render();
}
function selectFiltered(all) {
  if (busy) return;
  for (const row of filterFiles()) {
    if (all) selected.add(norm(row.source)); else selected.delete(norm(row.source));
  }
  enqueuePreview();render();
}
function confirmRename() {
  if (busy || $('confirm-modal').open || $('error-dialog').open || !latest.counts.ready || latest.counts.error) return;
  pendingAction = 'rename';
  const ready = latest.counts.ready;
  $('modal-title').textContent = '確認重新命名？';
  $('modal-description').textContent = `即將對 ${ready} 個檔案重新命名。操作只會更改檔案名稱，不會改動檔案內容。`;
  $('modal-note').textContent = '會先讀取檔案並建立校驗紀錄；大型檔案可能需要較長時間。成功後可使用「復原上一批」。';
  $('btn-confirm').textContent = '確認並執行';
  $('confirm-modal').showModal();
}
async function executeRename() {
  $('confirm-modal').close();
  if (busy) return;
  setBusy(true);
  try {
    const result = await api.rename(files.filter(p => selected.has(norm(p))), rules);
    const map = new Map(result.moves.map(m => [norm(m.source),m.destination]));
    if (result.changed) {
      files = [...new Set(files.map(p => map.get(norm(p)) || p))].sort((a,b)=>collator.compare(a,b));
      selected.clear();
      applyRules(defaults);saveRulePreferences();
      history = result.history ? { count: result.changed } : null;
      showToast(`成功重新命名 ${result.changed} 個檔案`, 'success');
      if (result.warning) showFailure('重新命名完成，但需要注意', result.warning);
    } else showToast('沒有需要重新命名的檔案');
  } catch(e) { showFailure('重新命名未完成', e); }
  finally { busy = false; history = await api.history().catch(() => null); await updatePreview(); }
}
function undo() {
  if (busy || !history || $('confirm-modal').open || $('error-dialog').open) return;
  pendingAction = 'undo';
  $('modal-title').textContent = '復原上一批命名？';
  $('modal-description').textContent = `即將檢查並復原 ${history.count} 個檔案的名稱。復原只會更改名稱，不會還原檔案內容。`;
  $('modal-note').textContent = '若任何檔案已被修改、替換、移走，或原名稱已被佔用，整批復原會停止。紀錄會保留，修正問題後可再試。舊版未校驗紀錄不支援自動復原。';
  $('btn-confirm').textContent = '檢查並復原';
  $('confirm-modal').showModal();
}
async function executeUndo() {
  $('confirm-modal').close();
  if (busy || !history) return;
  setBusy(true);
  try {
    const result = await api.undo();
    const map = new Map(result.moves.map(m => [norm(m.source),m.destination]));
    files = [...new Set(files.map(p => map.get(norm(p)) || p))].sort((a,b)=>collator.compare(a,b));
    selected.clear(); history = null;
    applyRules(defaults);saveRulePreferences();
    showToast(`已復原 ${result.changed} 個檔案`, 'success');
    if (result.warning) showFailure('復原完成，但需要注意', result.warning);
  } catch(e) {showFailure('無法安全復原', e);}
  finally {busy=false;history=await api.history().catch(()=>null);await updatePreview();}
}
async function exportCSV() {
  if (busy || !selected.size) return;
  try { const r = await api.exportCSV(files.filter(p=>selected.has(norm(p))),rules);if(!r.canceled)showToast(`已匯出 ${r.count} 筆檔案預覽`, 'success'); }
  catch(e) {showToast(withoutPrefix(e),'error');}
}
function wireEvents() {
  $('theme-select').addEventListener('change', e => applyTheme(e.target.value));
  $('btn-error-close').addEventListener('click', () => $('error-dialog').close());
  $('btn-add-files').addEventListener('click',chooseFiles);
  $('btn-empty-add').addEventListener('click',chooseFiles);
  $('dropzone').addEventListener('click',chooseFiles);
  $('dropzone').addEventListener('keydown', e => { if (e.key==='Enter' || e.key===' ') {e.preventDefault();chooseFiles();} });
  $('btn-add-folder').addEventListener('click',chooseFolder);
  $('btn-clear').addEventListener('click',clearFiles);
  $('btn-select-all').addEventListener('click',()=>selectFiltered(true));
  $('btn-select-none').addEventListener('click',()=>selectFiltered(false));
  $('check-all').addEventListener('change',e=>selectFiltered(e.target.checked));
  $('btn-reset').addEventListener('click',()=>{applyRules(defaults);saveRulePreferences();enqueuePreview();});
  document.querySelectorAll('[data-preset]').forEach(btn => btn.addEventListener('click', () => {
    const presets = {
      photo: { ...defaults, prefix:'Photo_', numberEnabled:true, numberWidth:3, numberPosition:'prefix' },
      clean: { ...defaults, trim:true, whitespace:'underscore', caseMode:'lower' },
      copy: { ...defaults, find:'\\s*\\(\\d+\\)$', regex:true, replace:'' }
    };
    applyRules(presets[btn.dataset.preset]); saveRulePreferences(); enqueuePreview();
  }));
  $('btn-run').addEventListener('click',confirmRename);
  $('btn-confirm').addEventListener('click',()=>pendingAction === 'undo' ? executeUndo() : executeRename());
  $('btn-cancel').addEventListener('click',()=>$('confirm-modal').close());
  $('btn-undo').addEventListener('click',undo);
  $('btn-export').addEventListener('click',exportCSV);
  $('search').addEventListener('input',render);
  for (const id of fieldIds) {
    const el = $('rule-' + id);
    el.addEventListener(el.type === 'checkbox' || el.tagName==='SELECT' ? 'change':'input',enqueuePreview);
  }
  document.addEventListener('keydown',e=>{
    if ($('confirm-modal').open || $('error-dialog').open) return;
    if((e.ctrlKey||e.metaKey) && e.key.toLowerCase()==='o') {e.preventDefault();e.shiftKey?chooseFolder():chooseFiles();}
    if((e.ctrlKey||e.metaKey) && e.key==='Enter') {e.preventDefault();confirmRename();}
    if((e.ctrlKey||e.metaKey) && e.key.toLowerCase()==='z' && document.activeElement?.tagName!=='INPUT') {e.preventDefault();undo();}
  });
  let dragDepth=0;
  document.addEventListener('dragenter',e=>{
    if(!e.dataTransfer?.types.includes('Files'))return;
    e.preventDefault();dragDepth++;$('drop-overlay').classList.remove('hidden');
  });
  document.addEventListener('dragover',e=>{e.preventDefault();});
  document.addEventListener('dragleave',e=>{e.preventDefault();dragDepth=Math.max(0,dragDepth-1);if(!dragDepth)$('drop-overlay').classList.add('hidden');});
  document.addEventListener('drop',async e=>{
    e.preventDefault();dragDepth=0;$('drop-overlay').classList.add('hidden');
    if(busy)return;
    try {
      const paths=Array.from(e.dataTransfer.files).map(f=>api.pathForFile(f)).filter(Boolean);
      if(paths.length)addFromResult(await api.addPaths(paths,$('recursive').checked));
      else showToast('無法讀取拖放路徑，請使用「加入檔案」按鈕','error');
    } catch(error) {showToast(withoutPrefix(error),'error');}
  });
}
async function init() {
  applyTheme(document.documentElement.dataset.theme);
  try { const saved=JSON.parse(localStorage.getItem('brs-rules-v1') || 'null');applyRules(saved && typeof saved==='object' ? {...defaults,...saved}:defaults); }
  catch {applyRules(defaults);}
  wireEvents();render();
  try { history = await api.history();render(); } catch(e) {showToast('無法讀取復原紀錄：'+withoutPrefix(e),'error');}
}
init();
