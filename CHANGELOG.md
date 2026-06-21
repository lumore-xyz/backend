# Changelog

All notable changes to the Lumore backend (`lumore` API) are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [1.1.0] – In-app notifications, AI match notes for community rooms, admin icon picker, hardening

### Added
- **In-app notification system.** New `Notification` model with fields `userId`, `actorId`, `type`, `title`, `message`, `entityType`, `entityId`, `metadata`, `isRead`, `readAt`, plus a partial unique `(userId, type, entityType, entityId)` index that makes `createNotification` idempotent.
- **NotificationService** with `createNotification`, `createManyNotifications`, `getUserNotifications`, `getUnreadCount`, `markAsRead`, `markAllAsRead`, `deleteNotification`, and typed domain helpers (`notifyVerificationStatusChange`, `notifyGameSubmissionStatusChange`, `notifyCommunityJoined`, `notifyCommunityInvite`, `notifyCommunityRoleUpdated`).
- **Notification REST API.**
  - `GET /api/notifications?page=&limit=&unreadOnly=`
  - `GET /api/notifications/unread-count`
  - `PATCH /api/notifications/:id/read`
  - `PATCH /api/notifications/read-all`
  - `DELETE /api/notifications/:id`
  - `POST /api/admin/notifications/system` and `POST /api/admin/notifications/system/bulk` (admin-only).
- **Socket events** emitted to the recipient (`notification_created`, `notification_updated`, `notification_deleted`, `notification_unread_count`) so the mobile bell updates in real time.
- **Hook points** that create notifications from existing flows:
  - Explore match found → `MATCH_CREATED` (both users).
  - Community/location-room match found → `MATCH_CREATED_FROM_COMMUNITY` (both users).
  - Chat feedback submitted with text → `FEEDBACK_RECEIVED` for the recipient.
  - Account verification status change (webhook + auto-revoke) → `ACCOUNT_VERIFICATION_APPROVED` / `COMPLETED` / `REVOKED` / `REJECTED`.
  - This-or-That submission approved/rejected → `GAME_SUBMISSION_APPROVED` / `REJECTED`.
  - Community room created by user → `COMMUNITY_JOINED` for the creator.
  - Admin push/email campaign → `SYSTEM_MESSAGE` per recipient.
- **Option icons for admin-managed dropdowns.** Each option in `AppOptions` may carry `icon: { library: "Ionicons", name: "heart-outline" }`. Admin endpoints validate the shape and the mobile renderer safely ignores unknown names.
- **Curated Ionicons catalog** at `libs/iconCatalog.js` (~250 outline icons in 13 categories) exposed via `GET /api/admin/options/icon-catalog` for the admin picker.
- **AI match notes for community-room matches.** Extracted `buildMatchNote` into `matchNote.service.js` and reused it in both explore and community matching flows so every fresh community match now ships an AI-generated `oneSentenceNote`, per-user `notesByUser`, and `aiSummary` metadata. The community `matchingNote` now includes `common.{interests, languages, goals, religion, diet, lifestyle}`, `thisOrThat.{sharedAnswers, matchedAnswers, matchRate}`, full `components`, `distanceKm`, and `reasons`. AI envelope fields are stripped from the persisted `MatchRoom.matchingNote` and attached only to the live socket payload (mobile sees the same field names as explore).

### Changed
- `options.service.js` now preserves `icon` on each option and runs `metadata` through a sanitizer that strips reserved/dangerous keys (`__proto__`, `prototype`, `constructor`, `$set`, `$unset`, `$inc`) so callers cannot smuggle Mongo operators or prototype pollution via metadata.
- Engagement campaign endpoints reject requests targeting more than 5000 recipients in a single call.
- Admin campaign notifications no longer forward `req.body.data` into notification metadata — only server-built fields (`campaignId`, `channel`, `emailCampaignType`) are stored.
- `matchRoom.controller.js#submitChatFeedback` now creates a `FEEDBACK_RECEIVED` notification for the recipient (only when the feedback text is non-empty).
- `thisOrThat.controller.js` notifies the submitter when admin approves/rejects their submitted question.
- `socket.service.js` exposes the unified `buildMatchNote` from `matchNote.service.js`, removing the local copy.

### Fixed
- `locationRoomMatching.service.js` previously stored only `{seekerScore, candidateScore, locationRoomTitle}` in the room matching note, which made community matches unrenderable by the AI service. The note now carries the full structural data (shared interests/languages/goals/religion/diet/lifestyle, this-or-that stats, components, distance, reasons).
- Notification emits no longer throw when the recipient socket is disconnected (wrapped in a `safeEmit` that logs and continues).
- `notifyVerificationStatusChange` no-ops when the previous status equals the new status (avoids spamming identical "verification revoked" rows when identity fields change repeatedly).
- Engagement admin route no longer lets a malicious payload inject arbitrary keys into `metadata`.

### Security
- New per-request recipient cap (5000) on admin campaign endpoints.
- `metadata` is sanitized server-side before persistence.
- Notification ownership is enforced at the query layer (every list/mark/delete filters by `req.user._id`), so users cannot read or mutate other users' notifications.
- All new admin routes (`/api/admin/notifications/*`) are gated by `protect` + `requireAdmin`.

### Internal
- Split `notification.service.js` into focused modules: `notification.helpers.js` (pure utilities), `notification.events.js` (socket emit helpers + event constants), `notification.templates.js` (typed domain builders). The orchestrator `notification.service.js` now only contains CRUD + the typed domain wrappers, easier to test and reason about.
- Extracted `buildMatchNote` from `socket.service.js` into `matchNote.service.js` with an injectable `loadUsers` callback so both explore and community flows share the same AI pipeline.
- `locationRoomMatching.service.js#buildRoomMatchingNote` now produces the same shape as the explore `matchingNote` so the AI summarizer is source-agnostic.
- New tests:
  - `tests/notification.helpers.test.js` (9 tests).
  - `tests/notification.templates.test.js` (9 tests).
  - `tests/options.service.test.js` (8 tests).
  - `tests/matchNote.service.test.js` (4 tests).
  - `tests/locationRoomMatching.service.test.js` (4 tests).
  - `tests/notificationConstants.test.js` (8 tests).
- 111 backend tests pass (was 81 prior to this release).

## [1.0.0] – Initial public API baseline
- Initial release. Express + Mongoose API with JWT auth, MongoDB models, Socket.io `/api/chat` namespace, didit verification webhooks, credits + matchmaking + chat-room + location-room pipelines, cron jobs, file uploads, OneSignal push notifications, nodemailer campaigns.
