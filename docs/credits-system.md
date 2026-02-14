# Credits System

## Rules
- New users receive `10` credits.
- Users receive `+3` once per UTC day for active usage.
- Starting a new matched conversation costs `-1` credit per participant.
- If a user-submitted This-or-That question is approved, submitter receives `+5`.

## Data Model
- `User.credits: number`
- `User.lastDailyCreditAt: Date | null`
- `CreditLedger` entries for each credit change:
  - `amount`
  - `type`
  - `balanceAfter`
  - `referenceType`
  - `referenceId`
  - `meta`

## API
- `GET /api/credits/balance`
- `GET /api/credits/history?page=1&limit=20`
- `POST /api/credits/daily-claim`

## Matchmaking Integration
- Socket event `startMatchmaking` now enforces minimum credits.
- On match creation, both users are charged `1` credit.
- Socket emits:
  - `insufficientCredits`
  - `creditsUpdated`

## This-or-That Approval Integration
- Admin endpoint:
  - `PATCH /api/games/this-or-that/questions/:questionId/status`
- Status transition to `approved` awards `+5` once using ledger idempotency.

## Admin Access
- Middleware checks `req.user.isAdmin === true`.
- Set `isAdmin` on admin user documents in `users` collection.

## Testing
- `npm test` runs Node test runner:
  - `tests/credits.service.test.js`
  - `tests/admin.middleware.test.js`
