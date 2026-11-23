import { MigrationInterface, QueryRunner } from 'typeorm';

export class QuotePublication1794460000004 implements MigrationInterface {
  async up(runner: QueryRunner) {
    await runner.query('ALTER TABLE quote_order ADD COLUMN quote_versions jsonb');
  }
  async down(runner: QueryRunner) {
    await runner.query('ALTER TABLE quote_order DROP COLUMN quote_versions');
  }
}
