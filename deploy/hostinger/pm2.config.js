// PM2 配置：单实例 NestJS API
// 使用：pm2 start pm2.config.js
// 注意：先在 apps/api 下执行 pnpm run build

module.exports = {
  apps: [
    {
      name: 'aeg-ddp-api',
      script: './apps/api/dist/main.js',
      cwd: '/opt/aeg-ddp',
      instances: 1,
      exec_mode: 'fork',
      max_memory_restart: '2G',
      env: {
        NODE_ENV: 'production',
        PORT: 5000,
        // 持久化模式：PostgreSQL（schema 由 migrations 管理，启动自动执行）
        APP_MODULE_MODE: 'postgres'
        // DB_* / JWT_SECRET / UPLOAD_ROOT 由 /opt/aeg-ddp/.env 提供
        // （应用启动时经 dotenv 加载，不要在此覆盖，否则会遮蔽 .env）
      },
      error_file: '/var/log/pm2/ddp-api-err.log',
      out_file: '/var/log/pm2/ddp-api-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      merge_logs: true,
      autorestart: true,
      watch: false
    }
  ]
};
