# 應用程式功能與模組盤點

版本：v1.153.0。以 `npm run audit:functions` 重新產生。

讀取 src 全部 250 個 JS／HTML／CSS 檔案；核對 13 個頁面、9 個工具入口、30 項功能導覽與 235 個介面／桌面偏好。

## 盤點與整合結果

- 工作集可從工具箱直接開啟，並可使用檔案和資料夾選擇器。情境包與桌面情境入口已移除，舊流程資料保留供相容讀取與備份。
- 查看紀錄浮窗保留失焦前的內容，每筆釘選對應獨立桌面便條。資料工作區、Everything 追蹤及我的收藏共用便條管理。背景色、展開／收合尺寸、標題握把、標題欄位及釘選來源可從設定調整。便條支援整條標題列拖曳及雙擊、具名標籤與草稿釘選、內文標題導航和附件表格的單擊／雙擊開啟與定位。浮動快捷列與設定共用全部顯示、隱藏、展開、收合；隱藏時保存位置及釘選。常用文字外部分類選擇窗支援方向鍵。ZIP 一般解壓可沿用 Everything 快照開啟或定位檔案。草稿移除附件只解除連結。
- Everything 排序由共用驗證模型管理，按追蹤 ID 保存欄位、方向與各欄位上次方向；欄位隱藏時暫用名稱排序，不刪除原偏好。
- 追蹤定時更新、選取與批次操作共用可收合工具列，啟動立即還原狀態並保留更新摘要、已選數量、所選項目選單、右鍵與快捷鍵，收合狀態納入偏好還原／匯出。
- 一般收藏既有排序由 favoriteSort／favoriteDirection 保存；工作區由 notes-table-state 管理表格版面與篩選；查看紀錄由 log-view-settings-model 管理各範圍篩選／排序歷史，沒有另建平行資料來源。
- Everything 僅建立可見結果欄的 DOM 與格式文字；局部偏好更新避免重複重建結果，隱藏欄資料仍保留於同一快取。
- 查看紀錄主視窗／浮窗共用標題與空白處展開／收合行為，提醒與前往工作區置於詳情內，保留文字選取；追蹤暫停沿用 trackingSave，表格複製沿用結果版本與檔案身分核對，不新增平行資料來源。
- 新手指南共用 18 章內容來源，六項學習進度獨立保存；Ctrl+K 功能搜尋沿用首頁功能導覽與原有入口，F1 開啟指南，兩個按鈕位於資訊頁以精簡頂端；紀錄瀏覽將搜尋、篩選與檢視分開，條件標籤及快速日期共用原查詢與記憶。check:app 同時驗證指南版本、目標及離線產物。
- check:app 檢查頁面與快捷入口、功能目錄、工具目標、設定預設／分類／控制項、DOM ID、aria-controls 與本機依賴，錯誤會令命令失敗。

## 界線與後續驗證

本表是全部來源檔案的模組／具名函式靜態索引；匿名回呼、動態產生的函式不一定列出，並不等同逐行安全審查。既有檔案寫入預覽、版本／身分核對、來源授權及備份流程繼續使用原服務。Windows Everything 索引、Explorer、通知、全域快捷鍵、SMB、DPI 與安裝包仍需實機驗證。main.js、notes.js 與 renderer.js 的職責較多，日後應按本表邊界逐步抽離，避免一次改寫造成檔案或共享流程回歸。

[使用者功能導覽與資料歸屬](function-map-zh-Hant.md) · [UI 與資料整理紀錄](ui-settings-and-data-audit.md)

## 完整來源索引

具名函式／箭頭函式／類別方法名稱由靜態掃描產生，供定位閱讀；以來源實際定義為準。

### 工作區與共享

