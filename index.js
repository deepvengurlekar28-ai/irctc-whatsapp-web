import express from 'express';
import pkg from 'whatsapp-web.js';
import qrcode from 'qrcode';

const { Client, LocalAuth } = pkg;

const app = express();
app.use(express.json());

const clients = {};

/* ===============================
   CREATE CLIENT PER WORKER
=================================*/
function createClient(workerId) {
  if (clients[workerId]) return;

  console.log(`Creating client for worker: ${workerId}`);

  const client = new Client({
    authStrategy: new LocalAuth({
      clientId: workerId
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

  clients[workerId] = {
    client,
    qr: '',
    ready: false
  };

  client.on('qr', async (qr) => {
    console.log(`QR RECEIVED for ${workerId}`);
    clients[workerId].qr = await qrcode.toDataURL(qr);
  });

  client.on('ready', () => {
    console.log(`Worker ${workerId} WhatsApp Ready`);
    clients[workerId].ready = true;
  });

  client.on('disconnected', () => {
    console.log(`Worker ${workerId} disconnected`);
    clients[workerId].ready = false;
  });

  client.on('auth_failure', (msg) => {
    console.log(`Auth failure for ${workerId}:`, msg);
    clients[workerId].ready = false;
  });

  client.initialize();
}

/* ===============================
   GET QR PER WORKER
=================================*/
app.get('/qr/:workerId', async (req, res) => {
  const { workerId } = req.params;

  if (!clients[workerId]) {
    createClient(workerId);
    return res.send("Generating QR... Refresh in 5 seconds.");
  }

  if (clients[workerId].ready) {
    return res.send("WhatsApp already connected ✅");
  }

  if (clients[workerId].qr) {
    return res.send(`<img src="${clients[workerId].qr}" />`);
  }

  res.send("QR not ready yet. Refresh.");
});

/* ===============================
   SEND MESSAGE PER WORKER
=================================*/
app.post('/send/:workerId', async (req, res) => {
  const { workerId } = req.params;
  const { number, message } = req.body;

  const worker = clients[workerId];

  if (!number || !message) {
    return res.status(400).send("Number and message required");
  }

  if (!worker) {
    return res.status(400).send("Worker not initialized");
  }

  if (!worker.ready) {
    return res.status(400).send("WhatsApp not ready");
  }

  try {
    await worker.client.sendMessage(`${number}@c.us`, message);
    res.send("Message Sent ✅");
  } catch (error) {
    console.error("Send Error:", error);
    res.status(500).send("Error sending message");
  }
});

/* ===============================
   HEALTH CHECK
=================================*/
app.get('/', (req, res) => {
  res.send("WhatsApp Multi Worker Server Running 🚀");
});

const PORT = process.env.PORT || 8080;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
