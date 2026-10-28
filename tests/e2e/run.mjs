// E2E runner (not part of `npm test`): starts `vite preview` on a free port, runs main-flow.mjs, stops the server.
// Run via `npm run test:e2e` (builds first).
import { spawn } from 'node:child_process'
import net from 'node:net'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../../', import.meta.url))

function freePort() {
  return new Promise((resolve, reject) => {
    const s = net.createServer()
    s.once('error', reject)
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address()
      s.close(() => resolve(port))
    })
  })
}

async function waitFor(url, ms = 30000) {
  const end = Date.now() + ms
  while (Date.now() < end) {
    try {
      if ((await fetch(url)).ok) return
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 200))
  }
  throw new Error(`Preview-Server nicht erreichbar: ${url}`)
}

const port = await freePort()
const base = `http://127.0.0.1:${port}/`
const server = spawn(
  process.execPath,
  ['node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1', '--port', String(port), '--strictPort'],
  { cwd: root, stdio: ['ignore', 'ignore', 'inherit'], detached: true },
)
let exitCode = 1
const stop = () => {
  try { process.kill(-server.pid, 'SIGTERM') } catch { /* already gone */ }
}
process.on('SIGINT', () => { stop(); process.exit(130) })
process.on('SIGTERM', () => { stop(); process.exit(143) })
try {
  await waitFor(base)
  exitCode = await new Promise((resolve) => {
    const t = spawn(process.execPath, ['tests/e2e/main-flow.mjs', base], { cwd: root, stdio: 'inherit' })
    t.on('exit', (code) => resolve(code ?? 1))
  })
} catch (e) {
  console.error(e.message)
} finally {
  stop()
}
process.exit(exitCode)
