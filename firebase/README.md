# Firebase Web config

The Firebase web configuration is in `public/firebase-config.js`. Firebase web API keys are not equivalent to Admin credentials, but restrict the key by HTTP referrer in Google Cloud Console and configure Firebase Auth/Firestore rules before launch.

The server still requires private Firebase Admin credentials (`FIREBASE_CLIENT_EMAIL` and `FIREBASE_PRIVATE_KEY`) as hosting environment variables. Never commit those values.
