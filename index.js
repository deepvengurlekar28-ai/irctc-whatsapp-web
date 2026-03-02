import express from 'express';
import pkg from 'whatsapp-web.js';
import qrcode from 'qrcode';
import cors from 'cors';

const { Client, LocalAuth } = pkg;

const app = express();

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
      // If using Railway volume:
      // dataPath: '/app/.wwebjs_auth'
    }),
    puppeteer: {
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu'
      ]
    }
  });

  clients[userId] = {
    client,
    qr: null,
    ready: false
  };

  /* QR EVENT */
  client.on('qr', async (qr) => {
    console.log(`QR RECEIVED for ${userId}`);
    clients[userId].qr = await qrcode.toDataURL(qr);
    clients[userId].ready = false;
  });

  /* READY EVENT */
  client.on('ready', () => {
    console.log(`User ${userId} WhatsApp Ready`);
    clients[userId].ready = true;
    clients[userId].qr = null;
  });

  /* DISCONNECTED EVENT */
  client.on('disconnected', async (reason) => {
    console.log(`User ${userId} disconnected:`, reason);

    try { await client.destroy(); } catch {}

    delete clients[userId];

    // AUTO recreate client (important)
    setTimeout(() => {
      createClient(userId);
    }, 2000);
  });

  /* AUTH FAILURE */
  client.on('auth_failure', async () => {
    console.log(`Auth failure for ${userId}`);

    try { await client.destroy(); } catch {}

    delete clients[userId];

    setTimeout(() => {
      createClient(userId);
    }, 2000);
  });

  client.initialize();
}

/* ===============================
   STATUS (SIMPLE + SAFE)
=================================*/
app.get('/status/:userId', (req, res) => {

  const { userId } = req.params;
  const userClient = clients[userId];

  if (!userClient) {
    return res.json({ status: "not_initialized" });
  }

  if (userClient.ready) {
    return res.json({ status: "ready" });
  }

  if (userClient.qr) {
    return res.json({ status: "qr_ready" });
  }

  return res.json({ status: "initializing" });
});

/* ===============================
   QR
=================================*/
app.get('/qr/:userId', (req, res) => {

  const { userId } = req.params;

  if (!clients[userId]) {
    createClient(userId);
    return res.send("Generating QR...");
  }

  if (clients[userId].ready) {
    return res.send("WhatsApp already connected ✅");
  }

  if (clients[userId].qr) {
    return res.send(`<img src="${clients[userId].qr}" width="350"/>`);
  }

  res.send("Generating QR...");
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
const PORT = process.env.PORT || 8080;

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});
