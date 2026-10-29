import { MigrationInterface, QueryRunner } from 'typeorm';

/** 首版 schema：10 张表（对照 src/entities 全量定义） */
export class InitialSchema1761300000000 implements MigrationInterface {
  name = 'InitialSchema1761300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "client" (
        "id" uuid NOT NULL,
        "name" character varying(100) NOT NULL,
        "status" character varying(20) NOT NULL DEFAULT 'active',
        "salesperson_id" uuid,
        "created_at" timestamp NOT NULL DEFAULT now(),
        "updated_at" timestamp NOT NULL DEFAULT now(),
        "deleted_at" timestamp,
        CONSTRAINT "PK_client" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "user" (
        "id" uuid NOT NULL,
        "username" character varying(50) NOT NULL,
        "password_hash" character varying(255) NOT NULL,
        "role" character varying(20) NOT NULL,
        "client_id" uuid,
        "status" character varying(20) NOT NULL DEFAULT 'active',
        "created_at" timestamp NOT NULL DEFAULT now(),
        "updated_at" timestamp NOT NULL DEFAULT now(),
        "deleted_at" timestamp,
        CONSTRAINT "PK_user" PRIMARY KEY ("id"),
        CONSTRAINT "FK_user_client" FOREIGN KEY ("client_id") REFERENCES "client"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
      )
    `);
    await queryRunner.query(`CREATE UNIQUE INDEX "IDX_user_username" ON "user" ("username")`);

    await queryRunner.query(`
      CREATE TABLE "template_version" (
        "id" uuid NOT NULL,
        "template_code" character varying(50) NOT NULL DEFAULT 'BR_FCL',
        "version_no" character varying(20) NOT NULL,
        "file_path" character varying(500) NOT NULL,
        "file_hash" character varying(128) NOT NULL,
        "schema_json" jsonb NOT NULL,
        "meta_json" jsonb NOT NULL,
        "status" character varying(20) NOT NULL DEFAULT 'inactive',
        "created_by" uuid,
        "activated_at" timestamp,
        "created_at" timestamp NOT NULL DEFAULT now(),
        "updated_at" timestamp NOT NULL DEFAULT now(),
        CONSTRAINT "PK_template_version" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_template_version_version_no" ON "template_version" ("version_no")`);

    await queryRunner.query(`
      CREATE TABLE "template_field" (
        "id" uuid NOT NULL,
        "template_version_id" uuid NOT NULL,
        "col_letter" character varying(5) NOT NULL,
        "header_cn" character varying(50) NOT NULL,
        "field_key" character varying(50) NOT NULL,
        "data_type" character varying(20) NOT NULL,
        "required" boolean NOT NULL DEFAULT false,
        "editable" boolean NOT NULL DEFAULT true,
        "formula" character varying(50),
        "validation_json" jsonb,
        "visible_client" boolean NOT NULL DEFAULT true,
        "visible_operator" boolean NOT NULL DEFAULT true,
        "sort_order" integer NOT NULL DEFAULT 0,
        CONSTRAINT "PK_template_field" PRIMARY KEY ("id"),
        CONSTRAINT "FK_template_field_version" FOREIGN KEY ("template_version_id") REFERENCES "template_version"("id") ON DELETE CASCADE ON UPDATE NO ACTION
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_template_field_version" ON "template_field" ("template_version_id")`);

    await queryRunner.query(`
      CREATE TABLE "audit_log" (
        "id" uuid NOT NULL,
        "ts" timestamp NOT NULL DEFAULT now(),
        "actor_username" character varying(50) NOT NULL DEFAULT 'system',
        "actor_role" character varying(20) NOT NULL DEFAULT 'system',
        "action" character varying(50) NOT NULL,
        "target_type" character varying(50),
        "target_id" character varying,
        "detail" jsonb,
        CONSTRAINT "PK_audit_log" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_audit_log_ts" ON "audit_log" ("ts")`);
    await queryRunner.query(`CREATE INDEX "IDX_audit_log_action" ON "audit_log" ("action")`);

    await queryRunner.query(`
      CREATE TABLE "quote_order" (
        "id" uuid NOT NULL,
        "quote_no" character varying(40) NOT NULL,
        "client_id" uuid NOT NULL,
        "template_code" character varying(50) NOT NULL,
        "template_version" character varying(20) NOT NULL,
        "status" character varying(20) NOT NULL DEFAULT 'uploaded',
        "total_amount_brl" double precision,
        "total_amount_usd" double precision,
        "input_file_name" character varying(255),
        "input_file_path" character varying(500),
        "total_cbm" double precision,
        "total_gw_kg" double precision,
        "total_rows" integer,
        "valid_rows" integer,
        "pricing_breakdown" jsonb,
        "line_items" jsonb,
        "salesperson_id" uuid,
        "deal_status" character varying(10),
        "deal_note" text,
        "deal_closed_at" timestamp,
        "shipment" jsonb,
        "invoice_cnpj" jsonb,
        "error_message" text,
        "created_at" timestamp NOT NULL DEFAULT now(),
        "updated_at" timestamp NOT NULL DEFAULT now(),
        CONSTRAINT "PK_quote_order" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`CREATE UNIQUE INDEX "IDX_quote_order_quote_no" ON "quote_order" ("quote_no")`);
    await queryRunner.query(`CREATE INDEX "IDX_quote_order_client_id" ON "quote_order" ("client_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_quote_order_salesperson_id" ON "quote_order" ("salesperson_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_quote_order_status" ON "quote_order" ("status")`);

    await queryRunner.query(`
      CREATE TABLE "fee_rate" (
        "id" uuid NOT NULL,
        "scope" character varying(10) NOT NULL,
        "client_id" uuid,
        "ocean_freight_usd" double precision NOT NULL,
        "port_fee_usd" double precision NOT NULL,
        "br_clearance_brl" double precision NOT NULL,
        "fx_rate" double precision NOT NULL,
        "updated_by" character varying(50) NOT NULL,
        "updated_at" timestamp NOT NULL,
        CONSTRAINT "PK_fee_rate" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`CREATE UNIQUE INDEX "IDX_fee_rate_scope_client" ON "fee_rate" ("scope", "client_id")`);

    await queryRunner.query(`
      CREATE TABLE "client_image" (
        "id" uuid NOT NULL,
        "client_id" uuid NOT NULL,
        "quote_id" uuid,
        "row_no" integer,
        "file_name" character varying(255) NOT NULL,
        "file_path" character varying(500) NOT NULL,
        "mime_type" character varying(100) NOT NULL,
        "size_bytes" integer NOT NULL,
        "created_at" timestamp NOT NULL DEFAULT now(),
        CONSTRAINT "PK_client_image" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_client_image_client_id" ON "client_image" ("client_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_client_image_quote_id" ON "client_image" ("quote_id")`);

    await queryRunner.query(`
      CREATE TABLE "client_cnpj" (
        "id" uuid NOT NULL,
        "client_id" uuid NOT NULL,
        "cnpj" character varying(20) NOT NULL,
        "company_name" character varying(200) NOT NULL,
        "is_default" boolean NOT NULL DEFAULT false,
        "created_at" timestamp NOT NULL DEFAULT now(),
        "updated_at" timestamp NOT NULL DEFAULT now(),
        CONSTRAINT "PK_client_cnpj" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_client_cnpj_client_id" ON "client_cnpj" ("client_id")`);

    await queryRunner.query(`
      CREATE TABLE "order_file" (
        "id" uuid NOT NULL,
        "quote_id" uuid NOT NULL,
        "kind" character varying(20) NOT NULL,
        "file_name" character varying(255) NOT NULL,
        "file_path" character varying(500) NOT NULL,
        "mime_type" character varying(100) NOT NULL,
        "size_bytes" integer NOT NULL,
        "note" text,
        "uploaded_by" character varying(64) NOT NULL,
        "created_at" timestamp NOT NULL DEFAULT now(),
        CONSTRAINT "PK_order_file" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_order_file_quote_id" ON "order_file" ("quote_id")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "order_file"`);
    await queryRunner.query(`DROP TABLE "client_cnpj"`);
    await queryRunner.query(`DROP TABLE "client_image"`);
    await queryRunner.query(`DROP TABLE "fee_rate"`);
    await queryRunner.query(`DROP TABLE "quote_order"`);
    await queryRunner.query(`DROP TABLE "audit_log"`);
    await queryRunner.query(`DROP TABLE "template_field"`);
    await queryRunner.query(`DROP TABLE "template_version"`);
    await queryRunner.query(`DROP TABLE "user"`);
    await queryRunner.query(`DROP TABLE "client"`);
  }
}
