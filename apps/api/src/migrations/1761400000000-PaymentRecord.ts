import { MigrationInterface, QueryRunner } from 'typeorm';

/** M10 财务：回款记录表 */
export class PaymentRecord1761400000000 implements MigrationInterface {
  name = 'PaymentRecord1761400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "payment_record" (
        "id" uuid NOT NULL,
        "quote_id" uuid NOT NULL,
        "amount_brl" double precision NOT NULL,
        "paid_at" date NOT NULL,
        "note" text,
        "created_by" character varying(50) NOT NULL,
        "created_at" timestamp NOT NULL DEFAULT now(),
        CONSTRAINT "PK_payment_record" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_payment_record_quote_id" ON "payment_record" ("quote_id")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "payment_record"`);
  }
}
