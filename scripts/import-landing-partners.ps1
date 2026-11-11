# 将落地页静态合作伙伴 + logo 导入管理端（通过 admin API，含审计与文件存储）
$base = 'http://127.0.0.1:5000'
$assets = 'c:\Users\admin\Documents\Trae-CN\default\aeg\apps\web-client\src\assets\partners'

$partners = @(
  @{ category = 'carrier';   name = 'MSC';           file = 'msc.svg' },
  @{ category = 'carrier';   name = 'Maersk';        file = 'maersk.png' },
  @{ category = 'carrier';   name = 'CMA CGM';       file = 'cmacgm.svg' },
  @{ category = 'carrier';   name = 'COSCO';         file = 'cosco.png' },
  @{ category = 'carrier';   name = 'Hapag-Lloyd';   file = 'hapaglloyd.png' },
  @{ category = 'carrier';   name = 'ONE';           file = 'one.svg' },
  @{ category = 'carrier';   name = 'Evergreen';     file = 'evergreen.svg' },
  @{ category = 'carrier';   name = 'HMM';           file = 'hmm.png' },
  @{ category = 'carrier';   name = 'Yang Ming';     file = 'yangming.png' },
  @{ category = 'carrier';   name = 'ZIM';           file = 'zim.png' },
  @{ category = 'ecosystem'; name = 'Santos Brasil'; file = 'santosbrasil.svg' },
  @{ category = 'ecosystem'; name = 'SGS';           file = 'sgs.svg' },
  @{ category = 'ecosystem'; name = 'Sinosure';      file = 'sinosure.svg' },
  @{ category = 'ecosystem'; name = 'Mercado Livre'; file = 'mercadolibre.svg' }
)

$login = curl.exe -s -X POST "$base/api/auth/login" -H "Content-Type: application/json" -d '{\"username\":\"admin\",\"password\":\"admin123\"}' | ConvertFrom-Json
$token = $login.access_token
if (-not $token) { Write-Output 'LOGIN FAILED'; exit 1 }

# 已存在的（按分类+名称）跳过，保证脚本可重复执行
$existing = (curl.exe -s "$base/api/admin/partners" -H "Authorization: Bearer $token" | ConvertFrom-Json).items
Write-Output "existing partners: $($existing.Count)"

$ok = 0; $skip = 0; $fail = 0
foreach ($p in $partners) {
  $dupe = $existing | Where-Object { $_.category -eq $p.category -and $_.name -eq $p.name }
  if ($dupe) { Write-Output "SKIP (已存在): $($p.name)"; $skip++; continue }
  $logoPath = Join-Path $assets $p.file
  $r = curl.exe -s -X POST "$base/api/admin/partners" -H "Authorization: Bearer $token" -F "name=$($p.name)" -F "category=$($p.category)" -F "logo=@$logoPath"
  if ($r -match '"ok":true') { Write-Output "OK: [$($p.category)] $($p.name)"; $ok++ }
  else { Write-Output "FAIL: $($p.name) -> $r"; $fail++ }
}
Write-Output "--- done: ok=$ok skip=$skip fail=$fail ---"
Write-Output '--- public list ---'
curl.exe -s "$base/api/partners"
