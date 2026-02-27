import express from 'express';
import pkg from 'whatsapp-web.js';
import qrcode from 'qrcode';

const { Client, LocalAuth } = pkg;

const app = express();
app.use(express.json());

const clients = {};   // 🔥 All workers stored here

// 🔥 Create client per worker
function createClient(workerId) {

  const client = new Client({
    authStrategy: new LocalAuth({
      clientId: workerId   // separate session per worker
    }),
    puppeteer: {
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
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
    console.log(`Worker ${workerId} Disconnected`);
    clients[workerId].ready = false;
  });

  client.initialize();
}

// 🔥 Get QR for specific worker
app.get('/qr/:workerId', (req, res) => {
  const { workerId } = req.params;

  if (!clients[workerId]) {
    createClient(workerId);
    return res.send("Generating QR... Refresh in 5 seconds.");
  }

  if (clients[workerId].qr && !clients[workerId].ready) {
    return res.send(`<img src="${clients[workerId].qr}" />`);
  }

  if (clients[workerId].ready) {
    return res.send("WhatsApp already connected ✅");
  }

  res.send("QR not ready yet. Refresh.");
});

// 🔥 Send message from specific worker
app.post('/send/:workerId', async (req, res) => {
  const { workerId } = req.params;
  const { number, message } = req.body;

  if (!clients[workerId] || !clients[workerId].ready) {
    return res.status(400).send("Worker not connected");
  }

  if (!number || !message) {
    return res.status(400).send("Number and message required");
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
