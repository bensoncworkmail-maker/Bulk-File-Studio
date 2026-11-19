# Floating Tools 2.0：P0 實作與驗收報告

版本：v1.133.0；日期：2026-11-19。依使用者提供的 ZIP 中 `WORK_MODE_FLOATING_TOOLS_2_INSTRUCTIONS.md`、`bulk_file_studio_floating_tools_2_prototype.html` 及靜態預覽實作。所有程式均接入正式 Electron 載入路徑；沒有另建示範資料庫。

## Baseline audit

開始時為乾淨的 main，基準提交 `4c820f8`、版本 v1.132.0、Electron 45.1.0。沒有找到 AGENTS.md；沿用 README、既有 scripts、狹窄 preload 及 IPC 來源核對。已閱讀附件指示、HTML 全部分頁／模式／設定／Pin 的腳本與預覽。

| 項目 | 原有狀態 | 本次處理 |
| --- | --- | --- |
| 入口模式 | 已有四種入口外形，但 Dock 未停駐邊緣 | 保留傳統模式，重排三種新模式，增加四邊停駐及點擊／懸停 |
| 工具分頁 | 文字、日曆、剪貼文字、檔案已有；情境／草稿只是入口 | 六分頁接回既有服務；草稿分頁顯示原草稿並開啟同一編輯器 |
| 獨立面板 | 文字與日曆共用視窗，Pin 會連帶置頂 | 每工具唯一實例，固定與置頂分開，保存布局並可選恢復 |
| Pin | 已有 desired 偏好與 native 同步，但無失敗總預算 | 有限次恢復、診斷、健康狀態不重排、顯示器事件統一恢復 |
| 貼上 | 有 Windows 目標驗證與常駐 helper | 等待剪貼簿寫入、外部目標競爭／過期保護、明確分開結果 |
| Everything／收藏／附件 | 追蹤獨立頁、收藏兩分頁、UUID 流水號附件 | 保留，不另改主程式資訊架構及儲存格式 |
| 原型假資料及模擬開關 | 無業務實作 | 不搬入；沒有把假日曆、客戶、剪貼紀錄當成完成 |

**原型互動驗證限制：** 曾嘗試以瀏覽器開啟已解壓的本機 HTML，但安全政策拒絕 `file:` 協定；依規則沒有改用繞過方式。因此未實際點擊原型，也沒有本次正式畫面的前後截圖／影片。提供的 PNG 僅作參考，不當成正式程式驗收截圖。

## 實作摘要與操作

### Quick Panel 與六個工具

新模式採右側圖示列、標題／固定／設定／收合、橫向六分頁、搜尋與卡片內容的層次；沿用主題、字體及色彩 token。固定展開有獨立狀態，不代表保持置頂。傳統模式保留舊控制列及檔案操作。

- **常用文字**：原資料、分類、搜尋與複製保留，增加明確的貼上操作；沿用既有目標核對及快捷鍵。
- **剪貼簿**：重用 v1.132.0 的手動文字擷取服務，僅本次執行、最多 20 項；不背景監聽、不寫磁碟。搜尋、複製、移除及清空均為真實操作。
- **工作情境**：重用原有 renderer factory、context state、切換 lease、資源 token、參數預覽及持有編輯保護。切換分頁前確認未完成輸入；未完成編輯時不能改變顯示位置。
- **檔案**：快捷面板保留原收藏／工作區操作；獨立面板可搜尋收藏、開啟、定位、複製路徑，及前往獨立 Everything 頁。獨立清單顯示篩選後前 100 項，完整管理仍在我的收藏。
- **日曆**：重用原月曆、日期標記、提醒與紀錄服務。
- **草稿**：讀取同一份草稿清單，新增／開啟時使用同一個草稿編輯器，先儲存目前內容再選取指定草稿；附件、順序與來源操作不另造一套。

搜尋框搜尋目前工具內容，不宣稱已實作跨全部資料來源的 Unified Search。工作情境保留原下拉選取與資源操作，其參數欄位不會被一般搜尋改寫。

### 各工具的顯示位置

