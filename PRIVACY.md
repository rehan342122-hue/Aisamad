# Aisamad deployment and privacy checklist

## Features

- Text chat in Hindi and English
- Gemini image understanding for JPG, PNG, WEBP and GIF files up to 6 MB
- Firebase email/password login and Firestore cloud chat history
- Guest chat stored only in the browser's local storage
- Voice input when the browser supports the Web Speech API

## Required Render variables

`GEMINI_API_KEY`, `GEMINI_MODEL` (recommended: `gemini-2.5-flash`), `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, and `FIREBASE_PRIVATE_KEY`.

## Before public launch

1. Rotate any Gemini key that has been shared publicly.
2. Restrict the Firebase web API key by HTTP referrer.
3. Configure Firebase Auth and Firestore rules; never use public read/write rules.
4. Confirm `/api/health` reports `firebaseReady: true` and `geminiReady: true`.
5. Do not put Admin credentials in GitHub or the browser.

Guest messages are not sent to Firestore by this app, but messages sent to Gemini are processed by Google's API. Do not promise absolute privacy; show users a clear privacy notice before production launch.
