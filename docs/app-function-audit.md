# 應用程式功能與模組盤點

版本：v1.109.0。以 `npm run audit:functions` 重新產生。

讀取 src 全部 187 個 JS／HTML／CSS 檔案；核對 10 個頁面、6 個工具入口、24 項功能導覽與 257 個介面／桌面偏好。

## 盤點與整合結果

- Everything 排序由共用驗證模型管理，按追蹤 ID 保存欄位、方向與各欄位上次方向；欄位隱藏時暫用名稱排序，不刪除原偏好。
- 追蹤定時更新、選取與批次操作共用可收合工具列，啟動立即還原狀態並保留更新摘要、已選數量、所選項目選單、右鍵與快捷鍵，收合狀態納入偏好還原／匯出。
- 一般收藏既有排序由 favoriteSort／favoriteDirection 保存；工作區由 notes-table-state 管理表格版面與篩選；查看紀錄由 log-view-settings-model 管理各範圍篩選／排序歷史，沒有另建平行資料來源。
- Everything 僅建立可見結果欄的 DOM 與格式文字；局部偏好更新避免重複重建結果，隱藏欄資料仍保留於同一快取。
- 查看紀錄主視窗／浮窗共用空白處展開／收合行為，保留按鈕與文字選取；追蹤暫停沿用 trackingSave，表格複製沿用結果版本與檔案身分核對，不新增平行資料來源。
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
| [notes-share-commit.js](../src/notes-share-commit.js) | `canonical`、`commitId`、`create`、`hash`、`scopeKey`、`validHash`、`validHead`、`validate` |
| [notes-share-profiles.js](../src/notes-share-profiles.js) | `channel`、`check`、`choose`、`close`、`completeImport`、`configure`、`conflict`、`constructor`、`create`、`emit`、`file`、`folderKey`、`ignore`、`masters`、`name`、`pause`、`publish`、`read`、`reconcile`、`scopeError`、`select`、`status`、`tick` |
| [notes-share-worker.js](../src/notes-share-worker.js) | `handle`、`packageIdentity`、`perform`、`readBounded`、`reply`、`safeFolder`、`validateFolder` |
| [notes-share.js](../src/notes-share.js) | `accept`、`accepted`、`action`、`candidate`、`check`、`choose`、`close`、`completeImport`、`configure`、`emit`、`finish`、`ignore`、`isOlderRelease`、`locallyChanged`、`publish`、`read`、`receive`、`receiveStatus`、`run`、`save`、`start`、`status`、`stop`、`tick` |
| [notes-shared-merge.js](../src/notes-shared-merge.js) | `baseline`、`canonical`、`constructor`、`contentDigest`、`describe`、`digest`、`displayValue`、`fieldHashes`、`hashes`、`identity`、`index`、`indexObject`、`matches`、`merge`、`mergeFields`、`older`、`patch`、`remoteChanged`、`sameVersion`、`structure`、`valueKey` |
| [notes-sharing-model.js](../src/notes-sharing-model.js) | `managedSheets`、`merge`、`project`、`receivingScope`、`scope`、`shareSnapshot` |
| [notes-sharing.css](../src/notes-sharing.css) | 版面、主題與互動狀態樣式 |
| [notes-sheet-change.js](../src/notes-sheet-change.js) | `apply`、`populated`、`removedColumns` |
| [notes-store.js](../src/notes-store.js) | `addTemplate`、`applyCustomTemplate`、`backup`、`batchAreas`、`batchSheets`、`batchTrash`、`bulkCommit`、`bulkPreview`、`cancelPreview`、`close`、`completeClientDetails`、`constructor`、`createDraft`、`deleteDraft`、`draft`、`draftList`、`duplicateRecord`、`exportPreview`、`get`、`hasSharedBase`、`history`、`importDetails`、`isUNC`、`key`、`planImport`、`removeArea`、`restoreCommit`、`restoreHistory`、`restorePreview`、`saveArea`、`saveCopies`、`saveDraft`、`saveSharedBase`、`saveSheet`、`sharedBase`、`sheetCommit`、`sheetPreview`、`tabularCommit`、`tabularFileLinks`、`tabularPaths`、`tabularPreview`、`tabularPreviewIntranet`、`takePreview`、`trash`、`updateCells` |
| [notes-table-state.js](../src/notes-table-state.js) | `filter`、`normalizeFilter`、`normalizeFilters`、`normalizeViewModes`、`selection`、`statusField`、`statusOptions`、`viewGroup`、`viewKey` |
| [notes-tools-store.js](../src/notes-tools-store.js) | `bookmarkKey`、`bookmarkTags`、`change`、`cleanTemplate`、`constructor`、`contactText`、`get`、`manageBookmarkTag`、`normalizeTools`、`pin`、`remove`、`saveTemplate`、`saveView`、`setBookmark`、`setBookmarkTags`、`setLogPin`、`view`、`workspaceItems` |
| [notes-web-links.js](../src/notes-web-links.js) | `openRecordWebsite` |
| [notes-xlsx.js](../src/notes-xlsx.js) | `add`、`content`、`decodeExcelText`、`encodeExcelText`、`excelColumn`、`excelDate`、`lname`、`parse`、`preflight`、`readSpreadsheetFile`、`readXlsx`、`relation`、`writeXlsx`、`xml` |
| [notes.css](../src/notes.css) | 版面、主題與互動狀態樣式 |
| [notes.js](../src/notes.js) | `$`、`accepted`、`action`、`activeSort`、`addLocations`、`appendCardFooterFields`、`applySearchDefault`、`applyTransfer`、`applyView`、`area`、`batchDelete`、`bindCardDragSource`、`bindCardDrop`、`buildLinkPickers`、`bulkValue`、`button`、`cardFieldList`、`cardFooterFields`、`cardFooterValue`、`cardStatusField`、`changeBookmark`、`chooseRecord`、`chooseShareFolder`、`chooseSheet`、`clearBulkPreview`、`clearChecks`、`clearSearch`、`configureBulkTargets`、`configureRecordTargets`、`confirm`、`confirmDeleteEntries`、`confirmTrash`、`contextAction`、`copyRecordText`、`currentShareProfile`、`display`、`doc`、`drawCardFieldRows`、`dropRecord`、`edit`、`editArea`、`editRecord`、`editSheet`、`el`、`ensureCurrentSheet`、`finishCardDrag`、`finishRecord`、`finishSheetSave`、`focusGrid`、`forExistingSheets`、`formOnly`、`gridDestination`、`historyTime`、`importDefaultKey`、`indexes`、`init`、`initBulk`、`initCardSettings`、`initSheetReview`、`inspectShareVersion`、`invalidateTable`、`invalidateTransfer`、`isDetail`、`list`、`loadImportFile`、`loadTableFile`、`masterSheet`、`navigate`、`navigationBlocked`、`openBulkEdit`、`openCardSettings`、`openContext`、`openDialogs`、`openLinkPicker`、`openOrganize`、`openSearchTarget`、`openShare`、`openTabular`、`openTransfer`、`orderedCardFields`、`organizeCount`、`paintChoices`、`paste`、`picker`、`prefs`、`previewShared`、`publishCurrentShare`、`publishShare`、`refresh`、`rememberLinkChoices`、`rememberLongTextSize`、`render`、`renderArea`、`renderAreaMasters`、`renderAudit`、`renderBookmark`、`renderCardFields`、`renderCardPreview`、`renderCards`、`renderColors`、`renderCurrent`、`renderCurrentShare`、`renderDetail`、`renderFields`、`renderFlatSidebar`、`renderGrid`、`renderImportHelp`、`renderMasterContext`、`renderNotePreview`、`renderPanelSummary`、`renderRecordFiles`、`renderSelection`、`renderShare`、`renderShareScopes`、`renderSharedConflicts`、`renderSidebar`、`renderStatusControls`、`renderTable`、`renderTableMapping`、`renderToolControls`、`renderToolLists`、`renderTransfer`、`renderWebsiteField`、`requestTemplate`、`resetLongTextObserver`、`resetPastedTable`、`returnToMaster`、`run`、`saveLongTextSizes`、`searchScope`、`select`、`selectArea`、`selectRecord`、`setFormTab`、`setLinkMode`、`setTableRows`、`setViewMode`、`showHistory`、`showSharedUpdate`、`showSheetReview`、`sidebarGroupOpen`、`sidebarMasterResults`、`sidebarSheetButton`、`snippetCustomer`、`sortHeader`、`stageRecordPaths`、`statusPatch`、`statusState`、`toggleCard`、`update`、`updateBatchPreview`、`updateRecordTargetCount`、`values`、`viewMode`、`viewModePatch`、`viewSheet`、`viewState` |
| [share-receive-ui.js](../src/share-receive-ui.js) | `$`、`init`、`render` |
| [share-view-model.js](../src/share-view-model.js) | `changed`、`filterRecords`、`identity`、`packageInfo`、`short` |
| [structured-note-model.js](../src/structured-note-model.js) | `format`、`isType`、`normalize`、`ordered`、`summary` |
| [structured-note-ui.js](../src/structured-note-ui.js) | `button`、`editor`、`insert`、`move`、`node`、`notify`、`redraw`、`updateState`、`updateSummary`、`value`、`view` |
| [structured-note.css](../src/structured-note.css) | 版面、主題與互動狀態樣式 |
### 主視窗與共用基礎