| 原始檔 | 函式索引／用途 |
| --- | --- |
| [notes-audit.js](../src/notes-audit.js) | `add`、`describe`、`describeField`、`fieldValue`、`importRows`、`links`、`plain`、`preserveUnchanged`、`recordChanges`、`same`、`structureChanges`、`view` |
| [notes-bulk.js](../src/notes-bulk.js) | `copies`、`edit` |
| [notes-files.js](../src/notes-files.js) | `readPackageFile`、`writePackageFile`、`writeWorkspaceFile` |
| [notes-import-files.js](../src/notes-import-files.js) | `packageImportName`、`packageImportPath`、`readImportPackageFile` |
| [notes-location-links.js](../src/notes-location-links.js) | `assertOpenableLocation`、`inspectIntranetLocation`、`inspectLinks`、`inspectLocation`、`locationError`、`locationPath`、`locationType`、`openRecordLink`、`safeLocationOpen` |
| [notes-model.js](../src/notes-model.js) | `activeSheet`、`areaCategory`、`cell`、`clean`、`clipboardText`、`clone`、`createTabular`、`date`、`deletionPlan`、`detailSheets`、`exportPackage`、`fail`、`filterDue`、`fold`、`gridValue`、`id`、`isObject`、`linked`、`live`、`masterTableTree`、`matches`、`mergeDocument`、`meta`、`missingClientDetails`、`normalizeDocument`、`parentField`、`parseCSV`、`parseDelimited`、`parseTSV`、`push`、`readPackage`、`readTabularList`、`recordContext`、`scopedRecords`、`searchRecords`、`searchable`、`sheet`、`sheetDeletionPlan`、`sidebarGroups`、`sortRecords`、`strings`、`suggestMapping`、`tabularExport`、`tabularHeading`、`tabularRows`、`template`、`text`、`unique`、`value`、`writeTabularList` |
| [notes-reference-trash.js](../src/notes-reference-trash.js) | `cleanDraftFolders`、`draftPaths`、`fileKey`、`isLegacyDraftImage`、`managedAttachmentFolder`、`protectedPaths`、`snapshot`、`trashReferences`、`under` |
| [notes-share-commit.js](../src/notes-share-commit.js) | `canonical`、`commitId`、`create`、`hash`、`scopeKey`、`validHash`、`validHead`、`validate` |
| [notes-share-profiles.js](../src/notes-share-profiles.js) | `channel`、`check`、`choose`、`close`、`completeImport`、`configure`、`conflict`、`constructor`、`create`、`emit`、`file`、`folderKey`、`ignore`、`masters`、`name`、`pause`、`publish`、`read`、`reconcile`、`scopeError`、`select`、`status`、`tick` |
| [notes-share-worker.js](../src/notes-share-worker.js) | `handle`、`packageIdentity`、`perform`、`readBounded`、`reply`、`safeFolder`、`validateFolder` |
| [notes-share.js](../src/notes-share.js) | `accept`、`accepted`、`action`、`candidate`、`check`、`choose`、`close`、`completeImport`、`configure`、`emit`、`finish`、`ignore`、`isOlderRelease`、`locallyChanged`、`publish`、`read`、`receive`、`receiveStatus`、`run`、`save`、`start`、`status`、`stop`、`tick` |
| [notes-shared-merge.js](../src/notes-shared-merge.js) | `baseline`、`canonical`、`constructor`、`contentDigest`、`describe`、`digest`、`displayValue`、`fieldHashes`、`hashes`、`identity`、`index`、`indexObject`、`matches`、`merge`、`mergeFields`、`older`、`patch`、`remoteChanged`、`sameVersion`、`structure`、`valueKey` |
| [notes-sharing-model.js](../src/notes-sharing-model.js) | `managedSheets`、`merge`、`project`、`receivingScope`、`scope`、`shareSnapshot` |
| [notes-sharing.css](../src/notes-sharing.css) | 版面、主題與互動狀態樣式 |
| [notes-sheet-change.js](../src/notes-sheet-change.js) | `apply`、`populated`、`removedColumns` |
| [notes-store.js](../src/notes-store.js) | `addTemplate`、`applyCustomTemplate`、`backup`、`batchAreas`、`batchSheets`、`batchTrash`、`bulkCommit`、`bulkPreview`、`cancelPreview`、`close`、`completeClientDetails`、`constructor`、`createDraft`、`deleteDraft`、`draft`、`draftAttachmentPaths`、`draftList`、`duplicateRecord`、`exportPreview`、`get`、`hasSharedBase`、`history`、`importDetails`、`isUNC`、`key`、`planImport`、`removeArea`、`restoreCommit`、`restoreHistory`、`restorePreview`、`saveArea`、`saveCopies`、`saveDraft`、`saveSharedBase`、`saveSheet`、`sharedBase`、`sheetCommit`、`sheetPreview`、`tabularCommit`、`tabularFileLinks`、`tabularPaths`、`tabularPreview`、`tabularPreviewIntranet`、`takePreview`、`trash`、`updateCells` |
| [notes-table-state.js](../src/notes-table-state.js) | `filter`、`normalizeFilter`、`normalizeFilters`、`normalizeViewModes`、`selection`、`statusField`、`statusOptions`、`viewGroup`、`viewKey` |
| [notes-tools-store.js](../src/notes-tools-store.js) | `bookmarkKey`、`bookmarkTags`、`change`、`cleanTemplate`、`clearStickerPins`、`constructor`、`contactText`、`get`、`manageBookmarkTag`、`normalizeTools`、`pin`、`remove`、`saveTemplate`、`saveView`、`setBookmark`、`setBookmarkTags`、`setFileStickerPin`、`setLogPin`、`view`、`workspaceItems` |
| [notes-web-links.js](../src/notes-web-links.js) | `openRecordWebsite` |
| [notes-xlsx.js](../src/notes-xlsx.js) | `add`、`content`、`decodeExcelText`、`encodeExcelText`、`excelColumn`、`excelDate`、`lname`、`parse`、`preflight`、`readSpreadsheetFile`、`readXlsx`、`relation`、`writeXlsx`、`xml` |
| [notes.css](../src/notes.css) | 版面、主題與互動狀態樣式 |
| [notes.js](../src/notes.js) | `$`、`accepted`、`action`、`activeSort`、`addLocations`、`appendCardFooterFields`、`applySearchDefault`、`applyTransfer`、`applyView`、`area`、`batchDelete`、`bindCardDragSource`、`bindCardDrop`、`bindRecordKeys`、`buildLinkPickers`、`bulkValue`、`button`、`cardFieldList`、`cardFooterFields`、`cardFooterValue`、`cardStatusField`、`changeBookmark`、`chooseRecord`、`chooseShareFolder`、`chooseSheet`、`clearBulkPreview`、`clearChecks`、`clearSearch`、`configureBulkTargets`、`configureRecordTargets`、`confirm`、`confirmDeleteEntries`、`confirmTrash`、`contextAction`、`copyRecordText`、`currentShareProfile`、`display`、`doc`、`drawCardFieldRows`、`dropPathKey`、`dropRecord`、`edit`、`editArea`、`editRecord`、`editSheet`、`el`、`ensureCurrentSheet`、`finishCardDrag`、`finishRecord`、`finishSheetSave`、`focusGrid`、`forExistingSheets`、`formOnly`、`gridDestination`、`historyTime`、`importDefaultKey`、`indexes`、`init`、`initBulk`、`initCardSettings`、`initSheetReview`、`inspectShareVersion`、`invalidateTable`、`invalidateTransfer`、`isDetail`、`list`、`loadImportFile`、`loadTableFile`、`masterSheet`、`navigate`、`navigationBlocked`、`openBulkEdit`、`openCardSettings`、`openContext`、`openDialogs`、`openGridOverview`、`openLinkPicker`、`openOrganize`、`openSearchTarget`、`openShare`、`openTabular`、`openTransfer`、`orderedCardFields`、`organizeCount`、`paintChoices`、`paste`、`pickRecord`、`picker`、`prefs`、`previewShared`、`publishCurrentShare`、`publishShare`、`recordCheckbox`、`recordClick`、`recordDirectPaths`、`refresh`、`rememberLinkChoices`、`rememberLongTextSize`、`render`、`renderArea`、`renderAreaMasters`、`renderAudit`、`renderBookmark`、`renderCardFields`、`renderCardPreview`、`renderCards`、`renderColors`、`renderCurrent`、`renderCurrentShare`、`renderDetail`、`renderDropTransfer`、`renderFields`、`renderFlatSidebar`、`renderGrid`、`renderImportHelp`、`renderMasterContext`、`renderNotePreview`、`renderPanelSummary`、`renderRecordFiles`、`renderSelection`、`renderShare`、`renderShareScopes`、`renderSharedConflicts`、`renderSidebar`、`renderStatusControls`、`renderTable`、`renderTableMapping`、`renderToolControls`、`renderToolLists`、`renderTransfer`、`renderWebsiteField`、`requestTemplate`、`resetLongTextObserver`、`resetPastedTable`、`returnToMaster`、`run`、`saveLongTextSizes`、`searchScope`、`select`、`selectArea`、`selectFilteredRecords`、`setFormTab`、`setLinkMode`、`setTableRows`、`setViewMode`、`showHistory`、`showRecordOverview`、`showSharedUpdate`、`showSheetReview`、`sidebarGroupOpen`、`sidebarMasterResults`、`sidebarSheetButton`、`snippetCustomer`、`sortHeader`、`stageRecordPaths`、`statusPatch`、`statusState`、`update`、`updateBatchPreview`、`updateRecordTargetCount`、`values`、`viewMode`、`viewModePatch`、`viewSheet`、`viewState` |
| [share-receive-ui.js](../src/share-receive-ui.js) | `$`、`init`、`render` |
| [share-view-model.js](../src/share-view-model.js) | `changed`、`filterRecords`、`identity`、`packageInfo`、`short` |
| [structured-note-model.js](../src/structured-note-model.js) | `format`、`isType`、`normalize`、`ordered`、`summary` |
| [structured-note-ui.js](../src/structured-note-ui.js) | `button`、`editor`、`insert`、`move`、`node`、`notify`、`redraw`、`updateState`、`updateSummary`、`value`、`view` |
| [structured-note.css](../src/structured-note.css) | 版面、主題與互動狀態樣式 |
### 主視窗與共用基礎

