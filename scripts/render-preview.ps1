# Synthetic illustration only. Never capture a real workspace/account for publication.
Add-Type -AssemblyName System.Drawing
$bitmap = New-Object System.Drawing.Bitmap 1000,360
$g = [System.Drawing.Graphics]::FromImage($bitmap)
$g.Clear([System.Drawing.ColorTranslator]::FromHtml('#16181d'))
$g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
$font = New-Object System.Drawing.Font 'Segoe UI',12
$small = New-Object System.Drawing.Font 'Segoe UI',10
$white = New-Object System.Drawing.SolidBrush ([System.Drawing.ColorTranslator]::FromHtml('#d9dee8'))
$muted = New-Object System.Drawing.SolidBrush ([System.Drawing.ColorTranslator]::FromHtml('#b5bdca'))
$raised = New-Object System.Drawing.SolidBrush ([System.Drawing.ColorTranslator]::FromHtml('#252933'))
$pen = New-Object System.Drawing.Pen ([System.Drawing.ColorTranslator]::FromHtml('#3a3e48'))
try {
  $g.DrawLine($pen,0,58,1000,58)
  $g.FillRectangle($raised,20,14,150,32)
  $g.DrawString('Terminal',$font,$white,35,20)
  $g.DrawString('Codex   5h 78%   7d 89%   Resets: 3',$font,$white,190,20)
  $g.DrawString('Reinicios de Codex',$font,$white,40,82)
  $g.FillRectangle($raised,30,122,940,84)
  $g.FillRectangle($raised,30,220,940,84)
  $g.DrawString('Full reset (Weekly + 5 hr)',$font,$white,48,138)
  $g.DrawString('Disponible - caducidad indicada por Codex',$small,$muted,48,174)
  $g.DrawString('Usar...',$font,$white,870,150)
  $g.DrawString('Confirmacion antes de gastar un credito real',$font,$white,48,236)
  $g.DrawString('Ningun reinicio se consume automaticamente',$small,$muted,48,272)
  $g.DrawString('Vista ilustrativa - datos ficticios - mod comunitario',$small,$muted,32,326)
  $out = Join-Path $PSScriptRoot '../packages/codex-usage/preview.png'
  $bitmap.Save([System.IO.Path]::GetFullPath($out),[System.Drawing.Imaging.ImageFormat]::Png)
} finally {
  $g.Dispose(); $bitmap.Dispose(); $font.Dispose(); $small.Dispose()
  $white.Dispose(); $muted.Dispose(); $raised.Dispose(); $pen.Dispose()
}
