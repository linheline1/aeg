import { MigrationInterface, QueryRunner } from 'typeorm';

export class QuoteSourceDraft1794460000002 implements MigrationInterface {
  name = 'QuoteSourceDraft1794460000002';

  async up(runner: QueryRunner) {
    await runner.query('ALTER TABLE quote_order ADD COLUMN source_draft_id uuid');
    await runner.query(`UPDATE quote_order q SET source_draft_id = d.id
      FROM upload_draft d
      WHERE d.status = 'confirmed' AND d.quote_id = q.id
        AND (SELECT count(*) FROM upload_draft x WHERE x.status = 'confirmed' AND x.quote_id = q.id) = 1`);
    await runner.query('CREATE UNIQUE INDEX uq_quote_source_draft ON quote_order(source_draft_id) WHERE source_draft_id IS NOT NULL');
  }

  async down(runner: QueryRunner) {
    await runner.query('ALTER TABLE quote_order DROP COLUMN source_draft_id');
  }
}