| 原始檔 | 函式索引／用途 |
| --- | --- |
| [app-layout.css](../src/app-layout.css) | 版面、主題與互動狀態樣式 |
| [app-navigation.js](../src/app-navigation.js) | `create` |
| [bounded-file-read.js](../src/bounded-file-read.js) | `readStableBytes`、`readStableBytesAsync`、`same` |
| [checkbox-migration.js](../src/checkbox-migration.js) | `convertCheckboxes` |
| [diagnostic-log.js](../src/diagnostic-log.js) | `clear`、`entries`、`escape`、`exportData`、`files`、`masked`、`prepareFolder`、`prune`、`record`、`scrub`、`settings`、`status`、`text` |
| [diagnostics-runtime.js](../src/diagnostics-runtime.js) | `report` |
| [diagnostics-settings.js](../src/diagnostics-settings.js) | `$`、`init`、`refresh`、`render`、`run` |
| [document-preview.js](../src/document-preview.js) | `allowedPreviewRequest`、`close`、`decodePreview`、`escape`、`previewLimit`、`previewType`、`readPreview`、`readSelectedPreview`、`show`、`showContent` |
| [function-directory.js](../src/function-directory.js) | `search` |
| [graphite-theme.css](../src/graphite-theme.css) | 版面、主題與互動狀態樣式 |
| [home-model.js](../src/home-model.js) | `name`、`recordItem`、`snapshot` |
| [home.css](../src/home.css) | 版面、主題與互動狀態樣式 |
| [home.js](../src/home.js) | `$`、`button`、`changed`、`init`、`list`、`openCustomize`、`openFeature`、`prefs`、`refresh`、`render`、`renderDirectory`、`renderDraft`、`renderLayoutControls`、`target` |
| [index.html](../src/index.html) | 視窗／頁面結構及本機資源引用 |
| [intranet-path.js](../src/intranet-path.js) | `assertIntranetPath`、`hostKey`、`isUNC`、`isValidated`、`privateAddress`、`run`、`uncServer`、`withIntranetPaths` |
| [list-pagination.js](../src/list-pagination.js) | `paginate` |
| [main.js](../src/main.js) | `actOnTool`、`applyMainBounds`、`bounded`、`bytes`、`captureController`、`closeFloatingMenu`、`command`、`configureDesktop`、`configuredQuick`、`confirmBatch`、`confirmTrackedBatch`、`confirmTrash`、`createWindow`、`dropCapture`、`endShortcutRecording`、`fileOperation`、`finishRenameJob`、`floatingAction`、`floatingSearchController`、`floatingTags`、`focusMain`、`go`、`handle`、`historyFile`、`inlinePanelConfig`、`invalidateNotesImport`、`invalidateSharedImport`、`keepFloatingAfterQuick`、`loggedInvocation`、`menuLabel`、`monitorException`、`move`、`navigateWorkspace`、`notesChanged`、`notesStore`、`notifyFavorites`、`openDrafts`、`openFavorite`、`openInlinePanel`、`openQuickToolMenu`、`openToolOverlay`、`overlayAction`、`performMovePlan`、`popupFloatingMenu`、`preparePasteWorker`、`publish`、`quote`、`readHistory`、`receiveFavorites`、`registerShortcut`、`rememberAuxSize`、`renameProgress`、`reportFloatingBatch`、`reportSnippetPasteFailure`、`resolve`、`runShortcutQuickAction`、`saveHistory`、`searchLocalData`、`secureWindow`、`send`、`setFloatingCollapsed`、`shareIdle`、`showCategories`、`showFloating`、`showMonth`、`showTagMenu`、`showToolRows`、`syncFavoriteMoves`、`toggleFloatingCollapse`、`toolsChanged`、`toolsStore`、`updateSharedNotification`、`validatedLinkPaths` |
| [menu-dismiss.js](../src/menu-dismiss.js) | `closeOutside` |
| [offline-policy.js](../src/offline-policy.js) | `allowedRequest`、`assertLocalPath`、`assertSafeOpen`、`installOfflinePolicy` |
| [open-file-input.js](../src/open-file-input.js) | `openFileInput` |
| [operation-ui.css](../src/operation-ui.css) | 版面、主題與互動狀態樣式 |
| [operation-ui.js](../src/operation-ui.js) | `$`、`close`、`create`、`receive`、`render`、`show`、`visibilityChanged` |
| [preload.js](../src/preload.js) | `invoke`、`listener`、`notifyOperation` |
| [quick-actions-model.js](../src/quick-actions-model.js) | `displayOptions`、`entry`、`form`、`normalize` |
| [quick-actions-settings.js](../src/quick-actions-settings.js) | `$`、`actionButton`、`appendOptions`、`displayFields`、`dropOptions`、`edit`、`fields`、`formFields`、`init`、`masters`、`move`、`node`、`persist`、`refresh`、`render`、`renderTagChecks`、`sheet` |
| [release-history.js](../src/release-history.js) | 宣告、設定或共用模型 |
| [renderer.js](../src/renderer.js) | `$`、`addFromResult`、`append`、`applyFontSize`、`applyRules`、`applyTheme`、`basename`、`bind`、`chooseFiles`、`chooseFolder`、`clearFiles`、`confirmRename`、`describe`、`dirname`、`dragOver`、`dropTarget`、`element`、`enqueuePreview`、`executeRename`、`executeUndo`、`expandGroups`、`exportCSV`、`filterFiles`、`getRules`、`groupHeader`、`grouped`、`init`、`initPresets`、`isFileDrag`、`moveListedSelection`、`norm`、`render`、`renderFiles`、`renderSavedPresets`、`renderTable`、`renderWorkspaceControls`、`saveCollapsedLocations`、`saveRulePreferences`、`selectFiltered`、`selectOne`、`setBusy`、`setRuleTab`、`shortDir`、`showDrop`、`showFailure`、`showToast`、`single`、`storeSavedPresets`、`undo`、`updatePreview`、`updateRuleControls`、`visibleGroupRows`、`wireEvents`、`withoutPrefix` |
| [scheduled-backup.js](../src/scheduled-backup.js) | `tick` |
| [style.css](../src/style.css) | 版面、主題與互動狀態樣式 |
| [theme.js](../src/theme.js) | 宣告、設定或共用模型 |
| [themes.css](../src/themes.css) | 版面、主題與互動狀態樣式 |
| [upgrades.css](../src/upgrades.css) | 版面、主題與互動狀態樣式 |
| [web-link-model.js](../src/web-link-model.js) | `links`、`normalize`、`valid` |
| [workspace.css](../src/workspace.css) | 版面、主題與互動狀態樣式 |
### 收藏與 Everything