「設定 → 浮動工具 → Floating Workspace 2.0」或浮窗內齒輪，可逐工具選：快捷面板／獨立釘選／只在主程式，另可設定獨立面板置頂與透明度。

獨立面板依工具 ID 去重；文字及日曆各有自己的視窗。固定開啟、置頂、顯示、收合、DIP bounds、顯示器 ID、透明度分別保存。面板可拖曳、調整尺寸、收合、最小化及關閉；關閉會移除該視窗，下次開啟只建立一個新實例。真正結束應用程式時保留可恢復狀態；恢復開關預設關閉，啟用後最多恢復每工具一個視窗。

「只在主程式」依原有功能前往收藏、日曆、情境包、參數範本；剪貼文字與草稿清單在主程式對話面板顯示，草稿編輯仍重用原編輯器。沒有平行業務資料。

切換入口模式不關閉其他獨立面板。重新取得焦點或按重新整理會讀取同一資料來源；草稿、收藏及情境變更亦會通知相應面板。

### Dock／懸浮球

Dock 可選上、下、左、右，以 display `workArea` 停駐，不覆蓋工作列；預設底部，對齊原型橫向 Dock。可點擊／懸停展開。自動收合隱藏展開內容，保留可操作入口；不保留 Windows 工作區，也不偽裝成系統工作列。懸浮球可拖曳及懸停／點擊展開。

顯示器新增、移除、DPI／工作區變動共用一個可取消的 debounce；修正浮動工作台、獨立工具、桌面情境及草稿編輯器的可見範圍。使用 Electron DIP，不手動重複乘上縮放比例。

## P0 穩定性

- **Pin 單一來源**：所有工具經 `FloatingPin` 讀取 desired 與 actual。普通 focus／blur 不強制提升健康視窗；每輪最多一次追加確認，連續三輪失敗後停止背景嘗試並記錄診斷。明確 show／restore／display recovery 可重新開始有限預算；不呼叫 focus 搶回使用者焦點。
- **貼上**：等待 `clipboard.writeText` 完成才送出鍵盤貼上；避免首次／非同步寫入時貼到舊內容。複製失敗不宣稱成功；複製成功但貼上失敗保留文字並提示 Ctrl+V。外部目標擷取有版本、60 秒期限及 quit 失效保護；沿用 HWND／PID／helper epoch／前景與修飾鍵檢查，沒有放寬受保護目標限制。
- **快捷鍵**：沿用註冊衝突與原設定回滾，增加重新註冊入口；保留原有快捷動作。
- **外部選單**：沿用原生選單的 close completion、blur 延遲及非啟用式文字選擇窗；自動收合不關閉正在使用的原生選單或未完成情境編輯。
- **生命週期**：同一工具只保留一個活實例；關閉、quit、timer、screen subscription 及 Pin interval 有對應清理，避免隱藏視窗令程式無法正常結束。

## 設定遷移與資料保護

新增 `floatingToolLayout` 只保存顯示 metadata，不修改 SQLite 紀錄、草稿、附件、收藏、Everything 搜尋或共享資料。舊設定沒有每工具置頂值時繼承原 floatingOnTop；有明確設定時各自保存。浮動分頁 metadata 升至版本 2，加入先前不存在的情境與草稿；既有明確關閉全部分頁的偏好保留。原入口模式、主要資料及舊附件仍可讀取。

沒有刪除用戶資料、重設設定或 force-push。若回退程式版本，原資料仍由舊服務讀取；新增顯示 metadata 可被忽略，備份仍使用原有機制。正式升級前仍可用原備份功能保留設定副本。

## 第 7 節逐項驗收

