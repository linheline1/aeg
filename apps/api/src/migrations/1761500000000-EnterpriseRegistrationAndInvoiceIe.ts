import { MigrationInterface, QueryRunner } from 'typeorm';

export class EnterpriseRegistrationAndInvoiceIe1761500000000 implements MigrationInterface {
  name = 'EnterpriseRegistrationAndInvoiceIe1761500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "client" ADD "china_company_name" character varying(128)`);
    await queryRunner.query(`ALTER TABLE "client" ADD "china_uscc" character varying(18)`);
    await queryRunner.query(`ALTER TABLE "client_cnpj" ADD "ie" character varying(30)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "client_cnpj" DROP COLUMN "ie"`);
    await queryRunner.query(`ALTER TABLE "client" DROP COLUMN "china_uscc"`);
    await queryRunner.query(`ALTER TABLE "client" DROP COLUMN "china_company_name"`);
  }
}
