import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { copyFile, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { request } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'

function readResponse(url: string, method = 'GET') {
  return new Promise<{ status?: number; type?: string; body: string }>(
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
            type: res.headers['content-type'],
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

it('serves unauthenticated JSON liveness over GET and an empty HEAD', async () => {
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
        HOST: 'localhost',
        PORT: '0',
        COOKIE_SECURE: '0',
        HERMES_PASSWORD: 'fixture-password',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    const exited = once(child, 'exit')
    try {
      const base = await Promise.race([
        once(child.stdout, 'data').then(
          ([output]) => String(output).match(/http:\/\/localhost:\d+/)?.[0],
        ),
        exited.then(([code]) => {
          throw new Error(`Workspace exited during startup (${code})`)
        }),
      ])
      expect(base).toBeDefined()
      expect(await readResponse(`${base}/api/healthcheck?probe=1`)).toEqual({
        status: 200,
        type: 'application/json',
        body: '{"ok":true}',
      })
      expect(await readResponse(`${base}/api/healthcheck`, 'HEAD')).toEqual({
        status: 200,
        type: 'application/json',
        body: '',
      })
      expect((await readResponse(`${base}/`)).type).toContain('text/html')
    } finally {
      child.kill()
      await exited
    }
  } finally {
    await rm(fixture, { recursive: true, force: true })
  }
})
