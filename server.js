const express = require('express');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const app = express();
const port = Number(process.env.PORT || 3000);
const model = process.env.GEMINI_MODEL || 'gemini-2.0-flash';
const apiKey = process.env.GEMINI_API_KEY;

app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

function loadTrainingExamples() {
  const file = path.join(__dirname, 'train.example.jsonl');
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, 'utf8')
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .flatMap(line => {
      try { return [JSON.parse(line)]; } catch { return []; }
    });
}

function trainingContext() {
  return loadTrainingExamples().map(item => {
    const messages = (item.messages || []).map(m => `${m.role}: ${m.content}`).join('\n');
    return messages ? `Example conversation:\n${messages}` : '';
  }).filter(Boolean).join('\n\n');
}

app.post('/api/chat', async (req, res) => {
  if (!apiKey) {
    return res.status(500).json({ error: 'GEMINI_API_KEY is not configured on the server.' });
  }

  const message = typeof req.body?.message === 'string' ? req.body.message.trim() : '';
  if (!message) return res.status(400).json({ error: 'message is required' });
  if (message.length > 10000) return res.status(413).json({ error: 'message is too long' });

  const context = trainingContext();
  const prompt = `You are Aisamad, a kind, honest, Hindi-friendly AI assistant.\nDo not claim to be human. Do not assume what the user feels; ask gentle clarifying questions when needed.\n${context ? `Use these examples as style guidance, not as facts:\n${context}\n` : ''}\nUser message:\n${message}`;

  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-goog-api-key': apiKey
      },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
    });

    const data = await response.json();
    if (!response.ok) {
      console.error('Gemini error:', data);
      return res.status(response.status).json({ error: 'Gemini request failed', details: data.error?.message });
    }

    const text = data.candidates?.[0]?.content?.parts?.map(part => part.text || '').join('') || 'Mujhe jawab nahi mila.';
    res.json({ reply: text });
  } catch (error) {
    console.error('Request error:', error);
    res.status(500).json({ error: 'Unable to contact Gemini right now.' });
  }
});

app.listen(port, () => console.log(`Aisamad is running at http://localhost:${port}`));
