import { copyFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

let configDir: string
const { listSwarmWorkerIds } = vi.hoisted(() => ({ listSwarmWorkerIds: vi.fn<() => Array<string>>() }))

vi.mock('@tanstack/react-router', () => ({ createFileRoute: () => (options: unknown) => options }))
vi.mock('../../server/auth-middleware', () => ({ isAuthenticated: () => true }))
vi.mock('../../server/swarm-environment', () => ({ SWARM_CANONICAL_REPO: configDir }))
vi.mock('../../server/swarm-foundation', () => ({ listSwarmWorkerIds }))

beforeEach(() => {
  vi.resetModules()
  configDir = mkdtempSync(join(tmpdir(), 'workspace-roster-test-'))
  copyFileSync(new URL('../../../swarm.yaml', import.meta.url), join(configDir, 'swarm.yaml'))
  listSwarmWorkerIds.mockReturnValue([])
})

afterEach(() => {
  rmSync(configDir, { recursive: true, force: true })
})

describe('/api/swarm-roster setup', () => {
  it('keeps a saved worker visible for setup until its profile is installed', async () => {
    const { Route } = await import('./swarm-roster')
    const handlers = (Route as unknown as {
      server: {
        handlers: Record<'GET' | 'POST', (context: { request: Request }) => Promise<Response>>
      }
    }).server.handlers
    const url = 'http://localhost/api/swarm-roster'
    const getRoster = () => handlers.GET({ request: new Request(url) }).then((response) => response.json())

    await expect(getRoster()).resolves.toMatchObject({ roster: { workers: [] }, pendingProfiles: [] })

    const response = await handlers.POST({
      request: new Request(url, {
        method: 'POST',
        body: JSON.stringify({ id: 'swarm13', name: 'Test Worker', role: 'Builder' }),
      }),
    })
    expect(response.status).toBe(200)
    const awaitingProfile = {
      roster: { workers: [] },
      pendingProfiles: [{ id: 'swarm13', name: 'Test Worker' }],
    }
    await expect(response.json()).resolves.toMatchObject(awaitingProfile)
    await expect(getRoster()).resolves.toMatchObject(awaitingProfile)

    listSwarmWorkerIds.mockReturnValue(['swarm13', 'builder'])
    const installed = await getRoster()
    expect(installed.pendingProfiles).toEqual([])
    expect(installed.roster.workers).toHaveLength(2)
    expect(installed.roster.workers).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'swarm13', name: 'Test Worker' }),
      expect.objectContaining({ id: 'builder', model: '', mcpServers: [] }),
    ]))
  })
})