| 原始檔 | 函式索引／用途 |
| --- | --- |
| [everything-bridge.js](../src/everything-bridge.js) | `cancel`、`choose`、`configure`、`fingerprint`、`instanceName`、`parseResults`、`save`、`selection`、`status` |
| [everything-layout.js](../src/everything-layout.js) | `apply`、`autoSize`、`end`、`fit`、`init`、`measure`、`prefs`、`reset`、`set`、`shown`、`sync` |
| [everything-metadata.js](../src/everything-metadata.js) | `cell`、`date`、`parse`、`record` |
| [everything-query.js](../src/everything-query.js) | `buildQuery`、`normalizeExtensions`、`normalizeQuery`、`searchExpression` |
| [everything-result-columns.js](../src/everything-result-columns.js) | `display`、`location`、`normalizeColumns`、`value`、`widths` |
| [everything-tracking-actions.js](../src/everything-tracking-actions.js) | `cell`、`pathAPI`、`trackingAction`、`trackingBatchStore` |
| [everything-tracking-ui.js](../src/everything-tracking-ui.js) | `$`、`action`、`activate`、`blocked`、`button`、`changeSort`、`chooseColumns`、`columnMenu`、`copyQuery`、`current`、`editor`、`filtered`、`init`、`interval`、`keydown`、`load`、`node`、`open`、`ordered`、`paintSelection`、`ready`、`refresh`、`rememberedSort`、`remove`、`renameItem`、`render`、`renderControls`、`rowMenu`、`save`、`saveItemName`、`schedule`、`selectResults`、`setColumns`、`shownColumns`、`sorting`、`syncStartQuery`、`toggleTracking`、`updateView`、`visible` |
| [everything-tracking-view.js](../src/everything-tracking-view.js) | `sortedRows`、`value` |
| [everything-tracking.js](../src/everything-tracking.js) | `configure`、`invalidate`、`list`、`normalizeRules`、`query`、`queryKey`、`read`、`refresh`、`remove`、`removeFileType`、`save`、`saveFileType`、`selection`、`snapshot` |
| [everything-view-settings.js](../src/everything-view-settings.js) | `direction`、`effective`、`normalize`、`select`、`sort` |
| [everything-workbench.js](../src/everything-workbench.js) | `$`、`append`、`button`、`el`、`pathFragment`、`setup`、`syncCustom`、`syncProfiles` |
| [everything.js](../src/everything.js) | `$`、`add`、`choose`、`clear`、`close`、`configure`、`controls`、`init`、`open`、`render`、`search`、`selectionUI`、`sync`、`track` |
| [favorites-batch.js](../src/favorites-batch.js) | `executeBatch`、`locationCount`、`parentPath`、`pathKey`、`prepareBatch`、`windowsPath` |
| [favorites-model.js](../src/favorites-model.js) | `basename`、`columns`、`sizeLabel`、`sortItems`、`tagList`、`typeLabel` |
| [favorites-network.js](../src/favorites-network.js) | `openFavorite` |
| [favorites-store.js](../src/favorites-store.js) | `absolute`、`addPaths`、`addTags`、`applyMoves`、`cleanTags`、`constructor`、`favoriteReference`、`get`、`identity`、`inspectPath`、`list`、`pathKey`、`read`、`readyPaths`、`recordedPaths`、`remove`、`sameIdentity`、`selection`、`single`、`state`、`validateFavorites`、`write` |
| [favorites-trash.js](../src/favorites-trash.js) | `executeTrash`、`key`、`prepareTrash`、`same`、`snapshot`、`within` |
| [favorites.css](../src/favorites.css) | 版面、主題與互動狀態樣式 |
| [favorites.js](../src/favorites.js) | `$`、`activate`、`addPaths`、`basename`、`batchFromMenu`、`button`、`closeMenu`、`edit`、`finishTagPrompt`、`importSelected`、`init`、`manageTag`、`menuAt`、`moveSelected`、`node`、`open`、`openColumns`、`queuePrompt`、`quickTag`、`refresh`、`render`、`renderColumnEditor`、`renderColumns`、`renderTags`、`reportAdded`、`reportTrash`、`requestBulkOpen`、`requestRemove`、`run`、`selectReplacement`、`selectRow`、`selectionUI`、`setView`、`showItemMenu`、`updateContextStatus`、`visibleItems` |
| [workspace-bookmark-model.js](../src/workspace-bookmark-model.js) | `bookmarkTarget`、`index`、`trackingBookmark`、`workspaceBookmarks` |
| [workspace-favorite-detail.js](../src/workspace-favorite-detail.js) | `$`、`button`、`close`、`key`、`node`、`recordBody`、`refresh`、`render`、`show`、`tableBody`、`tags`、`textValue`、`update` |
| [workspace-favorites.js](../src/workspace-favorites.js) | `$`、`action`、`activate`、`apply`、`applyManagedTag`、`bulk`、`detail`、`edit`、`editBookmark`、`filterCategory`、`init`、`key`、`manageTag`、`node`、`open`、`positionDialog`、`refilter`、`refresh`、`remove`、`render`、`renderTags`、`selectedItems`、`setDialogBusy`、`show`、`tableRules`、`tagMenu` |
### 草稿與常用文字

