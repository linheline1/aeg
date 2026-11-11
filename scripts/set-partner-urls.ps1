# 为现有合作伙伴补充官网链接（PATCH /api/admin/partners/:id）
$base = 'http://127.0.0.1:5000'

$urls = @{
  'MSC'            = 'https://www.msc.com'
  'Maersk'         = 'https://www.maersk.com'
  'CMA CGM'        = 'https://www.cma-cgm.com'
  'COSCO'          = 'https://www.coscoshipping.com'
  'Hapag-Lloyd'    = 'https://www.hapag-lloyd.com'
  'ONE'            = 'https://www.one-line.com'
  'Evergreen'      = 'https://www.evergreen-marine.com'
  'HMM'            = 'https://www.hmm21.com'
  'Yang Ming'      = 'https://www.yangming.com'
  'ZIM'            = 'https://www.zim.com'
  'Santos Brasil'  = 'https://www.santosbrasil.com.br'
  'SGS'            = 'https://www.sgs.com'
  'Sinosure'       = 'https://www.sinosure.com.cn'
  'Mercado Livre'  = 'https://www.mercadolivre.com.br'
  'Shein'          = 'https://www.shein.com.br'
  'Shopee'         = 'https://shopee.com.br'
  'Amazon'         = 'https://www.amazon.com.br'
  'Kwai'           = 'https://www.kwai.com'
  'TikTok'         = 'https://www.tiktok.com'
  'Magalu'         = 'https://www.magazineluiza.com.br'
}

$login = curl.exe -s -X POST "$base/api/auth/login" -H "Content-Type: application/json" -d '{\"username\":\"admin\",\"password\":\"admin123\"}' | ConvertFrom-Json
$token = $login.access_token
if (-not $token) { Write-Output 'LOGIN FAILED'; exit 1 }

$items = (curl.exe -s "$base/api/admin/partners" -H "Authorization: Bearer $token" | ConvertFrom-Json).items
$ok = 0; $skip = 0
foreach ($p in $items) {
  $url = $urls[$p.name]
  if (-not $url) { Write-Output "SKIP (无预设链接): $($p.name)"; $skip++; continue }
  if ($p.website_url -eq $url) { $skip++; continue }
  $body = '{"website_url": "' + $url + '"}'
  $r = curl.exe -s -X PATCH "$base/api/admin/partners/$($p.id)" -H "Authorization: Bearer $token" -H "Content-Type: application/json" -d $body
  if ($r -match '"ok":true') { Write-Output "OK: $($p.name) -> $url"; $ok++ }
  else { Write-Output "FAIL: $($p.name) -> $r" }
}
Write-Output "--- done: ok=$ok skip=$skip ---"
