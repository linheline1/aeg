# 把巴西电商平台的 7 个 logo 作为生态合作伙伴导入管理端
$base = 'http://127.0.0.1:5000'
$logos = 'c:\Users\admin\Documents\Trae-CN\default\aeg\logos'

$partners = @(
  @{ name = 'Shein';          file = 'shein.svg' },
  @{ name = 'Mercado Livre';  file = 'mercado-livre.svg' },
  @{ name = 'Shopee';         file = 'shopee.svg' },
  @{ name = 'Amazon';         file = 'amazon.svg' },
  @{ name = 'Kwai';           file = 'kwai.svg' },
  @{ name = 'TikTok';         file = 'tiktok.svg' },
  @{ name = 'Magalu';         file = 'magalu.svg' }
)

$login = curl.exe -s -X POST "$base/api/auth/login" -H "Content-Type: application/json" -d '{\"username\":\"admin\",\"password\":\"admin123\"}' | ConvertFrom-Json
$token = $login.access_token
if (-not $token) { Write-Output 'LOGIN FAILED'; exit 1 }

$existing = (curl.exe -s "$base/api/admin/partners" -H "Authorization: Bearer $token" | ConvertFrom-Json).items
Write-Output "existing partners: $($existing.Count)"

foreach ($p in $partners) {
  $dupe = $existing | Where-Object { $_.category -eq 'ecosystem' -and $_.name -eq $p.name }
  if ($dupe) {
    # 已存在：删除后用新 logo 重新添加（更新素材）
    curl.exe -s -X DELETE "$base/api/admin/partners/$($dupe.id)" -H "Authorization: Bearer $token" | Out-Null
    Write-Output "REMOVED old: $($p.name)"
  }
  $logoPath = Join-Path $logos $p.file
  $r = curl.exe -s -X POST "$base/api/admin/partners" -H "Authorization: Bearer $token" -F "name=$($p.name)" -F "category=ecosystem" -F "logo=@$logoPath"
  if ($r -match '"ok":true') { Write-Output "OK: [ecosystem] $($p.name)" }
  else { Write-Output "FAIL: $($p.name) -> $r" }
}

Write-Output '--- final ecosystem list ---'
$final = (curl.exe -s "$base/api/admin/partners" -H "Authorization: Bearer $token" | ConvertFrom-Json).items
$final | Where-Object { $_.category -eq 'ecosystem' } | ForEach-Object { Write-Output "$($_.name) -> $($_.logo_url)" }
Write-Output "total ecosystem: $(($final | Where-Object { $_.category -eq 'ecosystem' }).Count) / total: $($final.Count)"
