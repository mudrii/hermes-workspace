/**
 * Server-side proxy for /v1/commands on the gateway.
 *
 * The gateway exposes a list of slash commands at /v1/commands.
 * This route proxies that call server-side (with gateway auth) so the
 * browser never needs to reach the gateway port directly.
 */
import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { isAuthenticated } from '../../server/auth-middleware'
import { optionalGatewayFetch } from '../../server/gateway-capabilities'

export const Route = createFileRoute('/api/commands')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ error: 'Unauthorized' }, { status: 401 })
        }

        try {
          const res = await optionalGatewayFetch('/v1/commands')

          if (!res?.ok) {
            const status = res?.status ?? 404
            return json(
              { error: `Gateway responded with status ${status}` },
              { status },
            )
          }

          const body = await res.json()
          return Response.json(body)
        } catch {
          return json(
            { error: 'Gateway is unreachable' },
            { status: 500 },
          )
        }
      },
    },
  },
})
