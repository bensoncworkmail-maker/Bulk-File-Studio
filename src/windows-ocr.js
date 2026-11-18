'use strict';
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{execFile}=require('node:child_process');
const {readStableBytes}=require('./bounded-file-read'),{assertLocalPath}=require('./offline-policy');
const SCRIPT=`$ErrorActionPreference='Stop'
[Console]::OutputEncoding=New-Object System.Text.UTF8Encoding($false)
[Console]::InputEncoding=New-Object System.Text.UTF8Encoding($false)
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$null=[Windows.Media.Ocr.OcrEngine,Windows.Foundation,ContentType=WindowsRuntime]
$null=[Windows.Graphics.Imaging.BitmapDecoder,Windows.Foundation,ContentType=WindowsRuntime]
$null=[Windows.Globalization.Language,Windows.Foundation,ContentType=WindowsRuntime]
$null=[Windows.Storage.StorageFile,Windows.Storage,ContentType=WindowsRuntime]
function Await($operation,$type){$method=[System.WindowsRuntimeSystemExtensions].GetMethods()|Where-Object {$_.Name -eq 'AsTask' -and $_.IsGenericMethod -and $_.GetGenericArguments().Count -eq 1 -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -like 'IAsyncOperation*'}|Select-Object -First 1;$task=$method.MakeGenericMethod($type).Invoke($null,@($operation));$task.GetAwaiter().GetResult()}
$request=[Console]::In.ReadToEnd()|ConvertFrom-Json
$languages=@([Windows.Media.Ocr.OcrEngine]::AvailableRecognizerLanguages|ForEach-Object {$_.LanguageTag})
if($request.language){$language=[Windows.Globalization.Language]::new([string]$request.language);$engine=[Windows.Media.Ocr.OcrEngine]::TryCreateFromLanguage($language)}else{$engine=[Windows.Media.Ocr.OcrEngine]::TryCreateFromUserProfileLanguages()}
if(-not $engine){throw ('沒有可用的 Windows OCR 語言，請安裝 Windows 語言辨識元件。可用語言：'+($languages -join ', '))}
$file=Await ([Windows.Storage.StorageFile]::GetFileFromPathAsync([string]$request.path)) ([Windows.Storage.StorageFile])
$stream=Await ($file.OpenAsync([Windows.Storage.FileAccessMode]::Read)) ([Windows.Storage.Streams.IRandomAccessStream])
try{$decoder=Await ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)) ([Windows.Graphics.Imaging.BitmapDecoder]);if($decoder.PixelWidth -gt [Windows.Media.Ocr.OcrEngine]::MaxImageDimension -or $decoder.PixelHeight -gt [Windows.Media.Ocr.OcrEngine]::MaxImageDimension){throw '圖片超過 Windows OCR 尺寸上限'};$bitmap=Await ($decoder.GetSoftwareBitmapAsync([Windows.Graphics.Imaging.BitmapPixelFormat]::Bgra8,[Windows.Graphics.Imaging.BitmapAlphaMode]::Premultiplied)) ([Windows.Graphics.Imaging.SoftwareBitmap]);try{$result=Await ($engine.RecognizeAsync($bitmap)) ([Windows.Media.Ocr.OcrResult]);@{text=$result.Text;language=$engine.RecognizerLanguage.LanguageTag;languages=$languages}|ConvertTo-Json -Depth 4 -Compress}finally{$bitmap.Dispose()}}finally{$stream.Dispose()}`;
async function recognize(filename,{language='',platform=process.platform,run=execFile}={}){
 if(platform!=='win32')throw Error('離線 OCR 需要 Windows 10／11 及已安裝的 OCR 語言元件');if(language&&!/^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/i.test(language))throw Error('OCR 語言代碼無效');assertLocalPath(filename);
 if(!/\.(png|jpe?g|bmp|gif|webp)$/i.test(filename))throw Error('請選擇 PNG／JPG／BMP／GIF／WebP 圖片');const bytes=readStableBytes(filename,{maxBytes:25*1024*1024,label:'OCR 圖片'}),folder=fs.mkdtempSync(path.join(os.tmpdir(),'bfs-ocr-')),snapshot=path.join(folder,'image'+path.extname(filename));
 try{fs.writeFileSync(snapshot,bytes,{flag:'wx',mode:0o600});return await new Promise((resolve,reject)=>{const child=run(path.join(process.env.SystemRoot||'C:\\Windows','System32','WindowsPowerShell','v1.0','powershell.exe'),['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(SCRIPT,'utf16le').toString('base64')],{windowsHide:true,timeout:30000,maxBuffer:2*1024*1024,encoding:'utf8'},(error,stdout,stderr)=>{if(error){reject(Error('Windows OCR 未完成：'+String(stderr||error.message).slice(0,1000)));return;}try{const data=JSON.parse(stdout.trim());if(typeof data.text!=='string'||data.text.length>100000)throw Error('OCR 結果格式或長度無效');resolve({...data,source:filename});}catch(error){reject(error);}});child.stdin.on?.('error',()=>{});child.stdin.end(JSON.stringify({path:snapshot,language}));});}finally{fs.rmSync(folder,{recursive:true,force:true});}
}
module.exports={recognize,SCRIPT};
