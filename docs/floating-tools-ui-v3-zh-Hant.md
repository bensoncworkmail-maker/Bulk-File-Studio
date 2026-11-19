# Floating Tools UI 修復 V3 — v1.134.0

日期：2026-11-19。基準為 main `74ac962`（v1.133.0），實作分支 `fix/floating-tools-ui-v3`，未合併 main。

## 實作與根因

已讀取修正包兩份 Markdown、HTML 的完整樣式／互動腳本及三張 CURRENT 問題圖，並以正式 Electron `src/main.js → src/floating.html → src/floating.js` 的載入路徑修復。HTML 原型的本機瀏覽受環境限制，未完成原型互動操作；下方圖片及操作結果均來自修改後的正式 Electron 程式。

| 問題圖 | 原型目標 | 原因與正式模組修正 |
|---|---|---|
| CURRENT_01：B 旁有捲動箭頭、空白 | 58px 圓形 B，收合不掛出完整面板 | 舊 56px native content 小於按鈕加邊框／padding，入口又設 `overflow:auto`。`floating-layout.js` 統一 DIP 尺寸；`floating-window.js` 使用 content bounds；Renderer 收合時隱藏完整 `workspace-panel`，native 為 64×64、B 為 58×58。 |
| CURRENT_02：頂部舊捷徑與側列競爭、側列捲動 | 窄入口與 Quick Panel 分開 | 舊絕對定位列塞進整窗 flex body，原控制列的 inline 負 order 仍優先。改為明確面板容器及共享幾何；入口 60×410，面板相隔 12 DIP；`layout-editor.js` 在現代模式保留正確標題→分頁→檔案控制→清單順序。 |
| CURRENT_03：底列與面板黏合、圖示被擠出 | 獨立水平 Dock，面板在上方 | Dock 用水平專用幾何及 410×60 border-box，收合 native 418×68；依 Electron workArea 停駐，面板與 Dock 保持 12 DIP 間距。小工作區不足時保留「更多工具」，不裁掉後面的操作。 |

Main 與 Renderer 共用相同尺寸來源，沒有將畫面縮入小窗後只隱藏 scrollbar。CSS 僅對有明確尺寸的面板外框處理圓角裁切，入口列不再建立捲動容器；主要內容清單、必要的長選單／設定對話框可捲動。

`BrowserWindow` 改為透明無框 content 視窗、關閉厚框，首次 ready-to-show 才顯示。可見面板及入口共用一個原生視窗，以透明間距分隔；不是增加第二個 launcher。已釘選工具仍由原 registry 管理。

## 使用方式與保留功能

- 「設定 → 浮動工具 → 浮動工具入口」，或浮窗 ⚙，可切換傳統、側邊、Dock、懸浮球。Dock 保留四邊及點擊／懸停設定。
- B 可展開／收合；懸浮球可直接拖曳 B，拖動後不觸發展開或標題雙擊功能。面板標題與入口空白邊緣也可拖曳。
- 頂部 📌 是固定 Quick Panel 展開；↗ 將目前工具獨立開啟；⚙ 開設定；× 收合。
- 新的 ⋯「更多操作」保留原有置頂、專注、主視窗、工作情境、草稿筆記、自訂快捷動作及標題右鍵選單。舊動作執行後關閉次級選單，避免收合後留下 modal。原 DOM、事件及設定仍重用。
- 傳統模式保留舊版面及自訂控制順序；切回時原有控制節點放回原位置。現代分頁換行，不產生第二條標題水平 scrollbar。
- 工具被設定為「獨立釘選」或「只在主程式」時，入口沿用原有路由；停用的 Quick 工具在「更多」內也維持停用。
- 入口位置額外保存在原 `desktop-state.json` 的 `windows.floating.launcherBounds`，是可選欄位；舊設定照常讀取。展開尺寸與收合位置分開，避免角落收合後重啟被展開尺寸擠走。
- 修正 `desktop-context-ui.js` 在浮動頁自動建立第二個桌面元件的問題；浮動情境只經既有 `floating-tool-data/action` adapter 初始化，未放寬 IPC 驗證。
- 日曆月份欄保留日期選擇器及完整月份文字；統一搜尋後隱藏原搜尋欄的整個空容器，避免留下空白 flex 欄。

