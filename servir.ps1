# Servidor estático local — necessário para o hero 3D (módulos ES).
$root = $PSScriptRoot
$port = 8000
$prefix = "http://127.0.0.1:$port/"
$listener = [System.Net.HttpListener]::new()
$listener.Prefixes.Add($prefix)
try { $listener.Start() } catch {
  Write-Host "Nao foi possivel abrir $prefix : $_"
  exit 1
}
Write-Host "Minted em $prefix"
$mimes = @{
  '.html' = 'text/html; charset=utf-8'
  '.js'   = 'text/javascript; charset=utf-8'
  '.css'  = 'text/css; charset=utf-8'
  '.svg'  = 'image/svg+xml'
  '.png'  = 'image/png'
  '.jpg'  = 'image/jpeg'
  '.jpeg' = 'image/jpeg'
  '.json' = 'application/json'
  '.txt'  = 'text/plain; charset=utf-8'
  '.xml'  = 'application/xml'
  '.woff2'= 'font/woff2'
}
$rootFull = [IO.Path]::GetFullPath($root)
while ($listener.IsListening) {
  $ctx = $listener.GetContext()
  $rel = [Uri]::UnescapeDataString($ctx.Request.Url.LocalPath.TrimStart('/'))
  if ([string]::IsNullOrWhiteSpace($rel)) { $rel = 'index.html' }
  $full = [IO.Path]::GetFullPath((Join-Path $root $rel))
  if (-not $full.StartsWith($rootFull)) {
    $ctx.Response.StatusCode = 403
    $ctx.Response.Close()
    continue
  }
  if (Test-Path $full -PathType Container) { $full = Join-Path $full 'index.html' }
  if (-not (Test-Path $full -PathType Leaf)) {
    $ctx.Response.StatusCode = 404
    $bytes = [Text.Encoding]::UTF8.GetBytes('Not found')
    $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
    $ctx.Response.Close()
    continue
  }
  $ext = [IO.Path]::GetExtension($full).ToLowerInvariant()
  $ctx.Response.ContentType = $(if ($mimes.ContainsKey($ext)) { $mimes[$ext] } else { 'application/octet-stream' })
  $relNorm = $rel.Replace('\', '/').ToLowerInvariant()
  if ($relNorm -eq 'calculadora' -or $relNorm.StartsWith('calculadora/')) {
    $ctx.Response.Headers.Add('X-Robots-Tag', 'noindex, nofollow, noarchive, nosnippet')
  }
  $bytes = [IO.File]::ReadAllBytes($full)
  $ctx.Response.ContentLength64 = $bytes.Length
  $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
  $ctx.Response.Close()
}
