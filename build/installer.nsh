!macro customUnInstall
  DeleteRegKey HKCU "Software\Classes\*\shell\BulkRenameStudio.Favorite"
  DeleteRegKey HKCU "Software\Classes\Directory\shell\BulkRenameStudio.Favorite"
!macroend