既有有限次 Pin 修復、目標視窗驗證、複製／貼上結果區分、快捷鍵註冊、草稿圖片／附件機制及業務資料來源保持原流程。Everything 維持獨立頁，收藏仍有檔案與工作區兩分頁。沒有新增依賴、雲端服務或業務資料庫遷移。

## 正式應用程式截圖

環境：Linux 原生桌面、Electron 45.1.0，正式原始碼啟動，v1.134.0。使用這個測試環境原有的空資料，不注入原型的示範項目。日曆顯示系統目前月份；月份控制文字語系由作業系統提供。截圖直接擷取原生應用程式視窗，未重畫 UI。

| 模式 | 實際截圖 | 相對 CURRENT 的差異 |
|---|---|---|
| Orb 收合 | [orb.png](screenshots/floating-ui-v3/orb.png) | 64×64 native content，完整圓形 B；沒有箭頭、白色區域或旁邊被裁切工具。 |
| 側邊列＋Quick Panel | [side.png](screenshots/floating-ui-v3/side.png) | 標題與分頁在上方，舊快捷列移至 ⋯；側列與面板分開，按鈕完整。 |
| 底部 Dock＋Quick Panel | [dock.png](screenshots/floating-ui-v3/dock.png) | 水平 8 個入口完整，面板在上方並有透明間距。 |
| Dock 收合（補充） | [dock-collapsed.png](screenshots/floating-ui-v3/dock-collapsed.png) | 418×68，所有入口仍可見、沒有捲動控制。 |

與原型的保留差異：沿用應用程式主題 token、真實工具內容與既有快捷鍵（Esc 保留原本隱藏行為）；沒有移植假桌面／假 Taskbar／假資料。透明間距不代表 Windows 原生模糊玻璃效果。Launcher／Quick Panel 為同一個 native content window 的分離表面，獨立工具另有唯一視窗。

## UI-01 至 UI-12 驗收

「Linux 實測」不等於 Windows 驗收。單元測試的 fake BrowserWindow／DOM 不代表實際瀏覽器 layout 測試；本次另以原生 Electron 逐項檢查可操作畫面。

| ID | 結果 | 已做驗證與限制 |
|---|---|---|
| UI-01 | Linux 實測通過 | B-only 64×64；由 B 拖動 140×80 DIP，保持收合且沒有捲動控制。 |
| UI-02 | Linux 實測通過 | B 點擊展開，面板 × 收合，再展開正常，內容不塞在小窗。 |
| UI-03 | Linux 實測通過 | 側列與日曆面板分開；標題、工具列無捲動箭頭；⋯ 可找到原有快捷動作。 |
| UI-04 | Linux 實測通過；Windows Taskbar 未實測 | Dock 展開 500×600、收合 418×68；原生視窗底部保持在目前桌面邊界，面板上方間隔正確。四邊／workArea 有自動測試。 |
| UI-05 | Linux 實測通過 | Orb、Side、Dock 循環切換與重新載入，未見重複 launcher；獨立情境面板切換後仍存在。 |
| UI-06 | Linux 入口／載入通過；完整業務操作部分未實測 | 六種真實工具均開啟；日曆月份正確、草稿及收藏讀取原清單、情境初始化錯誤已消除；⋯ 與浮窗設定可操作。Windows Everything 執行及有資料的全流程未實測。 |
| UI-07 | 部分 Linux 實測＋自動測試 | 情境獨立面板開啟及模式切換不關閉已檢查；有限次置頂修復、pin/blur/registry 回歸通過。Windows 層級、UAC、子選單／全螢幕未實測。 |
| UI-08 | 自動測試通過；Windows 貼上未實測 | await 剪貼簿、複製／貼上不同結果、無效／競爭目標保護回歸通過；本次未宣稱跨程式貼上實機通過。 |
| UI-09 | Linux 重啟實測＋自動測試通過 | 新版 B 拖至 (1126,515)，重啟再叫出仍在同座標；模式、收合及分頁偏好保留。獨立工具恢復／唯一性沿用 registry 測試；實機未啟用自動恢復選項。 |
| UI-10 | 幾何自動測試通過；實體 DPI／雙螢幕未實測 | 100/125/150% 的 DIP 尺寸案例、四邊停駐、螢幕移除、內容尺寸來源、角落重啟等測試通過。不能據此宣稱 Windows 實際縮放或負座標顯示器驗收通過。 |
| UI-11 | 自動回歸通過，Linux 工具入口實測 | 全套包含草稿附件順序、收藏、工作情境、日曆、常用文字與 Everything 測試；Windows 檔案／外部程式／快捷鍵全流程未實測。 |
| UI-12 | 已交付 | 三種模式及補充 Dock 收合的真實 Electron 截圖見上表；Windows 截圖未提供。 |

