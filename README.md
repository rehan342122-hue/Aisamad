# Aisamad SaaS foundation

A secure, Hindi-friendly Gemini AI app with multi-session UI, authentication API, SQLite persistence, file upload foundation, rate limiting, security headers, and deployment configuration.

## Run locally

```bash
npm install
cp .env.example .env
npm start
```

Open `http://localhost:3000`.

## Backend capabilities

- Gemini chat endpoint: `POST /api/chat`
- Health check: `GET /api/health`
- Register/login/me endpoints under `/api/auth`
- Authenticated conversation CRUD under `/api/conversations`
- Authenticated file upload: `POST /api/files` (10 MB limit)
- SQLite database is created in `data/aisamad.sqlite`
- Passwords are hashed with bcrypt; auth uses expiring JWTs
- Helmet security headers and API rate limiting

The current UI still supports guest chat and browser-local sessions. To connect account-backed sessions, send the JWT as `Authorization: Bearer <token>` from a future account screen. File storage is a secure upload foundation; PDF/image extraction and provider-specific vision calls are the next integration layer.

## Production checklist

1. Set a strong `JWT_SECRET` in the hosting provider, never in Git.
2. Set `GEMINI_API_KEY` only as a private environment variable.
3. Use persistent disk or replace SQLite with managed Postgres before scaling beyond one instance.
4. Add HTTPS, email verification, password reset, CSRF strategy, moderation, billing limits, and a privacy policy before accepting real users.
5. Configure Gemini usage/billing caps.

Never commit `.env`, API keys, passwords, OTPs, or private user data.
