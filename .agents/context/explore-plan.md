# Daily Explore Implementation Plan

Status: backend selection, ranking, daily persistence, 1-credit unlock, recovery, NVIDIA match-note generation, and local fallbacks implemented. The user approved the public matching-fact payload and NVIDIA destination. See [Explore API](../../docs/explore-api.md) for the implementation contract. The companion lumore-mobile implementation now consumes these routes and opens selected-profile conversations.

## Intended Experience

A user unlocks a daily Explore list for **1 credit**. The backend selects up to 100 eligible profiles based on the user's gender preferences and preferred age range, scores every selected profile with distance and relationship goals as the strongest signals, and returns the top 10. Each result includes an allowed profile preview, compatibility score, and an AI-generated match note grounded in actual matching signals.

The UI owns choosing a profile and initiating a conversation. Integration found no existing chosen-profile chat endpoint, so POST /api/explore/profiles/:profileId/conversation creates or reuses a room after validating today's unlocked selection. The initiating user pays one credit once; retries reuse the charge. Generating or reading suggestions never creates a conversation.

Explore discovery uses HTTP. Sockets remain responsible for chat, typing, receipts, inbox updates, and notifications. Location-room matching remains a separate feature.

## Implemented Policy

- Daily unlock costs 1 credit, defined by `EXPLORE_DAILY_COST` in `services/creditRules.js`.
- Selection uses gender preferences and preferred age range before scoring.
- Ranking prioritizes distance and relationship goals, then returns up to 10 profiles with scores and AI match notes.
- The UI initiates conversations through the selected-profile endpoint. The starter pays one credit; the suggested user's balance is unchanged. Reports, unavailable profiles and ended chats are respected.
- Day boundary: UTC. The API returns the exact reset timestamp.
- Small pool: return fewer than 10 when fewer candidates qualify. Charge one credit for a partial list; an empty list is free and remains empty until the next UTC day.
- Reveal policy: return only the allowlisted preview fields documented in [Explore API](../../docs/explore-api.md), subject to current visibility settings.

## Candidate Selection and Ranking

1. Load the seeker, preferences, and relevant answer signals once.
2. Find discoverable candidates without requiring an online socket or `isMatching` state. Apply the seeker's gender preferences and preferred age range as selection filters. Resolve desired candidate genders from the user's gender and configured interested-in preferences using the project's matching conventions; do not assume everyone seeks the opposite gender. Exclude the seeker, unavailable/deleted accounts, blocked or moderation-ineligible profiles, and duplicate existing conversations according to current room rules.
3. Select at most 100 from that eligible pool with a database random sample, then persist the day's result so reads stay stable. Age and gender determine eligibility; distance, goals, and interests contribute to ranking rather than additional exclusion filters. Score all 100 when at least 100 eligible candidates are available, otherwise score the available pool. Activity/diversity stratification can replace sampling if measured discovery quality warrants it.
4. Batch-load candidate preferences and answers; avoid one database query per profile.
5. `exploreMatchingPolicy.service.js` scores distance (40%), goals and relationship type (40%), shared interests (10%), and This-or-That agreement (10%). It uses existing preference fields; recent activity is not presented as compatibility.
6. Keep Explore ranking in `exploreMatchingPolicy.service.js`; location-room compatibility retains its separate scorer in `matchingScore.service.js`.
7. Sort by score and retain the top 10. A score out of 100 is a ranking indicator, not a probability of relationship success. Missing data contributes no matching evidence.

The promise is “best suggestions among the evaluated candidates,” not the global top 10 across the entire user database. Future repeat-suppression should be a soft penalty so small pools can still produce results.

## Daily Persistence and Payment

Add one `ExploreDaily` model with a unique `(user, dayKey)` index. Store status (`generating`, `ready`, `failed`), generation lease/expiry, reset timestamp, selected candidate IDs, score breakdowns, explanations, ranking version, and payment reference/amount.

Generation is protected by a daily unique index and renewable generation ownership. Persist the generated list before payment. Deduct the credit and store an unsettled receipt in one atomic User update; recover the ledger and ready-list writes idempotently from that receipt. Use `explore:<userId>:<dayKey>` with database-enforced ledger deduplication. Mark the receipt settled only after the ledger and list are persisted.

The ledger enum and an additional partial unique index now support Explore. The embedded payment receipt supports standalone MongoDB without treating the separate list and ledger writes as atomic. Unsettled receipts prevent a subsequent day from being charged until recovery succeeds.

