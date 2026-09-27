# Converts a DOCX to PDF with Microsoft Word, for visual checks of the generated ACR.
param([Parameter(Mandatory)][string]$In, [Parameter(Mandatory)][string]$Out)
$inPath = (Resolve-Path $In).Path
$outPath = [System.IO.Path]::GetFullPath($Out)
$word = New-Object -ComObject Word.Application
$word.Visible = $false
try {
  $doc = $word.Documents.Open($inPath, $false, $true)
  $doc.ExportAsFixedFormat($outPath, 17)
  try { $doc.Close($false) } catch { }  # Word sometimes drops the COM link after exporting; the PDF is already written
} finally {
  try { $word.Quit() } catch { }
}
if (-not (Test-Path $outPath)) { throw "PDF was not created: $outPath" }
Write-Output "Wrote $outPath"
