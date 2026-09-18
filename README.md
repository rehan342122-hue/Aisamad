# Aisamad with Supabase

A secure, Hindi-friendly AI assistant foundation built with Express + Gemini + Supabase.

## What is included

- Supabase-ready auth routes
- Conversation API for authenticated users
- Gemini chat API
- Security headers + rate limiting
- Supabase schema template
- Production-friendly environment config

## Required setup

1. Install dependencies

```bash
npm install
```

2. Create `.env` from `.env.example`

```bash
cp .env.example .env
```

3. Fill in your own values:

- `GEMINI_API_KEY`
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

4. Start app

```bash
npm start
```

Then open `http://localhost:3000`.

## Supabase database schema

Use the SQL in `supabase/schema.sql` in your Supabase SQL editor.

The schema includes:
- `profiles` table
- `conversations` table
- `message_history` support pattern

## Security notes

- Never commit `.env` files
- Keep service role keys only in server-side environment variables
- Use Row Level Security (RLS) in Supabase for real user data
- Use billing caps in Google AI Studio and Supabase for production

## Production roadmap

- user dashboard
- login/register UI
- per-user chat persistence
- file upload and document understanding
- admin panel
- deployment on Vercel/Render
