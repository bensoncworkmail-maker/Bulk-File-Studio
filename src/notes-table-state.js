'use strict';
(() => {
 const ID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
 const modes=['list','cards','grid'],eligible=sheet=>(sheet?.fields||[]).filter(field=>['select','multiselect','checkbox'].includes(field.type));
 function normalizeFilter(input={}){return {fieldId:input&&(['auto','none'].includes(input.fieldId)||ID.test(input.fieldId))?input.fieldId:'auto',forField:input&&ID.test(input.forField)?input.forField:'',value:input&&typeof input.value==='string'&&input.value.length<=120?input.value:''};}
 function normalizeFilters(input){const out={};if(input&&typeof input==='object'&&!Array.isArray(input))for(const [id,value] of Object.entries(input).slice(0,100))if(ID.test(id))out[id]=normalizeFilter(value);return out;}
 function statusField(sheet,config){const fields=eligible(sheet),selected=normalizeFilter(config).fieldId;if(selected==='none')return null;if(selected!=='auto')return fields.find(field=>field.id===selected)||null;return fields.find(field=>/^(?:狀態|状态|status)$/i.test(field.label.trim()))||fields.find(field=>field.type==='checkbox'&&/^(?:已完成|完成|completed|done|iscompleted|is completed)$/i.test(field.label.trim()))||null;}
 function statusOptions(field){if(!field)return [];return field.type==='checkbox'?[{value:'true',label:'已勾選'},{value:'false',label:'未勾選'}]:[{value:'empty',label:'未設定'},...(field.options||[]).map(value=>({value:'v:'+value,label:value}))];}
 function selection(sheet,config){const normalized=normalizeFilter(config),field=statusField(sheet,normalized),options=statusOptions(field),value=field&&normalized.forField===field.id&&options.some(option=>option.value===normalized.value)?normalized.value:'';return {field,options,value,config:normalized};}
 function filter(records,sheet,config){const {field,value}=selection(sheet,config);if(!field||!value)return records;return records.filter(record=>{if(record.sheetId!==sheet.id)return false;const actual=record.values[field.id];if(field.type==='checkbox')return (actual===true)===(value==='true');if(value==='empty')return actual===undefined||actual===null||actual===''||Array.isArray(actual)&&!actual.length;return Array.isArray(actual)?actual.includes(value.slice(2)):actual===value.slice(2);});}
 function viewGroup(scope,detail){return ['all','area','master'].includes(scope)?'mixed':scope==='masters'?'master':detail?'detail':'master';}
 function viewKey(group){return group==='master'?'notesMasterView':group==='detail'?'notesDetailView':'notesView';}
 const exports={modes,eligible,normalizeFilter,normalizeFilters,statusField,statusOptions,selection,filter,viewGroup,viewKey};if(typeof module!=='undefined'&&module.exports)module.exports=exports;else globalThis.notesTableState=Object.freeze(exports);
})();
