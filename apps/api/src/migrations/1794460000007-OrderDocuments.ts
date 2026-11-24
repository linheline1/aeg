import { MigrationInterface, QueryRunner } from 'typeorm';

export class OrderDocuments1794460000007 implements MigrationInterface {
  async up(runner: QueryRunner) {
    await runner.query('ALTER TABLE quote_order ADD COLUMN document_requests jsonb');
  }

  async down(runner: QueryRunner) {
    await runner.query('ALTER TABLE quote_order DROP COLUMN document_requests');
  }
}
