# Application Flows

## Authentication and Active Usage

1. Clients register or log in through [auth routes](../../routes/auth.routes.js), including email/password, Google, and Telegram entry points.
2. [authToken.service.js](../../services/authToken.service.js) signs access and refresh tokens with separate secrets and configured expirations.
3. Protected HTTP endpoints read `Authorization: Bearer <accessToken>`, verify it, load the user without their password, and attach `req.user`.
4. [protect middleware](../../middleware/auth.middleware.js) records authenticated activity and starts the daily credit grant asynchronously; activity writes are throttled to five minutes per user. The admin active-user count includes non-archived users whose `lastActive` is within 30 days, while "online now" uses the live socket `isActive` flag.
5. Socket authentication reads `socket.handshake.auth.token` and attaches a minimal user record. Password recovery uses the password-reset service and SMTP delivery.

## Daily Explore Discovery

The [Explore API](../../docs/explore-api.md) replaces live socket matchmaking for discovery. `POST /api/explore/unlock` samples up to 100 profiles within the seeker's gender/age preferences, scores distance and goals most strongly, generates notes for the top 10, and persists one daily list. The 1-credit debit includes an atomic payment receipt; repeated unlocks return the cached list. `GET /api/explore` reads the list and recovers interrupted payments without another debit. Public field visibility and profile availability are rechecked on reads. The mobile UI owns conversation initiation: Say hello calls `POST /api/explore/profiles/:profileId/conversation`, which rechecks today's unlocked selection and creates or reuses an active chat. The initiating user pays one credit once; the suggested user is not charged, and active-room retries reuse the existing conversation. A newly created room sends the recipient a push notification through the configured provider and emits `inbox_updated`; the client enters its existing chat route. Reading or unlocking the list never creates a chat, and retries do not send duplicate pushes.

## Location-Room Matching

Users discover nearby rooms, pin them, and join or leave their matching pool. A pin's saved state and pool participation are separate fields. The default room matching interval is 24 hours.

[locationRoomMatching.service.js](../../services/locationRoomMatching.service.js) processes due cycles, coordinates room locks, evaluates eligibility and compatibility, creates matches with location-room provenance, updates pool state, and notifies participants. Cron checks due rooms every minute; `/api/rooms/:roomId/start-match` also exposes an explicit matching trigger with controller-enforced rules.

## Chat and Profile Visibility

Authenticated clients join a chat using `joinChat`. Message handlers check access, persist messages, update room previews/unread state, and emit delivery/read updates. Other handlers support typing, edits, reactions, ending chats, and profile unlock/lock operations. HTTP inbox and message routes complement realtime delivery. Message TTL and media cleanup make retention time-sensitive; see [data-model.md](data-model.md).

## Identity Verification

`POST /api/halokyc/create-verification` starts a provider session using user metadata. The provider webhook maps statuses and updates only the user whose ID and stored verification session match the event. Approval triggers referral-credit processing and a verification-status notification. `GET /api/halokyc/complete` redirects to `lumore://profile`. The current webhook handler parses raw JSON but contains no signature verification; session matching is not proof of provider authenticity.
