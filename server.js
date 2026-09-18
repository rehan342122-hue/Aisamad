const express = require('express');
const path = require('path');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const { getFirebaseAdmin, getFirebaseConfig, requireFirebaseAuth } = require('./firebase-admin');
require('dotenv').config();

const app = express();
const port = Number(process.env.PORT || 3000);
const geminiApiKey = process.env.GEMINI_API_KEY;
const defaultModel = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const maxHistory = 18;
const maxImageBytes = 6 * 1024 * 1024;
const allowedImageTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

app.disable('x-powered-by');
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'] }));
app.use('/api/', rateLimit({ windowMs: 60 * 1000, limit: 30, standardHeaders: 'draft-7', legacyHeaders: false, message: { error: 'Thoda ruk kar phir try karo.' } }));

function db() { const firebase = getFirebaseAdmin(); return firebase ? firebase.firestore() : null; }
function normalizeHistory(items) {
  if (!Array.isArray(items)) return [];
  return items.filter(x => x && typeof x.text === 'string' && x.text.trim()).slice(-maxHistory).map(x => ({ role: x.role === 'user' ? 'user' : 'model', parts: [{ text: x.text.slice(0, 10000) }] }));
}
function systemPrompt(mode, language) {
  return `You are Aisamad, a helpful, honest, premium Hindi-friendly AI assistant. Mode: ${mode || 'general'}. Preferred language: ${language || 'auto'}. Reply naturally in the user's language, with clear structure and useful detail. If an image is provided, carefully describe or analyse only what is visible. Never claim to be human.`;
}
function imagePart(image) {
  if (!image) return null;
  if (typeof image.data !== 'string' || !allowedImageTypes.has(image.mimeType)) throw new Error('Unsupported image type. Use JPG, PNG, WEBP or GIF.');
  const raw = image.data.replace(/^data:[^;]+;base64,/, '');
  if (!raw || Buffer.byteLength(raw, 'base64') > maxImageBytes) throw new Error('Image must be smaller than 6 MB.');
  return { inlineData: { mimeType: image.mimeType, data: raw } };
}

app.get('/api/config', (_req, res) => res.json({ firebase: getFirebaseConfig() }));
app.get('/api/health', (_req, res) => res.json({ ok: true, service: 'Aisamad', model: defaultModel, firebaseReady: !!getFirebaseAdmin(), geminiReady: !!geminiApiKey }));
app.get('/api/conversations', requireFirebaseAuth, async (req, res) => { try { const snap = await db().collection('conversations').where('userId', '==', req.user.uid).orderBy('updatedAt', 'desc').limit(50).get(); res.json({ conversations: snap.docs.map(doc => ({ id: doc.id, ...doc.data() })) }); } catch { res.status(500).json({ error: 'Could not load conversations.' }); } });
app.post('/api/conversations', requireFirebaseAuth, async (req, res) => { try { const now = new Date().toISOString(); const title = String(req.body?.title || 'New chat').slice(0, 100); const ref = await db().collection('conversations').add({ userId: req.user.uid, title, messages: [], createdAt: now, updatedAt: now }); res.status(201).json({ conversation: { id: ref.id, userId: req.user.uid, title, messages: [], createdAt: now, updatedAt: now } }); } catch { res.status(500).json({ error: 'Could not create conversation.' }); } });
app.get('/api/conversations/:id', requireFirebaseAuth, async (req, res) => { try { const snap = await db().collection('conversations').doc(req.params.id).get(); if (!snap.exists || snap.data().userId !== req.user.uid) return res.status(404).json({ error: 'Conversation not found.' }); res.json({ conversation: { id: snap.id, ...snap.data() } }); } catch { res.status(500).json({ error: 'Could not load conversation.' }); } });
app.put('/api/conversations/:id', requireFirebaseAuth, async (req, res) => { try { const ref = db().collection('conversations').doc(req.params.id); const snap = await ref.get(); if (!snap.exists || snap.data().userId !== req.user.uid) return res.status(404).json({ error: 'Conversation not found.' }); await ref.update({ title: String(req.body?.title || 'New chat').slice(0, 100), messages: Array.isArray(req.body?.messages) ? req.body.messages.slice(-100) : [], updatedAt: new Date().toISOString() }); res.json({ ok: true }); } catch { res.status(500).json({ error: 'Could not save conversation.' }); } });
app.delete('/api/conversations/:id', requireFirebaseAuth, async (req, res) => { try { const ref = db().collection('conversations').doc(req.params.id); const snap = await ref.get(); if (snap.exists && snap.data().userId === req.user.uid) await ref.delete(); res.json({ ok: true }); } catch { res.status(500).json({ error: 'Could not delete conversation.' }); } });

app.post('/api/chat', async (req, res) => {
  if (!geminiApiKey) return res.status(500).json({ error: 'GEMINI_API_KEY Render variable missing.' });
  const message = typeof req.body?.message === 'string' ? req.body.message.trim() : '';
  if (!message) return res.status(400).json({ error: 'message is required' });
  if (message.length > 10000) return res.status(413).json({ error: 'Message bahut lamba hai.' });
  try {
    const parts = [{ text: message }];
    const image = imagePart(req.body?.image);
    if (image) parts.push(image);
    const contents = [...normalizeHistory(req.body?.history), { role: 'user', parts }];
    const model = String(req.body?.model || defaultModel);
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-goog-api-key': geminiApiKey }, body: JSON.stringify({ systemInstruction: { parts: [{ text: systemPrompt(req.body?.mode, req.body?.language) }] }, contents }) });
    const data = await response.json();
    if (!response.ok) return res.status(response.status).json({ error: data?.error?.message || `Gemini HTTP ${response.status}` });
    const reply = data.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('').trim();
    if (!reply) return res.status(502).json({ error: 'AI ne empty response diya.' });
    res.json({ reply, model, imageSupported: true });
  } catch (error) { res.status(400).json({ error: error.message || 'AI request failed.' }); }
});

app.listen(port, () => console.log(`Aisamad running on port ${port}`));
