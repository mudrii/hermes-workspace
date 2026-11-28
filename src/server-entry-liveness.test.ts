import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { copyFile, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { request, type IncomingHttpHeaders } from 'node:http'
import { networkInterfaces, tmpdir } from 'node:os'
import { createInterface } from 'node:readline'
import { join } from 'node:path'
import type { Readable } from 'node:stream'
import { expect, it } from 'vitest'

async function readStartupUrl(stdout: Readable): Promise<string> {
  const lines = createInterface({ input: stdout })
  const timeout = setTimeout(() => lines.close(), 4_000)
  const prefix = 'Hermes Workspace running at '
  try {
    for await (const line of lines) {
      if (line.startsWith(prefix)) return new URL(line.slice(prefix.length)).origin
    }
    throw new Error('Workspace did not print its startup URL')
  } finally {
    clearTimeout(timeout)
    lines.close()
  }
}

function readResponse(url: string, method = 'GET') {
  return new Promise<{ status?: number; headers: IncomingHttpHeaders; body: string }>(
    (resolve, reject) => {
      const req = request(url, { method }, (res) => {
        let body = ''
        res.setEncoding('utf8')
        res.on('data', (chunk) => {
          body += chunk
        })
        res.on('end', () =>
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body,
          }),
        )
        res.on('error', reject)
      })
      req.on('error', reject)
      req.end()
    },
  )
}

const hasIpv6Loopback = Object.values(networkInterfaces()).some((addresses) =>
  addresses?.some(({ address }) => address === '::1'),
)

const loopbackHosts = hasIpv6Loopback ? ['localhost', '::1'] : ['localhost']

it.each(loopbackHosts)('serves unauthenticated liveness over GET and HEAD on %s', async (host) => {
  const fixture = await mkdtemp(join(tmpdir(), 'workspace-liveness-'))
  const dist = join(fixture, 'dist/server')
  try {
    await mkdir(dist, { recursive: true })
    await writeFile(join(fixture, 'package.json'), '{"type":"module"}')
    await writeFile(
      join(dist, 'server.js'),
      `export default {
      fetch: () => new Response('<html>Workspace</html>', {
        headers: { 'Content-Type': 'text/html' },
      }),
    }`,
    )
    await copyFile(
      new URL('../server-entry.js', import.meta.url),
      join(fixture, 'server-entry.js'),
    )
    const child = spawn(process.execPath, ['server-entry.js'], {
      cwd: fixture,
      env: {
        ...process.env,
        HOST: host,
        PORT: '0',
        COOKIE_SECURE: '0',
        HERMES_PASSWORD: 'fixture-password',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    const exited = once(child, 'exit')
    try {
      const base = await Promise.race([
        readStartupUrl(child.stdout),
        exited.then(([code]) => {
          throw new Error(`Workspace exited during startup (${code})`)
        }),
      ])
      const headers = {
        'content-type': 'application/json',
        'cache-control': 'no-store, no-cache, must-revalidate, private',
        pragma: 'no-cache',
        expires: '0',
      }
      expect(await readResponse(`${base}/api/healthcheck?probe=1`)).toMatchObject({
        status: 200,
        headers,
        body: '{"ok":true}',
      })
      expect(await readResponse(`${base}/api/healthcheck`, 'HEAD')).toMatchObject({
        status: 200,
        headers,
        body: '',
      })
      expect((await readResponse(`${base}/`)).headers['content-type']).toContain('text/html')
    } finally {
      child.kill()
      await exited
    }
  } finally {
    await rm(fixture, { recursive: true, force: true })
  }
})
