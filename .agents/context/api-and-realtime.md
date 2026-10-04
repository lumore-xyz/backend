# API and Realtime Map

## HTTP Surface

[server.js](../../server.js) defines these prefixes. Read the corresponding router and controller for methods, payloads, authentication, and response details; this map is not an exhaustive endpoint contract.

| Prefix | Responsibility |
| --- | --- |
| `/api/auth` | Registration, login, token refresh, password recovery |
| `/api/profile`, `/api/post`, `/api/prompt` | Profiles, photos/content, prompts |
| `/api/status` | User status operations |
| `/api/app-version` | Mobile app version information |
| `/api/inbox`, `/api/messages` | Match rooms and messaging |
| `/api/rooms` | Location rooms, pins, pools, matching triggers |
| `/api/credits`, `/api/referral` | Balances, history, rewards, referrals |
| `/api/explore` | Read/unlock a 1-credit daily list of up to 10 scored suggestions from 100 age/gender-eligible profiles; start a chosen-profile conversation without another charge |
| `/api/games/this-or-that` | Questions, answers, moderation |
| `/api/notifications`, `/api/push` | Notification records and push operations |
| `/api/halokyc` | Start verification and completion redirect |
| `/api/webhooks/halokyc` | Provider status callback |
| `/api/admin/auth`, `/api/admin` | Admin authentication and operations |
| `/api/admin/notifications` | Admin notification operations |

`GET /` returns a basic running message; it does not verify database or provider health. Protected user routes use bearer authentication; inspect individual routes for admin and action-specific checks.

## Socket Connection

Use the Socket.IO namespace `/api/chat` and supply `auth: { token: accessToken }`. This is a namespace, not a replacement for Socket.IO's transport path. Socket CORS uses `CLIENT_URL` or `http://localhost:3000`; HTTP CORS separately combines configured and default origins.

## Event Families

| Client event | Purpose |
| --- | --- |
| `joinChat`, `leaveChat`, `endChat` | Chat subscription and lifecycle |
| `send_message` | Send message content |
| `typing` | Send typing state |
| `edit_message`, `toggle_message_reaction` | Change messages or reactions |
| `unlockProfile`, `lockProfile` | Change profile visibility |

Explore discovery and conversation initiation use HTTP. Location-room matches and chat updates still use sockets. Event payloads and emissions live in [socket.service.js](../../services/socket.service.js), [socketChat.service.js](../../services/socketChat.service.js), and [locationRoomNotification.service.js](../../services/locationRoomNotification.service.js). Preserve spelling and casing when changing client/server contracts.
