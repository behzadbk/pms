// ─────────────────────────────────────────────────────────────────────────────
//  همین (Hamin) PMS — اجراکننده‌ی نسخه‌ی پرتابل ویندوز
//
//  این فایل را start.bat / stop.bat صدا می‌زنند. هیچ وابستگی npm ندارد و فقط از
//  ماژول‌های داخلی Node استفاده می‌کند.
//
//    node launcher.mjs start   ← دیتابیس + Redis + ۸ سرویس + وب‌سرور (پیش‌فرض)
//    node launcher.mjs stop    ← توقف همه‌چیز
//    node launcher.mjs reset   ← پاک کردن کامل داده‌ها (دیتابیس از نو با داده‌ی نمونه)
//
//  چیدمان پوشه‌ها (همان چیزی که workflow ویندوز می‌سازد):
//    <root>/start.bat, stop.bat
//    <root>/app/launcher.mjs        ← همین فایل
//    <root>/app/services/<name>/    ← dist + node_modules هر میکروسرویس
//    <root>/app/frontend/           ← خروجی build فرانت‌اند
//    <root>/app/sql/                ← db/ و backend/<svc>/prisma (مایگریشن‌ها و seed)
//    <root>/runtime/node|pgsql|redis
//    <root>/data, <root>/logs       ← در اولین اجرا ساخته می‌شوند
// ─────────────────────────────────────────────────────────────────────────────
import { spawn, spawnSync } from 'node:child_process'
import { createHash, randomBytes } from 'node:crypto'
import fs from 'node:fs'
import http from 'node:http'
import net from 'node:net'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const APP = path.dirname(fileURLToPath(import.meta.url))
const ROOT = process.env.PMS_ROOT || path.resolve(APP, '..')
const IS_WIN = process.platform === 'win32'
const EXE = IS_WIN ? '.exe' : ''

const PG_BIN = process.env.PMS_PG_BIN || path.join(ROOT, 'runtime', 'pgsql', 'bin')
const REDIS_BIN = process.env.PMS_REDIS_BIN || path.join(ROOT, 'runtime', 'redis', 'redis-server' + EXE)
const DATA = path.join(ROOT, 'data')
const LOGS = path.join(ROOT, 'logs')
const PGDATA = path.join(DATA, 'pg')
const STATE = path.join(DATA, 'state.json')

const HTTP_PORT = Number(process.env.PMS_PORT || 8080)
const PG_PORT = Number(process.env.PMS_PG_PORT || 55432)
const REDIS_PORT = Number(process.env.PMS_REDIS_PORT || 56379)
const APP_DB_PASSWORD = 'pms_local_only'

const SERVICES = {
  identity: 3001, property: 3002, facility: 3003, finance: 3004,
  guard: 3005, notification: 3006, audit: 3007, fnb: 3008,
}

const children = []
const say = (m) => console.log(m)
const ok = (m) => console.log('  [OK] ' + m)
const warn = (m) => console.log('  [!]  ' + m)
const fail = (m) => { console.log('\n  [X]  ' + m + '\n'); process.exit(1) }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function readState() { try { return JSON.parse(fs.readFileSync(STATE, 'utf8')) } catch { return {} } }
function writeState(s) { fs.mkdirSync(DATA, { recursive: true }); fs.writeFileSync(STATE, JSON.stringify(s, null, 2)) }

function run(bin, args, opts = {}) {
  const r = spawnSync(bin, args, { encoding: 'utf8', windowsHide: true, ...opts })
  if (r.error) throw r.error
  return r
}

// ─────────────────────────────── PostgreSQL ───────────────────────────────
const pgExe = (n) => path.join(PG_BIN, n + EXE)
const PSQL_BASE = ['-h', '127.0.0.1', '-p', String(PG_PORT), '-U', 'postgres', '-X', '-q', '-v', 'ON_ERROR_STOP=1']
const PSQL_ENV = { ...process.env, PGCLIENTENCODING: 'UTF8', PGOPTIONS: '-c client_min_messages=warning' }

function psql(db, args) {
  const r = run(pgExe('psql'), [...PSQL_BASE, '-d', db, ...args], { env: PSQL_ENV })
  if (r.status !== 0) throw new Error((r.stderr || r.stdout || '').trim())
  return (r.stdout || '').trim()
}

function pgRunning() {
  return run(pgExe('pg_ctl'), ['-D', PGDATA, 'status']).status === 0
}

