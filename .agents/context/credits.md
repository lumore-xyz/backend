# Credits and Rewards

## Current Rules

[CREDIT_RULES](../../services/credits.service.js) is the source of truth.

| Action | Credit change / limit |
| --- | --- |
| Signup | +10 |
| Daily active usage, verified user | +3 once per UTC day |
| Daily active usage, unverified user | +1 once per UTC day |
| Location-room conversation start | -1 to the selected starter only |
| Unlock daily Explore suggestions | -1 to the requesting user, once per UTC day; no charge for an empty list |
| Refresh daily Explore suggestions | -10 to the requesting user |
| Start an Explore conversation | No additional charge after unlocking the daily list |
| Approved user-submitted This-or-That question | +5 |
| Referral verification bonus | +10 to the eligible referrer |
| Rewarded ad | +1; maximum 3 in a rolling 60-minute window |

Daily verification checks accept `isVerified` or an approved verification status. Reward eligibility and repeated-claim handling live in the individual service functions, not just these constants.

## Persistence and Consistency

`User.credits` stores the current balance; `CreditLedger` records changes with type, amount, balance after the operation, references, and metadata. Daily grants use UTC boundaries. Rewarded-ad session references have a partial unique ledger index to prevent duplicate session claims.

Conversation spending checks both participants' balances and uses MongoDB transactions when supported. The standalone-database fallback uses conditional updates and compensating refunds. Review failure paths whenever changing spending; fallback operations are not equivalent to full transaction isolation.

## Entry Points

All credit routes apply user authentication:

- `GET /api/credits/balance`
- `GET /api/credits/history?page=1&limit=20`
- `POST /api/credits/daily-claim`
- `POST /api/credits/rewarded-ad-claim`
- `POST /api/explore/unlock` (daily discovery unlock, separate from conversation spending)
- `POST /api/explore/refresh` (refreshes the daily list for 10 credits)

Protected HTTP activity also attempts the daily bonus in the background. Location-room matching charges only the selected conversation starter. Explore charges for unlocking and refreshing the daily list, not for starting an Explore conversation. Realtime clients receive `creditsUpdated` for location-room credit changes.

## Change Checklist

Update service constants and eligibility together, verify balance and ledger behavior, and cover repeated requests, insufficient balances, time boundaries, and transaction fallback. Start with [credits.service.test.js](../../tests/credits.service.test.js). Keep [credits-system.md](../../docs/credits-system.md) in sync with the implemented rules and endpoints.
