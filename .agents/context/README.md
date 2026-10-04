# Backend Project Context

These documents describe the Lumore backend as inspected on 2026-10-03. Scope: this repository; mobile and admin client implementations are outside this guide.

## Reading Order

1. [Architecture](architecture.md): components, boundaries, startup, and integrations.
2. [Application flows](flows.md): authentication, matching, chat, and verification.
3. [Data model](data-model.md): persistent entities, relationships, and constraints.
4. [API and realtime map](api-and-realtime.md): route groups and socket events.
5. [Credits](credits.md): rewards, conversation charges, and ledger behavior.
6. [Development and operations](development.md): setup, tests, scheduled work, and deployment.
7. [Daily Explore plan](explore-plan.md): implementation decisions and contract for HTTP-based daily Explore discovery.
8. [Explore API integration guide](../../docs/explore-api.md): implemented endpoints, response shapes, pricing, and recovery behavior.

## How to Maintain This Context

Treat code as the source of truth. Update the relevant document when changing endpoints, model fields, event names, credit rules, or background schedules. Links point to implementation files so readers can verify details; these documents are an orientation guide rather than a complete API specification.

Contributor conventions live in [AGENTS.md](../../AGENTS.md). The [credits guide](../../docs/credits-system.md) and [credits context](credits.md) describe the current charging rules and ledger behavior.
