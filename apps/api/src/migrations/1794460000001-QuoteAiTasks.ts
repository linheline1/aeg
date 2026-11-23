import { MigrationInterface, QueryRunner } from 'typeorm';

export class QuoteAiTasks1794460000001 implements MigrationInterface {
  name = 'QuoteAiTasks1794460000001';

  async up(runner: QueryRunner): Promise<void> {
    await runner.query(`CREATE TABLE "quote_ai_task" (
      "key" text PRIMARY KEY, "revision" integer NOT NULL, "state" jsonb NOT NULL
    )`);
    await runner.query(`CREATE INDEX "IDX_quote_ai_task_poll" ON "quote_ai_task" (
      ("state"->>'status'), (("state"->>'updatedAt')::bigint)
    )`);
  }

  async down(runner: QueryRunner): Promise<void> {
    await runner.query('DROP TABLE "quote_ai_task"');
  }
}