Reopening the same day returns the stored ranking without another charge or AI generation. Refresh allowed public fields and recheck discoverability at read time; omit newly unavailable profiles without silently charging or regenerating. A daily cache cannot override blocks or privacy changes. Define whether removed entries are replaced; initial proposal does not replace them. The existing messaging flow remains responsible for access checks when the UI starts a conversation.

## HTTP Contract

| Endpoint | Behavior |
| --- | --- |
| `GET /api/explore` | Read unlock status, configured price, reset time, and today's saved cards when unlocked; no payment or generation side effects |
| `POST /api/explore/unlock` | Generate/unlock once for the day; return existing paid result on retry, pending status during generation, or an actionable failure |

| `POST /api/explore/profiles/:profileId/conversation` | On UI action only, validate today's unlocked suggestion, charge the initiating user one credit, and create/reuse an active room; retries reuse the charge |

Each returned profile should contain candidate ID, permitted preview fields, numeric `score`, AI-generated `matchNote`, and note status (`generated` or `fallback`). Include the daily list ID and reset timestamp at the response level. Return profiles sorted by descending score. Never serialize the full User document or internal scoring inputs directly. The separate conversation action returns a room ID for the existing chat UI.

## AI Explanations

Keep ranking deterministic. Generate explanations only for the selected 10 using the existing `matchNote.service.js` if its contract supports this use case. Verify its provider, inputs, and existing cache behavior before adapting it.

Give the model structured, permitted facts and the score reasons, emphasizing distance and shared relationship goals when supported. Ask for a short explanation such as “You live nearby and are both looking for a long-term relationship.” Mention interests or answer agreement only when present. Do not infer sensitive traits, invent shared interests, or imply guaranteed compatibility. Treat profile text as data. Persist explanations so reads do not repeat provider calls.

Use a bounded provider timeout and deterministic explanation fallback. AI failure should not block a usable paid list. A batch request for the selected cards is an option if the existing provider and response validation support it; otherwise use bounded concurrency.

## Implementation Order

1. Keep the confirmed 1-credit daily unlock, age/gender selection, distance/goals ranking, and UI-owned conversation initiation; settle timezone, partial-list behavior, and reveal policy.
2. Inspect scoring and note-generation contracts; extract/reuse scoring without altering current location-room matching.
3. Add daily persistence and candidate scoring; validate ranking on controlled fixtures before enabling payment.
4. Add unlock payment, ledger deduplication, API routes/controller, and permission-safe card projection.
5. Add explanations with cached results and fallback.
6. Connect the UI to ranked daily cards. The UI uses the selected-profile endpoint to enter its existing chat screen; no conversation creation or recipient notification is triggered by generating or reading the Explore list.
7. Complete: Explore uses HTTP discovery and the legacy socket matchmaking handlers have been removed. Keep chat sockets and existing rooms. The `/api/status/match-available-count` compatibility route and its legacy matcher were removed after repository-wide client inspection found usage only in the disabled frontend flow and none in the current mobile app.

Suggested files: `models/exploreDaily.model.js`, `services/explore.service.js`, `controllers/explore.controller.js`, `routes/explore.routes.js`, and `tests/explore.service.test.js`. Extend existing services rather than introducing a new queue or separate service for the first version. Generation can use the persisted lease and client polling initially.

## Acceptance and Validation

- All 100 selected profiles are evaluated when the eligible pool permits; up to 10 distinct profiles are returned sorted by deterministic score, each with `score` and `matchNote`.
- Gender and age preferences filter the candidate pool before scoring. Distance and goal mismatches lower scores rather than adding exclusion filters.
- Controlled fixtures verify that distance and goal compatibility dominate secondary ranking signals; missing coordinates/goals do not fabricate proximity or compatibility.
- Offline profiles can appear; privacy, block and moderation exclusions still apply.
- Reopening and concurrent unlock requests produce one daily result and one successful charge.
- Insufficient funds, interrupted generation, expired leases, database failure, and AI failure produce recoverable behavior.
- UTC reset, sparse profiles, empty/partial pools, and score ties are tested.
- Generating, unlocking, or reading Explore never creates a conversation or charges a recipient. Only the initiating user pays the one-credit conversation cost.
- A candidate becoming unavailable after selection is omitted from the cached response.
- Existing chat sockets and location-room matching continue passing their tests.

Measure generation latency, candidate pool sizes, partial-list frequency, AI fallback rate/cost, and unlock failures. Client and messaging analytics can separately measure chat initiation and recipient reply rate. Record technical counts and timing without logging private profile content.