function startPostgres() {
  let fresh = false
  if (!fs.existsSync(path.join(PGDATA, 'PG_VERSION'))) {
    say('  First run: initializing database...')
    fs.mkdirSync(DATA, { recursive: true })
    const r = run(pgExe('initdb'), ['-D', PGDATA, '-U', 'postgres', '-A', 'trust', '-E', 'UTF8', '--no-locale'])
    if (r.status !== 0) fail('initdb failed:\n' + r.stderr)
    fresh = true
  }
  if (!pgRunning()) {
    const r = run(pgExe('pg_ctl'), ['-D', PGDATA, '-l', path.join(LOGS, 'postgres.log'), '-w', '-t', '60',
      '-o', `-p ${PG_PORT} -h 127.0.0.1` + (IS_WIN ? '' : ' -k /tmp'), 'start'],
      // stdio باید ignore باشد: روی ویندوز postgres هندل pipe را به ارث می‌برد و spawnSync تا ابد منتظر می‌ماند
      { stdio: 'ignore' })
    if (r.status !== 0 || !pgRunning()) fail('PostgreSQL did not start - see logs\\postgres.log')
  }
  ok(`PostgreSQL on port ${PG_PORT}`)
  const exists = psql('postgres', ['-tAc', "SELECT 1 FROM pg_database WHERE datname='pms'"])
  if (exists !== '1') { psql('postgres', ['-c', 'CREATE DATABASE pms']); fresh = true }
  return fresh
}

// لیست مایگریشن‌ها و seedها از خود db/migrate.sh خوانده می‌شود تا ترتیب فقط یک‌جا تعریف شود
function readLists() {
  const sh = fs.readFileSync(path.join(APP, 'sql', 'db', 'migrate.sh'), 'utf8')
  const arr = (name) => {
    const m = sh.match(new RegExp(name + '=\\(([\\s\\S]*?)\\)'))
    if (!m) fail(`List ${name} not found in migrate.sh`)
    return [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1])
  }
  return { migrations: arr('MIGRATIONS'), seeds: arr('SEEDS') }
}

function migrate(seed) {
  const { migrations, seeds } = readLists()
  psql('pms', ['-c', `CREATE SCHEMA IF NOT EXISTS platform;
    CREATE TABLE IF NOT EXISTS platform.schema_migrations (
      filename text PRIMARY KEY, checksum text NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT now(), duration_ms integer);`])
  let applied = 0
  for (const rel of migrations) {
    const abs = path.join(APP, 'sql', rel)
    if (!fs.existsSync(abs)) fail('Migration file missing: ' + rel)
    // checksum بدون وابستگی به CRLF/LF (checkout ویندوز) — تا با نسخه‌ی لینوکس هم یکی باشد
    const sum = createHash('sha256').update(fs.readFileSync(abs, 'utf8').replace(/\r\n/g, '\n')).digest('hex')
    const rec = psql('pms', ['-tAc', `SELECT checksum FROM platform.schema_migrations WHERE filename='${rel}'`])
    if (rec) continue
    const t0 = Date.now()
    try { psql('pms', ['-f', abs]) } catch (e) { fail(`Migration ${rel} failed:\n${e.message}`) }
    psql('pms', ['-c', `INSERT INTO platform.schema_migrations (filename, checksum, duration_ms) VALUES ('${rel}','${sum}',${Date.now() - t0})`])
    applied++
  }
  psql('pms', ['-c', `ALTER ROLE app_user PASSWORD '${APP_DB_PASSWORD}'`])
  ok(applied ? `${applied} migrations applied` : 'Database is up to date')
  if (seed) {
    for (const rel of seeds) {
      try { psql('pms', ['-f', path.join(APP, 'sql', rel)]) } catch (e) { fail(`Seed ${rel} failed:\n${e.message}`) }
    }
    ok('Demo data loaded (borj-aftab + test users)')
  }
}

// ─────────────────────────────── پردازه‌های فرزند ───────────────────────────────
function launch(name, bin, args, opts = {}) {
  const log = fs.openSync(path.join(LOGS, name + '.log'), 'a')
  const child = spawn(bin, args, { stdio: ['ignore', log, log], windowsHide: true, ...opts })
  child.on('exit', (code) => { if (!shuttingDown) warn(`${name} exited (code ${code}) - see logs\\${name}.log`) })
  children.push({ name, child })
  return child
}

