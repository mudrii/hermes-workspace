import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Route } from './profiles/read'

const { fetchDashboard, isAuthenticated } = vi.hoisted(() => ({
  fetchDashboard: vi.fn(),
  isAuthenticated: vi.fn(),
}))

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (options: unknown) => options,
}))
vi.mock('../../server/auth-middleware', () => ({ isAuthenticated }))

const { GET } = (
  Route as unknown as {
    server: {
      handlers: { GET: (args: { request: Request }) => Promise<Response> }
    }
  }
).server.handlers

function readProfile(name: string): Promise<Response> {
  return GET({
    request: new Request(`http://localhost/api/profiles/read?name=${name}`),
  })
}

let home: string

beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), 'workspace-read-profile-'))
  vi.stubEnv('HERMES_HOME', home)
  vi.stubEnv('HERMES_DASHBOARD_URL', undefined)
  vi.stubEnv('CLAUDE_DASHBOARD_URL', undefined)
  fetchDashboard.mockReset()
  vi.stubGlobal('fetch', fetchDashboard)
  isAuthenticated.mockReturnValue(true)
})

afterEach(async () => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  await rm(home, { recursive: true, force: true })
})

describe('GET /api/profiles/read', () => {
  it('returns 401 without a Workspace session', async () => {
    isAuthenticated.mockReturnValue(false)
    expect((await readProfile('missing')).status).toBe(401)
  })

  it('returns 200 for an existing local profile before querying the dashboard', async () => {
    const profile = join(home, 'profiles', 'local-worker')
    await mkdir(profile, { recursive: true })
    await writeFile(join(profile, 'config.yaml'), 'model: example\n')
    vi.stubEnv('HERMES_DASHBOARD_URL', 'http://dashboard.test')

    const response = await readProfile('local-worker')
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      profile: { name: 'local-worker' },
    })
    expect(fetchDashboard).not.toHaveBeenCalled()
  })

  it('returns 404 for a missing local profile without a configured dashboard', async () => {
    const response = await readProfile('removed-worker')
    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({ error: 'Profile not found' })
  })

  it('returns 404 when the configured dashboard confirms the profile is absent', async () => {
    vi.stubEnv('HERMES_DASHBOARD_URL', 'http://dashboard.test')
    fetchDashboard.mockResolvedValue(Response.json({ profiles: [] }))
    expect((await readProfile('removed-worker')).status).toBe(404)
  })

  it('returns 200 for an existing profile on the configured dashboard', async () => {
    vi.stubEnv('HERMES_DASHBOARD_URL', 'http://dashboard.test')
    fetchDashboard.mockResolvedValue(
      Response.json({
        profiles: [{ name: 'remote-worker', model: 'example' }],
      }),
    )
    const response = await readProfile('remote-worker')
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      profile: { name: 'remote-worker', config: { model: 'example' } },
    })
  })

  it('keeps dashboard transport failures and non-OK responses distinguishable from a missing profile', async () => {
    vi.stubEnv('HERMES_DASHBOARD_URL', 'http://dashboard.test')
    fetchDashboard
      .mockRejectedValueOnce(new Error('Dashboard connection refused'))
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(Response.json({ profiles: null }))

    for (const _kind of [
      'network failure',
      'unavailable',
      'unexpected shape',
    ]) {
      const response = await readProfile('remote-worker')
      expect(response.status).toBe(500)
      expect(await response.json()).not.toEqual({ error: 'Profile not found' })
    }
  })
})
