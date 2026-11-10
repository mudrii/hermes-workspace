# Security remediation validation — 2026-11-07

## Decision

Proceed only with a revised plan. The TanStack packages have independent version lines: `@tanstack/react-router-devtools@^1.169.39` must not be requested. The coherent TanStack upgrade also requires Vite 8, React Query, Tailwind, and test-tool updates. Hermes needs a PM dependency sync for three already-locked fixes, not a channel switch; oauthlib still needs an upstream 4.0.1 lock change. Profiles and `advanced-delegation` are supported primitives, but they do not provision the custom Workspace swarm.

Research used current official documentation/source, npm registry metadata, and GitHub advisories. No configuration, dependency, or application-code changes were made.

## 1. Workspace dependencies

A local read-only `pnpm audit --prod --json` reproduced 75 findings: 4 critical, 20 high, 38 moderate, and 13 low. The four critical fixes are React Start `>=1.168.60`, Start Server Core `>=1.169.39`, seroval `>=1.6.1`, and DOMPurify `>=3.4.17`; later seroval findings raise the effective floor to 1.6.8 for high and 1.6.10 for moderate findings ([TanStack advisory](https://github.com/advisories/GHSA-qx66-fv34-fjm8), [DOMPurify advisory](https://github.com/advisories/GHSA-cg2g-xh64-v4q7), [seroval critical](https://github.com/advisories/GHSA-p6vx-979v-rg4c), [seroval high](https://github.com/advisories/GHSA-97r2-qh9m-474h), [seroval moderate](https://github.com/advisories/GHSA-9wx9-5pv9-3349)).

### Minimum-change coherent package set

| Package | Validated version | Primary evidence |
|---|---:|---|
| `@tanstack/react-start` | **1.169.4** | [Registry: exact Router/Start Server Core dependencies, Node `>=22.12.0`, Vite `>=8`](https://registry.npmjs.org/@tanstack%2freact-start/1.169.4) |
| `@tanstack/react-router` | **1.170.46** | [Registry](https://registry.npmjs.org/@tanstack%2freact-router/1.170.46) |
| `@tanstack/start-server-core` | **1.169.45**, transitively | [Registry: seroval `^1.6.7`](https://registry.npmjs.org/@tanstack%2fstart-server-core/1.169.45) |
| `@tanstack/react-router-devtools` | **1.167.2** | [Registry: current latest; Router peer `^1.170.36`](https://registry.npmjs.org/@tanstack%2freact-router-devtools/1.167.2) |
| `@tanstack/react-router-ssr-query` | **1.167.3** | [Registry: Router `>=1.170.33`, React Query/query-core `>=5.102.0`](https://registry.npmjs.org/@tanstack%2freact-router-ssr-query/1.167.3) |
| `@tanstack/router-plugin` | **1.168.48** | [Registry: Router peer `^1.170.46`, Vite 5–8](https://registry.npmjs.org/@tanstack%2frouter-plugin/1.168.48) |
| `@tanstack/react-query` | **5.107.1** | [Registry: current latest, installs matching query-core](https://registry.npmjs.org/@tanstack%2freact-query/5.107.1) |
| `vite` | **8.3.6** | [Registry: current latest](https://registry.npmjs.org/vite/8.3.6) |
| `@vitejs/plugin-react` | **5.2.0** | [Registry: supports Vite 8 without taking plugin major 6](https://registry.npmjs.org/@vitejs%2fplugin-react/5.2.0) |
| `@tailwindcss/vite` and `tailwindcss` | **4.3.5**, together | [Registry: plugin supports Vite 8 and exactly depends on Tailwind 4.3.5](https://registry.npmjs.org/@tailwindcss%2fvite/4.3.5) |
| `vitest` | **4.1.12** | [Registry: supports Vite 8 without taking Vitest major 5](https://registry.npmjs.org/vitest/4.1.12) |

`vite-tsconfig-paths` 6.0.2 can remain because its Vite peer is unrestricted ([registry](https://registry.npmjs.org/vite-tsconfig-paths/6.0.2)). React/React DOM 19.2.0 satisfy the TanStack peers. The local Node 24.14.1 satisfies React Start's Node `>=22.12.0` requirement; production and CI must meet it too ([React Start metadata](https://registry.npmjs.org/@tanstack%2freact-start/1.169.4)).

This is a migration, not a drop-in patch. TanStack Start 1.169 is its first stable release and explicitly requires Vite 8; its migration guide lists removed APIs and error/response behavior changes ([TanStack migration](https://tanstack.com/start/latest/docs/framework/react/migrate-from-release-candidate)). Vite 8 moves to Rolldown/Oxc, changes browser targets, and removes or deprecates several Rollup/esbuild options ([Vite migration](https://github.com/vitejs/vite/blob/main/docs/guide/migration.md)). Vitest 4 also has migration changes to coverage, mocks, projects, and pools ([Vitest 4 migration](https://v4.vitest.dev/guide/migration.html)). A local source scan found no direct use of Start's removed `useSession`, `.inputValidator()`, or old Nitro plugin, and no explicit Rollup/esbuild build options in `vite.config.ts`; that does not replace build and runtime verification.

### Overrides and remaining audit work

Raise security floors rather than merely hoping an existing range re-resolves. pnpm overrides apply throughout the dependency graph, including peers ([pnpm overrides](https://pnpm.io/settings#overrides)); `pnpm update` changes the lock and declared ranges according to its selection rules ([pnpm update](https://pnpm.io/cli/update)).

- `seroval: ^1.6.10` — covers all seroval findings in this audit; current latest is 1.7.10 ([registry](https://registry.npmjs.org/seroval/1.7.10), [1.6.10 advisory](https://github.com/advisories/GHSA-9wx9-5pv9-3349)).
- `undici: ^7.30.1` — retains major 7 while covering the current findings; 7.30.2 is available ([advisory](https://github.com/advisories/GHSA-xjj6-f33q-929c), [registry](https://registry.npmjs.org/undici/7.30.2)).
- `js-yaml: ^4.3.2` — retains major 4 and covers all current js-yaml findings ([advisory](https://github.com/advisories/GHSA-2883-xcg3-v3hh), [registry](https://registry.npmjs.org/js-yaml/4.3.2)).
- Add `dompurify: ^3.4.17` unless updating every dependent produces the same floor. Local `pnpm why` found vulnerable copies through both `monaco-editor` and `mermaid`, so updating only TanStack will not clear them ([advisory](https://github.com/advisories/GHSA-cg2g-xh64-v4q7)).
- Plan a separate, compatibility-tested direct `zod` 4 migration (current 4.6.7). The audit's patched floor is 4.6.6, while the Workspace directly pins 3.25.76; a global override is not a substitute for checking application compatibility ([advisory](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5), [registry](https://registry.npmjs.org/zod/4.6.7)).

Do not claim the 75-finding audit is cleared by the TanStack set alone: other packages and the moderate/low findings remain. Re-run `pnpm audit --prod`, inspect peer warnings, then run the project's `pnpm test` and `pnpm build` plus browser/SSR smoke tests before accepting the change.

## 2. Hermes Python dependencies

The installed environment's reported old versions are stale relative to current source locks. Current online `v0.23.0` **and** `main` already lock msgpack **1.2.3**, tornado **6.6**, multidict **6.9.1**, and oauthlib **4.0.0** ([v0.23.0 lock](https://github.com/NousResearch/hermes-agent/blob/v0.23.0/uv.lock), [main lock at reviewed commit](https://github.com/NousResearch/hermes-agent/blob/a9ff9799e273f525b82718cdc69fdec71b1dca5a/uv.lock)). The first three versions satisfy their respective advisories ([msgpack](https://github.com/advisories/GHSA-j586-36cw-2gc2), [tornado](https://github.com/advisories/GHSA-r4j5-9xpp-3985), [multidict](https://github.com/advisories/GHSA-54p9-h82j-f925)).

Therefore, if the running environment still contains the old three, use the supported PM path: a normal `hermes update`, or an explicit `hermes pm install` to sync the existing lock, followed by process restart and PM diagnostics. **Switching to `main` is unnecessary for those three and incomplete for oauthlib.** `hermes pm repair` only replays the recorded dependency set; `hermes pm update` is a maintainer pin-update command, not the application updater ([PM ownership and commands](https://hermes-agent.nousresearch.com/docs/reference/package-management), [update channels](https://hermes-agent.nousresearch.com/docs/getting-started/updating)).

Both current locks remain vulnerable to the oauthlib device-workflow advisory because its first patched version is **4.0.1**, not 4.0.0 ([GHSA-3jp2-3mrg-2vxc](https://github.com/advisories/GHSA-3jp2-3mrg-2vxc)). Full remediation requires an upstream/reviewed source constraint change and `hermes pm lock`, followed by the normal update/sync path. Do not mutate Hermes's managed environment with raw pip or uv; PM explicitly forbids that workflow ([PM developer workflow](https://hermes-agent.nousresearch.com/docs/reference/package-management#developer-workflow)).

## 3. Hermes command and configuration validation

| Proposal | Verdict and correction | Primary source |
|---|---|---|
| `hermes config set approvals.destructive_slash_confirm true` | Valid. It prompts before `/clear`, `/new`, `/reset`, and `/undo`; `true` is already the default, so this is explicit hardening rather than a required repair. | [Security configuration](https://hermes-agent.nousresearch.com/docs/user-guide/security) |
| `hermes config unset command_allowlist` | Valid syntax and a hardening choice, but review first. This is **not** an ignored key: entries permanently auto-approve matching dangerous commands, including unattended deny-mode sessions. Unsetting removes all such approvals and can increase prompts. | [Permanent allowlist](https://hermes-agent.nousresearch.com/docs/user-guide/security#permanent-allowlist), [config unset](https://hermes-agent.nousresearch.com/docs/user-guide/configuration#managing-configuration) |
| `hermes plugins update --yes` | Supported. Safer first run is interactive `hermes plugins update` to review the set. Even with `--yes`, new capabilities, widened catalog pins, and other required consent fail closed rather than being silently accepted. | [Plugin update behavior](https://hermes-agent.nousresearch.com/docs/user-guide/features/plugins) |
| Optional `hermes plugins auto-update on` | Supported and per-profile (`plugins.auto_apply: true`). Keep optional: unattended updates still skip items needing review, but enabling them changes the desired supply-chain review cadence. | [Plugin auto-update](https://hermes-agent.nousresearch.com/docs/user-guide/features/plugins) |
| `hermes skills update NAME` | Supported. Locally edited skills are skipped unless `--force` is explicitly supplied. Do not force the dangerous `reddit-reading` skill: force can overwrite local edits or override caution-level install blocks, but cannot override a dangerous verdict. | [Skill update lifecycle and security](https://hermes-agent.nousresearch.com/docs/user-guide/features/skills#update-lifecycle) |
| Disable unconfigured Home Assistant | `hermes config set platforms.homeassistant.enabled false` disables only the gateway platform. If the intent is to disable device tools too, use `hermes plugins disable homeassistant` in the affected profile and restart the gateway; the plugin's toolset can otherwise activate when `HASS_TOKEN` exists. | [Home Assistant integration](https://hermes-agent.nousresearch.com/docs/user-guide/messaging/homeassistant), [plugin enable/disable](https://hermes-agent.nousresearch.com/docs/user-guide/features/plugins) |
| Remove `auxiliary.skills_hub` and `auxiliary.session_search` | Valid inert-key cleanup with `hermes config unset KEY`. Current source explicitly says Skills Hub never used an auxiliary LLM and session search no longer uses one. | [`skills_hub` removal test](https://github.com/NousResearch/hermes-agent/blob/main/tests/hermes_cli/test_aux_skills_hub_removed.py), [`session_search` config note](https://github.com/NousResearch/hermes-agent/blob/main/hermes_cli/config_defaults.py) |
| `hermes auth upgrade` for stale Portal auth | **Wrong general repair.** This command upgrades the anonymous/free-tier identity to a Nous account while preserving connectors. For a stale device-code Portal login, try `hermes auth refresh nous`; for a dead/independent login, reauthenticate with `hermes auth add nous --type oauth`. | [Auth parser and upgrade implementation](https://github.com/NousResearch/hermes-agent/blob/main/hermes_cli/auth_commands.py), [Nous refresh/reauthentication rules](https://hermes-agent.nousresearch.com/docs/user-guide/features/credential-pools) |
| Enable Webapp with three proposed commands | Valid exactly as proposed: `hermes config set webapp.enabled true`, `hermes gateway restart`, then `hermes webapp`. The final command builds if needed and opens a one-use sign-in link; keep that link private. | [CLI Webapp reference](https://hermes-agent.nousresearch.com/docs/reference/cli-commands#hermes-webapp) |
| Install/configure `advanced-delegation` | Supported on installed Hermes 0.23.0 (plugin requires `>=0.22.5`). Install per delegating profile with `hermes plugins install advanced-delegation`, then run `hermes delegation config`; route changes affect new sessions. | [Advanced Delegation](https://hermes-agent.nousresearch.com/docs/plugins/advanced-delegation) |

## 4. Swarm: supported primitives versus custom assets

Officially supported:

- `hermes profile create NAME --description "..."` creates an isolated profile and a `~/.local/bin/NAME` command alias. Each profile needs its own working model/configuration; profiles are state boundaries, not filesystem sandboxes ([Profiles](https://hermes-agent.nousresearch.com/docs/user-guide/profiles)).
- `advanced-delegation` adds model routes or profile routes. In `profile_routes` mode, target profiles only need to exist with a working model; the configured list is both the model-visible route menu and the allowlist. One delegation backend is active at a time ([Advanced Delegation](https://hermes-agent.nousresearch.com/docs/plugins/advanced-delegation)).

Not supplied by those primitives:

- Reading Workspace `swarm.yaml`, provisioning its ten workers, generating `<worker>-core` skills, configuring GBrain MCP, or creating custom `worker:mode` wrappers. Those are Workspace/legacy assets and need separate reviewed implementation. Hermes's generated alias is `NAME`, with ordinary Hermes subcommands—not the roster's custom wrapper protocol ([profile alias behavior](https://hermes-agent.nousresearch.com/docs/user-guide/profiles#using-profiles)).
- Treating ten profiles as a managed ten-worker swarm. Profile routes delegate individual subagents to existing profiles; they do not implement the Workspace's roster, greenlight, lifecycle, or tmux semantics ([delegation provider scope](https://hermes-agent.nousresearch.com/docs/plugins/advanced-delegation#how-it-works)).

Local-only confirmation, with no online claim needed: `~/.hermes/profiles` is empty, no roster wrappers or `*-core` skills were found, and `scripts/swarm-env-check.sh:4-5` hardcodes `/Users/aurora` while assigning the same path to both `CANONICAL_REPO` and `FORBIDDEN_REPO`. Its reject and require checks therefore contradict each other. Do not provision or repair these assets as a side effect of the security update.

## Acceptance order

1. Workspace: apply the coherent package set and security floors as reviewed changes; inspect resolution/peer output, run test/build/SSR smoke checks, then re-audit and handle the remaining findings, including Zod, separately.
2. Hermes: sync the existing PM lock for msgpack/tornado/multidict and verify the running environment. Track or make an explicit upstream oauthlib 4.0.1 lock fix; do not treat channel switching or PM repair as that fix.
3. Configuration: apply only the intended command corrections above, per profile, with interactive review for plugin/skill updates.
4. Swarm: treat profiles/delegation as a new supported foundation only after a separate design decision for the custom Workspace assets. Provision nothing during this remediation.