function startRedis() {
  if (!fs.existsSync(REDIS_BIN)) { warn('Redis not found - notification queue disabled'); return }
  launch('redis', REDIS_BIN, ['--port', String(REDIS_PORT), '--bind', '127.0.0.1', '--save', '', '--appendonly', 'no'])
  ok(`Redis on port ${REDIS_PORT}`)
}

function startServices(secret) {
  for (const [name, port] of Object.entries(SERVICES)) {
    const dir = path.join(APP, 'services', `${name}-service`)
    if (!fs.existsSync(path.join(dir, 'dist', 'main.js'))) fail(`Service ${name} missing from package (${dir})`)
    launch(`${name}-svc`, process.execPath, ['dist/main.js'], {
      cwd: dir,
      env: {
        ...process.env,
        NODE_ENV: 'production',
        PORT: String(port),
        GRPC_PORT: '50052',
        PROPERTY_SVC_GRPC_URL: '127.0.0.1:50052',
        JWT_SECRET: secret,
        CORS_ORIGIN: `http://localhost:${HTTP_PORT},http://127.0.0.1:${HTTP_PORT}`,
        DATABASE_URL: `postgresql://app_user:${APP_DB_PASSWORD}@127.0.0.1:${PG_PORT}/pms?schema=${name}`,
        // RabbitMQ در نسخه‌ی پرتابل نیست؛ سرویس‌ها بدون آن بالا می‌آیند و فقط رویدادهای بین‌سرویسی (لاگ ممیزی، نوتیف) منتقل نمی‌شوند
        RABBITMQ_URL: 'amqp://guest:guest@127.0.0.1:5672',
        REDIS_HOST: '127.0.0.1',
        REDIS_PORT: String(REDIS_PORT),
      },
    })
  }
}

// ─────────────────────────────── وب‌سرور + gateway ───────────────────────────────
// همان مسیریابی gateway.conf / ingress: /api/<svc>/… → سرویس، /socket.io → fnb، بقیه → فرانت‌اند
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.txt': 'text/plain; charset=utf-8',
}

function route(url) {
  const m = url.match(/^\/api\/([a-z]+)(\/[^]*)?$/)
  if (m && SERVICES[m[1]]) return { port: SERVICES[m[1]], path: m[2] || '/' }
  if (url.startsWith('/socket.io/')) return { port: SERVICES.fnb, path: url }
  return null
}

function serveStatic(req, res) {
  const FRONT = path.join(APP, 'frontend')
  let p = decodeURIComponent(req.url.split('?')[0])
  let file = path.normalize(path.join(FRONT, p))
  if (!file.startsWith(FRONT)) { res.writeHead(403); return res.end() }
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(FRONT, 'index.html')
  const ext = path.extname(file).toLowerCase()
  const noCache = ['.html', '.webmanifest'].includes(ext) || /sw\.js$|workbox/.test(file)
  res.writeHead(200, {
    'Content-Type': MIME[ext] || 'application/octet-stream',
    'Cache-Control': noCache ? 'no-cache' : 'public, max-age=86400',
  })
  fs.createReadStream(file).pipe(res)
}

function startGateway() {
  const server = http.createServer((req, res) => {
    const r = route(req.url)
    if (!r) return serveStatic(req, res)
    const up = http.request({ host: '127.0.0.1', port: r.port, path: r.path, method: req.method,
      headers: { ...req.headers, 'x-forwarded-for': req.socket.remoteAddress } }, (ur) => {
      res.writeHead(ur.statusCode, ur.headers); ur.pipe(res)
    })
    up.on('error', () => { if (!res.headersSent) res.writeHead(502, { 'Content-Type': 'application/json' }); res.end('{"message":"service unavailable"}') })
    req.pipe(up)
  })
  server.on('upgrade', (req, socket, head) => {
    const r = route(req.url)
    if (!r) return socket.destroy()
    const up = net.connect(r.port, '127.0.0.1', () => {
      let raw = `${req.method} ${r.path} HTTP/${req.httpVersion}\r\n`
      for (let i = 0; i < req.rawHeaders.length; i += 2) raw += `${req.rawHeaders[i]}: ${req.rawHeaders[i + 1]}\r\n`
      up.write(raw + '\r\n'); if (head && head.length) up.write(head)
      socket.pipe(up).pipe(socket)
    })
    up.on('error', () => socket.destroy()); socket.on('error', () => up.destroy())
  })
  return new Promise((resolve) => {
    server.once('error', (e) => fail(e.code === 'EADDRINUSE'
      ? `Port ${HTTP_PORT} is in use. Close the other program or change PMS_PORT in start.bat.` : e.message))
    server.listen(HTTP_PORT, '0.0.0.0', () => { ok(`Web server on http://localhost:${HTTP_PORT}`); resolve(server) })
  })
}

