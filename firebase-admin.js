const admin = require('firebase-admin');

function getFirebaseAdmin() {
  if (admin.apps.length) return admin;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');
  if (!process.env.FIREBASE_PROJECT_ID || !process.env.FIREBASE_CLIENT_EMAIL || !privateKey) return null;
  admin.initializeApp({ credential: admin.credential.cert({ projectId: process.env.FIREBASE_PROJECT_ID, clientEmail: process.env.FIREBASE_CLIENT_EMAIL, privateKey }) });
  return admin;
}

function getFirebaseConfig() {
  return {
    apiKey: process.env.FIREBASE_WEB_API_KEY || '',
    authDomain: process.env.FIREBASE_AUTH_DOMAIN || '',
    projectId: process.env.FIREBASE_PROJECT_ID || '',
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET || '',
    messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || '',
    appId: process.env.FIREBASE_APP_ID || ''
  };
}

async function requireFirebaseAuth(req, res, next) {
  const firebase = getFirebaseAdmin();
  if (!firebase) return res.status(503).json({ error: 'Firebase server configuration is incomplete.' });
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) return res.status(401).json({ error: 'Login required.' });
  try {
    req.user = await firebase.auth().verifyIdToken(header.slice(7));
    next();
  } catch { res.status(401).json({ error: 'Session expired. Login again.' }); }
}

module.exports = { admin, getFirebaseAdmin, getFirebaseConfig, requireFirebaseAuth };
