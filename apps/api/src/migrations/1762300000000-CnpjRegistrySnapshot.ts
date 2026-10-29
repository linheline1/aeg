import { MigrationInterface, QueryRunner } from 'typeorm';

export class CnpjRegistrySnapshot1762300000000 implements MigrationInterface {
  name = 'CnpjRegistrySnapshot1762300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "client_cnpj" ADD "nome_fantasia" character varying(200)`);
    await queryRunner.query(`ALTER TABLE "client_cnpj" ADD "situacao_cadastral" character varying(80)`);
    await queryRunner.query(`ALTER TABLE "client_cnpj" ADD "endereco" jsonb`);
    await queryRunner.query(`ALTER TABLE "client_cnpj" ADD "registry_snapshot" jsonb`);
    await queryRunner.query(`ALTER TABLE "client_cnpj" ADD "queried_at" timestamp`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "client_cnpj" DROP COLUMN "queried_at"`);
    await queryRunner.query(`ALTER TABLE "client_cnpj" DROP COLUMN "registry_snapshot"`);
    await queryRunner.query(`ALTER TABLE "client_cnpj" DROP COLUMN "endereco"`);
    await queryRunner.query(`ALTER TABLE "client_cnpj" DROP COLUMN "situacao_cadastral"`);
    await queryRunner.query(`ALTER TABLE "client_cnpj" DROP COLUMN "nome_fantasia"`);
  }
}
