# Garante que a conta Cloudflare tenha um subdominio workers.dev (usa o login salvo pelo Wrangler).
$ErrorActionPreference = 'Stop'
$candidatos = @('minted', 'minted3d', 'minted-3d', 'mintedbr', ('minted' + (Get-Random -Minimum 100 -Maximum 999)))

$paths = @(
  "$env:APPDATA\xdg.config\.wrangler\config\default.toml",
  "$env:USERPROFILE\.wrangler\config\default.toml",
  "$env:USERPROFILE\.config\.wrangler\config\default.toml"
)
$cfg = $paths | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $cfg) { Write-Host '[ERRO] Login do Wrangler nao encontrado.'; exit 1 }
$m = [regex]::Match((Get-Content $cfg -Raw), 'oauth_token\s*=\s*"([^"]+)"')
if (-not $m.Success) { Write-Host '[ERRO] Token do Wrangler nao encontrado.'; exit 1 }
$h = @{ Authorization = 'Bearer ' + $m.Groups[1].Value; 'Content-Type' = 'application/json' }
$api = 'https://api.cloudflare.com/client/v4'

$acc = (Invoke-RestMethod -Uri "$api/accounts" -Headers $h).result | Select-Object -First 1
if (-not $acc) { Write-Host '[ERRO] Nenhuma conta Cloudflare encontrada.'; exit 1 }

try {
  $sub = (Invoke-RestMethod -Uri "$api/accounts/$($acc.id)/workers/subdomain" -Headers $h).result.subdomain
} catch { $sub = $null }
if ($sub) { Write-Host "Subdominio ja existe: $sub.workers.dev"; exit 0 }

foreach ($c in $candidatos) {
  try {
    $body = @{ subdomain = $c } | ConvertTo-Json
    $r = Invoke-RestMethod -Method Put -Uri "$api/accounts/$($acc.id)/workers/subdomain" -Headers $h -Body $body
    if ($r.success) { Write-Host "Subdominio registrado: $c.workers.dev"; exit 0 }
  } catch { Write-Host "  '$c' indisponivel, tentando outro..." }
}
Write-Host '[ERRO] Nao consegui registrar um subdominio.'
exit 1
