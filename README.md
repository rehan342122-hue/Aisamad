# Aisamad / Veyqora

Aisamad is a Hindi-friendly AI assistant. The new lightweight image studio is available at `/ai-studio.html` and keeps image generation separate from the chat UI so older, low-end devices do not pay the cost of loading a heavy editor.

## Run

```bash
npm install
npm start
```

Set `GEMINI_API_KEY` only in Render Environment Variables or a local, untracked `.env` file. Never paste secrets into chat, frontend files, commits, or issues.

## Production checklist

- Verify `/api/health` after every deployment.
- Keep API keys in Render secrets and rotate any key that was exposed.
- Use HTTPS in production.
- Test chat, login, image upload, small screens, slow networks, and reduced-motion mode.
- The image studio stores only up to eight image URLs in local storage and uses lazy loading for low-memory devices.
