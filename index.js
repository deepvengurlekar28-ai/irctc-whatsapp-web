import express from 'express';
import pkg from 'whatsapp-web.js';
import qrcode from 'qrcode';

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

let qrCodeData = '';

client.on('qr', async (qr) => {
  console.log('QR RECEIVED');
  qrCodeData = await qrcode.toDataURL(qr);
});

client.on('ready', () => {
  console.log('WhatsApp Client is Ready!');
});

app.get('/qr', (req, res) => {
  if (qrCodeData) {
    res.send(`<img src="${qrCodeData}" />`);
  } else {
    res.send('QR not generated yet');
  }
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
