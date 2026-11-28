import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Route as HistoryRoute } from './history'
import { HermesHttpError } from '../../server/claude-dashboard-api'
import { Route as SessionHistoryRoute } from './session-history'

const { backend, dashboardFetch, isAuthenticated } = vi.hoisted(() => ({
  backend: { dashboardAvailable: true },
  dashboardFetch: vi.fn(),
  isAuthenticated: vi.fn(),
}))

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (options: unknown) => options,
}))
vi.mock('../../server/auth-middleware', () => ({ isAuthenticated }))
vi.mock('../../server/gateway-capabilities', () => ({
  BEARER_TOKEN: '',
  CLAUDE_API: 'http://gateway.test',
  CLAUDE_DASHBOARD_URL: 'http://dashboard.test',
  dashboardFetch,
  ensureGatewayProbed: vi.fn(),
  getCapabilities: () => ({
    sessions: true,
    dashboard: { available: backend.dashboardAvailable },
  }),
}))
vi.mock('../../server/local-session-store', () => ({
  getLocalMessages: () => [],
  getLocalSession: () => null,
}))

function readHistory(route: unknown, path: string): Promise<Response> {
  const { GET } = (
    route as {
      server: {
        handlers: { GET: (args: { request: Request }) => Promise<Response> }
      }
    }
  ).server.handlers
  return GET({ request: new Request(`http://localhost${path}`) })
}

const compatibilityPath = '/api/session-history?key=removed-session'

beforeEach(() => {
  backend.dashboardAvailable = true
  dashboardFetch.mockReset()
  isAuthenticated.mockReturnValue(true)
})

afterEach(() => vi.unstubAllGlobals())

describe('GET /api/session-history', () => {
  it('returns 401 without a Workspace session', async () => {
    isAuthenticated.mockReturnValue(false)
    expect(
      (await readHistory(SessionHistoryRoute, compatibilityPath)).status,
    ).toBe(401)
    expect(dashboardFetch).not.toHaveBeenCalled()
  })

  it('preserves a dashboard 404 and keeps the main history route empty', async () => {
    dashboardFetch.mockImplementation(async () =>
      Response.json({ detail: 'Session not found' }, { status: 404 }),
    )

    const response = await readHistory(SessionHistoryRoute, compatibilityPath)
    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({
      ok: false,
      messages: [],
      sessionKey: 'removed-session',
      error: 'Session not found',
    })

    const main = await readHistory(
      HistoryRoute,
      '/api/history?sessionKey=removed-session',
    )
    expect(main.status).toBe(200)
    expect(await main.json()).toMatchObject({ messages: [] })
  })

  it('preserves a gateway 404 in a gateway-only deployment', async () => {
    backend.dashboardAvailable = false
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        Response.json({ detail: 'Session not found' }, { status: 404 }),
      )
    vi.stubGlobal('fetch', fetchMock)

    expect(
      (await readHistory(SessionHistoryRoute, compatibilityPath)).status,
    ).toBe(404)
    expect(fetchMock).toHaveBeenCalledWith(
      'http://gateway.test/api/sessions/removed-session/messages',
      expect.anything(),
    )
  })

  it('keeps a genuine dashboard failure as a 500', async () => {
    dashboardFetch.mockResolvedValue(
      Response.json({ detail: 'Database unavailable' }, { status: 503 }),
    )
    const response = await readHistory(SessionHistoryRoute, compatibilityPath)
    expect(response.status).toBe(500)
    expect(await response.json()).toMatchObject({
      ok: false,
      error: expect.stringContaining('Database unavailable'),
    })
  })
})

it('identifies Hermes HTTP errors in diagnostics', () => {
  expect(new HermesHttpError('Upstream unavailable', 503)).toMatchObject({
    name: 'HermesHttpError',
    status: 503,
  })
})
