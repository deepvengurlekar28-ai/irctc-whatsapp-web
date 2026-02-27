import express from 'express';
import pkg from 'whatsapp-web.js';

const { Client, LocalAuth } = pkg;

const app = express();
app.use(express.json());

const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: {
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  }
});

client.initialize();

client.on('qr', (qr) => {
  console.log('QR RECEIVED:', qr);
});

client.on('ready', () => {
  console.log('WhatsApp Client is Ready!');
});

app.get('/', (req, res) => {
  res.send('WhatsApp Automation Server Running ✅');
});

app.post('/send', async (req, res) => {
  const { number, message } = req.body;

  if (!number || !message) {
    return res.status(400).send('Number and message required');
  }

  try {
    await client.sendMessage(`${number}@c.us`, message);
    res.send('Message Sent ✅');
  } catch (error) {
    res.status(500).send('Error sending message');
  }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
