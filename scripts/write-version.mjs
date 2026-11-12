#!/usr/bin/env node
/**
 * 写入当前端的构建版本信息到仓库根目录 versions.json（保留其它端数据）
 * 用法：node scripts/write-version.mjs <api|admin|ops|client|customs> <appDir>
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const KEY = process.argv[2];
const APP_DIR = process.argv[3];

if (!KEY || !APP_DIR) {
  console.error('用法：node scripts/write-version.mjs <key> <appDir>');
  process.exit(1);
}

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const appDir = path.resolve(process.cwd(), APP_DIR);
const pkgPath = path.join(appDir, 'package.json');
const versionsPath = path.join(repoRoot, 'versions.json');

function readVersion() {
  try {
    return JSON.parse(fs.readFileSync(pkgPath, 'utf8')).version || '0.0.0';
  } catch {
    return '0.0.0';
  }
}

function shortCommit() {
  try {
    const out = execSync('git rev-parse --short HEAD', {
      cwd: repoRoot,
      stdio: ['ignore', 'pipe', 'ignore']
    })
      .toString()
      .trim();
    return out || 'unknown';
  } catch {
    return 'unknown';
  }
}

let versions = {};

// turbo 会并行构建多个端，读改写需要加文件锁，避免相互覆盖导致条目丢失
const lockPath = `${versionsPath}.lock`;
function acquireLock() {
  for (let i = 0; i < 600; i += 1) {
    try {
      return fs.openSync(lockPath, 'wx');
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      try {
        // 超过 10 秒的锁视为残留，直接清理
        if (Date.now() - fs.statSync(lockPath).mtimeMs > 10000) fs.unlinkSync(lockPath);
      } catch {
        /* 锁已被其它进程释放 */
      }
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50);
    }
  }
  throw new Error(`获取 ${path.basename(lockPath)} 超时`);
}

const lockFd = acquireLock();
try {
  try {
    versions = JSON.parse(fs.readFileSync(versionsPath, 'utf8')) || {};
  } catch {
    versions = {};
  }

  versions[KEY] = {
    version: readVersion(),
    commit: shortCommit(),
    builtAt: new Date().toISOString()
  };

  fs.writeFileSync(versionsPath, JSON.stringify(versions, null, 2) + '\n', 'utf8');
} finally {
  fs.closeSync(lockFd);
  try {
    fs.unlinkSync(lockPath);
  } catch {
    /* 已清理 */
  }
}
console.log(
  `✅ versions.json ← ${KEY} (${versions[KEY].version} @ ${versions[KEY].commit})`
);
