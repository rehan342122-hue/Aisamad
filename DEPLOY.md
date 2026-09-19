# Aisamad AI — quick deployment

The app is already wired to Gemini through the server-side `/api/chat` route. The API key is intentionally **not** stored in HTML, JavaScript, Git, or this repository.

## Render deployment

1. Open the repository in Render and create a **Web Service**.
2. Build command: `npm ci`
3. Start command: `npm start`
4. Add these environment variables in Render:

```text
GEMINI_API_KEY=<a newly generated Gemini API key>
GEMINI_MODEL=gemini-2.5-flash
```

Render will use `render.yaml` automatically when configured as a Blueprint.

## Local run

```bash
npm ci
cp .env.example .env
# Put the new key in .env; never commit .env
npm start
```

Then open `http://localhost:3000`. Check `/api/health` to confirm `geminiReady: true`.

## Important

The API key previously pasted in chat should be revoked and replaced. A browser-visible key can be copied and abused, so the frontend calls `/api/chat` and the server keeps the secret in the environment.
