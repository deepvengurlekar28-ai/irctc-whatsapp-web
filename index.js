import express from 'express';
import pkg from 'whatsapp-web.js';
import qrcode from 'qrcode';
import cors from 'cors';

const { Client, LocalAuth } = pkg;

const app = express();

/* ===============================
   CORS (ALLOW ALL FOR NOW)
=================================*/
app.use(cors({
  origin: true,
  credentials: true
}));

app.use(express.json());

const clients = {};

/* ===============================
   HEALTH CHECK
=================================*/
app.get("/", (req, res) => {
  res.send("Server running ✅");
});

/* ===============================
   CREATE CLIENT
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
        '--disable-dev-shm-usage'
      ]
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

  client.on('disconnected', async (reason) => {
    console.log(`User ${userId} disconnected:`, reason);
    try { await client.destroy(); } catch {}
    delete clients[userId];
  });

  client.on('auth_failure', () => {
    console.log(`Auth failure for ${userId}`);
    delete clients[userId];
  });

  client.initialize();
}

/* ===============================
   STATUS
=================================*/
app.get('/status/:userId', async (req, res) => {

  const { userId } = req.params;
  const userClient = clients[userId];

  if (!userClient) {
    return res.json({ status: "not_initialized" });
  }

  try {
    const state = await userClient.client.getState();

    if (state !== "CONNECTED") {
      await userClient.client.destroy();
      delete clients[userId];
      return res.json({ status: "not_initialized" });
    }

    return res.json({ status: "ready" });

  } catch {
    delete clients[userId];
    return res.json({ status: "not_initialized" });
  }
});

/* ===============================
   QR
=================================*/
app.get('/qr/:userId', (req, res) => {

  const { userId } = req.params;

  if (!clients[userId]) {
    createClient(userId);
    return res.send("Generating QR... Refreshing...");
  }

  if (clients[userId].ready) {
    return res.send("WhatsApp already connected ✅");
  }

  if (clients[userId].qr) {
    return res.send(`<img src="${clients[userId].qr}" width="350"/>`);
  }

  res.send("QR not ready yet...");
});

/* ===============================
   SEND
=================================*/
app.post('/send/:userId', async (req, res) => {

  const { userId } = req.params;
  const { number, message } = req.body;

  if (!number || !message) {
    return res.status(400).send("Number and message required");
  }

  const userClient = clients[userId];

  if (!userClient) {
    return res.status(400).send("Client not initialized");
  }

  if (!userClient.ready) {
    return res.status(400).send("WhatsApp not ready");
  }

  try {
    await userClient.client.sendMessage(`${number}@c.us`, message);
    res.send("Message Sent ✅");
  } catch (error) {
    console.error(error);
    res.status(500).send("Error sending message");
  }
});

/* ===============================
   LOGOUT
=================================*/
app.post('/logout/:userId', async (req, res) => {

  const { userId } = req.params;
  const userClient = clients[userId];

  if (!userClient) {
    return res.json({ success: true });
  }

  try {
    await userClient.client.logout().catch(() => {});
    await userClient.client.destroy().catch(() => {});
  } catch {}

  delete clients[userId];

  res.json({ success: true });
});

/* ===============================
   START SERVER
=================================*/
const PORT = process.env.PORT;

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});
