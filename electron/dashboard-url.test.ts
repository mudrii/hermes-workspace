import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { runInNewContext } from 'node:vm'
import { describe, expect, it, vi } from 'vitest'

const source = readFileSync(new URL('./main.cjs', import.meta.url), 'utf8')
const load = createRequire(import.meta.url)

function desktopBackend(env: Record<string, string>, reachable: Set<string>) {
  const probes: Array<{ protocol: string; url: string }> = []
  const spawn = vi.fn(() => ({ unref: () => {} }))
  const handlers = new Map<
    string,
    () => Promise<{ dashboardReachable: boolean }>
  >()
  const transport = (protocol: string) => ({
    get(
      url: string | URL,
      _options: unknown,
      respond: (reply: { statusCode: number; resume: () => void }) => void,
    ) {
      const address = new URL(url).href
      probes.push({ protocol, url: address })
      if (reachable.has(address)) {
        respond({ statusCode: 200, resume: () => {} })
      }
      return {
        on(event: string, callback: () => void) {
          if (event === 'error' && !reachable.has(address)) callback()
        },
      }
    },
  })
  const modules: Record<string, unknown> = {
    electron: {
      app: {
        requestSingleInstanceLock: () => true,
        getVersion: () => 'test',
        whenReady: () => ({ then: () => {} }),
        on: () => {},
        setName: () => {},
      },
      ipcMain: {
        handle: (
          name: string,
          handler: () => Promise<{ dashboardReachable: boolean }>,
        ) => handlers.set(name, handler),
      },
    },
    'electron-updater': {},
    child_process: { spawn, execSync: () => {} },
    http: transport('http'),
    https: transport('https'),
  }
  runInNewContext(source, {
    URL,
    process: { env, platform: 'darwin' },
    require: (name: string) => modules[name] ?? load(name),
  })
  const start = handlers.get('desktop:start-backend')!
  return { start, probes, spawn }
}

const gatewayHealth = 'http://127.0.0.1:8642/health'

describe('Electron dashboard discovery', () => {
  it('probes a configured dashboard with an uppercase HTTPS scheme and keeps its base path', async () => {
    const status = 'https://dashboard.example/hermes/api/status'
    const app = desktopBackend(
      { HERMES_DASHBOARD_URL: 'HTTPS://dashboard.example/hermes/' },
      new Set([gatewayHealth, status]),
    )

    expect(await app.start()).toMatchObject({ dashboardReachable: true })
    expect(app.probes).toContainEqual({ protocol: 'https', url: status })
    expect(app.spawn).not.toHaveBeenCalled()
  })

  it('does not start a second dashboard when an explicitly configured dashboard is down', async () => {
    const app = desktopBackend(
      { CLAUDE_DASHBOARD_URL: 'http://127.0.0.1:9120' },
      new Set([gatewayHealth]),
    )

    expect(await app.start()).toMatchObject({ dashboardReachable: false })
    expect(app.probes).toContainEqual({
      protocol: 'http',
      url: 'http://127.0.0.1:9120/api/status',
    })
    expect(app.spawn).not.toHaveBeenCalled()
  })

  it('retains fallback startup when no dashboard URL is configured', async () => {
    const app = desktopBackend({}, new Set([gatewayHealth]))

    await app.start()
    expect(app.spawn).toHaveBeenCalledWith(
      'bash',
      ['-lc', expect.stringContaining('hermes dashboard --port 9119')],
      expect.anything(),
    )
  })
})
