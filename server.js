const express = require('express');
const fs = require('fs');
const path = require('path');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const app = express();
const port = Number(process.env.PORT || 3000);
const model = process.env.GEMINI_MODEL || 'gemini-2.0-flash';
const apiKey = process.env.GEMINI_API_KEY;
const maxHistory = 12;

app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'] }));
app.use('/api/', rateLimit({ windowMs: 60 * 1000, limit: 20, standardHeaders: 'draft-7', legacyHeaders: false, message: { error: 'Thoda ruk kar phir try karo.' } }));

function loadTrainingExamples() {
  const file = path.join(__dirname, 'train.example.jsonl');
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, 'utf8').split('\n').map(line => line.trim()).filter(Boolean).flatMap(line => {
    try { return [JSON.parse(line)]; } catch { return []; }
  });
}

function trainingContext() {
  return loadTrainingExamples().map(item => {
    const messages = (item.messages || []).map(m => `${m.role}: ${m.content}`).join('\n');
    return messages ? `Example conversation:\n${messages}` : '';
  }).filter(Boolean).join('\n\n');
}

function cleanHistory(history) {
  if (!Array.isArray(history)) return [];
  return history.filter(item => ['user', 'model'].includes(item?.role) && typeof item?.text === 'string')
    .slice(-maxHistory).map(item => ({ role: item.role, parts: [{ text: item.text.slice(0, 10000) }] }));
}

app.get('/api/health', (_req, res) => res.json({ ok: true, service: 'Aisamad' }));

app.post('/api/chat', async (req, res) => {
  if (!apiKey) return res.status(500).json({ error: 'Server configuration incomplete. GEMINI_API_KEY add karo.' });
  const message = typeof req.body?.message === 'string' ? req.body.message.trim() : '';
  if (!message) return res.status(400).json({ error: 'message is required' });
  if (message.length > 10000) return res.status(413).json({ error: 'Message bahut lamba hai.' });

  const context = trainingContext();
  const systemPrompt = `You are Aisamad, a kind, honest, Hindi-friendly AI assistant. Reply in the user's language (Hindi, Hinglish, or English). Do not claim to be human. Do not assume what the user feels; ask gentle clarifying questions when needed.${context ? `\nUse these examples only as style guidance, not as facts:\n${context}` : ''}`;
  const contents = [{ role: 'user', parts: [{ text: systemPrompt }] }, ...cleanHistory(req.body?.history), { role: 'user', parts: [{ text: message }] }];

  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-goog-api-key': apiKey },
      body: JSON.stringify({ contents })
    });
    const data = await response.json();
    if (!response.ok) {
      console.error('Gemini error:', data.error?.message || data);
      return res.status(response.status).json({ error: 'Gemini request failed. Model ya API settings check karo.' });
    }
    const text = data.candidates?.[0]?.content?.parts?.map(part => part.text || '').join('') || 'Mujhe jawab nahi mila.';
    res.json({ reply: text });
  } catch (error) {
    console.error('Request error:', error.message);
    res.status(502).json({ error: 'Gemini se connection nahi ho saka.' });
  }
});

app.listen(port, () => console.log(`Aisamad is running at http://localhost:${port}`));
