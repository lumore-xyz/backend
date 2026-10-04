# Repository Guidelines

## Project Structure & Module Organization

This backend uses Node.js ES modules, Express, MongoDB/Mongoose, and Socket.IO. `app.js` configures HTTP middleware and routes. `server.js` connects the database before starting the HTTP server, sockets, and scheduled jobs.

- `routes/` defines endpoints; `controllers/` handles HTTP requests; `services/` contains business logic and external integrations.
- `models/` contains Mongoose schemas; `middleware/` handles shared request concerns; `config/` configures infrastructure.
- `utils/` and `libs/` hold shared helpers and constants.
- `tests/` contains automated tests; `scripts/` contains data backfills; `docs/` contains feature documentation.
- `seed-data/` is ignored local data. There is no dedicated frontend or static asset directory.

## Build, Test, and Development Commands

Use Node.js 24 to match the Docker image.

- `npm install`: install dependencies.
- `npm run dev`: run with nodemon and `NODE_ENV=development`.
- `npm start`: run `server.js` without automatic restarts.
- `npm test`: run the complete Node.js test suite.
- `node --test tests/credits.service.test.js`: run a focused test file.
- `npm run backfill:interested-in` and `npm run backfill:location`: update existing user data; verify the target database before running.

There is no compilation step or configured lint/format script.

## Coding Style & Naming Conventions

Follow adjacent code: two-space indentation, double-quoted strings, semicolons, and ES-module imports with explicit `.js` extensions. Use camelCase for functions and variables, PascalCase for model identifiers, and UPPER_SNAKE_CASE for constants. Name modules by feature and role, such as `credits.service.js`, `auth.controller.js`, and `locationRoom.routes.js`. Keep reusable business logic in services rather than route handlers.

## Testing Guidelines

Tests use `node:test` and `node:assert/strict`; name files `tests/<feature>.<role>.test.js`. Cover changed behavior, failure paths, authorization, and relevant time or quota boundaries. Stub database and external-service calls where practical, and restore patched methods after tests. No coverage threshold is configured. Run focused tests during development and `npm test` before submitting.

## Commit & Pull Request Guidelines

History mixes plain summaries with `feat:`, `fix:`, and `refactor:` prefixes; prefer these prefixes with a concise action-oriented description. Pull requests should explain the problem, resulting behavior, affected endpoints or configuration, and validation performed. Link relevant issues and document migration or backfill steps when applicable.

## Security & Configuration

Copy `.env.example` to `.env` and configure `MONGODB_URI` and required integration credentials. Keep secrets and personal data out of commits, logs, and test fixtures. Use a development database for local work.