async function waitHealthy() {
  const check = (port) => new Promise((r) => {
    http.get({ host: '127.0.0.1', port, path: '/health/live', timeout: 2000 }, (res) => { res.resume(); r(res.statusCode === 200) })
      .on('error', () => r(false)).on('timeout', function () { this.destroy(); r(false) })
  })
  const pending = new Set(Object.keys(SERVICES))
  for (let i = 0; i < 60 && pending.size; i++) {
    for (const n of [...pending]) if (await check(SERVICES[n])) { ok(`${n}-svc`); pending.delete(n) }
    if (pending.size) await sleep(1000)
  }
  for (const n of pending) warn(`${n}-svc did not respond - see logs\\${n}-svc.log`)
  return pending.size === 0
}

// ─────────────────────────────── توقف ───────────────────────────────
let shuttingDown = false
function killPid(pid) {
  if (!pid) return
  try {
    if (IS_WIN) run('taskkill', ['/PID', String(pid), '/T', '/F'])
    else process.kill(pid, 'SIGTERM')
  } catch { return }
}

function stopAll() {
  const st = readState()
  if (st.launcherPid && st.launcherPid !== process.pid) killPid(st.launcherPid)
  for (const pid of st.pids || []) killPid(pid)
  if (fs.existsSync(path.join(PGDATA, 'PG_VERSION')) && pgRunning()) {
    run(pgExe('pg_ctl'), ['-D', PGDATA, '-m', 'fast', '-w', 'stop'])
  }
  writeState({ ...st, pids: [] })
}

async function shutdown() {
  if (shuttingDown) return
  shuttingDown = true
  say('\n  Stopping...')
  for (const { child } of children) killPid(child.pid)
  stopAll()
  say('  Stopped. Run start.bat to start again.')
  process.exit(0)
}

// ─────────────────────────────── main ───────────────────────────────
async function start() {
  say('\n  ============================================')
  say('    Hamin PMS - local Windows edition')
  say('  ============================================\n')
  fs.mkdirSync(LOGS, { recursive: true })
  if (readState().pids?.length) stopAll()   // باقی‌مانده‌ی اجرای قبلی (پنجره‌ای که بسته شده)

  const st = readState()
  const secret = st.jwtSecret || randomBytes(32).toString('hex')
  await startGateway()          // اول پورت وب را می‌گیریم تا اگر اشغال بود، چیزی نیمه‌کاره بالا نیاید
  process.on('exit', () => { if (!shuttingDown) for (const { child } of children) killPid(child.pid) })
  const fresh = startPostgres()
  migrate(fresh || !st.seeded)
  startRedis()
  startServices(secret)
  writeState({ jwtSecret: secret, seeded: true, launcherPid: process.pid, pids: children.map((c) => c.child.pid) })
  say('\n  Waiting for services...')
  const allOk = await waitHealthy()

  const url = `http://localhost:${HTTP_PORT}`
  say(`
  ============================================
   ${allOk ? 'READY' : 'STARTED WITH WARNINGS (see above)'}:  ${url}

   Building login:  building  borj-aftab
                    admin@borj-aftab.test  /  Passw0rd!
                    (resident@ / guard@ / staff@ / accountant@ same password)
   Super admin:     ${url}/super-admin/login
                    behzad / 1234   or   amir / 1234

   Logs:  logs folder
   Stop:  close this window, press Ctrl+C, or run stop.bat
  ============================================
`)
  if (IS_WIN && !process.env.PMS_NO_BROWSER) spawn('cmd', ['/c', 'start', '', url], { detached: true, stdio: 'ignore', windowsHide: true })
  for (const sig of ['SIGINT', 'SIGTERM', 'SIGBREAK', 'SIGHUP']) process.on(sig, shutdown)
}

const cmd = (process.argv[2] || 'start').toLowerCase()
if (cmd === 'stop') { stopAll(); say('  Everything stopped.') }
else if (cmd === 'reset') { stopAll(); fs.rmSync(DATA, { recursive: true, force: true }); say('  Data deleted. start.bat will rebuild the database with demo data.') }
else start().catch((e) => { console.error(e); shutdown() })
