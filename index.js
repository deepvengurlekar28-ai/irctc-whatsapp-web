import express from 'express';
import pkg from 'whatsapp-web.js';
import qrcode from 'qrcode';
import cors from 'cors';

const { Client, LocalAuth } = pkg;

const app = express();

/* ===============================
   ENV CHECK
=================================*/

const ALLOWED_USER = process.env.ALLOWED_USER || null;

if (!ALLOWED_USER) {
  console.log("⚠ ALLOWED_USER missing but server continuing...");
   
}

/* ===============================
   CORS
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
        '--single-process'
      ]
    }
  });

  clientInstance = client;

  client.on('qr', async (qr) => {
    console.log("QR RECEIVED");
    qrCode = await qrcode.toDataURL(qr);
    isReady = false;
  });

  client.on('ready', () => {
    console.log("WhatsApp Ready ✅");
    isReady = true;
    qrCode = null;
  });

  client.on('authenticated', () => {
    console.log("Authenticated");
  });

  client.on('disconnected', async (reason) => {
    console.log("Disconnected:", reason);
    try { await client.destroy(); } catch {}
    clientInstance = null;
    isReady = false;
  });

  client.on('auth_failure', async () => {
    console.log("Auth failure");
    try { await client.destroy(); } catch {}
    clientInstance = null;
    isReady = false;
  });

  client.on('error', async (err) => {
    console.log("Client error:", err);
    try { await client.destroy(); } catch {}
    clientInstance = null;
    isReady = false;
  });

  client.initialize();
}

/* ===============================
   STATUS
=================================*/

app.get('/status/:userId', (req, res) => {

  const { userId } = req.params;

  console.log("Incoming UID:", userId);
  console.log("Allowed UID:", ALLOWED_USER);

  if (userId !== ALLOWED_USER)
    return res.json({ status: "unauthorized" });

  if (!clientInstance)
    return res.json({ status: "not_initialized" });

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
    return res.send("WhatsApp already connected ✅");

  if (qrCode) {
    return res.send(`
      <html>
        <body style="margin:0;display:flex;justify-content:center;align-items:center;background:white;">
          <img src="${qrCode}" width="380" height="380"/>
        </body>
      </html>
    `);
  }

  res.send("Generating QR...");
});

/* ===============================
   SEND
=================================*/

app.post('/send/:userId', async (req, res) => {

  try {
    const { userId } = req.params;
    let { number, message } = req.body;

    if (userId !== ALLOWED_USER)
      return res.status(403).send("Unauthorized");

    if (!clientInstance || !isReady)
      return res.status(400).send("WhatsApp not ready");

    number = number.replace(/\D/g, '');

    const numberId = await clientInstance.getNumberId(number);

    if (!numberId)
      return res.status(400).send("Number not on WhatsApp");

    await new Promise(r => setTimeout(r, 1500));

    await clientInstance.sendMessage(numberId._serialized, message);

    await new Promise(r => setTimeout(r, 2000));

    res.send("Message sent ✅");

  } catch (err) {
    console.log("SEND ERROR:", err);
    res.status(500).send("Send failed");
  }
});

/* ===============================
   LOGOUT
=================================*/

app.get("/logout/:uid", async (req, res) => {

const uid = req.params.uid;

try {

const client = clients[uid];

if (!client) {
return res.json({ status: "no_client" });
}

await client.logout();
await client.destroy();

delete clients[uid];

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
