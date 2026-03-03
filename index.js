import express from 'express';
import pkg from 'whatsapp-web.js';
import qrcode from 'qrcode';
import cors from 'cors';

const { Client, LocalAuth } = pkg;

const app = express();

app.use(cors({ origin: true, credentials: true }));
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
      clientId: userId,
      dataPath: '/app/.wwebjs_auth'
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
  ]
}
  });

  clients[userId] = {
    client,
    qr: null,
    ready: false
  };

   client.on('change_state', state => {
  console.log('State changed:', state);
});

  client.on('qr', async (qr) => {
    console.log(`QR RECEIVED for ${userId}`);
    clients[userId].qr = await qrcode.toDataURL(qr);
    clients[userId].ready = false;
  });

   client.on('authenticated', () => {
  console.log("Authenticated successfully");
});

   client.on('loading_screen', (percent, message) => {
  console.log('Loading:', percent, message);
});

  client.on('ready', () => {
    console.log(`User ${userId} WhatsApp Ready`);
    clients[userId].ready = true;
    clients[userId].qr = null;
  });

  client.on('disconnected', async (reason) => {
    console.log(`User ${userId} disconnected:`, reason);
    try { await client.destroy(); } catch {}
    delete clients[userId];
  });

  client.on('auth_failure', async (msg) => {
    console.log(`Auth failure for ${userId}:`, msg);
    try { await client.destroy(); } catch {}
    delete clients[userId];
  });

  client.on('error', async (err) => {
  console.log("Client error:", err);

  try { await client.destroy(); } catch {}

  delete clients[userId];

  setTimeout(() => {
    createClient(userId);
  }, 3000);
});

  client.initialize();
}

/* ===============================
   STATUS
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
    return res.send(`
      <html>
        <body style="margin:0;display:flex;justify-content:center;align-items:center;background:white;">
          <img src="${clients[userId].qr}" width="380" height="380"/>
        </body>
      </html>
    `);
  }

  res.send("Generating QR...");
});

/* ===============================
   SEND MESSAGE
=================================*/
app.post('/send/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    let { number, message } = req.body;

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

    // ✅ Normalize number
    number = number.replace(/\D/g, '');

    const chatId = `${number}@c.us`;

    // ✅ Step 1: Check if registered
    const isRegistered = await userClient.client.isRegisteredUser(chatId);

    if (!isRegistered) {
      return res.status(400).send("Number not registered on WhatsApp");
    }

    // ✅ Step 2: Get chat first (forces LID resolution)
    await userClient.client.getChatById(chatId).catch(() => null);

    // ✅ Step 3: Send message
    await userClient.client.sendMessage(chatId, message);

    res.send("Message sent ✅");

  } catch (err) {
    console.error("SEND ERROR:", err);
    res.status(500).send("Send failed");
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
   KEEP SERVER ALIVE
=================================*/
setInterval(() => {
  console.log("Server heartbeat...");
}, 30000);

/* ===============================
   START SERVER
=================================*/
const PORT = process.env.PORT || 8080;

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});