| 原始檔 | 函式索引／用途 |
| --- | --- |
| [draft-export-types.js](../src/draft-export-types.js) | `extension`、`filters` |
| [draft-file-transfer.js](../src/draft-file-transfer.js) | `copyFile`、`digest`、`inside`、`key`、`scan`、`stat`、`transfer` |
| [draft-notes-preload.js](../src/draft-notes-preload.js) | `invoke` |
| [draft-notes-ui.js](../src/draft-notes-ui.js) | `applyPreferences`、`caption`、`changeAttachments`、`closeEditor`、`dirty`、`draftItems`、`el`、`flush`、`inputChanged`、`loadMasters`、`message`、`nextDraft`、`option`、`refreshTargets`、`remember`、`renderAttachments`、`renderExtra`、`renderItems`、`renderList`、`renderMapping`、`report`、`run`、`setBusy`、`showDraft`、`showPreview`、`targetFields`、`updateCount`、`updateDropHint`、`updateSend` |
| [draft-notes.css](../src/draft-notes.css) | 版面、主題與互動狀態樣式 |
| [draft-notes.html](../src/draft-notes.html) | 視窗／頁面結構及本機資源引用 |
| [draft-notes.js](../src/draft-notes.js) | `attach`、`cancelClose`、`close`、`configure`、`constructor`、`data`、`destroy`、`draftText`、`export`、`extraField`、`fileKey`、`image`、`masters`、`open`、`owns`、`paste`、`pngBytes`、`preview`、`remind`、`removeAttachment`、`requestClose`、`save`、`textField`、`updateSettings` |
| [snippet-import.js](../src/snippet-import.js) | `csv`、`key`、`preview` |
| [snippet-paste-worker.js](../src/snippet-paste-worker.js) | `fail`、`start`、`stop` |
| [snippet-paste.js](../src/snippet-paste.js) | `capture`、`close`、`paste`、`warm`、`worker` |
| [snippet-picker-model.js](../src/snippet-picker-model.js) | `grouped`、`history`、`normalize`、`updateGroups` |
| [snippet-picker-preload.js](../src/snippet-picker-preload.js) | 宣告、設定或共用模型 |
| [snippet-picker-settings.js](../src/snippet-picker-settings.js) | `init`、`receive` |
| [snippet-picker-ui.js](../src/snippet-picker-ui.js) | `failure`、`persist` |
| [snippet-picker.css](../src/snippet-picker.css) | 版面、主題與互動狀態樣式 |
| [snippet-picker.html](../src/snippet-picker.html) | 視窗／頁面結構及本機資源引用 |
| [snippet-picker.js](../src/snippet-picker.js) | `close`、`constructor`、`data`、`open`、`owns`、`select`、`setGroups` |
### 設定與桌面整合