| 驗收條件 | 程式與自動驗證 | 實機狀態 |
| --- | --- | --- |
| 三模式可操作，切換不遺失獨立面板 | 已實作；模式／bounds／面板去重測試 | Windows 待驗 |
| 六工具讀取真實資料 | 已實作；canonical service／IPC 測試，剪貼簿採手動文字階段 | Windows 待驗 |
| 每工具顯示位置及跨重啟保存 | 已實作；normalize、UI、layout restore 測試 | Windows 重啟待驗 |
| 拖動、尺寸、關閉、收合、Pin，無重複視窗 | 已實作；視窗管理、唯一實例及位置測試 | 原生拖曳待驗 |
| Pin 不被普通 blur／主程式切換清除 | 已實作；desired／actual、有限預算測試 | 原生層級待驗 |
| 未固定外部選單失焦關閉，自身按鈕不誤關閉 | 保留既有機制；選單與 idle-collapse 回歸 | 跨程式點擊待驗 |
| 首次快捷貼上、複製與貼上分別回報 | 非同步順序、冷 helper、連續操作與錯誤測試通過 | 首次 Windows 貼上未實測 |
| 無效目標不誤貼、保留剪貼簿 | 保留 native 驗證；模擬無效目標及 helper 測試 | UAC／管理員欄位未實測 |
| 重啟、螢幕／DPI 改變後可見 | display debounce、workArea、移除螢幕及恢復測試 | 實際 DPI／RDP 未實測 |
| 舊文字、日曆、情境、草稿、收藏保留 | 全套回歸；未另建業務資料 | 用戶實際資料待驗 |
| Everything 獨立、收藏兩分頁 | 保持既有架構及相關回歸 | 無另改資訊架構 |
| 可重現報告、限制明列 | 本文件及測試檔案 | 有限項明列 |
| 修改真正應用程式 | src／preload／IPC／設定／正式載入頁均已修改 | 非 HTML Demo |

## 測試及建置限制

測試命令：`npm test`、`npm run check:app`、`node build/update-changelog.js --check`、兩份離線指南的 `--check`、`git diff --check`。執行結果於本報告末補記。

`npm run check:deps` 及 `npm run dist:win` 的 predist 階段失敗，原始訊息：

```text
Build/start dependencies are missing, outdated or incomplete:
  - jszip: not installed in this project
  - xml-js: not installed in this project
  - electron: not installed in this project
  - electron-builder: not installed in this project
Run: npm install --include=prod --include=dev
```

未產生 EXE，沒有發生 Electron 下載逾時，也沒有宣稱建置成功。在 Windows 建置電腦依原有 scripts 執行：`npm install --include=prod --include=dev`，再執行 `npm test`、`npm run check:app` 及 `npm run dist:win`。需核對安裝版與 Portable 的首次啟動、重啟、100／125／150% DPI、螢幕移除、RDP、一般與管理員權限目標。

## P1 待辦與已知界線

本次不擴充跨來源 Unified Search、入口拖放後的多種寫入動作、Clipboard Transform、額外 Mini Preview 或新多步 Workflow Quick Actions。Everything 原文語法、既有搜尋／預覽／批次操作仍保留。原型的全螢幕應用自動隱藏、遠端桌面自動偵測及每螢幕多組位置歷史尚未實作；目前保存每面板一組 DIP bounds 與顯示器 ID，並在變動時移回可見範圍。

一般權限無法保證蓋過所有遊戲、管理員視窗或 UAC；程式不承諾對受保護輸入欄位自動貼上成功。對這些目標會使用明確的複製／手動貼上備援。

