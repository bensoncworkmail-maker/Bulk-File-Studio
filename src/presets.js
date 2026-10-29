'use strict';
(() => {
  const DEFAULT_RULES = Object.freeze({
    find:'', replace:'', regex:false, matchCase:false, replaceAll:true,
    prefix:'', suffix:'', numberEnabled:false, numberStart:1, numberStep:1,
    numberWidth:3, numberPosition:'suffix', numberSeparator:'_',
    caseMode:'none', whitespace:'none', trim:false, includeExtension:false,
    nameTemplate:'', dateValue:'', dateFormat:'YYYY-MM-DD', removeStart:0, removeEnd:0,
    trimCharacters:'', extensionMode:'keep', extensionValue:'', sortBy:'path', sortDirection:'asc'
  });
  const BUILTIN_PRESETS = Object.freeze([
    { id:'photo', name:'照片統一編號', description:'IMG_2458.jpg → Photo_001.jpg；保留副檔名。', rules:{nameTemplate:'Photo_{n}'} },
    { id:'clean', name:'空白整理', description:'my  file.txt → my_file.txt；小寫、底線、去除頭尾空白。', rules:{trim:true,whitespace:'underscore',caseMode:'lower'} },
    { id:'copy', name:'移除 (1) 副本後綴', description:'report (1).pdf → report.pdf；有同名檔案時會提示衝突。', rules:{find:'\\s*\\(\\d+\\)$',regex:true,replace:''} },
    { id:'folder', name:'加上資料夾名稱', description:'Invoices/report.pdf → Invoices_report.pdf。', rules:{nameTemplate:'{folder}_{name}'} },
    { id:'folder-number', name:'資料夾名稱＋編號', description:'Holiday/IMG.jpg → Holiday_001.jpg。', rules:{nameTemplate:'{folder}_{n}'} },
    { id:'date', name:'指定日期＋原檔名', description:'report.pdf → 指定日期_report.pdf；日期可以自行選擇。', rules:{nameTemplate:'{date}_{name}'} },
    { id:'modified', name:'修改日期＋原檔名', description:'依檔案修改日期命名並排序；不是照片拍攝日期。', rules:{nameTemplate:'{modified}_{name}',sortBy:'modified'} },
    { id:'document', name:'文件統一編號', description:'report.pdf → Document_001.pdf。', rules:{nameTemplate:'Document_{n}'} },
    { id:'backup', name:'備份名稱標記', description:'report.pdf → report_backup_指定日期.pdf；只改名，不建立備份。', rules:{nameTemplate:'{name}_backup_{date}'} },
    { id:'web', name:'網站檔名格式', description:'My File.JPG → my-file.jpg；整理分隔符及副檔名大小寫。', rules:{find:'[\\s_-]+',replace:'-',regex:true,caseMode:'lower',trim:true,trimCharacters:' _-',extensionMode:'lower'} },
    { id:'spaces', name:'底線／連字號轉空白', description:'my_file-name.txt → my file name.txt。', rules:{find:'[_-]+',replace:' ',regex:true,trim:true} },
    { id:'remove-number', name:'移除開頭編號', description:'001_report.pdf → report.pdf；不會移除中段數字。', rules:{find:'^\\d+[\\s._-]*',replace:'',regex:true} },
    { id:'remove-brackets', name:'移除括號備註', description:'report [draft] (copy).pdf → report.pdf；移除所有半形括號內容。', rules:{find:'\\s*(?:\\([^)]*\\)|\\[[^\\]]*\\])',replace:'',regex:true,trim:true} },
    { id:'lower-extension', name:'副檔名轉小寫', description:'Photo.JPEG → Photo.jpeg；主檔名保持不變。', rules:{extensionMode:'lower'} },
    { id:'title', name:'英文每字首字大寫', description:'my report.txt → My Report.txt。', rules:{caseMode:'title',trim:true} },
    { id:'number', name:'原檔名前加編號', description:'report.pdf → 001_report.pdf；編號依預覽排序。', rules:{nameTemplate:'{n}_{name}'} }
  ].map(preset => Object.freeze({...preset,rules:Object.freeze(preset.rules)})));
  function todayISO(date = new Date()) {
    return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
  }
  function presetRules(id, dateValue = todayISO()) {
    const preset = BUILTIN_PRESETS.find(item => item.id === id);
    if (!preset) throw new Error('找不到指定範本');
    return {...DEFAULT_RULES,dateValue,...preset.rules};
  }
  function sanitizeSavedPresets(input) {
    if (!Array.isArray(input)) return [];
    const used = new Set();
    return input.filter(item => item && typeof item.id === 'string' && /^[a-zA-Z0-9_-]{1,80}$/.test(item.id) &&
      typeof item.name === 'string' && item.name.trim() && item.rules && typeof item.rules === 'object')
      .filter(item => { if (used.has(item.id)) return false; used.add(item.id); return true; }).slice(0,30)
      .map(item => ({ id:item.id,name:item.name.trim().slice(0,60),rules:Object.fromEntries(
        Object.entries(DEFAULT_RULES).map(([key,value]) => [key,typeof item.rules[key] === typeof value &&
          (typeof value !== 'number' || Number.isFinite(item.rules[key])) ?
          (typeof value === 'string' ? item.rules[key].slice(0,500) : item.rules[key]) : value])) }));
  }
  const exports = { DEFAULT_RULES, BUILTIN_PRESETS, todayISO, presetRules, sanitizeSavedPresets };
  if (typeof module !== 'undefined' && module.exports) module.exports = exports;
  else globalThis.renamePresets = Object.freeze(exports);
})();
