import express from 'express';
import pkg from 'whatsapp-web.js';
import qrcode from 'qrcode';
import cors from 'cors';

const { Client, LocalAuth } = pkg;

const app = express();
app.use(cors());
app.use(express.json());

const clients = {};

/* ===============================
   CREATE CLIENT PER USER (UID)
=================================*/
function createClient(userId) {

  if (clients[userId]) return;

  console.log(`Creating client for user: ${userId}`);

  const client = new Client({
    authStrategy: new LocalAuth({
      clientId: userId
    }),
    puppeteer: {
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--no-zygote',
        '--single-process'
      ],
      protocolTimeout: 120000
    }
  });

  clients[userId] = {
    client,
    qr: '',
    ready: false
  };

  client.on('qr', async (qr) => {
    console.log(`QR RECEIVED for ${userId}`);
    clients[userId].qr = await qrcode.toDataURL(qr);
  });

  client.on('ready', () => {
    console.log(`User ${userId} WhatsApp Ready`);
    clients[userId].ready = true;
  });

  client.on('disconnected', () => {
    console.log(`User ${userId} disconnected`);
    clients[userId].ready = false;
    delete clients[userId];
  });

  client.on('auth_failure', (msg) => {
    console.log(`Auth failure for ${userId}:`, msg);
    clients[userId].ready = false;
  });

  client.initialize();
}

client.on('disconnected', async () => {
    console.log(`User ${userId} disconnected`);

    try {
        await client.destroy();
    } catch (e) {}

    delete clients[userId];
});


/* ===============================
   STATUS CHECK
=================================*/
app.get('/status/:userId', (req, res) => {

  const { userId } = req.params;

  if (!clients[userId]) {
    return res.json({ status: "not_initialized" });
  }

  if (clients[userId].ready) {
    return res.json({ status: "ready" });
  }

  res.json({ status: "not_ready" });
});


/* ===============================
   GET QR
=================================*/
app.get('/qr/:userId', async (req, res) => {

  const { userId } = req.params;

  if (!clients[userId]) {
    createClient(userId);
    return res.send("Generating QR... Refresh in 5 seconds.");
  }

  if (clients[userId].ready) {
    return res.send("WhatsApp already connected ✅");
  }

  if (clients[userId].qr) {
    return res.send(`<img src="${clients[userId].qr}" width="300"/>`);
  }

  res.send("QR not ready yet. Refresh.");
});


/* ===============================
   SEND MESSAGE
=================================*/
app.post('/send/:userId', async (req, res) => {

  const { userId } = req.params;
  const { number, message } = req.body;

  if (!number || !message) {
    return res.status(400).send("Number and message required");
  }

  if (!clients[userId]) {
    return res.status(400).send("Client not initialized");
  }

  if (!clients[userId].ready) {
    return res.status(400).send("WhatsApp not ready");
  }

  try {
    await clients[userId].client.sendMessage(`${number}@c.us`, message);
    res.send("Message Sent ✅");
  } catch (error) {
    console.error("Send Error:", error);
    res.status(500).send("Error sending message");
  }
});


/* ===============================
   LOGOUT
=================================*/
app.post('/logout/:userId', async (req, res) => {

  const { userId } = req.params;

  if (!clients[userId]) {
    return res.json({ success: false });
  }

  try {
    await clients[userId].client.logout();
    await clients[userId].client.destroy();

    delete clients[userId];

    res.json({ success: true });

  } catch (error) {
    console.error("Logout error:", error);
    res.status(500).json({ success: false });
  }
});


/* ===============================
   HEALTH CHECK
=================================*/
app.get('/', (req, res) => {
  res.send("WhatsApp User-Based Server Running 🚀");
});


const PORT = process.env.PORT || 8080;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
