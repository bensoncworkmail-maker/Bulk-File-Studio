'use strict';

const api = window.renameAPI;
const $ = (id) => document.getElementById(id);
const collator = new Intl.Collator('zh-Hant', { numeric: true, sensitivity: 'base' });
const { DEFAULT_RULES, BUILTIN_PRESETS, todayISO, presetRules, sanitizeSavedPresets } = window.renamePresets;
const { paginate } = window.studioPagination;
const fieldIds = [
  'find','replace','regex','match-case','replace-all','prefix','suffix',
  'number-enabled','number-start','number-step','number-width',
  'number-position','number-separator','case-mode','whitespace','trim','include-extension',
  'name-template','date-value','date-format','remove-start','remove-end','trim-characters',
  'extension-mode','extension-value','sort-by','sort-direction'
];
const initialSettings=window.settingsUI.get();
const defaults = { ...DEFAULT_RULES, dateValue:todayISO(),sortBy:initialSettings.defaultSortBy,sortDirection:initialSettings.defaultSortDirection };
const optionsMap = {
  'find':'find', 'replace':'replace', 'regex':'regex', 'match-case':'matchCase',
  'replace-all':'replaceAll', 'prefix':'prefix', 'suffix':'suffix',
  'number-enabled':'numberEnabled', 'number-start':'numberStart', 'number-step':'numberStep',
  'number-width':'numberWidth', 'number-position':'numberPosition',
  'number-separator':'numberSeparator', 'case-mode':'caseMode',
  'whitespace':'whitespace', 'trim':'trim', 'include-extension':'includeExtension',
  'name-template':'nameTemplate','date-value':'dateValue','date-format':'dateFormat',
  'remove-start':'removeStart','remove-end':'removeEnd','trim-characters':'trimCharacters',
  'extension-mode':'extensionMode','extension-value':'extensionValue','sort-by':'sortBy','sort-direction':'sortDirection'
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
let previewPending = false;
let savedPresets = [];
let previewPage=0,sourcePage=0;
let previousPanels={showSource:initialSettings.showSource,showRules:initialSettings.showRules};

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
    const value = key === 'dateValue' ? (r[key] || defaults[key]) : (r[key] ?? defaults[key]);
    if (el.type === 'checkbox') el.checked = Boolean(value);
    else el.value = value;
  }
  rules = getRules();
  updateRuleControls();
}
function updateRuleControls() {
  $('number-details').classList.toggle('disabled-group', !rules.numberEnabled && !rules.nameTemplate.includes('{n}'));
  $('rule-extension-value').disabled = rules.extensionMode !== 'replace';
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
function applyFontSize(value) {
  const size = ['12','13','15','17','19'].includes(String(value)) ? String(value) : '13';
  document.documentElement.dataset.fontSize = size;
  $('font-size-select').value = size;
  try { localStorage.setItem('brs-font-size', size); } catch { /* Session-only choice. */ }
}
function renderSavedPresets(selectedId = $('saved-preset-select').value) {
  const select = $('saved-preset-select');
  select.replaceChildren();
  for (const preset of savedPresets) {
    const option = element('option','',preset.name); option.value = preset.id; select.appendChild(option);
  }
  if (!savedPresets.length) {
    const option = element('option','','尚未儲存範本'); option.value=''; select.appendChild(option);
  } else if (savedPresets.some(preset=>preset.id===selectedId)) select.value=selectedId;
  $('saved-presets-summary').textContent = `我的範本（${savedPresets.length}）`;
  select.disabled = !savedPresets.length;
  $('btn-load-preset').disabled = !savedPresets.length;
  $('btn-delete-preset').disabled = !savedPresets.length;
}
function storeSavedPresets(next, selectedId) {
  try { localStorage.setItem('brs-presets-v1',JSON.stringify(next)); }
  catch (e) { showFailure('無法儲存範本',e); return false; }
  savedPresets=next; renderSavedPresets(selectedId); return true;
}
function initPresets() {
  const select=$('preset-select');
  for (const preset of BUILTIN_PRESETS) {
    const option=element('option','',preset.name); option.value=preset.id; select.appendChild(option);
  }
  const describe=()=>{ $('preset-description').textContent=BUILTIN_PRESETS.find(item=>item.id===select.value)?.description || ''; };
  select.addEventListener('change',describe); describe();
  try { savedPresets=sanitizeSavedPresets(JSON.parse(localStorage.getItem('brs-presets-v1')||'[]')); }
  catch { savedPresets=[]; }
  renderSavedPresets();
  $('btn-apply-preset').addEventListener('click',()=>{
    if (busy) return;
    applyRules(presetRules(select.value,rules.dateValue||defaults.dateValue)); enqueuePreview();
  });
  $('btn-load-preset').addEventListener('click',()=>{
    if (busy) return;
    const preset=savedPresets.find(item=>item.id===$('saved-preset-select').value);
    if (preset) { applyRules({...defaults,...preset.rules}); enqueuePreview(); showToast('已套用範本：'+preset.name); }
  });
  $('btn-delete-preset').addEventListener('click',()=>{
    if (busy) return;
    const id=$('saved-preset-select').value;
    if (storeSavedPresets(savedPresets.filter(item=>item.id!==id))) showToast('已刪除選取的範本');
  });
  $('btn-save-preset').addEventListener('click',()=>{
    if (busy) return;
    $('preset-name').value=''; $('preset-dialog').showModal();
  });
  $('btn-preset-cancel').addEventListener('click',()=>$('preset-dialog').close());
  $('preset-form').addEventListener('submit',event=>{
    event.preventDefault();
    const name=$('preset-name').value.trim();
    if (!name) { $('preset-name').setCustomValidity('請輸入範本名稱'); $('preset-name').reportValidity(); return; }
    const existing=savedPresets.find(item=>item.name.toLocaleLowerCase()===name.toLocaleLowerCase());
    if (!existing && savedPresets.length>=30) { $('preset-dialog').close();showFailure('範本數量已達上限','最多儲存 30 個範本，請先刪除不需要的範本。');return; }
    const preset={id:existing?.id||crypto.randomUUID(),name,rules:getRules()};
    const next=existing?savedPresets.map(item=>item.id===existing.id?preset:item):[...savedPresets,preset];
    $('preset-dialog').close();
    if (storeSavedPresets(next,preset.id)) showToast('已儲存範本：'+name,'success');
  });
  $('preset-name').addEventListener('input',()=>$('preset-name').setCustomValidity(''));
}
function saveRulePreferences() {
  if(!window.settingsUI.get().rememberRules)return;
  try { localStorage.setItem('brs-rules-v1', JSON.stringify(rules)); } catch {} 
}
function enqueuePreview(resetPage=false) {
  if(resetPage)previewPage=0;
  rules = getRules(); saveRulePreferences();
  updateRuleControls();
  previewPending = true;
  revision++;
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(updatePreview, 140);
  render();
}
async function updatePreview() {
  const request = ++revision;
  const paths = files.filter(p => selected.has(norm(p)));
  if (!paths.length) {
    previewPending = false;
    latest = { rows: [], counts: { total:0, ready:0, same:0, error:0 } };
    render(); return;
  }
  try {
    const data = await api.preview(paths, rules);
    if (request !== revision) return;
    previewPending = false; latest = data; render();
  } catch (e) {
    if (request !== revision) return;
    previewPending = false;
    latest = {rows:[],counts:{total:0,ready:0,same:0,error:0}};render();
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
    if (seen.has(norm(p))) {selected.add(norm(p));continue;}
    if (seen.size >= 5000) { showToast("已達 5,000 個檔案上限，無法繼續加入", "error"); break; }
    files.push(p); selected.add(norm(p)); seen.add(norm(p)); count++;
  }
  files.sort((a,b) => collator.compare(a,b));
  if (count) {
    sourcePage=0;previewPage=0;
    enqueuePreview();
    showToast(`已加入 ${count} 個檔案`, 'success');
  } else if (paths.length) {enqueuePreview();showToast('已選取清單中現有的檔案');}
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
  files = []; selected.clear(); sourcePage=0;previewPage=0;enqueuePreview(); render();
}
function filterFiles() {
  const q = $('search').value.trim().toLocaleLowerCase();
  const current=new Set(files.map(norm));
  const active=latest.rows.filter(row=>current.has(norm(row.source))&&selected.has(norm(row.source)));
  const shown=new Set(active.map(row=>norm(row.source)));
  const filtered = [...active,...files.filter(p=>!shown.has(norm(p))).map(p=>({ source:p, name:basename(p), dir:dirname(p), targetName:basename(p), status:'off', message:selected.has(norm(p))?'等待預覽':'未選取' }))]
    .filter(row => !q || row.name.toLocaleLowerCase().includes(q) || row.targetName.toLocaleLowerCase().includes(q) || row.dir.toLocaleLowerCase().includes(q));
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
  const page=paginate(files,sourcePage,window.settingsUI.get().pageSize);sourcePage=page.page;
  $('source-page-info').textContent=`${page.page+1} / ${page.pageCount}`;
  $('source-page-prev').disabled=busy||!page.hasPrevious;$('source-page-next').disabled=busy||!page.hasNext;
  if (!files.length) { container.appendChild(element('div','list-empty','尚未加入任何檔案')); return; }
  const fragment = document.createDocumentFragment();
  const list = page.rows;
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
    row.addEventListener('contextmenu',event=>{event.preventDefault();if(!busy)window.favoritesUI.showSourceMenu(event,p);});
    fragment.appendChild(row);
  }
  container.appendChild(fragment);
}
function renderTable() {
  const tbody = $('preview-body'); tbody.replaceChildren();
  const filtered = filterFiles();
  const page=paginate(filtered,previewPage,window.settingsUI.get().pageSize);previewPage=page.page;
  $('preview-page-info').textContent=`${page.page+1} / ${page.pageCount}`;
  for(const id of ['preview-page-first','preview-page-prev'])$(id).disabled=busy||!page.hasPrevious;
  for(const id of ['preview-page-next','preview-page-last'])$(id).disabled=busy||!page.hasNext;
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
  const visible = page.rows;
  for (const row of visible) {
    const on = selected.has(norm(row.source));
    const tr = element('tr', on ? '' : 'row-off');
    tr.addEventListener('contextmenu',event=>{event.preventDefault();if(!busy)window.favoritesUI.showSourceMenu(event,row.source);});
    const checkTd = document.createElement('td');
    const checkbox = element('input');checkbox.type='checkbox';checkbox.checked=on;checkbox.setAttribute('aria-label','選取 ' + row.name);
    checkbox.addEventListener('change',() => selectOne(row.source, checkbox.checked));checkTd.appendChild(checkbox);
    const originalTd = document.createElement('td');
    originalTd.append(element('span','filename',row.name,row.source),element('div','full-dir full-dir-path',row.dir,row.dir));
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
  $('table-showing').textContent = `顯示 ${page.start}–${page.end} / ${page.total} 項 · 已選取 ${selected.size} 項`;
}
function setRuleTab(tab) {
  const value=['presets','name','text','extension'].includes(tab)?tab:'presets';
  document.documentElement.dataset.ruleTab=value;
  for(const item of ['presets','name','text','extension'])$('rule-tab-'+item).setAttribute('aria-pressed',String(item===value));
  $('rules-scroll').scrollTop=0;
}
function renderWorkspaceControls() {
  const settings=window.settingsUI.get();
  $('btn-toggle-source').textContent=settings.showSource?'收合來源':'來源清單';
  $('btn-toggle-rules').textContent=settings.showRules?'收合規則':'命名規則';
  $('btn-toggle-source').setAttribute('aria-pressed',String(settings.showSource));
  $('btn-toggle-rules').setAttribute('aria-pressed',String(settings.showRules));
  $('btn-focus-list').textContent=settings.showSource||settings.showRules?'專注清單':'還原面板';
  const summary=[];
  if(rules.nameTemplate)summary.push('命名格式');if(rules.find)summary.push('搜尋取代');
  if(rules.prefix||rules.suffix)summary.push('前後綴');if(rules.numberEnabled)summary.push('編號');
  if(rules.removeStart||rules.removeEnd||rules.trimCharacters)summary.push('字元移除');
  if(rules.trim||rules.caseMode!=='none'||rules.whitespace!=='none')summary.push('文字整理');
  if(rules.extensionMode!=='keep')summary.push(rules.extensionMode==='replace'?`副檔名 → .${rules.extensionValue||'（未填）'}`:'副檔名大小寫');
  $('rule-summary').textContent=summary.length?summary.join(' · '):'尚未設定命名規則';
  $('rule-summary').title=$('rule-summary').textContent+'；搜尋及分頁只改變顯示，仍處理全部選取項目。';
}
function render() {
  const counts = latest.counts;
  $('stat-total').textContent = files.length;
  $('stat-ready').textContent = counts.ready;
  $('stat-error').textContent = counts.error;
  const selCount = selected.size;
  const canRun = !busy && !previewPending && counts.ready > 0 && counts.error === 0;
  const blocker = counts.error > 0;
  $('btn-run').disabled = !canRun;
  $('btn-move-selected').disabled=busy||!selected.size;
  $('btn-undo').disabled = busy || !history;
  $('btn-export').disabled = busy || !selCount;
  $('btn-favorite-selected').disabled = busy || !selCount;
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
  } else if (previewPending) {
    $('footer-title').textContent = '正在更新預覽…';
    $('footer-desc').textContent = '新檔名確認完成後才可執行';
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
  renderWorkspaceControls();renderFiles(); renderTable();
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
  if (busy || previewPending || $('confirm-modal').open || $('error-dialog').open || $('preset-dialog').open || window.favoritesUI.hasOpenDialog() || !latest.counts.ready || latest.counts.error) return;
  pendingAction = 'rename';
  const ready = latest.counts.ready;
  $('modal-title').textContent = '確認重新命名？';
  $('modal-description').textContent = `即將對 ${ready} 個檔案重新命名。操作只會更改檔案名稱，不會改動檔案內容。`;
  if(rules.extensionMode!=='keep')$('modal-description').textContent+=' 副檔名變更亦不會轉換檔案格式。';
  $('modal-note').textContent = '會先讀取檔案並建立校驗紀錄；大型檔案可能需要較長時間。成功後可使用「復原上一批」。';
  $('btn-confirm').textContent = '確認並執行';
  $('confirm-modal').showModal();
}
async function executeRename() {
  $('confirm-modal').close();
  if (busy) return;
  setBusy(true);
  try {
    const plan=latest.rows.filter(row=>row.status==='ready').map(({source,destination})=>({source,destination}));
    const result = await api.rename(files.filter(p => selected.has(norm(p))), rules, plan);
    const map = new Map(result.moves.map(m => [norm(m.source),m.destination]));
    if (result.changed) {
      files = [...new Set(files.map(p => map.get(norm(p)) || p))].sort((a,b)=>collator.compare(a,b));
      selected.clear();
      if(window.settingsUI.get().resetRulesAfterRename)applyRules(defaults);saveRulePreferences();
      history = result.history ? { count: result.changed } : null;
      showToast(`成功重新命名 ${result.changed} 個檔案`, 'success');
      if (result.warning) showFailure('重新命名完成，但需要注意', result.warning);
    } else showToast('沒有需要重新命名的檔案');
  } catch(e) { showFailure('重新命名未完成', e); }
  finally { busy = false; history = await api.history().catch(() => null); await updatePreview(); }
}
function undo() {
  if (busy || !history || $('confirm-modal').open || $('error-dialog').open || $('preset-dialog').open || window.favoritesUI.hasOpenDialog()) return;
  pendingAction = 'undo';
  $('modal-title').textContent = '復原上一批操作？';
  $('modal-description').textContent = `即將檢查並復原 ${history.count} 個檔案的${history.kind==='move'?'位置':'名稱'}。不會還原檔案內容；若檔案已修改／替換或原位置被占用，會整批停止。`;
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
    if(window.settingsUI.get().resetRulesAfterRename)applyRules(defaults);saveRulePreferences();
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
  $('btn-toggle-source').addEventListener('click',()=>window.settingsUI.update({showSource:!window.settingsUI.get().showSource}));
  $('btn-toggle-rules').addEventListener('click',()=>window.settingsUI.update({showRules:!window.settingsUI.get().showRules}));
  $('btn-close-source').addEventListener('click',()=>window.settingsUI.update({showSource:false}));
  $('btn-close-rules').addEventListener('click',()=>window.settingsUI.update({showRules:false}));
  $('btn-focus-list').addEventListener('click',()=>{
    const settings=window.settingsUI.get();
    if(settings.showSource||settings.showRules){previousPanels={showSource:settings.showSource,showRules:settings.showRules};window.settingsUI.update({showSource:false,showRules:false});}
    else window.settingsUI.update(previousPanels.showSource||previousPanels.showRules?previousPanels:{showSource:false,showRules:true});
  });
  $('btn-extension').addEventListener('click',()=>{window.settingsUI.update({showRules:true});setRuleTab('extension');});
  for(const tab of ['presets','name','text','extension'])$('rule-tab-'+tab).addEventListener('click',()=>setRuleTab(tab));
  $('source-page-prev').addEventListener('click',()=>{sourcePage--;renderFiles();});
  $('source-page-next').addEventListener('click',()=>{sourcePage++;renderFiles();});
  $('preview-page-first').addEventListener('click',()=>{previewPage=0;renderTable();});
  $('preview-page-prev').addEventListener('click',()=>{previewPage--;renderTable();});
  $('preview-page-next').addEventListener('click',()=>{previewPage++;renderTable();});
  $('preview-page-last').addEventListener('click',()=>{previewPage=paginate(filterFiles(),0,window.settingsUI.get().pageSize).pageCount-1;renderTable();});
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
  document.querySelectorAll('[data-token]').forEach(btn=>btn.addEventListener('click',()=>{
    if (busy) return;
    const input=$('rule-name-template');
    input.setRangeText(`{${btn.dataset.token}}`,input.selectionStart??input.value.length,input.selectionEnd??input.value.length,'end');
    input.focus();enqueuePreview();
  }));
  $('btn-run').addEventListener('click',confirmRename);
  $('btn-confirm').addEventListener('click',()=>pendingAction === 'undo' ? executeUndo() : executeRename());
  $('btn-cancel').addEventListener('click',()=>$('confirm-modal').close());
  $('btn-undo').addEventListener('click',undo);
  $('btn-export').addEventListener('click',exportCSV);
  $('search').addEventListener('input',()=>{previewPage=0;render();});
  for (const id of fieldIds) {
    const el = $('rule-' + id);
    el.addEventListener(el.type === 'checkbox' || el.tagName==='SELECT' ? 'change':'input',enqueuePreview);
  }
  document.addEventListener('keydown',e=>{
    if ($('confirm-modal').open || $('error-dialog').open || $('preset-dialog').open || window.favoritesUI.hasOpenDialog() || window.settingsUI.hasOpenDialog()) return;
    if(window.favoritesUI.isSettings())return;
    if(window.favoritesUI.isActive())return;
    if((e.ctrlKey||e.metaKey) && e.key.toLowerCase()==='o') {e.preventDefault();e.shiftKey?chooseFolder():chooseFiles();}
    if((e.ctrlKey||e.metaKey) && e.key==='Enter') {e.preventDefault();confirmRename();}
    if((e.ctrlKey||e.metaKey) && e.key.toLowerCase()==='z' && document.activeElement?.tagName!=='INPUT') {e.preventDefault();undo();}
  });
  let dragDepth=0;
  document.addEventListener('dragenter',e=>{
    if(window.favoritesUI.isSettings())return;
    if(!e.dataTransfer?.types.includes('Files'))return;
    e.preventDefault();dragDepth++;$('drop-overlay').classList.remove('hidden');
  });
  document.addEventListener('dragover',e=>{e.preventDefault();});
  document.addEventListener('dragleave',e=>{e.preventDefault();dragDepth=Math.max(0,dragDepth-1);if(!dragDepth)$('drop-overlay').classList.add('hidden');});
  document.addEventListener('drop',async e=>{
    e.preventDefault();dragDepth=0;$('drop-overlay').classList.add('hidden');
    if(busy||window.favoritesUI.isSettings())return;
    try {
      const paths=Array.from(e.dataTransfer.files).map(f=>api.pathForFile(f)).filter(Boolean);
      if(paths.length){if(window.favoritesUI.isActive())await window.favoritesUI.addPaths(paths);else addFromResult(await api.addPaths(paths,$('recursive').checked));}
      else showToast('無法讀取拖放路徑，請使用「加入檔案」按鈕','error');
    } catch(error) {showToast(withoutPrefix(error),'error');}
  });
}
async function init() {
  applyTheme(document.documentElement.dataset.theme);
  applyFontSize(document.documentElement.dataset.fontSize);
  try { const saved=initialSettings.rememberRules?JSON.parse(localStorage.getItem('brs-rules-v1') || 'null'):null;applyRules(saved && typeof saved==='object' ? {...defaults,...saved}:defaults); }
  catch {applyRules(defaults);}
  $('recursive').checked=initialSettings.recursiveDefault;$('favorite-recursive').checked=initialSettings.recursiveDefault;
  window.settingsUI.init({isBusy:()=>busy,showFailure,getConfiguration:()=>({rules:getRules(),presets:savedPresets}),onChange:(settings,changed)=>{
    if(changed.includes('theme'))applyTheme(settings.theme);
    if(changed.includes('fontSize'))applyFontSize(settings.fontSize);
    if(changed.includes('recursiveDefault')){$('recursive').checked=settings.recursiveDefault;$('favorite-recursive').checked=settings.recursiveDefault;}
    defaults.sortBy=settings.defaultSortBy;defaults.sortDirection=settings.defaultSortDirection;
    if(changed.includes('pageSize')){sourcePage=0;previewPage=0;window.favoritesUI.resetPage();}
    if(changed.some(key=>key==='favoriteSort'||key==='favoriteDirection'))window.favoritesUI.resetPage();
    if(changed.includes('rememberRules')&&settings.rememberRules)saveRulePreferences();
    render();window.favoritesUI.render();
  }});
  setRuleTab('presets');initPresets();wireEvents();render();
  window.movingUI.init({showFailure,onMoved:async result=>{
    const destinations=new Map(result.moves.map(move=>[norm(move.source),move.destination]));
    files=files.map(file=>destinations.get(norm(file))||file);selected.clear();history=await api.history().catch(()=>null);await updatePreview();await window.favoritesUI.refresh();showToast(`已搬移 ${result.changed} 個檔案`,'success');
  }});
  window.sidebarResize.initSource({getWidth:()=>window.settingsUI.get().sourcePanelWidth,save:value=>window.settingsUI.update({sourcePanelWidth:value}),isBusy:()=>busy});
  window.sidebarResize.initRules({getWidth:()=>Number(window.settingsUI.get().rulesWidth),save:value=>window.settingsUI.update({rulesWidth:String(value)}),isBusy:()=>busy});
  $('btn-move-selected').addEventListener('click',()=>window.movingUI.start(files.filter(p=>selected.has(norm(p)))));
  window.notesUI.init({showToast,showFailure});
  const favoriteReady=window.favoritesUI.init({isBusy:()=>busy,getSelectedPaths:()=>files.filter(p=>selected.has(norm(p))),addToRename:addFromResult,showToast,showFailure});
  try { history = await api.history();render(); } catch(e) {showToast('無法讀取復原紀錄：'+withoutPrefix(e),'error');}
  await favoriteReady;
  window.everythingUI.init({isBusy:()=>busy,showToast,showFailure,onFavorite:async()=>{await window.favoritesUI.refresh();window.favoritesUI.show('favorites');},onRename:result=>{addFromResult(result);window.favoritesUI.show('rename');}});
}
init();
