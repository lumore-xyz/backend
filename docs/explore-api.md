# Daily Explore API

Explore uses HTTP for daily discovery and user-initiated conversation creation. Chat sockets and location-room matching continue to work.

## Rules

- A daily list costs **1 credit**, once per user per UTC day.
- Select up to **100** non-archived profiles using the seeker's gender and age preferences; score every selected profile and retain up to **10**.
- Candidates can be offline and need not have credits or be actively matchmaking.
- Ranking weights: distance 40%, goals 40%, interests 10%, This-or-That agreement 10%. Missing data contributes no matching evidence. Goals use `UserPreference.goal` and relationship type.
- Sampling occurs once per daily generation. Results are the best within that sample, not the entire database.
- Existing active/archived conversations and bilateral report/rejection records exclude a pair.
- Partial lists cost 1 credit. Empty lists cost nothing and remain empty until the next UTC day.
- Reads preserve the paid ranking, omit newly unavailable profiles, and honor current public field visibility. Removed suggestions are not replaced that day.
- Scores indicate relative compatibility, not a probability of relationship success.

## Endpoints

All endpoints require `Authorization: Bearer <accessToken>`. User identity always comes from authentication, never request parameters.

### `GET /api/explore`

Read today's unlock state and, when unlocked, the saved profiles. This endpoint does not generate a list or deduct credits. It can repair an interrupted unlock using an existing payment receipt. The shared authentication middleware independently attempts the daily activity bonus.

### `POST /api/explore/unlock`

No body is required. Generate and unlock today's list, or return the existing result without another charge. Rate limited to 30 requests per authenticated user per 15 minutes.

```json
{
  "success": true,
  "data": {
    "dailyId": "<daily-document-id>",
    "dayKey": "2026-10-03",
    "resetAt": "2026-10-04T00:00:00.000Z",
    "cost": 1,
    "amountPaid": 1,
    "unlocked": true,
    "status": "ready",
    "candidateCount": 100,
    "profiles": [
      {
        "_id": "<profile-id>",
        "nickname": "Sam",
        "age": 25,
        "distanceKm": 4.7,
        "score": 83.5,
        "matchNote": "Worth exploring: you live nearby and you both want a long term relationship.",
        "noteStatus": "fallback"
      }
    ]
  }
}
```

Preview fields are a restricted allowlist, subject to `fieldVisibility`: nickname, profile picture, gender, bio, interests, languages, verification flag, and age derived from DOB. `distanceKm` is calculated from both users' current locations, rounded to 0.1 km, and is `null` when the suggested profile's location is hidden or either location is unavailable. Usernames, full DOB, coordinates, real names, contact information, provider IDs, credentials, private fields and unlock-only fields are not returned. Note inputs also omit hidden fields. A cached note is replaced with a fresh safe fallback if its public facts change.

### `POST /api/explore/profiles/:profileId/conversation`

Called only when the user selects **Say hello**. No body is required. The initiating user pays one credit; the suggested user is not charged. An existing active conversation is reused without another charge. Returns `{ success: true, data: { roomId } }`; navigate to the existing chat route using this ID.

The profile must belong to the caller's unlocked list for the current UTC day. The server rechecks age/gender eligibility, account availability, bilateral reports/rejections and existing room status. Active rooms are reused; archived rooms cannot be reopened. A newly created room sends the recipient a push notification through the existing push providers, with the room ID for navigation. Retrying an existing room does not send another push. Concurrent requests use a unique sparse `MatchRoom.directExplorePairKey` index to reuse one directly created room. Both participants receive `inbox_updated` through their existing sockets.

Failures include `403 PROFILE_NOT_UNLOCKED`, `409 PROFILE_UNAVAILABLE`, and `409 CHAT_ARCHIVED`. Invalid profile IDs return 400. This route shares the unlock route's 30-request/15-minute limit. Generating or reading suggestions never creates a chat.

### `POST /api/explore/refresh`

Replaces the current ready list with a newly generated set that excludes the current suggestions. The request body requires a client-generated `requestId`; the configured force-refresh cost is 10 credits and the debit is idempotent for that request ID. Reuse the same `requestId` when retrying a timed-out request: the prepared replacement list and payment receipt let the server resume the refresh safely. A different refresh request is rejected while one is pending. Clients should explain the cost and replacement behavior in a confirmation dialog before calling this endpoint. The refresh ledger uses a separately named unique index from the daily-unlock ledger.

### `POST /api/explore/profiles/:profileId/reject`

Removes an unlocked suggestion and excludes the pair from future matching while the rejection record is retained. The body requires a `reason` (`not_my_type`, `different_intentions`, `too_far_away`, `profile_incomplete`, or `other`) and accepts up to 500 characters of optional private `feedback`. The suggested user is not notified. Returns `{ success: true, data: { profileId } }`.

## Client Handling

| Result | Client action |
| --- | --- |
| `200`, `locked` | Show the unlock action and cost |
| `200`, `ready` | Display sorted profiles and their scores/notes |
| `200`, `empty` | Show no available suggestions; no credit was spent |
| `202`, `generating` | Poll GET after `Retry-After` (3 seconds) |
| `400`, incomplete profile/invalid age preference | Ask the user to complete their profile/preferences |
| `409`, `INSUFFICIENT_CREDITS` | Show insufficient balance |
| `409`, payment pending/day expired/no profiles available | Refresh state and retry as appropriate |
| `503` or transient server error | Retry GET first; an existing debit receipt can recover the list |
| `429` | Respect the rate limit |

## Persistence and Payment Recovery

`ExploreDaily` has a unique `(user, dayKey)` index. A token and three-minute lease protect generation; a later request can reclaim an expired lease. Generated profiles are persisted as `prepared` before any debit.

The credit decrement and `User.explorePayment` receipt are a single atomic update, supporting standalone MongoDB. Refreshes first persist the replacement list in `ExploreDaily.pendingRefresh`; the credit decrement and `User.exploreRefreshPayment` receipt are also a single atomic update. Ledger insertion is an idempotent upsert with a unique Explore reference index. Recovery writes the ledger, installs the pending list, and settles the receipt. A crash or transient failure resumes from the receipt; the same request cannot be charged twice. Keep these records available for recovery; they currently have no TTL.

MongoDB model initialization waits for configured index creation before serving Explore. Production deployments that disable automatic index creation must provision the new unique indexes before enabling these routes. Account deletion removes owned daily records and removes that user from other lists.

## Match Notes

Notes use the existing NVIDIA chat-completion provider when `NVIDIA_API_KEY` is configured. `NVIDIA_MATCH_NOTE_MODEL` optionally overrides the existing service's model. Only the top ten trigger provider calls, at most five concurrently, with a five-second timeout per call.

The approved provider payload includes the suggested profile's public nickname, shared goals/interests/languages, approximate distance, and score. Hidden facts, user IDs, contact details, and coordinates are excluded. Explore uses a generic viewer name. Missing credentials, provider failure, or invalid output produce factual local fallback notes with `noteStatus: "fallback"`; successful AI notes use `"generated"`. Results are cached for the day, with no extra provider calls on reads.

## Validation

The existing model-double tests cover ranking, filters, visibility, caching, concurrent unlocks, interrupted-payment recovery, date boundaries, route authentication, selected-profile conversation authorization, and room reuse. They do not exercise the shared conversation credit ledger or refund path. A disposable MongoDB integration check should verify transaction and fallback billing behavior before deployment.
