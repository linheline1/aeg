import fs from 'fs';
import path from 'path';
import { Client } from 'ssh2';

const HOST = process.env.DEPLOY_SSH_HOST || '185.139.1.213';
const USER = process.env.DEPLOY_SSH_USER || 'root';
const PASSWORD = process.env.DEPLOY_SSH_PASSWORD;
const APP_ROOT = '/opt/aeg-ddp';
const BACKUP_ROOT = '/opt/aeg-ddp-backups';
const localArchive = path.resolve('deploy/aeg-ddp-deploy.tar.gz');
const action = process.argv[2] || 'preflight';

if (!PASSWORD) {
  console.error('DEPLOY_SSH_PASSWORD is required');
  process.exit(2);
}

const conn = new Client();

function exec(command, timeoutMs = 600000) {
  return new Promise((resolve, reject) => {
    conn.exec(command, { pty: true }, (err, stream) => {
      if (err) return reject(err);
      let stdout = '';
      let stderr = '';
      const timer = setTimeout(() => {
        stream.close();
        reject(new Error(`Command timed out after ${timeoutMs}ms`));
      }, timeoutMs);
      stream.on('close', code => {
        clearTimeout(timer);
        resolve({ code: code ?? 0, stdout, stderr });
      });
      stream.on('data', data => {
        const text = data.toString();
        stdout += text;
        process.stdout.write(text);
      });
      stream.stderr.on('data', data => {
        const text = data.toString();
        stderr += text;
        process.stderr.write(text);
      });
    });
  });
}

function upload(local, remote) {
  return new Promise((resolve, reject) => {
    conn.sftp((err, sftp) => {
      if (err) return reject(err);
      sftp.fastPut(local, remote, err2 => {
        sftp.end();
        if (err2) reject(err2);
        else resolve();
      });
    });
  });
}

function connect() {
  return new Promise((resolve, reject) => {
    conn.on('ready', resolve).on('error', reject).connect({
      host: HOST,
      port: 22,
      username: USER,
      password: PASSWORD,
      readyTimeout: 30000,
      keepaliveInterval: 15000
    });
  });
}

try {
  await connect();
  if (action === 'preflight') {
    await exec(`
      set -e
      echo "HOST=$(hostname)"
      echo "DISK"; df -h / /opt | tail -n +1
      echo "APP"; ls -ld ${APP_ROOT}; test -f ${APP_ROOT}/.env && echo ".env exists"
      echo "DB"; sudo -u postgres psql -Atc "select datname from pg_database where datname='ddpserver'"
      echo "PM2"; pm2 list
      echo "HTTP"; curl -s -o /dev/null -w "client=%{http_code}\\n" https://app.linsgeekai.com.br/ || true
      curl -s -o /dev/null -w "ops=%{http_code}\\n" https://ops.linsgeekai.com.br/ || true
      curl -s -o /dev/null -w "admin=%{http_code}\\n" https://admin.linsgeekai.com.br/ || true
      curl -s -o /dev/null -w "customs=%{http_code}\\n" https://customs.linsgeekai.com.br/ || true
    `, 120000);
  } else if (action === 'deploy') {
    if (!fs.existsSync(localArchive)) throw new Error('deploy archive missing');
    const stamp = new Date().toISOString().replace(/\D/g, '').slice(0, 14);
    const backup = await exec(`
      set -euo pipefail
      mkdir -p ${BACKUP_ROOT}
      tar -czf ${BACKUP_ROOT}/predeploy-${stamp}.tar.gz --exclude='node_modules' --exclude='*/node_modules' --exclude='.git' -C ${APP_ROOT} .
      sudo -u postgres pg_dump -Fc ddpserver > ${BACKUP_ROOT}/db-${stamp}.dump
      ls -lh ${BACKUP_ROOT}/predeploy-${stamp}.tar.gz ${BACKUP_ROOT}/db-${stamp}.dump
      echo BACKUP_STAMP=${stamp}
    `, 600000);
    if (backup.code !== 0) throw new Error('backup failed');

    const remoteArchive = `${APP_ROOT}/deploy/aeg-ddp-deploy.tar.gz.new`;
    console.log(`\nUploading ${localArchive} ...`);
    await upload(localArchive, remoteArchive);

    const deploy = await exec(`
      set -euo pipefail
      cd ${APP_ROOT}
      mv deploy/aeg-ddp-deploy.tar.gz.new deploy/aeg-ddp-deploy.tar.gz
      tar -xzf deploy/aeg-ddp-deploy.tar.gz -C ${APP_ROOT}
      # tar 解包不会删除仓库中已移除的文件：清理 landing 重构前的旧组件
      rm -f apps/web-client/src/pages/landing/sections.tsx
      bash deploy/hostinger/update.sh
      bash deploy/hostinger/enable-subdomains.sh
    `, 1800000);
    if (deploy.code !== 0) throw new Error('deployment failed');
  } else if (action === 'status') {
    await exec(`
      set -e
      echo "PM2"; pm2 list
      echo "MIGRATIONS"; sudo -u postgres psql -d ddpserver -Atc "select name from migrations order by id desc limit 5"
      echo "API"; curl -s -o /dev/null -w "api_unauth=%{http_code}\\n" http://127.0.0.1:5000/api/auth/me || true
      echo "SITES"
      for url in https://app.linsgeekai.com.br/ https://ops.linsgeekai.com.br/ https://admin.linsgeekai.com.br/ https://customs.linsgeekai.com.br/; do
        curl -s -o /dev/null -w "$url => %{http_code}\\n" "$url" || true
      done
      echo "CLIENT_ASSET"; curl -s https://app.linsgeekai.com.br/login | grep -o 'assets/index-[^"]*\\.js' | head -n 1 || true
      echo "OPS_ASSET"; curl -s https://ops.linsgeekai.com.br/login | grep -o 'assets/index-[^"]*\\.js' | head -n 1 || true
      echo "ADMIN_ASSET"; curl -s https://admin.linsgeekai.com.br/login | grep -o 'assets/index-[^"]*\\.js' | head -n 1 || true
      echo "CUSTOMS_ASSET"; curl -s https://customs.linsgeekai.com.br/login | grep -o 'assets/index-[^"]*\\.js' | head -n 1 || true
      echo "API_ERRORS"; tail -n 20 /var/log/pm2/ddp-api-err.log || true
    `, 120000);
  } else {
    throw new Error('usage: node deploy.mjs preflight|deploy|status');
  }
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  conn.end();
}
