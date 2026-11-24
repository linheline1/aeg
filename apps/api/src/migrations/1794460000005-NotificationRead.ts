import { MigrationInterface, QueryRunner } from 'typeorm';

export class NotificationRead1794460000005 implements MigrationInterface {
  async up(runner: QueryRunner) {
    await runner.query(`CREATE TABLE client_notification_read (
      client_id uuid NOT NULL,
      user_id uuid NOT NULL,
      event_key text NOT NULL,
      read_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (client_id, user_id, event_key)
    )`);
  }

  async down(runner: QueryRunner) {
    await runner.query('DROP TABLE client_notification_read');
  }
}
