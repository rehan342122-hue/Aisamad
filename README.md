# Aisamad

A small, secure Gemini-powered AI assistant with a simple Hindi-friendly web interface.

## Run locally

1. Install Node.js 18 or newer.
2. Install dependencies:

   ```bash
   npm install
   ```

3. Create `.env` from `.env.example` and add a **new** Gemini API key:

   ```bash
   cp .env.example .env
   ```

4. Start Aisamad:

   ```bash
   npm start
   ```

5. Open http://localhost:3000

The API key is used only on the server and is never sent to the browser. The JSONL file is currently used as style guidance; it is not model fine-tuning.

## Security

Never commit `.env` or paste an API key into frontend code, GitHub, screenshots, or chat. The key previously shared publicly should be revoked and replaced in Google AI Studio.
