# Aisamad — Firebase edition

Aisamad now uses **Firebase Authentication + Firestore** for the SaaS foundation and Gemini for AI responses.

## What is ready

- Firebase Admin SDK server integration
- Firebase ID-token verification for protected APIs
- Firestore conversation CRUD APIs
- Gemini chat endpoint with modes and history
- Helmet security headers and rate limiting
- Public `/api/config` endpoint for safe Firebase web configuration

## Setup

1. Create a Firebase project.
2. Enable **Authentication → Sign-in method → Email/Password**.
3. Create a Firestore database.
4. Create a Web App in Firebase Project Settings and copy its web configuration.
5. Create a service account in Project Settings → Service accounts.
6. Copy `.env.example` to `.env` and fill the values locally or in Render environment variables.
7. Install and run:

```bash
npm install
npm start
```

Open `http://localhost:3000`.

## Security — strict rule

Never commit `.env`, a service-account JSON file, `FIREBASE_PRIVATE_KEY`, Gemini keys, passwords, or OTPs. The Firebase web config is designed to be public, but Admin credentials are server-only. Set Firestore security rules and Gemini billing limits before launch.

The frontend still has local guest sessions; account UI and Firestore sync are the next frontend integration. The backend is already prepared for Firebase ID tokens from a Firebase client login.
