import express from "express";
import cors from "cors";
import pkg from "whatsapp-web.js";
import qrcode from "qrcode-terminal";

const { Client, LocalAuth } = pkg;

const app = express();
app.use(cors());
app.use(express.json());

const client = new Client({
  authStrategy: new LocalAuth()
});

client.on("qr", qr => {
  console.log("Scan this QR:");
  qrcode.generate(qr, { small: true });
});

client.on("ready", () => {
  console.log("WhatsApp Client Ready!");
});

client.initialize();

app.post("/send-ticket", async (req, res) => {
  const {
    phone,
    fromStation,
    toStation,
    trainName,
    trainNumber,
    classType,
    ticketType
  } = req.body;

  try {
    const message =
`🎫 NEW TICKET

From: ${fromStation}
To: ${toStation}
Train: ${trainName} (${trainNumber})
Class: ${classType}
Type: ${ticketType}`;

    await client.sendMessage(phone + "@c.us", message);

    res.json({ success: true });

  } catch (err) {
    console.log(err);
    res.status(500).json({ error: "Failed" });
  }
});

app.listen(3000, () => {
  console.log("Server running on port 3000");
});
