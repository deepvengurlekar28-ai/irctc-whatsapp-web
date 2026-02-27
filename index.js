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
    protocolTimeout: 120000   // 🔥 2 minutes
  }
});
