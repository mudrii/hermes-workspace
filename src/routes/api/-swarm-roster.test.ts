import { copyFileSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

let configDir: string
let profilesDir: string

vi.mock('@tanstack/react-router', () => ({ createFileRoute: () => (options: unknown) => options }))
vi.mock('../../server/auth-middleware', () => ({ isAuthenticated: () => true }))

beforeEach(() => {
  vi.resetModules()
  configDir = mkdtempSync(join(tmpdir(), 'workspace-roster-test-'))
  vi.doMock('../../server/swarm-environment', () => ({ SWARM_CANONICAL_REPO: configDir }))
  copyFileSync(new URL('../../../swarm.yaml', import.meta.url), join(configDir, 'swarm.yaml'))
  vi.stubEnv('HERMES_HOME', configDir)
  profilesDir = join(configDir, 'profiles')
})

afterEach(() => {
  vi.unstubAllEnvs()
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

    mkdirSync(join(profilesDir, 'swarm13'), { recursive: true })
    mkdirSync(join(profilesDir, 'builder'))
    mkdirSync(join(profilesDir, 'swarm14'))
    const installed = await getRoster()
    expect(installed.pendingProfiles).toEqual([])
    expect(installed.roster.workers).toHaveLength(3)
    expect(installed.roster.workers).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'swarm13', name: 'Test Worker' }),
      expect.objectContaining({ id: 'builder', model: '', mcpServers: [] }),
      expect.objectContaining({ id: 'swarm14', model: '' }),
    ]))
  })

  it('retains configured roles for linked profile directories', async () => {
    const { Route } = await import('./swarm-roster')
    const { GET } = (Route as unknown as {
      server: { handlers: { GET: (context: { request: Request }) => Promise<Response> } }
    }).server.handlers
    const url = 'http://localhost/api/swarm-roster'
    const linkedProfile = join(configDir, 'linked-profile')
    mkdirSync(profilesDir)
    mkdirSync(linkedProfile)
    symlinkSync(linkedProfile, join(profilesDir, 'builder'), 'junction')
    const nonProfile = join(configDir, 'file')
    writeFileSync(nonProfile, '')
    symlinkSync(nonProfile, join(profilesDir, 'swarm13'), 'file')

    const response = await GET({ request: new Request(url) })

    await expect(response.json()).resolves.toMatchObject({
      roster: { workers: [{ id: 'builder', role: 'Scoped Implementation Agent' }] },
      pendingProfiles: [],
    })
  })
})
