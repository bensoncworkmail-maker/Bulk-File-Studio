'use strict';

const {isIP}=require('node:net');
const {lookup}=require('node:dns').promises;
const accessScope=new(require('node:async_hooks').AsyncLocalStorage)();
const isUNC=value=>typeof value==='string'&&/^[\\/]{2}/.test(value);
const separator=require('node:path').win32.sep;
const hostKey=value=>value.replaceAll('/',separator).split(separator)[2]?.toLowerCase();
function isValidated(value){if(!isUNC(value))return false;const key=hostKey(value);for(let scope=accessScope.getStore();scope;scope=scope.parent)if(scope.active&&scope.hosts.has(key))return true;return false;}
function assertIntranetPath(value){uncServer(value);if(!isValidated(value))throw new Error('內網共享位置須先驗證主機，請使用開啟或路徑修復操作');return value;}

function privateAddress(address){
 if(isIP(address)===4){
  const [a,b]=address.split('.').map(Number);
  return a===10||a===127||a===192&&b===168||a===172&&b>=16&&b<=31||a===169&&b===254;
 }
 return isIP(address)===6&&(/^(?:f[cd]|fe[89ab])/i.test(address)||address==='::1');
}

function uncServer(filename){
 const match=/^\\\\(?:\?\\UNC\\)?([^\\]+)\\([^\\]+)/i.exec(filename.replace(/\//g,'\\'));
 if(!match||/^\\\\\?\\(?:[a-z]:|Volume\{)/i.test(filename))return null;
 const [,host,share]=match;
 if(/[@:]/.test(host)||/^(?:ipc\$|pipe|DavWWWRoot)$/i.test(share)){
  throw new Error('只支援內網 SMB 共享資料夾');
 }
 if(isIP(host)){
  if(!privateAddress(host))throw new Error('不允許存取外部網路共享');
  return null;
 }
 const labels=host.split('.');
 if(host.length>253||labels.some(label=>!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(label))||!/[a-z]/i.test(host)){
  throw new Error('請使用內網伺服器名稱、私有 IP 或 Windows 對應磁碟');
 }
 return host.toLowerCase();
}

function withIntranetPaths(paths,action,resolve=lookup){
 const hosts=[...new Set(paths.map(uncServer).filter(Boolean))];
 const run=()=>{
  const scope={hosts:new Set(paths.filter(isUNC).map(hostKey)),parent:accessScope.getStore(),active:true};
  return accessScope.run(scope,()=>{let result;try{result=action();}catch(error){scope.active=false;throw error;}if(result&&typeof result.then==='function')return Promise.resolve(result).finally(()=>{scope.active=false;});scope.active=false;return result;});
 };
 if(!hosts.length)return run();
 return Promise.all(hosts.map(async host=>{
  const addresses=await resolve(host,{all:true});
  if(!addresses.length||addresses.some(({address})=>!privateAddress(address))){
   throw new Error('共享主機未解析至內網位址');
  }
 })).then(run);
}

module.exports={privateAddress,withIntranetPaths,uncServer,isUNC,isValidated,assertIntranetPath};