| 原始檔 | 函式索引／用途 |
| --- | --- |
| [desktop-shell.js](../src/desktop-shell.js) | `constructor`、`destroy`、`ensureTray`、`hideFloatingForTray`、`hideToTray`、`loginOptions`、`loginStatus`、`loginSupported`、`matches`、`onClose`、`openLoginSettings`、`registerShortcuts`、`setLogin` |
| [desktop-state.js](../src/desktop-state.js) | `bounds`、`constructor`、`fitBounds`、`logFilters`、`normalize`、`normalizeFloatingTitle`、`overlap`、`record`、`remembers`、`replaceSnippetPickerGroups`、`save`、`saveLogFilters`、`saveSnippetPickerGroups`、`snippetPickerGroups`、`update`、`validBounds`、`write` |
| [dialog-sizes.js](../src/dialog-sizes.js) | `$`、`apply`、`bounded`、`finish`、`init`、`labelOf`、`read`、`refresh`、`save` |
| [floating-capture-preload.js](../src/floating-capture-preload.js) | `listener` |
| [floating-capture-ui.js](../src/floating-capture-ui.js) | `$`、`collect`、`field`、`init`、`invalidate`、`lock`、`node`、`refreshChoices`、`renderAttachments`、`renderFavorites`、`renderTags`、`status` |
| [floating-capture.css](../src/floating-capture.css) | 版面、主題與互動狀態樣式 |
| [floating-capture.html](../src/floating-capture.html) | 視窗／頁面結構及本機資源引用 |
| [floating-capture.js](../src/floating-capture.js) | `addAttachments`、`assertAvailable`、`captureBounds`、`checkedPaths`、`choose`、`clearAttachments`、`close`、`commit`、`constructor`、`data`、`destroy`、`key`、`open`、`owns`、`pathsUnchanged`、`preview`、`save`、`target` |
| [floating-date-settings.js](../src/floating-date-settings.js) | `$`、`apply`、`changed`、`control`、`field`、`init`、`load`、`node`、`render`、`status` |
| [floating-header.js](../src/floating-header.js) | `control`、`finish`、`init`、`menu`、`move`、`queue` |
| [floating-live-search.js](../src/floating-live-search.js) | `activate`、`cancel`、`clear`、`create`、`enabled`、`fail`、`input`、`prepare`、`settingsChanged` |
| [floating-menu.js](../src/floating-menu.js) | `bind`、`close`、`closeAndWait`、`done`、`release` |
| [floating-panels-model.js](../src/floating-panels-model.js) | `enabledPanels`、`ids`、`known`、`normalize` |
| [floating-panels-settings.js](../src/floating-panels-settings.js) | `$`、`edit`、`init`、`receive`、`rows`、`selectOptions` |
| [floating-panels.js](../src/floating-panels.js) | `create`、`display`、`mountTool`、`refresh`、`remove`、`select`、`sync` |
| [floating-pin.js](../src/floating-pin.js) | `refresh`、`sync` |
| [floating-render-guard.js](../src/floating-render-guard.js) | `begin`、`create`、`finish`、`request` |
| [floating-tag-menu.js](../src/floating-tag-menu.js) | `entry`、`escape`、`tagListMenu`、`tagMenu` |
| [floating-window.js](../src/floating-window.js) | `apply`、`captureExpanded`、`collapsedMinimumWidth`、`compactSize`、`constructor`、`endDrag`、`liveBounds`、`moveDrag`、`opacity`、`place`、`record`、`restoreDefaultSize`、`saveDefaultSize`、`savedBounds`、`startDrag`、`windowDefaults` |
| [floating.css](../src/floating.css) | 版面、主題與互動狀態樣式 |
| [floating.html](../src/floating.html) | 視窗／頁面結構及本機資源引用 |
| [floating.js](../src/floating.js) | `$`、`action`、`activate`、`buttonSearch`、`copyPaths`、`hideDrop`、`makeCopy`、`makeShow`、`menu`、`node`、`open`、`openButtonSearch`、`paint`、`quickFeedback`、`quickLabel`、`refresh`、`refreshWorkspace`、`render`、`renderCollapsed`、`renderMixed`、`renderQuickActions`、`renderWorkspace`、`runQuickAction`、`section`、`showMenu`、`showTagMenu` |
| [global-shortcuts.js](../src/global-shortcuts.js) | `fromEvent`、`normalize`、`validatePair` |
| [layout-editor.js](../src/layout-editor.js) | `bind`、`floating`、`main` |
| [log-view-settings-model.js](../src/log-view-settings-model.js) | `allowedSheet`、`logFilterKey`、`normalize`、`normalizeFilters`、`normalizeHistory` |
| [log-view-settings.js](../src/log-view-settings.js) | `$`、`init`、`refreshTables`、`renderTables`、`sync` |
| [resizable-split.js](../src/resizable-split.js) | `attach`、`bounds`、`end`、`persist`、`set` |
| [settings-catalog.js](../src/settings-catalog.js) | `find`、`resetPatch` |
| [settings-export.js](../src/settings-export.js) | `createSettingsExport`、`writeSettingsExport` |
| [settings-model.js](../src/settings-model.js) | `applyRoot`、`entries`、`load`、`normalize` |
| [settings-workbench.js](../src/settings-workbench.js) | `$`、`add`、`category`、`clear`、`create`、`inCategory`、`reveal`、`search` |
| [settings.js](../src/settings.js) | `$`、`checkPackage`、`init`、`loginMessage`、`makeCheck`、`readLogin`、`refreshInfo`、`refreshTagOptions`、`releaseCard`、`renderCollapsedSettings`、`renderTags`、`requestReset`、`save`、`saveNative`、`showReleaseHistory`、`status`、`syncControls`、`syncLogin`、`syncNative`、`update` |
| [shortcut-controls.js](../src/shortcut-controls.js) | `bind`、`capture`、`set` |
| [shortcut-inventory-model.js](../src/shortcut-inventory-model.js) | `assertGlobal`、`canonical`、`conflicts`、`overlap`、`rows` |
| [shortcut-menu-trigger.js](../src/shortcut-menu-trigger.js) | `abort`、`close`、`finish`、`input` |
| [shortcut-overview.js](../src/shortcut-overview.js) | `$`、`focusEntry`、`init`、`node`、`refresh`、`render`、`save`、`saveFocus`、`sourceSignature`、`status` |
| [shortcuts.js](../src/shortcuts.js) | `adopt`、`chord`、`configure`、`init`、`normalize`、`render`、`save`、`validate` |
| [sidebar-resize.js](../src/sidebar-resize.js) | `bind`、`clamp`、`direction`、`finish`、`show` |
| [startup-registration.js](../src/startup-registration.js) | `commandMatches`、`readRegistration` |
| [tool-overlay-preload.js](../src/tool-overlay-preload.js) | 宣告、設定或共用模型 |
| [tool-overlay.html](../src/tool-overlay.html) | 視窗／頁面結構及本機資源引用 |
| [tool-overlay.js](../src/tool-overlay.js) | `close`、`closeForParent`、`constructor`、`invalidate`、`open`、`owner`、`refresh`、`setPinned`、`switchTab`、`updateSettings`、`windowKey` |
| [tool-preferences.js](../src/tool-preferences.js) | `value` |
| [tool-views-model.js](../src/tool-views-model.js) | `configuration`、`dateValue`、`firstField`、`followUpField`、`logDay`、`logDetail`、`logRecord`、`logValue`、`paginate`、`pinnedRows`、`snippetRows`、`viewData` |
| [tool-views-ui.js](../src/tool-views-ui.js) | `act`、`applyPinnedOnly`、`arrow`、`button`、`card`、`choices`、`detailFields`、`field`、`go`、`hasLogFilters`、`load`、`logRow`、`mount`、`node`、`pinButton`、`reloadField`、`render`、`renderLogDetail`、`renderMonth`、`renderPins`、`saveLogFilters`、`setWindowPin`、`showRows`、`toggle`、`updateFilterSummary` |
| [tool-views.css](../src/tool-views.css) | 版面、主題與互動狀態樣式 |
| [windows-context-menu.js](../src/windows-context-menu.js) | `command`、`favoriteArguments`、`invoke`、`setEnabled`、`status`、`supported`、`validFavoritePaths` |
### 搜尋與規劃

