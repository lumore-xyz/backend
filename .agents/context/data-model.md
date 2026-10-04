# Data Model

Schemas in [models/](../../models/) define the authoritative fields and indexes. Mongoose references associate documents; they do not provide database-enforced foreign keys or automatic cascading deletion.

## Core Entities

| Entity / source | Purpose and relationships |
| --- | --- |
| `User` — `user.model.js` | Identity, profile, location, verification, activity/matching flags, credits, referral and account lifecycle state |
| User preferences — `preference.model.js` | Matching preferences; unique user reference |
| `MatchRoom` — `room.model.js` | Participants, `active`/`archive` status, source, last-message preview, unread counts, matching note |
| `Message` — `message.model.js` | Sender/receiver, string `roomId`, text/image/audio content, replies, reactions, read/delivery state |
| `LocationRoom` — `locationRoom.model.js` | Creator, public/private visibility, GeoJSON location, schedule, cycle lock |
| `LocationRoomPin` — `locationRoomPin.model.js` | User/room membership, saved pin state, pool eligibility and latest match |
| `LocationRoomCycle` — `locationRoomCycle.model.js` | Running/completed/failed cycle, counts, matches, skipped users, error details |
| `CreditLedger` — `creditLedger.model.js` | Signed credit change, user, type, reference, resulting balance, metadata |
| `ExploreDaily` — `exploreDaily.model.js` | Unique user/day list, generation lease, ranked profiles and notes, paid state; atomic payment receipt lives on User |

## Supporting Entities

Posts, prompts, and user photos support profiles and content. Unlocks represent profile visibility relationships. Reports and rejected profiles support moderation and matching exclusions. This-or-That questions and answers provide moderated content and compatibility signals. Notifications, push subscriptions, user groups, app options, mobile app versions, and mobile runtime configuration support delivery and administration.

## Relationships and Important Constraints

- A match room references users and optionally a location room/cycle. Its `source` is `explore` or `location_room`.
- Location-room pins have a unique `(room, user)` index. `isPinned` and `inPool` are independent; pool statuses include `in_pool`, `matched`, `left`, `insufficient_credits`, and `ineligible`.
- Location rooms and users use `2dsphere` location indexes. Coordinates follow GeoJSON order: `[longitude, latitude]`.
- User identity fields have unique indexes, with sparse indexes for optional identities such as email and provider IDs.
- This-or-That answers have a unique `(userId, questionId)` index.
- Rewarded-ad ledger entries have a partial unique index on user, type, reference type, and reference ID. Other ledger types do not inherit this uniqueness guarantee.
- Explore unlocks have a separate partial unique ledger index on user, reference ID, and type. `ExploreDaily` has a unique `(user, dayKey)` index; its recovery records currently have no TTL.

## Retention and Deletion

[Message](../../models/message.model.js) has a 24-hour TTL on `timestamp`. MongoDB TTL removal is asynchronous, so expiry is not an exact deletion deadline. Image cleanup runs separately to remove cloud media before document expiry. Archived-chat cleanup and account deletion are application jobs; consult their services when changing retention or adding user-owned records.
