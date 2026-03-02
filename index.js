import express from 'express';
import pkg from 'whatsapp-web.js';
import qrcode from 'qrcode';
import cors from 'cors';

const { Client, LocalAuth } = pkg;

const app = express();

/* ===============================
   CORS CONFIGURATION (FIXED)
=================================*/
const allowedOrigins = [
  "https://irctc-tracker.web.app",
  "http://localhost:3000"
];

app.use(cors({
  origin: true,
  credentials: true
}));

app.use(express.json());

const clients = {};
app.get("/", (req, res) => {
  res.send("Server running ✅");
});

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

   client.on('change_state', state => {
    console.log(`State changed for ${userId}:`, state);

    if (state === "CONFLICT" || state === "UNPAIRED" || state === "UNPAIRED_IDLE") {
        client.destroy();
        delete clients[userId];
    }
});

  /* DISCONNECTED EVENT */
  client.on('disconnected', async (reason) => {
    console.log(`User ${userId} disconnected:`, reason);

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

    } catch (e) {
        delete clients[userId];
        return res.json({ status: "not_initialized" });
    }
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

 const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