| 原始檔 | 函式索引／用途 |
| --- | --- |
| [app-help.js](../src/app-help.js) | `$`、`blocked`、`close`、`init`、`navigate`、`open`、`render`、`showFinder`、`showGuide` |
| [app-layout.css](../src/app-layout.css) | 版面、主題與互動狀態樣式 |
| [app-navigation.js](../src/app-navigation.js) | `configure`、`create`、`groupState` |
| [bounded-file-read.js](../src/bounded-file-read.js) | `readStableBytes`、`readStableBytesAsync`、`same` |
| [checkbox-migration.js](../src/checkbox-migration.js) | `convertCheckboxes` |
| [diagnostic-log.js](../src/diagnostic-log.js) | `clear`、`entries`、`escape`、`exportData`、`files`、`masked`、`prepareFolder`、`prune`、`record`、`scrub`、`settings`、`status`、`text` |
| [diagnostics-runtime.js](../src/diagnostics-runtime.js) | `report` |
| [diagnostics-settings.js](../src/diagnostics-settings.js) | `$`、`init`、`refresh`、`render`、`run` |
| [document-preview.js](../src/document-preview.js) | `allowedPreviewRequest`、`close`、`decodePreview`、`escape`、`isPreviewImage`、`previewLimit`、`previewType`、`readPreview`、`readSelectedPreview`、`show`、`showContent` |
| [function-directory.js](../src/function-directory.js) | `search` |
| [graphite-theme.css](../src/graphite-theme.css) | 版面、主題與互動狀態樣式 |
| [home-model.js](../src/home-model.js) | `name`、`recordItem`、`snapshot` |
| [home.css](../src/home.css) | 版面、主題與互動狀態樣式 |
| [home.js](../src/home.js) | `$`、`button`、`changed`、`init`、`list`、`openCustomize`、`openFeature`、`prefs`、`refresh`、`render`、`renderDirectory`、`renderDraft`、`renderLayoutControls`、`target` |
| [index.html](../src/index.html) | 視窗／頁面結構及本機資源引用 |
| [intranet-path.js](../src/intranet-path.js) | `assertIntranetPath`、`hostKey`、`isUNC`、`isValidated`、`privateAddress`、`run`、`uncServer`、`withIntranetPaths` |
| [list-pagination.js](../src/list-pagination.js) | `paginate` |
| [main.js](../src/main.js) | `actOnTool`、`actionBinding`、`actionBindings`、`applyMainBounds`、`bounded`、`bytes`、`captureController`、`checkTool`、`closeFloatingMenu`、`completeShellHandoff`、`configureDesktop`、`configuredQuick`、`confirmBatch`、`confirmTrackedBatch`、`confirmTrackedTrash`、`confirmTrash`、`createWindow`、`dropCapture`、`endShortcutRecording`、`fileOperation`、`finishRenameJob`、`floatingAction`、`floatingSearchController`、`floatingTags`、`focusMain`、`go`、`handle`、`hideFloating`、`historyFile`、`invalidateNotesImport`、`invalidateSharedImport`、`item`、`journal`、`keepFloatingAfterQuick`、`launchWithShell`、`loggedInvocation`、`menuLabel`、`monitorException`、`move`、`navigateWorkspace`、`newWorkspaceMaster`、`notesChanged`、`notesStore`、`notifyFavorites`、`openBrowserSnippet`、`openDrafts`、`openFavorite`、`openInMainWindow`、`openMainTool`、`openQuickSearch`、`openQuickToolMenu`、`openToolOverlay`、`outputDialog`、`overlayAction`、`performMovePlan`、`popupFloatingMenu`、`preparePasteWorker`、`quote`、`readHistory`、`receiveFavorites`、`recoverFloatingPins`、`registerShortcut`、`rememberAuxSize`、`renameProgress`、`reportFloatingBatch`、`reportSnippetPasteFailure`、`resolve`、`restoreDesktopStickers`、`runShortcutQuickAction`、`saveHistory`、`saveToolLayout`、`saveWorkspaceRecord`、`searchLocalData`、`secureWindow`、`send`、`sendDraftSelection`、`shareIdle`、`shellHandoffActive`、`showCategories`、`showFloating`、`showMonth`、`showStickerMenu`、`showTagMenu`、`showToolRows`、`snippetInboxFolder`、`startApp`、`stickerMenuItems`、`syncFavoriteMoves`、`toggle`、`toolsChanged`、`toolsStore`、`trackingChanged`、`undoJournalOperation`、`updateSharedNotification`、`validatedLinkPaths`、`workspaceAttachmentSheet`、`workspaceImages` |
| [menu-dismiss.js](../src/menu-dismiss.js) | `closeOutside` |
| [navigation-model.js](../src/navigation-model.js) | `normalize` |
| [navigation-settings.js](../src/navigation-settings.js) | `mount`、`render` |
| [offline-policy.js](../src/offline-policy.js) | `allowedRequest`、`assertLocalPath`、`assertSafeOpen`、`installOfflinePolicy` |
| [open-file-input.js](../src/open-file-input.js) | `openFileInput` |
| [operation-journal.js](../src/operation-journal.js) | `begin`、`complete`、`constructor`、`enqueue`、`list`、`markUndone`、`read`、`rebase`、`recover`、`undoable`、`update`、`write` |
| [operation-ui.css](../src/operation-ui.css) | 版面、主題與互動狀態樣式 |
| [operation-ui.js](../src/operation-ui.js) | `$`、`close`、`create`、`receive`、`render`、`show`、`visibilityChanged` |
| [paste-target-session.js](../src/paste-target-session.js) | `close`、`get`、`observe` |
| [preload.js](../src/preload.js) | `invoke`、`listener`、`notifyOperation` |
| [quick-actions-model.js](../src/quick-actions-model.js) | `displayOptions`、`entry`、`form`、`normalize` |
| [quick-actions-settings.js](../src/quick-actions-settings.js) | `$`、`actionButton`、`appendOptions`、`displayFields`、`dropOptions`、`edit`、`fields`、`formFields`、`init`、`masters`、`move`、`node`、`persist`、`refresh`、`render`、`renderTagChecks`、`sheet` |
| [record-browser.css](../src/record-browser.css) | 版面、主題與互動狀態樣式 |
| [release-history.js](../src/release-history.js) | 宣告、設定或共用模型 |
| [relocation-job-worker.js](../src/relocation-job-worker.js) | 宣告、設定或共用模型 |
| [relocation-job.js](../src/relocation-job.js) | `done`、`run` |
| [relocation-perform.js](../src/relocation-perform.js) | `perform` |
| [renderer.js](../src/renderer.js) | `$`、`addFromResult`、`append`、`applyFontSize`、`applyRules`、`applyTheme`、`basename`、`bind`、`bindFileSelection`、`choose`、`chooseFiles`、`chooseFolder`、`clearFiles`、`confirmRename`、`describe`、`dirname`、`dragOver`、`dropTarget`、`element`、`enqueuePreview`、`executeRename`、`executeUndo`、`expandGroups`、`exportCSV`、`filterFiles`、`getRules`、`groupHeader`、`grouped`、`init`、`initPresets`、`isFileDrag`、`moveListedSelection`、`norm`、`paintPreviewSort`、`previewOrder`、`render`、`renderFiles`、`renderSavedPresets`、`renderTable`、`renderWorkspaceControls`、`saveCollapsedLocations`、`saveRulePreferences`、`selectFiltered`、`setBusy`、`setRuleTab`、`shortDir`、`showDrop`、`showFailure`、`showToast`、`single`、`storeSavedPresets`、`undo`、`updatePreview`、`updateRuleControls`、`visibleGroupRows`、`wireEvents`、`withoutPrefix` |
| [scheduled-backup.js](../src/scheduled-backup.js) | `tick` |
| [sticker-settings.js](../src/sticker-settings.js) | `$`、`choices`、`enabled`、`init`、`pin`、`pinTag`、`refresh`、`renderCounts`、`renderHeader`、`status`、`sync` |
| [style.css](../src/style.css) | 版面、主題與互動狀態樣式 |
| [table-selection.js](../src/table-selection.js) | `add`、`begin`、`bind`、`choose`、`clear`、`control`、`create`、`editable`、`enhance`、`guard`、`modifier`、`paint`、`primary`、`range`、`reorder`、`selectAll`、`sort` |
| [theme.js](../src/theme.js) | 宣告、設定或共用模型 |
| [themes.css](../src/themes.css) | 版面、主題與互動狀態樣式 |
| [toolbox-model.js](../src/toolbox-model.js) | `get` |
| [tracking-changes.js](../src/tracking-changes.js) | `compare`、`constructor`、`identity`、`key`、`monitor`、`read`、`remove`、`seen`、`signature`、`update`、`write` |
| [upgrades.css](../src/upgrades.css) | 版面、主題與互動狀態樣式 |
| [user-guide-model.js](../src/user-guide-model.js) | `progress`、`search` |
| [user-guide-ui.js](../src/user-guide-ui.js) | `button`、`filter`、`mount`、`persist`、`update` |
| [user-guide.css](../src/user-guide.css) | 版面、主題與互動狀態樣式 |
| [web-link-model.js](../src/web-link-model.js) | `links`、`normalize`、`valid` |
| [workflow-guide-model.js](../src/workflow-guide-model.js) | 宣告、設定或共用模型 |
| [workflow-hub.css](../src/workflow-hub.css) | 版面、主題與互動狀態樣式 |
| [workflow-hub.js](../src/workflow-hub.js) | `args`、`button`、`canLeave`、`chosen`、`conditions`、`detail`、`discardChanges`、`disclosure`、`doc`、`draw`、`el`、`explanations`、`fields`、`go`、`input`、`invalidate`、`isVisible`、`message`、`mount`、`ocr`、`open`、`output`、`paint`、`render`、`renderGuide`、`rules`、`run`、`section`、`select`、`selectionContext`、`sheets`、`snippets`、`sourceTools`、`trackEditor`、`tracking`、`watch` |
| [workflow-ipc.js](../src/workflow-ipc.js) | `ensure`、`registerWorkflow` |
| [workflow-model.js](../src/workflow-model.js) | `condition`、`definition`、`evaluate`、`expand`、`id`、`ids`、`legacyRule`、`parameters`、`text`、`values` |
| [workflow-service.js](../src/workflow-service.js) | `close`、`constructor`、`remember`、`select`、`selection`、`snippet`、`state`、`take`、`token` |
| [workflow-store.js](../src/workflow-store.js) | `change`、`constructor`、`empty`、`normalize`、`read` |
| [workspace-images-ui.js](../src/workspace-images-ui.js) | `create`、`displayImage`、`figure`、`gallery`、`node`、`paste`、`render`、`reset`、`showFrame`、`step`、`zoom` |
| [workspace-images.js](../src/workspace-images.js) | `bytes`、`constructor`、`prepare`、`read`、`sheetFolder`、`withImages`、`workspaceFilesRoot` |
| [workspace.css](../src/workspace.css) | 版面、主題與互動狀態樣式 |
| [zip-batch-ui.js](../src/zip-batch-ui.js) | `$`、`addSources`、`appendOutputs`、`button`、`clearPasswords`、`columns`、`controls`、`create`、`describeMode`、`extend`、`fileCell`、`invalidate`、`isZip`、`key`、`node`、`on`、`onTrackingKey`、`passwordFor`、`previewSources`、`query`、`recycle`、`rememberSelection`、`renderHeaders`、`renderPreview`、`renderResult`、`renderSources`、`renderTracking`、`resetSelection`、`restoreSelection`、`selectClick`、`selectRows`、`settings`、`sort`、`sourceSort`、`syncTarget`、`syncTracking`、`toggle`、`trackingRows`、`trackingSummary`、`update` |
| [zip-update-browser.js](../src/zip-update-browser.js) | `check`、`clear`、`inside`、`parent`、`read`、`resolve`、`snapshot` |
| [zip-update-ipc.js](../src/zip-update-ipc.js) | `batchSources`、`batchTargetState`、`choose`、`existing`、`index`、`loadZip`、`menuEntry`、`open`、`readLocation`、`refreshLocations`、`register`、`setBatchTarget`、`state`、`target`、`validateBatchTarget` |
| [zip-update-tree.js](../src/zip-update-tree.js) | `build`、`compare`、`flatten`、`page`、`values` |
| [zip-update-ui.js](../src/zip-update-ui.js) | `$`、`activateMode`、`askPassword`、`bindEntryMenu`、`bindPanelResize`、`brief`、`browserRows`、`chooseCompare`、`compare`、`compareMembers`、`compareSelection`、`controls`、`coordinate`、`currentRows`、`hideDrop`、`invalidate`、`isFileDrag`、`jump`、`makeTree`、`members`、`node`、`on`、`options`、`persistView`、`refresh`、`refreshLocations`、`render`、`renderBrowser`、`renderComparison`、`renderHistory`、`renderPanelSize`、`renderResults`、`renderTargetOptions`、`report`、`resize`、`runTask`、`saveView`、`show`、`showMode`、`size`、`switchTarget`、`sync` |
| [zip-update-view.js](../src/zip-update-view.js) | `browserRows`、`compare`、`dimension`、`normalize`、`text` |
| [zip-update.css](../src/zip-update.css) | 版面、主題與互動狀態樣式 |
| [zip-update.js](../src/zip-update.js) | `apply`、`archiveIdentity`、`cancel`、`check`、`compareStructure`、`completedBatch`、`destination`、`directoryIdentity`、`emit`、`entryPath`、`extractBatch`、`fingerprint`、`forgetTarget`、`getPlan`、`guard`、`inspectArchive`、`logItem`、`openZip`、`passwordError`、`preview`、`previewBatch`、`readArchive`、`readJSON`、`readRun`、`recycleBatch`、`remember`、`rememberSource`、`reserveName`、`result`、`same`、`save`、`saveTarget`、`setTarget`、`stageArchive`、`state`、`undo`、`within`、`writeJSON`、`zipNameKey` |
### 收藏與 Everything

