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
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH,
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--no-zygote',
      '--single-process'
    ]
  }
});

  clients[userId] = {
    client,
    qr: '',
    ready: false
  };

  /* QR EVENT */
  client.on('qr', async (qr) => {
    console.log(`QR RECEIVED for ${userId}`);
    clients[userId].qr = await qrcode.toDataURL(qr);
  });

  /* READY EVENT */
  client.on('ready', () => {
    console.log(`User ${userId} WhatsApp Ready`);
    clients[userId].ready = true;
  });

  /* DISCONNECTED EVENT */
  client.on('disconnected', async () => {

    console.log(`User ${userId} disconnected`);

    try {
        await client.destroy();
    } catch (e) {}

    delete clients[userId];
});

  /* AUTH FAILURE */
  client.on('auth_failure', (msg) => {
    console.log(`Auth failure for ${userId}:`, msg);
    delete clients[userId];
  });

  client.initialize();
}

/* ===============================
   STATUS CHECK
=================================*/
app.get('/status/:userId', (req, res) => {

  const { userId } = req.params;

  if (!clients[userId]) {
    return res.json({ status: "not_initialized" });
  }

  if (!clients[userId].client) {
    delete clients[userId];
    return res.json({ status: "not_initialized" });
  }

  if (clients[userId].ready === true) {
    return res.json({ status: "ready" });
  }

  return res.json({ status: "not_ready" });
});

/* ===============================
   GET QR
=================================*/
app.get('/qr/:userId', async (req, res) => {

  const { userId } = req.params;

  if (!clients[userId]) {
    createClient(userId);
    return res.send("Generating QR... Refreshing...");
  }

  if (clients[userId].ready === true) {
    return res.send("WhatsApp already connected ✅");
  }

  if (clients[userId].qr) {
    return res.send(`<img src="${clients[userId].qr}" width="300"/>`);
  }

  res.send("QR not ready yet...");
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

  const userClient = clients[userId];

  if (!userClient) {
    return res.json({ success: true });
  }

  try {

    // Try logout (ignore failure)
    try {
      await userClient.client.logout();
    } catch (e) {
      console.log("Logout error ignored");
    }

    // Always destroy
    try {
      await userClient.client.destroy();
    } catch (e) {
      console.log("Destroy error ignored");
    }

  } catch (e) {
    console.log("General logout error");
  }

  // Always delete from memory
  delete clients[userId];

  console.log(`User ${userId} fully logged out`);

  return res.json({ success: true });
});
