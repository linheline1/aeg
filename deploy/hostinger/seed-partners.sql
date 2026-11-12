-- Import the landing page's built-in partner catalog into the managed partner table.
-- Logos are copied to apps/api/uploads/partners/<id>.<ext> before running this file.
INSERT INTO partner (id, category, name, logo_file_path, logo_mime_type, logo_size_bytes, website_url, created_at)
VALUES
  ('catalog-msc', 'carrier', 'MSC', 'apps/api/uploads/partners/msc.svg', 'image/svg+xml', 3331, '', NOW()),
  ('catalog-maersk', 'carrier', 'Maersk', 'apps/api/uploads/partners/maersk.png', 'image/png', 27738, '', NOW()),
  ('catalog-cmacgm', 'carrier', 'CMA CGM', 'apps/api/uploads/partners/cmacgm.svg', 'image/svg+xml', 3642, '', NOW()),
  ('catalog-cosco', 'carrier', 'COSCO', 'apps/api/uploads/partners/cosco.png', 'image/png', 75826, '', NOW()),
  ('catalog-hapaglloyd', 'carrier', 'Hapag-Lloyd', 'apps/api/uploads/partners/hapaglloyd.png', 'image/png', 24900, '', NOW()),
  ('catalog-one', 'carrier', 'ONE', 'apps/api/uploads/partners/one.svg', 'image/svg+xml', 6224, '', NOW()),
  ('catalog-evergreen', 'carrier', 'Evergreen', 'apps/api/uploads/partners/evergreen.svg', 'image/svg+xml', 15039, '', NOW()),
  ('catalog-hmm', 'carrier', 'HMM', 'apps/api/uploads/partners/hmm.png', 'image/png', 29495, '', NOW()),
  ('catalog-yangming', 'carrier', 'Yang Ming', 'apps/api/uploads/partners/yangming.png', 'image/png', 24950, '', NOW()),
  ('catalog-zim', 'carrier', 'ZIM', 'apps/api/uploads/partners/zim.png', 'image/png', 37133, '', NOW()),
  ('catalog-santosbrasil', 'ecosystem', 'Santos Brasil', 'apps/api/uploads/partners/santosbrasil.svg', 'image/svg+xml', 419, '', NOW()),
  ('catalog-sgs', 'ecosystem', 'SGS', 'apps/api/uploads/partners/sgs.svg', 'image/svg+xml', 258, '', NOW()),
  ('catalog-sinosure', 'ecosystem', 'Sinosure', 'apps/api/uploads/partners/sinosure.svg', 'image/svg+xml', 434, '', NOW()),
  ('catalog-mercadolibre', 'ecosystem', 'Mercado Livre', 'apps/api/uploads/partners/mercadolibre.svg', 'image/svg+xml', 423, '', NOW())
ON CONFLICT (id) DO NOTHING;
