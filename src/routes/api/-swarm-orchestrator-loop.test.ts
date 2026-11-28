import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Route } from './swarm-orchestrator-loop'

vi.mock('@tanstack/react-router', () => ({ createFileRoute: () => (options: unknown) => options }))
vi.mock('../../server/auth-middleware', () => ({ isAuthenticated: () => true }))
vi.mock('../../server/swarm-memory', () => ({ appendSwarmMemoryEvent: vi.fn() }))
vi.mock('../../server/swarm-notifications', () => ({
  publishSwarmActionPrompt: () => ({ published: false, sessionKey: 'main' }),
  publishSwarmCheckpointNotification: () => ({ published: false, sessionKey: 'main' }),
}))

let profilesDir: string

beforeEach(() => {
  const hermesRoot = mkdtempSync(join(tmpdir(), 'workspace-loop-test-'))
  profilesDir = join(hermesRoot, 'profiles')
  vi.stubEnv('HERMES_HOME', hermesRoot)
})

afterEach(() => {
  rmSync(join(profilesDir, '..'), { recursive: true, force: true })
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('/api/swarm-orchestrator-loop', () => {
  it('routes a completed checkpoint to an installed reviewer outside the polling subset', async () => {
    const builderDir = join(profilesDir, 'builder')
    mkdirSync(builderDir, { recursive: true })
    mkdirSync(join(profilesDir, 'reviewer'))
    execFileSync('python3', ['-c', `
import sqlite3, sys
with sqlite3.connect(sys.argv[1]) as db:
    db.execute('CREATE TABLE sessions (id TEXT)')
    db.execute("INSERT INTO sessions VALUES ('work')")
    db.execute('CREATE TABLE messages (id INTEGER, session_id TEXT, role TEXT, content TEXT)')
    db.execute("INSERT INTO messages VALUES (1, 'work', 'assistant', ?)", ('STATE: DONE\\nFILES_CHANGED: none\\nCOMMANDS_RUN: none\\nRESULT: Finished work\\nBLOCKER: none\\nNEXT_ACTION: none',))
`, join(builderDir, 'state.db')])
    const dispatch = vi.fn(async (_url: URL, _init: RequestInit) => Response.json({ results: [] }))
    vi.stubGlobal('fetch', dispatch)
    const { POST } = (Route as unknown as {
      server: { handlers: { POST: (context: { request: Request }) => Promise<Response> } }
    }).server.handlers

    const response = await POST({
      request: new Request('http://localhost/api/swarm-orchestrator-loop', {
        method: 'POST',
        body: JSON.stringify({ workerIds: ['builder'], autoContinue: true, reviewWorkerId: 'reviewer' }),
      }),
    })

    await expect(response.json()).resolves.toMatchObject({ summary: { checkpointed: 1 } })
    expect(dispatch).toHaveBeenCalledOnce()
    const [[url, init]] = dispatch.mock.calls
    expect(url.pathname).toBe('/api/swarm-dispatch')
    expect(JSON.parse(String(init.body)).assignments).toMatchObject([
      { workerId: 'reviewer', rationale: 'Autopilot review gate for completed worker checkpoints.' },
    ])
  })
})
