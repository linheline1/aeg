// Keep paging, counting and read validation in PostgreSQL. Event keys match the local snapshot adapter.
export const notificationQuery = `
  WITH orders AS (
    SELECT id, quote_no, quote_versions, shipment, document_requests FROM quote_order
    WHERE client_id = $1 AND status <> 'deleted' AND (quote_versions IS NOT NULL OR shipment IS NOT NULL OR document_requests IS NOT NULL)
  ), documents AS (
    SELECT o.id, o.quote_no, d.data
    FROM orders o CROSS JOIN LATERAL jsonb_array_elements(
      CASE WHEN jsonb_typeof(o.document_requests) = 'array' THEN o.document_requests ELSE '[]'::jsonb END) d(data)
  ), source AS (
    SELECT o.id, o.quote_no, 'published:' || (v->>'version') AS key, 'published' AS type,
      v->>'published_at' AS at, v->'version' AS version, NULL::text AS stage, NULL::text AS message
    FROM orders o CROSS JOIN LATERAL jsonb_array_elements(
      CASE WHEN jsonb_typeof(o.quote_versions) = 'array' THEN o.quote_versions ELSE '[]'::jsonb END) v
    UNION ALL
    SELECT o.id, o.quote_no, 'decision:' || (v->>'version'), v->'decision'->>'value',
      v->'decision'->>'at', v->'version', NULL, NULL
    FROM orders o CROSS JOIN LATERAL jsonb_array_elements(
      CASE WHEN jsonb_typeof(o.quote_versions) = 'array' THEN o.quote_versions ELSE '[]'::jsonb END) v
    WHERE v->'decision'->>'value' IN ('accepted', 'rejected')
    UNION ALL
    SELECT o.id, o.quote_no, 'shipment:' || (e->>'id'), 'shipment',
      COALESCE(e->>'created_at', e->>'happened_at'), NULL, e->>'stage', NULL
    FROM orders o CROSS JOIN LATERAL jsonb_array_elements(
      CASE WHEN jsonb_typeof(o.shipment->'events') = 'array' THEN o.shipment->'events' ELSE '[]'::jsonb END) e
    UNION ALL
    SELECT o.id, o.quote_no, 'exception:' || (e->>'updated_at'), 'exception_' || (e->>'status'),
      e->>'updated_at', NULL, NULL, e->>'message'
    FROM orders o CROSS JOIN LATERAL jsonb_array_elements(
      CASE WHEN jsonb_typeof(o.shipment->'exception_updates') = 'array' THEN o.shipment->'exception_updates'
        ELSE jsonb_build_array(o.shipment->'exception') END) e
    WHERE e->>'status' IN ('open', 'resolved')
    UNION ALL
    SELECT d.id, d.quote_no, 'document-request:' || (d.data->>'id'), 'document_requested',
      d.data->>'requested_at', NULL, d.data->>'type', d.data->>'title'
    FROM documents d
    UNION ALL
    SELECT d.id, d.quote_no, 'document-rejected:' || (v->>'id'), 'document_rejected',
      v->'review'->>'at', NULL, d.data->>'type', v->'review'->>'reason'
    FROM documents d CROSS JOIN LATERAL jsonb_array_elements(d.data->'versions') v
    WHERE v->'review'->>'status' = 'rejected'
  ), notices AS (
    SELECT DISTINCT ON (source.id, source.key) source.id::text || ':' || source.key AS id,
      source.id AS "quoteId", source.quote_no AS "quoteNo", source.type, source.at,
      source.version, source.stage, source.message
    FROM source
    WHERE source.key IS NOT NULL AND source.at IS NOT NULL AND source.at <> ''
    ORDER BY source.id, source.key, source.at DESC
  ), inbox AS (
    SELECT n.*, (r.event_key IS NOT NULL) AS read FROM notices n
    LEFT JOIN client_notification_read r ON r.client_id = $1 AND r.user_id = $2 AND r.event_key = n.id
  )
`;