官方參考：[Electron screen](https://www.electronjs.org/docs/latest/api/screen)、[BrowserWindow](https://www.electronjs.org/docs/latest/api/browser-window)、[globalShortcut](https://www.electronjs.org/docs/latest/api/global-shortcut)、[安全實務](https://www.electronjs.org/docs/latest/tutorial/security)。

## 執行結果

- `npm test`：1,240 項通過、0 失敗。
- `check:app`：236 個來源、11 頁、11 個工具、29 個功能目錄項目、273 個設定，通過。
- 更新紀錄、兩份離線指南一致性及 Git whitespace 檢查通過。
- Windows build／桌面／RDP／原型瀏覽器操作的未實測項如上；沒有把模擬測試當成 Windows 實機結果。

## 完整修改清單

| 檔案 | 作用 |
| --- | --- |
| `CHANGELOG.md` | 版本、更新紀錄與指南 |
| `README.md` | 版本、更新紀錄與指南 |
| `docs/app-function-audit.md` | 操作、盤點、驗收或離線指南 |
| `docs/floating-panels.md` | 操作、盤點、驗收或離線指南 |
| `docs/floating-tools-p0-v1.133.0-zh-Hant.md` | 操作、盤點、驗收或離線指南 |
| `docs/function-map-zh-Hant.md` | 操作、盤點、驗收或離線指南 |
| `docs/user-guide-zh-Hant.html` | 操作、盤點、驗收或離線指南 |
| `package.json` | 版本、更新紀錄與指南 |
| `src/desktop-context-actions.js` | 工作集確認使用實際呼叫視窗 |
| `src/desktop-context-ui.js` | 容許原 renderer factory 安全嵌入 |
| `src/desktop-state.js` | 設定遷移、預設值與持久化 |
| `src/draft-notes-preload.js` | 狹窄 IPC bridge，維持 context isolation |
| `src/draft-notes-ui.js` | 先儲存原內容，再選取浮窗要求的草稿 |
| `src/floating-context.css` | 重用情境元件的樣式範圍 |
| `src/floating-displays.js` | 顯示器事件合併與清理 |
| `src/floating-main-tool.js` | 主程式草稿清單／剪貼文字對話面板 |
| `src/floating-panels-model.js` | 六工具與分頁 metadata 遷移 |
| `src/floating-panels.js` | 六分頁生命週期、顯示位置路由及編輯保護 |
| `src/floating-pin.js` | desired／actual、有限預算及診斷 |
| `src/floating-tool-layout.js` | 每工具顯示 metadata 與嚴格驗證 |
| `src/floating-tool-panel.html` | 正式獨立面板載入頁與安全政策 |
| `src/floating-tool-panel.js` | 獨立面板 Pin／置頂／收合／最小化／關閉 |
| `src/floating-tool-views.js` | canonical 情境、草稿、收藏及剪貼文字 view factory |
| `src/floating-tools-settings.js` | 主程式與浮窗共用設定編輯器 |
| `src/floating-window.js` | Dock 四邊、DIP bounds、可見範圍及入口尺寸 |
| `src/floating-workspace-ui.js` | 原型入口、標題、搜尋、固定與設定互動 |
| `src/floating-workspace.css` | 原型視覺層次、模式、獨立面板及設定樣式 |
| `src/floating-workspace.js` | 狹窄設定／工具操作與固定展開 |
| `src/floating.html` | 正式浮動工具六分頁元件載入 |
| `src/floating.js` | 分頁重新取得資料、設定對話框鍵盤保護 |
| `src/index.html` | 正式主程式設定與工具清單對話框 |
| `src/main.js` | 接線、來源核對、canonical 工具資料、設定、恢復與生命周期 |
| `src/paste-target-session.js` | 外部貼上目標擷取、競爭、過期及 quit 保護 |
| `src/preload.js` | 狹窄 IPC bridge，維持 context isolation |
| `src/productivity-ipc.js` | 等待複製完成再貼上，分開回報結果 |
| `src/release-history.js` | 版本、更新紀錄與指南 |
| `src/settings-catalog.js` | 新增設定控制項及分類 |
| `src/tool-overlay-preload.js` | 狹窄 IPC bridge，維持 context isolation |
| `src/tool-overlay.html` | 原有獨立日曆／文字頁樣式接入 |
| `src/tool-overlay.js` | 按工具唯一視窗、獨立狀態、關閉與啟動恢復 |
| `src/tool-views-ui.js` | 真實貼上及每面板獨立控制 |
| `src/user-guide-model.js` | 版本、更新紀錄與指南 |
| `tests/floating-panels.test.js` | 回歸／驗收測試或更新受影響的行為預期 |
| `tests/floating-tools-p0.test.js` | 回歸／驗收測試或更新受影響的行為預期 |
| `tests/floating-tools-settings-ui.test.js` | 回歸／驗收測試或更新受影響的行為預期 |
| `tests/floating-window.test.js` | 回歸／驗收測試或更新受影響的行為預期 |
| `tests/floating-workspace-ui.test.js` | 回歸／驗收測試或更新受影響的行為預期 |
| `tests/main.test.js` | 回歸／驗收測試或更新受影響的行為預期 |
