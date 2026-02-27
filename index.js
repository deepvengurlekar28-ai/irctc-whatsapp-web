import express from 'express';
import pkg from 'whatsapp-web.js';
import qrcode from 'qrcode';

const { Client, LocalAuth } = pkg;

const app = express();
app.use(express.json());

const clients = {};

function createClient(workerId) {
  const client = new Client({
    authStrategy: new LocalAuth({
      clientId: workerId
    }),
    puppeteer: {
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    }
  });

  clients[workerId] = {
    client,
    qr: ''
  };

  client.on('qr', async (qr) => {
    console.log(`QR RECEIVED for ${workerId}`);
    clients[workerId].qr = await qrcode.toDataURL(qr);
  });

  client.on('ready', () => {
    console.log(`Worker ${workerId} WhatsApp Ready`);
  });

  client.initialize();
}

app.get('/qr/:workerId', (req, res) => {
  const { workerId } = req.params;

  if (!clients[workerId]) {
    createClient(workerId);
    return res.send("Generating QR... Refresh in 5 seconds.");
  }

  if (clients[workerId].qr) {
    res.send(`<img src="${clients[workerId].qr}" />`);
  } else {
    res.send("QR not ready yet. Refresh.");
  }
});

app.post('/send/:workerId', async (req, res) => {
  const { workerId } = req.params;
  const { number, message } = req.body;

  if (!number || !message) {
    return res.status(400).send("Number and message required");
  }

  if (!clients[workerId]) {
    return res.status(400).send("Worker not initialized");
  }

  try {
    await clients[workerId].client.sendMessage(`${number}@c.us`, message);
    res.send("Message Sent ✅");
  } catch (error) {
    console.error(error);
    res.status(500).send("Error sending message");
  }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