| 原始檔 | 函式索引／用途 |
| --- | --- |
| [everything-bridge.js](../src/everything-bridge.js) | `cancel`、`choose`、`configure`、`fingerprint`、`instanceName`、`parseResults`、`save`、`selection`、`status` |
| [everything-file-icons.js](../src/everything-file-icons.js) | `constructor`、`icon`、`pump`、`read` |
| [everything-layout.js](../src/everything-layout.js) | `apply`、`autoSize`、`end`、`fit`、`init`、`measure`、`prefs`、`reset`、`set`、`shown`、`sync` |
| [everything-metadata.js](../src/everything-metadata.js) | `cell`、`date`、`parse`、`record` |
| [everything-query.js](../src/everything-query.js) | `buildQuery`、`normalizeExtensions`、`normalizeQuery`、`searchExpression` |
| [everything-result-columns.js](../src/everything-result-columns.js) | `display`、`formatSize`、`location`、`normalizeColumns`、`normalizeSizeUnit`、`value`、`widths` |
| [everything-result-paths.js](../src/everything-result-paths.js) | `accessReason`、`directory`、`resultPath`、`sharedInspector` |
| [everything-tracking-actions.js](../src/everything-tracking-actions.js) | `cell`、`pathAPI`、`trackingAction`、`trackingBatchStore`、`trackingTrashStore` |
| [everything-tracking-ui.js](../src/everything-tracking-ui.js) | `$`、`action`、`activate`、`blocked`、`button`、`cancelInlineRename`、`changeSelection`、`changeSort`、`chooseColumns`、`columnMenu`、`copyQuery`、`current`、`editTag`、`editor`、`filtered`、`init`、`interval`、`keydown`、`load`、`loadIcons`、`node`、`open`、`openTag`、`ordered`、`paintIcons`、`paintSelection`、`ready`、`refresh`、`rememberQuery`、`rememberSelection`、`rememberTag`、`rememberedSort`、`remove`、`renameItem`、`renameMode`、`render`、`renderControls`、`restoreSelection`、`resultFilter`、`rowMenu`、`save`、`saveItemName`、`saveTag`、`schedule`、`selectResults`、`selectTag`、`setColumns`、`showCopy`、`showHint`、`shownColumns`、`sizeUnit`、`sorting`、`syncStartQuery`、`tagMenu`、`tagNote`、`toggleTracking`、`updateView`、`visible` |
| [everything-tracking-view.js](../src/everything-tracking-view.js) | `filterRows`、`sortedRows`、`value` |
| [everything-tracking.js](../src/everything-tracking.js) | `apiFor`、`applyMoves`、`configure`、`entries`、`failed`、`invalidate`、`key`、`list`、`manageTag`、`normalizeRules`、`query`、`queryKey`、`read`、`refresh`、`remove`、`removeFileType`、`removePaths`、`save`、`saveFileType`、`selection`、`snapshot`、`versionList` |
| [everything-view-settings.js](../src/everything-view-settings.js) | `direction`、`effective`、`normalize`、`normalizeSelections`、`pathKey`、`select`、`sort` |
| [everything-workbench.js](../src/everything-workbench.js) | `$`、`append`、`button`、`el`、`pathFragment`、`setup`、`syncCustom`、`syncProfiles` |
| [everything.js](../src/everything.js) | `$`、`add`、`choose`、`clear`、`close`、`configure`、`controls`、`init`、`open`、`render`、`search`、`selectionUI`、`sync`、`track` |
| [favorites-batch.js](../src/favorites-batch.js) | `executeBatch`、`locationCount`、`parentPath`、`pathKey`、`prepareBatch`、`windowsPath` |
| [favorites-model.js](../src/favorites-model.js) | `basename`、`columns`、`sizeLabel`、`sortItems`、`tagList`、`typeLabel` |
| [favorites-network.js](../src/favorites-network.js) | `openFavorite` |
| [favorites-store.js](../src/favorites-store.js) | `absolute`、`addPaths`、`addTags`、`applyMoves`、`cleanTags`、`constructor`、`favoriteReference`、`get`、`identity`、`inspectPath`、`inspectPathSnapshot`、`inspectStat`、`list`、`pathKey`、`read`、`readyPaths`、`recordedPaths`、`remove`、`sameIdentity`、`selection`、`single`、`state`、`validateFavorites`、`write` |
| [favorites-trash.js](../src/favorites-trash.js) | `covers`、`executeTrash`、`executeTrashBatch`、`key`、`prepareTrash`、`same`、`snapshot`、`verify`、`within` |
| [favorites.css](../src/favorites.css) | 版面、主題與互動狀態樣式 |
| [favorites.js](../src/favorites.js) | `$`、`activate`、`addPaths`、`basename`、`batchFromMenu`、`button`、`closeMenu`、`edit`、`finishTagPrompt`、`importSelected`、`init`、`manageTag`、`menuAt`、`moveSelected`、`node`、`open`、`openColumns`、`queuePrompt`、`quickTag`、`refresh`、`render`、`renderColumnEditor`、`renderColumns`、`renderTags`、`reportAdded`、`reportTrash`、`requestBulkOpen`、`requestRemove`、`run`、`selectReplacement`、`selectRow`、`selectionUI`、`setView`、`showItemMenu`、`tagMenu`、`updateContextStatus`、`visibleItems` |
| [workspace-bookmark-model.js](../src/workspace-bookmark-model.js) | `bookmarkTarget`、`index`、`trackingBookmark`、`workspaceBookmarks` |
| [workspace-favorite-detail.js](../src/workspace-favorite-detail.js) | `$`、`button`、`close`、`key`、`node`、`recordBody`、`refresh`、`render`、`show`、`tableBody`、`tags`、`textValue`、`update` |
| [workspace-favorites.js](../src/workspace-favorites.js) | `$`、`action`、`activate`、`apply`、`applyManagedTag`、`bulk`、`choose`、`detail`、`edit`、`editBookmark`、`filterCategory`、`init`、`key`、`manageTag`、`node`、`open`、`openTag`、`positionDialog`、`refilter`、`refresh`、`remove`、`render`、`renderTags`、`restoreFocus`、`saveSort`、`selectRow`、`selectedItems`、`setDialogBusy`、`show`、`sortKey`、`tableRules`、`tagMenu`、`value` |
### 草稿與常用文字

