!macro customUnInstall
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "BulkFileStudio"
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run" "BulkFileStudio"
  DeleteRegKey HKCU "Software\Classes\*\shell\BulkRenameStudio.Favorite"
  DeleteRegKey HKCU "Software\Classes\Directory\shell\BulkRenameStudio.Favorite"
!macroend
