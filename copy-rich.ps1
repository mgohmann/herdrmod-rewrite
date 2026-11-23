param(
  [Parameter(Mandatory = $true)][string]$HtmlPath,
  [Parameter(Mandatory = $true)][string]$PlainPath
)

Add-Type -AssemblyName System.Windows.Forms
$html = [System.IO.File]::ReadAllText($HtmlPath, [System.Text.Encoding]::UTF8)
$plain = [System.IO.File]::ReadAllText($PlainPath, [System.Text.Encoding]::UTF8)

$data = New-Object System.Windows.Forms.DataObject
$data.SetData([System.Windows.Forms.DataFormats]::Html, $html)
$data.SetText($plain, [System.Windows.Forms.TextDataFormat]::UnicodeText)
[System.Windows.Forms.Clipboard]::SetDataObject($data, $true)