| 原始檔 | 函式索引／用途 |
| --- | --- |
| [draft-export-types.js](../src/draft-export-types.js) | `extension`、`filters` |
| [draft-file-transfer.js](../src/draft-file-transfer.js) | `copyFile`、`digest`、`inside`、`key`、`scan`、`stat`、`transfer` |
| [draft-notes-preload.js](../src/draft-notes-preload.js) | `invoke` |
| [draft-notes-ui.js](../src/draft-notes-ui.js) | `applyPreferences`、`applyStickerUpdate`、`caption`、`changeAttachments`、`closeEditor`、`dirty`、`draftItems`、`el`、`flush`、`inputChanged`、`loadMasters`、`message`、`nextDraft`、`openPendingSelection`、`option`、`refreshTargets`、`remember`、`renderAttachments`、`renderExtra`、`renderItems`、`renderList`、`renderMapping`、`report`、`run`、`setBusy`、`setStickerIds`、`showDraft`、`showPreview`、`targetFields`、`updateCount`、`updateDropHint`、`updateSend`、`updateSticker` |
| [draft-notes.css](../src/draft-notes.css) | 版面、主題與互動狀態樣式 |
| [draft-notes.html](../src/draft-notes.html) | 視窗／頁面結構及本機資源引用 |
| [draft-notes.js](../src/draft-notes.js) | `attach`、`cancelClose`、`close`、`commit`、`configure`、`constructor`、`data`、`destroy`、`draftText`、`export`、`extraField`、`fileKey`、`image`、`masters`、`open`、`owns`、`paste`、`pngBytes`、`preview`、`remind`、`removeAttachment`、`requestClose`、`save`、`textField`、`updateSettings` |
| [snippet-browser-host.js](../src/snippet-browser-host.js) | `deliverToApp` |
| [snippet-browser-setup.js](../src/snippet-browser-setup.js) | `installBrowserSnippetExtension`、`refreshBrowserSnippetExtension`、`writeBridge`、`writeBridgeFile` |
| [snippet-capture-preload.js](../src/snippet-capture-preload.js) | 宣告、設定或共用模型 |
| [snippet-capture-ui.js](../src/snippet-capture-ui.js) | `close`、`showError` |
| [snippet-capture.css](../src/snippet-capture.css) | 版面、主題與互動狀態樣式 |
| [snippet-capture.html](../src/snippet-capture.html) | 視窗／頁面結構及本機資源引用 |
| [snippet-capture.js](../src/snippet-capture.js) | `close`、`commit`、`constructor`、`data`、`open`、`openFromShortcut`、`owner`、`snippetContextMenu` |
| [snippet-import.js](../src/snippet-import.js) | `csv`、`key`、`preview` |
| [snippet-paste-worker.js](../src/snippet-paste-worker.js) | `fail`、`start`、`stop` |
| [snippet-paste.js](../src/snippet-paste.js) | `capture`、`close`、`isCurrentTarget`、`paste`、`warm`、`worker` |
| [snippet-picker-model.js](../src/snippet-picker-model.js) | `accentForeground`、`grouped`、`history`、`normalize`、`updateGroups` |
| [snippet-picker-preload.js](../src/snippet-picker-preload.js) | 宣告、設定或共用模型 |
| [snippet-picker-settings.js](../src/snippet-picker-settings.js) | `init`、`receive` |
| [snippet-picker-ui.js](../src/snippet-picker-ui.js) | `activate`、`failure`、`navigate`、`persist` |
| [snippet-picker.css](../src/snippet-picker.css) | 版面、主題與互動狀態樣式 |
| [snippet-picker.html](../src/snippet-picker.html) | 視窗／頁面結構及本機資源引用 |
| [snippet-picker.js](../src/snippet-picker.js) | `bind`、`close`、`constructor`、`data`、`open`、`owns`、`select`、`setGroups` |
| [snippet-selection-inbox.js](../src/snippet-selection-inbox.js) | `discard`、`inboxFile`、`isShown`、`markShown`、`receiveSelection`、`stageSelection` |
| [snippet-selection-message.js](../src/snippet-selection-message.js) | `encodeMessage`、`readMessage`、`selectionFromMessage`、`selectionText` |
| [snippet-selection-reader.js](../src/snippet-selection-reader.js) | `readFocusedText`、`readWindowSelection`、`readWindowsSelection` |
### 設定與桌面整合

