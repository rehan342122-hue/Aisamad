# Aisamad

A secure, Hindi-friendly Gemini AI assistant with chat history, voice input, voice replies, dark mode, rate limiting, and Render/Docker deployment support.

## Run locally

```bash
npm install
cp .env.example .env
npm start
```

Open `http://localhost:3000`. Keep `GEMINI_API_KEY` only in `.env` or your hosting provider's private environment variables.

## Features

- Gemini backend with Hindi, Hinglish, and English replies
- Conversation context (last 12 messages)
- Browser-local chat history and clear-chat button
- Optional browser voice input
- Text-to-speech voice replies with auto-speak toggle
- Dark mode and responsive mobile UI
- Basic API rate limiting: 20 requests per minute per client
- `/api/health` endpoint for deployment checks

The JSONL file is used as style guidance in the prompt; it is not model fine-tuning. Login/authentication is intentionally not included yet.

## Security

Never commit `.env`, API keys, passwords, OTPs, or private user data. Set a billing/usage limit in Google AI Studio. For production, also add authentication, a database, stronger abuse protection, and a privacy policy before storing user accounts or server-side conversations.
