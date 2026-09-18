const express = require('express');
const fs = require('fs');
const path = require('path');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const { getFirebaseAdmin, getFirebaseConfig, requireFirebaseAuth } = require('./firebase-admin');
require('dotenv').config();

const app = express();
const port = Number(process.env.PORT || 3000);
const defaultModel = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const geminiApiKey = process.env.GEMINI_API_KEY;
const maxHistory = 18;

app.disable('x-powered-by');
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'] }));
app.use('/api/', rateLimit({ windowMs: 60 * 1000, limit: 30, standardHeaders: 'draft-7', legacyHeaders: false, message: { error: 'Thoda ruk kar phir try karo.' } }));

function normalizeHistory(history) {
  if (!Array.isArray(history)) return [];
  return history.filter(item => item && typeof item.text === 'string' && item.text.trim()).slice(-maxHistory).map(item => ({
    role: item.role === 'user' ? 'user' : 'model',
    parts: [{ text: item.text.slice(0, 10000) }]
  }));
}

function systemPrompt(mode = 'general', language = 'auto') {
  const roles = {
    general: 'a helpful, honest, warm Hindi-friendly AI assistant',
    study: 'a patient study coach who explains step by step',
    code: 'a professional coding assistant who gives practical, correct code',
    support: 'a calm and empathetic support mentor'
  };
  return `You are Aisamad, ${roles[mode] || roles.general}. Preferred language: ${language}. Reply naturally like a modern AI assistant. Keep answers clear and useful. Never claim to be human.`;
}

function database() {
  const firebase = getFirebaseAdmin();
  return firebase ? firebase.firestore() : null;
}

app.get('/api/config', (_req, res) => res.json({ firebase: getFirebaseConfig() }));
app.get('/api/health', (_req, res) => res.json({ ok: true, service: 'Aisamad', model: defaultModel, firebaseReady: !!getFirebaseAdmin(), geminiReady: !!geminiApiKey }));

app.get('/api/conversations', requireFirebaseAuth, async (req, res) => {
  try {
    const snap = await database().collection('conversations').where('userId', '==', req.user.uid).orderBy('updatedAt', 'desc').limit(50).get();
    res.json({ conversations: snap.docs.map(doc => ({ id: doc.id, ...doc.data() })) });
  } catch (error) { res.status(500).json({ error: 'Could not load conversations.' }); }
});

app.post('/api/conversations', requireFirebaseAuth, async (req, res) => {
  try {
    const now = new Date().toISOString();
    const title = String(req.body?.title || 'New chat').slice(0, 100);
    const ref = await database().collection('conversations').add({ userId: req.user.uid, title, messages: [], createdAt: now, updatedAt: now });
    res.status(201).json({ conversation: { id: ref.id, userId: req.user.uid, title, messages: [], createdAt: now, updatedAt: now } });
  } catch (error) { res.status(500).json({ error: 'Could not create conversation.' }); }
});

app.get('/api/conversations/:id', requireFirebaseAuth, async (req, res) => {
  try {
    const snap = await database().collection('conversations').doc(req.params.id).get();
    if (!snap.exists || snap.data().userId !== req.user.uid) return res.status(404).json({ error: 'Conversation not found.' });
    res.json({ conversation: { id: snap.id, ...snap.data() } });
  } catch (error) { res.status(500).json({ error: 'Could not load conversation.' }); }
});

app.put('/api/conversations/:id', requireFirebaseAuth, async (req, res) => {
  try {
    const ref = database().collection('conversations').doc(req.params.id);
    const snap = await ref.get();
    if (!snap.exists || snap.data().userId !== req.user.uid) return res.status(404).json({ error: 'Conversation not found.' });
    await ref.update({ title: String(req.body?.title || 'New chat').slice(0, 100), messages: Array.isArray(req.body?.messages) ? req.body.messages.slice(-100) : [], updatedAt: new Date().toISOString() });
    res.json({ ok: true });
  } catch (error) { res.status(500).json({ error: 'Could not save conversation.' }); }
});

app.delete('/api/conversations/:id', requireFirebaseAuth, async (req, res) => {
  try {
    const ref = database().collection('conversations').doc(req.params.id);
    const snap = await ref.get();
    if (snap.exists && snap.data().userId === req.user.uid) await ref.delete();
    res.json({ ok: true });
  } catch (error) { res.status(500).json({ error: 'Could not delete conversation.' }); }
});

app.post('/api/chat', async (req, res) => {
  if (!geminiApiKey) return res.status(500).json({ error: 'GEMINI_API_KEY Render environment variable missing.' });
  const message = typeof req.body?.message === 'string' ? req.body.message.trim() : '';
  if (!message) return res.status(400).json({ error: 'message is required' });
  if (message.length > 10000) return res.status(413).json({ error: 'Message bahut lamba hai.' });

  const requestedModel = String(req.body?.model || defaultModel);
  const contents = [
    { role: 'user', parts: [{ text: systemPrompt(String(req.body?.mode || 'general'), String(req.body?.language || 'auto')) }] },
    ...normalizeHistory(req.body?.history),
    { role: 'user', parts: [{ text: message }] }
  ];

  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(requestedModel)}:generateContent`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-goog-api-key': geminiApiKey }, body: JSON.stringify({ contents })
    });
    const data = await response.json();
    if (!response.ok) {
      const detail = data?.error?.message || `Gemini returned HTTP ${response.status}`;
      return res.status(response.status).json({ error: detail });
    }
    const reply = data.candidates?.[0]?.content?.parts?.map(part => part.text || '').join('').trim();
    if (!reply) return res.status(502).json({ error: 'Gemini ne empty response diya.' });
    res.json({ reply, model: requestedModel });
  } catch (error) {
    res.status(502).json({ error: `AI connection error: ${error.message}` });
  }
});

app.listen(port, () => console.log(`Aisamad running on port ${port}`));