| 原始檔 | 函式索引／用途 |
| --- | --- |
| [desktop-shell.js](../src/desktop-shell.js) | `constructor`、`destroy`、`ensureTray`、`hideFloatingForTray`、`hideToTray`、`loginOptions`、`loginStatus`、`loginSupported`、`matches`、`onClose`、`openLoginSettings`、`openTraySettings`、`refreshTrayMenu`、`registerShortcuts`、`setLogin`、`syncTray` |
| [desktop-state.js](../src/desktop-state.js) | `bounds`、`constructor`、`fitBounds`、`logFilters`、`normalize`、`overlap`、`record`、`remembers`、`replaceSnippetPickerGroups`、`save`、`saveLogFilters`、`saveSnippetPickerGroups`、`saveStickerLayout`、`snippetPickerGroups`、`stickerLayout`、`update`、`validBounds`、`write` |
| [desktop-sticker-model.js](../src/desktop-sticker-model.js) | `appendUrls`、`attachmentRow`、`colorText`、`desktopLayout`、`draftDetail`、`fieldKey`、`fileKey`、`filePins`、`headingFields`、`headingValue`、`headline`、`locationDetail`、`object`、`pathName`、`recordDetail`、`requireValid`、`settings`、`tableOptions`、`tagDetail`、`tagName` |
| [desktop-sticker-service.js](../src/desktop-sticker-service.js) | `changeDraft`、`changeRecord`、`changedPins`、`command`、`config`、`control`、`counts`、`document`、`draftChanged`、`draftPins`、`editableDraft`、`filePinByKey`、`linkRef`、`matchingTag`、`openAttachment`、`openLink`、`openLocation`、`openPathAction`、`openRecordAttachment`、`openTitle`、`pinFile`、`pinTag`、`previewFavorite`、`previewImage`、`read`、`readDraftBody`、`recordFor`、`register`、`remove`、`resolveLink`、`saveDraftBody`、`showHeaderMenu`、`sourceEnabled`、`tagItems`、`tagPreview`、`trackingRefreshed` |
| [dialog-sizes.js](../src/dialog-sizes.js) | `$`、`apply`、`bounded`、`finish`、`init`、`labelOf`、`read`、`refresh`、`save` |
| [floating-capture-preload.js](../src/floating-capture-preload.js) | `listener` |
| [floating-capture-ui.js](../src/floating-capture-ui.js) | `$`、`collect`、`field`、`init`、`invalidate`、`lock`、`node`、`refreshChoices`、`renderAttachments`、`renderFavorites`、`renderTags`、`status` |
| [floating-capture.css](../src/floating-capture.css) | 版面、主題與互動狀態樣式 |
| [floating-capture.html](../src/floating-capture.html) | 視窗／頁面結構及本機資源引用 |
| [floating-capture.js](../src/floating-capture.js) | `addAttachments`、`assertAvailable`、`captureBounds`、`checkedPaths`、`choose`、`clearAttachments`、`close`、`commit`、`constructor`、`data`、`destroy`、`key`、`open`、`owns`、`pathsUnchanged`、`preview`、`save`、`target` |
| [floating-clipboard-ui.js](../src/floating-clipboard-ui.js) | `mount`、`node`、`refresh`、`render`、`run` |
| [floating-date-settings.js](../src/floating-date-settings.js) | `$`、`apply`、`changed`、`control`、`field`、`init`、`load`、`node`、`render`、`status` |
| [floating-displays.js](../src/floating-displays.js) | `close`、`recover` |
| [floating-header.js](../src/floating-header.js) | `control`、`finish`、`init`、`menu`、`move`、`queue` |
| [floating-main-tool.js](../src/floating-main-tool.js) | 宣告、設定或共用模型 |
| [floating-menu.js](../src/floating-menu.js) | `activeFor`、`bind`、`close`、`closeAndWait`、`done`、`release` |
| [floating-pin.js](../src/floating-pin.js) | `failed`、`refresh`、`reloadCrashedRenderer`、`rendererGone` |
| [floating-tag-menu.js](../src/floating-tag-menu.js) | `entry`、`escape`、`tagListMenu`、`tagMenu` |
| [floating-tool-layout.js](../src/floating-tool-layout.js) | `normalize` |
| [floating-tool-panel.css](../src/floating-tool-panel.css) | 版面、主題與互動狀態樣式 |
| [floating-tool-panel.html](../src/floating-tool-panel.html) | 視窗／頁面結構及本機資源引用 |
| [floating-tool-panel.js](../src/floating-tool-panel.js) | `render` |
| [floating-tool-views.js](../src/floating-tool-views.js) | `button`、`mount`、`node`、`refresh`、`render` |
| [floating-tools-settings.js](../src/floating-tools-settings.js) | `mount`、`node`、`save`、`select`、`sync`、`syncSizes` |
| [floating-window.js](../src/floating-window.js) | `apply`、`constructor`、`endDrag`、`ensureVisible`、`initialBounds`、`liveBounds`、`moveDrag`、`place`、`record`、`startDrag`、`windowDefaults` |
| [floating-workspace.css](../src/floating-workspace.css) | 版面、主題與互動狀態樣式 |
| [floating-workspace.js](../src/floating-workspace.js) | `createClipboardHistory` |
| [floating.css](../src/floating.css) | 版面、主題與互動狀態樣式 |
| [floating.html](../src/floating.html) | 視窗／頁面結構及本機資源引用 |
| [floating.js](../src/floating.js) | `$`、`anchor`、`isFileDrag`、`notify`、`render`、`renderOpacity`、`report`、`run` |
| [global-shortcuts.js](../src/global-shortcuts.js) | `fromEvent`、`normalize`、`validatePair` |
| [layout-editor.js](../src/layout-editor.js) | `bind`、`main` |
| [log-sticker-preload.js](../src/log-sticker-preload.js) | 宣告、設定或共用模型 |
| [log-sticker-ui.js](../src/log-sticker-ui.js) | `adoptDraft`、`draftDirty`、`draftStatus`、`error`、`fileCell`、`finishClose`、`finishDrag`、`flushDraft`、`imageArgs`、`isClose`、`linkButton`、`locate`、`moveDrag`、`normalizeLines`、`open`、`openHeaderMenu`、`queueDraft`、`render`、`renderImages`、`report`、`text`、`toggle`、`toggleAt` |
| [log-sticker.css](../src/log-sticker.css) | 版面、主題與互動狀態樣式 |
| [log-sticker.html](../src/log-sticker.html) | 視窗／頁面結構及本機資源引用 |
| [log-stickers.js](../src/log-stickers.js) | `applyOpacity`、`bounds`、`checkpoint`、`clear`、`close`、`constructor`、`currentBounds`、`drag`、`loadLayout`、`open`、`owner`、`payload`、`persist`、`recover`、`refresh`、`remember`、`resize`、`restoreOnStartup`、`reveal`、`scheduleOpacity`、`setAllCollapsed`、`setCollapsed`、`setHidden`、`show`、`showAll`、`syncOpacity`、`syncTopmost`、`toggle`、`visibleCount` |
| [log-view-settings-model.js](../src/log-view-settings-model.js) | `allowedSheet`、`logFilterKey`、`normalize`、`normalizeFilters`、`normalizeHistory` |
| [log-view-settings.js](../src/log-view-settings.js) | `$`、`init`、`refreshTables`、`renderTables`、`sync` |
| [resizable-split.js](../src/resizable-split.js) | `attach`、`bounds`、`end`、`persist`、`set` |
| [settings-catalog.js](../src/settings-catalog.js) | `find`、`resetPatch` |
| [settings-export.js](../src/settings-export.js) | `createSettingsExport`、`writeSettingsExport` |
| [settings-model.js](../src/settings-model.js) | `applyRoot`、`entries`、`load`、`normalize` |
| [settings-workbench.js](../src/settings-workbench.js) | `$`、`add`、`category`、`clear`、`create`、`inCategory`、`reveal`、`search` |
| [settings.js](../src/settings.js) | `$`、`checkPackage`、`init`、`loginMessage`、`readLogin`、`refreshInfo`、`refreshTagOptions`、`releaseCard`、`renderTags`、`requestReset`、`save`、`saveNative`、`showReleaseHistory`、`status`、`syncControls`、`syncLogin`、`syncNative`、`update` |
| [shortcut-controls.js](../src/shortcut-controls.js) | `bind`、`capture`、`set` |
| [shortcut-inventory-model.js](../src/shortcut-inventory-model.js) | `assertGlobal`、`canonical`、`conflicts`、`overlap`、`rows` |
| [shortcut-menu-trigger.js](../src/shortcut-menu-trigger.js) | `abort`、`close`、`finish`、`input` |
| [shortcut-overview.js](../src/shortcut-overview.js) | `$`、`focusEntry`、`init`、`node`、`refresh`、`render`、`save`、`saveFocus`、`sourceSignature`、`status` |
| [shortcuts.js](../src/shortcuts.js) | `adopt`、`chord`、`configure`、`init`、`normalize`、`render`、`save`、`validate` |
| [sidebar-resize.js](../src/sidebar-resize.js) | `bind`、`clamp`、`direction`、`finish`、`show` |
| [startup-registration.js](../src/startup-registration.js) | `commandMatches`、`readRegistration` |
| [tool-overlay-preload.js](../src/tool-overlay-preload.js) | 宣告、設定或共用模型 |
| [tool-overlay.html](../src/tool-overlay.html) | 視窗／頁面結構及本機資源引用 |
| [tool-overlay.js](../src/tool-overlay.js) | `close`、`closeForParent`、`closeLogs`、`constructor`、`control`、`desiredTopmost`、`invalidate`、`layout`、`open`、`owner`、`payload`、`record`、`recover`、`refresh`、`restore`、`save`、`setPinned`、`switchTab`、`syncTopmost`、`updateSettings` |
| [tool-preferences.js](../src/tool-preferences.js) | `value` |
| [tool-views-model.js](../src/tool-views-model.js) | `configuration`、`dateValue`、`firstField`、`followUpField`、`logDay`、`logDetail`、`logRecord`、`logValue`、`paginate`、`pinnedRows`、`snippetRows`、`viewData` |
| [tool-views-ui.js](../src/tool-views-ui.js) | `act`、`applyPinnedOnly`、`arrow`、`button`、`card`、`choices`、`day`、`detailFields`、`field`、`go`、`hasLogFilters`、`label`、`load`、`logRow`、`mount`、`node`、`pinButton`、`reloadField`、`reminderButton`、`render`、`renderLogChips`、`renderLogDetail`、`renderMonth`、`renderPins`、`saveLogFilters`、`setWindowPin`、`showRows`、`toggle`、`updateFilterSummary` |
| [tool-views.css](../src/tool-views.css) | 版面、主題與互動狀態樣式 |
| [windows-context-menu.js](../src/windows-context-menu.js) | `command`、`favoriteArguments`、`invoke`、`setEnabled`、`status`、`supported`、`validFavoritePaths` |
| [windows-file-icons.js](../src/windows-file-icons.js) | `close`、`fail`、`get`、`local`、`request`、`start` |
| [windows-ocr.js](../src/windows-ocr.js) | `Await`、`recognize` |
| [windows-trash.js](../src/windows-trash.js) | `finish`、`recycleWindowsBatch`、`runWindowsBatch` |
### 搜尋與規劃

