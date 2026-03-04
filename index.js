import express from 'express';
import pkg from 'whatsapp-web.js';
import qrcode from 'qrcode';
import cors from 'cors';

const { Client, LocalAuth } = pkg;

const app = express();

/* ===============================
   ENV
=================================*/

const ALLOWED_USER = process.env.ALLOWED_USER || null;

if (!ALLOWED_USER) {
  console.log("⚠ ALLOWED_USER missing but server continuing...");
}

/* ===============================
   MIDDLEWARE
=================================*/

app.use(cors({
  origin: "*",
  methods: ["GET", "POST"],
  allowedHeaders: ["Content-Type"]
}));

app.use(express.json());

let clientInstance = null;
let qrCode = null;
let isReady = false;
let cachedGroups = [];

/* ===============================
   HEALTH
=================================*/

app.get("/", (req, res) => {
  res.send("Server running ✅");
});

/* ===============================
   CREATE CLIENT
=================================*/

async function createClient(userId) {

  if (userId !== ALLOWED_USER) {
    console.log("🚫 Unauthorized user:", userId);
    return;
  }

  if (clientInstance) return;

  console.log("Creating WhatsApp client for:", userId);

  const client = new Client({
    authStrategy: new LocalAuth({
      clientId: userId,
      dataPath: './.wwebjs_auth'
    }),
    puppeteer: {
      headless: true,
      protocolTimeout: 180000,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--no-zygote',
        '--single-process',
        '--disable-extensions',
        '--disable-background-networking',
        '--disable-sync'
      ]
    }
  });

  clientInstance = client;

  client.on('qr', async (qr) => {
    console.log("QR RECEIVED");
    qrCode = await qrcode.toDataURL(qr);
    isReady = false;
  });

  client.on('ready', async () => {

  console.log("WhatsApp Ready ✅");

  isReady = true;
  qrCode = null;

  try{

    const chats = await client.getChats();

    cachedGroups = chats
      .filter(chat => chat.isGroup)
      .map(g => ({
        name: g.name,
        id: g.id._serialized
      }));

    console.log("Cached groups:", cachedGroups.length);

  }catch(err){

    console.log("Group preload error:",err);

  }

});

  client.on('authenticated', () => {
    console.log("Authenticated");
  });

  client.on('disconnected', async (reason) => {

    console.log("Disconnected:", reason);

    try { await client.destroy(); } catch {}

    clientInstance = null;
    isReady = false;
    qrCode = null;
    cachedGroups = [];

    console.log("Restarting client...");

    setTimeout(() => {
      createClient(ALLOWED_USER);
    }, 2000);

  });

  client.on('auth_failure', async () => {

    console.log("Auth failure");

    try { await client.destroy(); } catch {}

    clientInstance = null;
    isReady = false;
    qrCode = null;
    cachedGroups = [];

  });

  client.on('error', async (err) => {

    console.log("Client error:", err);

    try { await client.destroy(); } catch {}

    clientInstance = null;
    isReady = false;
    qrCode = null;
    cachedGroups = [];

  });

  client.initialize();
}

/* ===============================
   GROUPS
=================================*/

app.get("/groups/:userId", async (req, res) => {

  const { userId } = req.params;

  if (userId !== ALLOWED_USER)
    return res.status(403).send("Unauthorized");

  if (!clientInstance || !isReady)
    return res.json([]);

  try {

    // if cached groups exist return them
    if(cachedGroups.length){
      return res.json(cachedGroups);
    }

    const chats = await clientInstance.getChats();

    cachedGroups = chats
      .filter(chat => chat.isGroup)
      .map(g => ({
        name: g.name,
        id: g.id._serialized
      }));

    console.log("Groups loaded:", cachedGroups.length);

    res.json(cachedGroups);

  } catch (err) {

    console.log("Group fetch error:", err);

    // return cached groups instead of crashing
    res.json(cachedGroups || []);

  }

});

/* ===============================
   STATUS
=================================*/

app.get('/status/:userId', (req, res) => {

  const { userId } = req.params;

  if (userId !== ALLOWED_USER)
    return res.json({ status: "unauthorized" });

  if (!clientInstance) {

    createClient(userId);

    return res.json({
      status: "initializing"
    });

  }

  if (isReady)
    return res.json({ status: "ready" });

  if (qrCode)
    return res.json({ status: "qr_ready" });

  return res.json({ status: "initializing" });

});

/* ===============================
   QR
=================================*/

app.get('/qr/:userId', (req, res) => {

  const { userId } = req.params;

  if (userId !== ALLOWED_USER)
    return res.send("Unauthorized");

  if (!clientInstance) {
    createClient(userId);
    return res.send("Generating QR...");
  }

  if (isReady)
    return res.send("WhatsApp already connected");

  if (qrCode) {

    return res.send(`
      <html>
        <body style="margin:0;display:flex;justify-content:center;align-items:center;height:100vh;background:white;">
          <img src="${qrCode}" width="380"/>
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
    let { number, message, isGroup } = req.body;

    if (userId !== ALLOWED_USER)
      return res.status(403).send("Unauthorized");

    if (!clientInstance || !isReady)
      return res.status(400).send("WhatsApp not ready");

    if (isGroup) {

      await clientInstance.sendMessage(number, message);

    } else {

      number = number.replace(/\D/g, '');

      const numberId = await clientInstance.getNumberId(number);

      if (!numberId)
        return res.status(400).send("Number not on WhatsApp");

      await clientInstance.sendMessage(numberId._serialized, message);

    }

    res.send("Message sent ✅");

  } catch (err) {

    console.log("SEND ERROR:", err);
    res.status(500).send("Send failed");

  }

});

/* ===============================
   LOGOUT
=================================*/

app.get("/logout/:userId", async (req, res) => {

  const { userId } = req.params;

  if (userId !== ALLOWED_USER)
    return res.status(403).send("Unauthorized");

  try {

    if (!clientInstance)
      return res.json({ status: "no_client" });

    await clientInstance.logout();
    await clientInstance.destroy();

    clientInstance = null;
    isReady = false;
    qrCode = null;
    cachedGroups = [];

    console.log("WhatsApp logged out");

    setTimeout(() => {
      createClient(userId);
    }, 2000);

    res.json({ status: "logged_out" });

  } catch (err) {

    console.log("Logout error:", err);

    res.status(500).json({ status: "error" });

  }

});

/* ===============================
   KEEP ALIVE
=================================*/

setInterval(() => {
  console.log("Server heartbeat...");
}, 30000);

/* ===============================
   START
=================================*/

const PORT = process.env.PORT || 3000;

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});
