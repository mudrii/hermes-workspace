/** @vitest-environment jsdom */
import { getByRole } from '@testing-library/dom'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CrewMember } from '@/hooks/use-crew-status'
import { RouterChat } from './router-chat'

const builder: CrewMember = {
  id: 'builder',
  displayName: 'Builder',
  role: 'Builder',
  profileFound: true,
  gatewayState: 'running',
  processAlive: true,
  platforms: {},
  model: 'test',
  provider: 'test',
  lastSessionTitle: null,
  lastSessionAt: null,
  sessionCount: 0,
  messageCount: 0,
  toolCallCount: 0,
  totalTokens: 0,
  estimatedCostUsd: null,
  cronJobCount: 0,
  assignedTaskCount: 0,
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('RouterChat broadcast', () => {
  it('ignores a saved room member that is absent from the dispatch roster', async () => {
    const fetchDispatch = vi.fn(async (_url: string, _init: RequestInit) => Response.json({ results: [] }))
    vi.stubGlobal('fetch', fetchDispatch)
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
    const container = document.createElement('div')
    const root = createRoot(container)
    try {
      await act(async () => root.render(<RouterChat
        members={[builder]}
        roomIds={['retired-worker']}
        selectedId={null}
        open
        onClose={() => {}}
        onResults={() => {}}
        seedMode="broadcast"
        seedPrompt="Check the build"
      />))
      await act(async () => getByRole(container, 'button', { name: 'Broadcast to 1' }).click())
    } finally {
      await act(async () => root.unmount())
    }

    expect(fetchDispatch).toHaveBeenCalledOnce()
    const [[url, init]] = fetchDispatch.mock.calls
    expect(url).toBe('/api/swarm-dispatch')
    expect(JSON.parse(String(init.body)).assignments).toMatchObject([{ workerId: 'builder' }])
  })
})