| 原始檔 | 函式索引／用途 |
| --- | --- |
| [app-search-model.js](../src/app-search-model.js) | `addEdge`、`addPath`、`cell`、`displayName`、`owners`、`pathKey`、`recordItem`、`search`、`stringify` |
| [app-search.js](../src/app-search.js) | `$`、`changed`、`fileActions`、`init`、`open`、`prefs`、`recordLink`、`render`、`run` |
| [calendar-scope-settings.js](../src/calendar-scope-settings.js) | `$`、`init`、`refresh`、`render`、`sync` |
| [calendar-scope.js](../src/calendar-scope.js) | `allows`、`normalize` |
| [floating-search-preload.js](../src/floating-search-preload.js) | `listen`、`listener` |
| [floating-search-state.js](../src/floating-search-state.js) | `normalize`、`tablePresets` |
| [floating-search-ui.js](../src/floating-search-ui.js) | `$`、`act`、`button`、`changed`、`filterChanged`、`focusResults`、`lock`、`node`、`persistConditions`、`readFilters`、`receiveSettings`、`render`、`renderDatePresets`、`renderFilters`、`renderTablePresets`、`run`、`state`、`updateFilterSummary` |
| [floating-search.css](../src/floating-search.css) | 版面、主題與互動狀態樣式 |
| [floating-search.html](../src/floating-search.html) | 視窗／頁面結構及本機資源引用 |
| [floating-search.js](../src/floating-search.js) | `action`、`anchoredBounds`、`cancelLive`、`close`、`constructor`、`data`、`destroy`、`invalidate`、`owns`、`prepareLive`、`previewLive`、`saveState`、`targetOpened`、`updateSettings` |
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
| [productivity-ipc.js](../src/productivity-ipc.js) | `backupNames`、`copySnippet`、`ensure`、`openWorkset`、`pasteSnippet`、`previewFile`、`registerProductivity`、`snippetText`、`state`、`viewData` |
| [productivity-model.js](../src/productivity-model.js) | `agenda`、`board`、`entry`、`expandSnippet`、`ids`、`masterLabels`、`matches`、`normalize`、`text` |
| [productivity-store.js](../src/productivity-store.js) | `constructor`、`get`、`reload`、`remove`、`replace`、`save`、`writeJSON` |
| [productivity.css](../src/productivity.css) | 版面、主題與互動狀態樣式 |
| [productivity.js](../src/productivity.js) | `$`、`apply`、`applyRestored`、`button`、`changed`、`clearRule`、`clearSnippet`、`clearWorkset`、`configuration`、`discard`、`editRule`、`empty`、`importFile`、`init`、`invalidateImport`、`liveRecords`、`load`、`moveCard`、`node`、`openLogs`、`openRecord`、`options`、`previewBackup`、`previewRules`、`remove`、`render`、`renderBackups`、`renderRepair`、`renderRules`、`renderSnippets`、`renderSuggestions`、`renderWorkChoices`、`renderWorksets`、`repairKeys`、`ruleAction`、`rulePaths`、`run`、`selectSnippet`、`selectWorkset`、`setFolder`、`setupToolSplits`、`show`、`showPreview`、`snippetPicker`、`status`、`updateActions`、`updateBackupSelection`、`updateSnippetBulk`、`updateWorkCounts` |
| [profile-service.js](../src/profile-service.js) | `backup`、`captureFiles`、`cleanUI`、`deleteHistory`、`hash`、`history`、`historyPath`、`normalizeBundle`、`preview`、`readJSON`、`recoverProfile`、`restore`、`restoreFiles`、`signature`、`snapshot`、`take`、`transaction` |
| [rename-core.js](../src/rename-core.js) | `assertFingerprint`、`createPreview`、`emit`、`executeMoves`、`fileIdentity`、`filenameProblem`、`fingerprintFile`、`formatDate`、`hashReporter`、`key`、`listPaths`、`localDate`、`normalizeOptions`、`pathExists`、`prepareUndo`、`renameOne`、`reportProgress`、`safe`、`sameIdentity`、`snapshotMoves`、`splitName`、`validateMoves`、`visit` |
| [rename-history.js](../src/rename-history.js) | `writeHistory` |
| [rename-job-worker.js](../src/rename-job-worker.js) | 宣告、設定或共用模型 |
| [rename-job.js](../src/rename-job.js) | `finish`、`perform`、`run`、`workerFilename` |