| 原始檔 | 函式索引／用途 |
| --- | --- |
| [app-search-model.js](../src/app-search-model.js) | `addEdge`、`addPath`、`cell`、`displayName`、`owners`、`pathKey`、`recordItem`、`search`、`stringify` |
| [app-search.js](../src/app-search.js) | `$`、`changed`、`fileActions`、`init`、`open`、`prefs`、`recordLink`、`render`、`run` |
| [calendar-scope-settings.js](../src/calendar-scope-settings.js) | `$`、`init`、`refresh`、`render`、`sync` |
| [calendar-scope.js](../src/calendar-scope.js) | `allows`、`normalize` |
| [floating-search-preload.js](../src/floating-search-preload.js) | `listen`、`listener` |
| [floating-search-state.js](../src/floating-search-state.js) | `normalize`、`tablePresets` |
| [floating-search-ui.js](../src/floating-search-ui.js) | `$`、`act`、`button`、`changed`、`filterChanged`、`lock`、`node`、`persistConditions`、`readFilters`、`receiveSettings`、`render`、`renderDatePresets`、`renderFilters`、`renderTablePresets`、`run`、`state`、`updateFilterSummary` |
| [floating-search.css](../src/floating-search.css) | 版面、主題與互動狀態樣式 |
| [floating-search.html](../src/floating-search.html) | 視窗／頁面結構及本機資源引用 |
| [floating-search.js](../src/floating-search.js) | `action`、`anchoredBounds`、`close`、`constructor`、`data`、`destroy`、`invalidate`、`owns`、`saveState`、`targetOpened`、`updateSettings` |
| [planning-view.css](../src/planning-view.css) | 版面、主題與互動狀態樣式 |
| [planning-view.js](../src/planning-view.js) | `$`、`button`、`init`、`node`、`openEvent`、`render`、`renderBoard`、`renderCalendar`、`select`、`setFields`、`setOptions`、`setSheets`、`today` |
| [record-reminders-ui.js](../src/record-reminders-ui.js) | `$`、`button`、`editMessage`、`fail`、`idle`、`messageFields`、`node`、`open`、`pick`、`previewMessage`、`render`、`reset` |
| [record-reminders.js](../src/record-reminders.js) | `ack`、`close`、`list`、`persist`、`reload`、`remove`、`save`、`snooze`、`tick`、`validate` |
| [reminder-attention-preload.js](../src/reminder-attention-preload.js) | `listener` |
| [reminder-attention-ui.js](../src/reminder-attention-ui.js) | `$`、`fail`、`lock`、`node`、`render` |
| [reminder-attention.css](../src/reminder-attention.css) | 版面、主題與互動狀態樣式 |
| [reminder-attention.html](../src/reminder-attention.html) | 視窗／頁面結構及本機資源引用 |
| [reminder-attention.js](../src/reminder-attention.js) | `action`、`close`、`data`、`destroyWindow`、`dismiss`、`due`、`key`、`owns`、`present`、`pulse`、`refresh`、`suppress`、`sync` |
| [search-criteria-settings.js](../src/search-criteria-settings.js) | `$`、`changed`、`init`、`node`、`refresh`、`render` |
| [search-criteria.js](../src/search-criteria.js) | `date`、`inRange`、`normalize`、`summary` |
| [search-date-presets.js](../src/search-date-presets.js) | `entry`、`fail`、`iso`、`normalize`、`range`、`validDate` |
| [search-table-presets-settings.js](../src/search-table-presets-settings.js) | `$`、`action`、`apply`、`init`、`node`、`render` |
### 檔案與工具箱