## 測試及建置

- `npm test`：1,254 項通過、0 失敗；包括既有 P0 Pin/Paste/Focus 測試。
- `node --test tests/floating-header.test.js tests/floating-workspace-ui.test.js tests/floating-layout.test.js tests/floating-window.test.js tests/layout-and-menus.test.js`：43 項通過。
- `npm run audit:functions`／`npm run check:app`：237 來源、11 頁面、11 工具、29 功能目錄入口、273 設定。
- `npm run changelog`、`npm run guide`：已同步；`git diff --check` 通過。
- `npm run dist:win`：依賴檢查及 Windows 程式封裝完成，製作安裝／可攜檔失敗。環境為 Linux，原始錯誤 `spawn wine ENOENT`；未提供可交付的最終 Setup／Portable，須在 Windows 重新建置。

P0 的 UI 修復已實作；Windows 專屬驗收仍有上述待實測項。P1 統一跨資料搜尋、入口拖放新流程、剪貼簿轉換、迷你預覽等本次未新增；原有已存在能力保留。

## 完整變更檔案

| 檔案 | 用途 |
|---|---|
| `CHANGELOG.md` | 版本、說明、驗收或產生的指南／盤點 |
| `README.md` | 版本、說明、驗收或產生的指南／盤點 |
| `docs/app-function-audit.md` | 版本、說明、驗收或產生的指南／盤點 |
| `docs/floating-tools-ui-v3-zh-Hant.md` | 版本、說明、驗收或產生的指南／盤點 |
| `docs/screenshots/floating-ui-v3/dock-collapsed.png` | 實際 Electron 原生視窗截圖 |
| `docs/screenshots/floating-ui-v3/dock.png` | 實際 Electron 原生視窗截圖 |
| `docs/screenshots/floating-ui-v3/orb.png` | 實際 Electron 原生視窗截圖 |
| `docs/screenshots/floating-ui-v3/side.png` | 實際 Electron 原生視窗截圖 |
| `docs/user-guide-zh-Hant.html` | 版本、說明、驗收或產生的指南／盤點 |
| `package.json` | 版本、說明、驗收或產生的指南／盤點 |
| `src/desktop-context-ui.js` | 防止嵌入情境重複初始化 |
| `src/desktop-state.js` | 相容保存可選入口 bounds |
| `src/floating-header.js` | B 拖曳、點擊及雙擊保護 |
| `src/floating-layout.js` | 共享 DIP 尺寸、面板間距及溢出槽位 |
| `src/floating-window.js` | content bounds、模式尺寸及入口座標 |
| `src/floating-workspace-ui.js` | 獨立面板容器、更多選單、模式／拖曳狀態 |
| `src/floating-workspace.css` | 入口與面板佈局、內容捲動及日曆欄位 |
| `src/floating.html` | 正式 renderer 容器及共享幾何載入 |
| `src/layout-editor.js` | 現代／傳統模式控制順序 |
| `src/main.js` | 透明 content BrowserWindow 與首次顯示 |
| `src/release-history.js` | 版本、說明、驗收或產生的指南／盤點 |
| `src/user-guide-model.js` | 版本、說明、驗收或產生的指南／盤點 |
| `tests/floating-header.test.js` | 回歸測試／測試環境 API |
| `tests/floating-layout.test.js` | 回歸測試／測試環境 API |
| `tests/floating-window.test.js` | 回歸測試／測試環境 API |
| `tests/floating-workspace-ui.test.js` | 回歸測試／測試環境 API |
| `tests/layout-and-menus.test.js` | 回歸測試／測試環境 API |
| `tests/main.test.js` | 回歸測試／測試環境 API |

Git 審閱：本分支的 commit／PR 保留全部實際程式與截圖，可用 `git diff main...fix/floating-tools-ui-v3` 檢閱。未修改 main，未重設業務資料。
