# Development and Operations

## Local Setup

Use Node.js 24 to match [Dockerfile](../../Dockerfile). From the repository root:

```powershell
npm install
Copy-Item .env.example .env
# Set local database and required credentials in .env.
npm run dev
```

Configure `MONGODB_URI`, access/refresh token secrets, and token expirations. Use a development database. `npm run dev` enables development mode and nodemon; `npm start` runs the server directly. The default port is `5000`. There is no compilation step or configured lint/format command.

## Feature Configuration

`.env.example` documents many settings but is not a complete inventory. Search feature code for `process.env` before enabling an integration.

| Feature | Configuration examples |
| --- | --- |
| HTTP / sockets | `PORT`, `CLIENT_URL`, `CORS_ORIGINS` |
| Tokens / database | `ACCESS_TOKEN_SECRET`, `REFRESH_TOKEN_SECRET`, expiry settings, `MONGODB_URI` |
| Google / Telegram login | Google client credentials; `TMA_BOT_TOKEN` |
| Email / password reset | `SMTP_*`, `EMAIL_FROM`, password-reset URL and expiry settings |
| HaloKYC | `HALOKYC_API_URL`, `HALOKYC_API_KEY`, `HALOKYC_WORKFLOW_ID` |
| Push | `VAPID_*`, `ONESIGNAL_APP_ID`, `ONESIGNAL_API_KEY` |

Keep credentials and personal data out of context documents, fixtures, commits, and logs.

## Verification

```powershell
node --test tests/credits.service.test.js
npm test
git diff --check
```

Tests use `node:test` and `node:assert/strict`, with feature-oriented `*.test.js` files and mocked dependencies where needed. There is no configured coverage threshold. Run targeted tests while changing behavior, then the full suite before submission. Test names and assertions should describe observable behavior, especially authorization, repeated requests, and failure handling.

## Background Work

[cron.service.js](../../services/cron.service.js) registers:

| Schedule | Work |
| --- | --- |
| Daily at 02:30 | Delete archived accounts past scheduled deletion |
| Every 10 minutes | Clean up expired image messages and cloud files |
| Daily at 03:00 | Clean up expired archived chats |
| Every minute | Process due location-room matching cycles |

These cron registrations specify no timezone, so daily schedules use the runtime's local timezone. Credit-day calculations separately use UTC. Jobs initialize with every server process; assess concurrency when running multiple instances.

## Deployment and Data Maintenance

The Docker image uses `node:24-alpine`, installs production dependencies, runs as a non-root user, and checks `/` on port 5000. Coordinate port changes with its health check. The HTTP bind address is hardcoded to `0.0.0.0` in `server.js`.

`npm run backfill:interested-in` and `npm run backfill:location` modify existing user data. Inspect the script, confirm the target database, and prepare recovery before running a backfill. Account deletion is centralized in [accountDeletion.service.js](../../services/accountDeletion.service.js); update it when adding user-owned records.