| 原始檔 | 函式索引／用途 |
| --- | --- |
| [file-location-groups.js](../src/file-location-groups.js) | `arrange`、`collapseKey`、`location`、`members`、`normalize`、`visibleRows` |
| [file-rules.js](../src/file-rules.js) | `preview`、`selected`、`tag` |
| [move-core.js](../src/move-core.js) | `add`、`assertExpected`、`assertSourceTrees`、`copyExclusive`、`depth`、`destinationFor`、`directories`、`directoryFingerprint`、`equal`、`executeRelocation`、`exists`、`fingerprint`、`inside`、`isFolder`、`key`、`planMove`、`planRename`、`prepareMoveUndo`、`resolveMoveSources`、`stageFile`、`validate` |
| [moving.js](../src/moving.js) | `$`、`choose`、`chooseSources`、`controls`、`execute`、`options`、`preview`、`refreshSources`、`sourceSummary`、`start` |
| [path-import-core.js](../src/path-import-core.js) | `importPathList`、`parsePathList`、`pathKey`、`previewPathImport` |
| [path-import.js](../src/path-import.js) | `$`、`attempt`、`check`、`commit`、`init`、`invalidate`、`lock`、`open`、`queue`、`showPreview`、`tags` |
| [path-repair.js](../src/path-repair.js) | `add`、`apply`、`constructor`、`flavor`、`key`、`planRepair`、`preview`、`roots`、`translate`、`windows` |
| [presets.js](../src/presets.js) | `presetRules`、`sanitizeSavedPresets`、`todayISO` |
| [productivity-ipc.js](../src/productivity-ipc.js) | `backupNames`、`copySnippet`、`ensure`、`openWorkset`、`pasteSnippet`、`previewFile`、`recent`、`registerProductivity`、`remember`、`saveSnippet`、`snippetText`、`state`、`viewData` |
| [productivity-model.js](../src/productivity-model.js) | `agenda`、`board`、`entry`、`expandSnippet`、`ids`、`masterLabels`、`matches`、`normalize`、`text` |
| [productivity-store.js](../src/productivity-store.js) | `constructor`、`get`、`reload`、`remove`、`replace`、`save`、`writeJSON` |
| [productivity.css](../src/productivity.css) | 版面、主題與互動狀態樣式 |
| [productivity.js](../src/productivity.js) | `$`、`addWorksetPaths`、`applyRestored`、`applyToolSplitWidths`、`attachSplit`、`button`、`canSwitch`、`changed`、`clearRule`、`clearWorkset`、`configuration`、`copySnippet`、`discard`、`editRule`、`empty`、`filtersChanged`、`hasSnippetFilter`、`importFile`、`init`、`invalidateImport`、`liveRecords`、`load`、`makeSnippetGroup`、`moveCard`、`node`、`openLogs`、`openRecord`、`openSection`、`options`、`previewBackup`、`previewRules`、`remove`、`render`、`renderBackups`、`renderRepair`、`renderRules`、`renderSnippets`、`renderSuggestions`、`renderWorkChoices`、`renderWorksets`、`repairKeys`、`ruleAction`、`rulePaths`、`run`、`selectWorkset`、`setFolder`、`setSnippet`、`setSnippetGroupExpanded`、`setSnippetGroupsExpanded`、`setupToolSplits`、`show`、`showPreview`、`snippetBulk`、`snippetCategory`、`snippetFolds`、`snippetPicker`、`snippetQuery`、`snippetResults`、`snippetsOpen`、`status`、`updateActions`、`updateBackupSelection`、`updateSnippetActions`、`updateSnippetCategories`、`updateSnippetPreview`、`updateWorkCounts`、`worksetPaths` |
| [profile-extra.js](../src/profile-extra.js) | `exportAuxiliary`、`normalize`、`normalizeAssets`、`packAssets`、`replaceAuxiliary`、`sha`、`unpackAssets` |
| [profile-service.js](../src/profile-service.js) | `captureFiles`、`cleanUI`、`deleteHistory`、`hash`、`history`、`historyPath`、`normalizeBundle`、`preview`、`readJSON`、`recoverProfile`、`restore`、`restoreFiles`、`signature`、`take`、`trial` |
| [rename-core.js](../src/rename-core.js) | `assertFingerprint`、`createPreview`、`emit`、`executeMoves`、`fileIdentity`、`filenameProblem`、`fingerprintFile`、`formatDate`、`hashReporter`、`key`、`listPaths`、`localDate`、`normalizeOptions`、`pathExists`、`prepareUndo`、`renameOne`、`reportProgress`、`safe`、`sameIdentity`、`snapshotMoves`、`splitName`、`validateMoves`、`visit` |
| [rename-history.js](../src/rename-history.js) | `writeHistory` |
| [rename-job-worker.js](../src/rename-job-worker.js) | 宣告、設定或共用模型 |
| [rename-job.js](../src/rename-job.js) | `finish`、`perform`、`run`、`workerFilename` |
