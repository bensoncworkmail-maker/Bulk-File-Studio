!macro customUnInstall
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "BulkFileStudio"
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run" "BulkFileStudio"
  DeleteRegKey HKCU "Software\Classes\*\shell\BulkRenameStudio.Favorite"
  DeleteRegKey HKCU "Software\Classes\Directory\shell\BulkRenameStudio.Favorite"
  ${ifNot} ${isUpdated}
    DeleteRegKey HKCU "Software\Google\Chrome\NativeMessagingHosts\com.bulkfilestudio.snippets"
    DeleteRegKey HKCU "Software\Microsoft\Edge\NativeMessagingHosts\com.bulkfilestudio.snippets"
  ${endIf}
!macroend
