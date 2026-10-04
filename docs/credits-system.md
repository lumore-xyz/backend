# Credits

Credit amounts and limits are defined in [creditRules.js](../services/creditRules.js). Feature services apply each rule and write the corresponding ledger entry.

| Action | Credit change |
| --- | ---: |
| Signup | +10 |
| Daily active usage, verified user | +3 once per UTC day |
| Daily active usage, unverified user | +1 once per UTC day |
| Start an Explore or location-room conversation | -1 from the starter only |
| Unlock the daily Explore list | -1 once per UTC day; an empty list is free |
| Refresh the daily Explore list | -10 per refresh |
| Approve a user-submitted This-or-That question | +5 |
| Verify a referred user | +10 to the eligible referrer |
| Claim a rewarded ad | +1, up to 3 in a rolling hour |

Starting a conversation from an Explore suggestion or a location-room match costs one credit from the starter. The other participant is never charged. Reusing an active conversation does not charge again.

## Persistence

`User.credits` stores the balance. `CreditLedger` records each change with its type, amount, resulting balance, reference, and metadata. Daily grants use UTC boundaries. Services use ledger uniqueness and idempotent references where retries could otherwise duplicate a charge or reward.

Conversation spending uses a MongoDB transaction when available and a conditional-update/refund fallback otherwise. Explore payments use an embedded receipt and ledger recovery so interrupted writes can be retried without another debit. These fallback paths are feature-specific and do not provide general transaction isolation.

Conversation-start retries reuse an existing charge for the same starter and partner. If an Explore or location-room match room cannot be persisted after its starter is charged, the service removes that charge and restores the starter's balance. The compensation is transactional when MongoDB transactions are available.

## Endpoints

- `GET /api/credits/balance`
- `GET /api/credits/history?page=1&limit=20`
- `POST /api/credits/daily-claim`
- `POST /api/credits/rewarded-ad-claim`
- `POST /api/explore/unlock` — daily Explore list
- `POST /api/explore/refresh` — refresh the list

Authenticated HTTP activity also attempts the daily usage grant in the background. The credits controller and feature-specific services define the detailed response and retry behavior.
