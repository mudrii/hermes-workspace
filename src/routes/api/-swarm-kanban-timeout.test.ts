import { describe, expect, it, vi } from 'vitest'
import { Route } from './swarm-kanban'
import { listKanbanCards } from '../../server/kanban-backend'

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (options: unknown) => options,
}))
vi.mock('../../server/kanban-backend', () => ({
  listKanbanCards: vi.fn(),
  getKanbanBackendMeta: () => ({ id: 'hermes-proxy' }),
}))

const { GET } = (
  Route as unknown as { server: { handlers: { GET: () => Promise<Response> } } }
).server.handlers

describe('GET /api/swarm-kanban', () => {
  it('reports a board timeout and reads the same backend on the next request', async () => {
    vi.mocked(listKanbanCards)
      .mockRejectedValueOnce(new DOMException('Timed out', 'TimeoutError'))
      .mockResolvedValueOnce([])

    const timeout = await GET()
    expect(timeout.status).toBe(504)
    expect(await timeout.json()).toEqual({
      ok: false,
      error: 'Kanban backend timed out',
    })

    const recovered = await GET()
    expect(recovered.status).toBe(200)
    expect(await recovered.json()).toEqual({
      ok: true,
      cards: [],
      backend: { id: 'hermes-proxy' },
    })
  })
})
