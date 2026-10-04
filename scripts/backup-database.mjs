import 'dotenv/config';
import mariadb from 'mariadb';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
async function main() {
  const url = new URL(process.env.DATABASE_URL);
  const options = { host: url.hostname, port: Number(url.port || 3306), user: decodeURIComponent(url.username), password: decodeURIComponent(url.password), database: decodeURIComponent(url.pathname.slice(1)) };
  const connection = await mariadb.createConnection(options);
  try {
    const duplicates = await connection.query('SELECT schedule_group_id,type,COUNT(*) n FROM schedules GROUP BY schedule_group_id,type HAVING COUNT(*)>1');
    if (duplicates.length) throw new Error('Duplicate schedule directions require resolution before the Phase 1 migration.');
    const directory = path.resolve('.local-backups'); fs.mkdirSync(directory, { recursive: true });
    const output = path.join(directory, `phase1-${Date.now()}.sql`);
    const executable = process.env.MYSQLDUMP_PATH || 'D:/xampp/mysql/bin/mysqldump.exe';
    const result = spawnSync(executable, [`--host=${options.host}`, `--port=${options.port}`, `--user=${options.user}`, '--single-transaction', '--routines', `--result-file=${output}`, options.database], { env: { ...process.env, MYSQL_PWD: options.password }, encoding: 'utf8', windowsHide: true });
    if (result.error || result.status !== 0) throw result.error || new Error(result.stderr);
    if (!fs.statSync(output).size) throw new Error('Database backup is empty.');
    console.log(`Backup saved: ${output}; no duplicate schedule directions.`);
  } finally { await connection.end(); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
