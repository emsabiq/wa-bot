const { default: makeWASocket, useMultiFileAuthState } = require("@adiwajshing/baileys")
const qrcode = require("qrcode-terminal")
const express = require("express")
const axios = require("axios")

async function start() {
  const { state, saveCreds } = await useMultiFileAuthState("auth")
  const sock = makeWASocket({ auth: state })

  sock.ev.on("creds.update", saveCreds)

  sock.ev.on("connection.update", ({ qr }) => {
    if (qr) qrcode.generate(qr, { small: true })
  })

  sock.ev.on("messages.upsert", async ({ messages }) => {
    const msg = messages[0]
    if (!msg.message) return

    const text = msg.message.conversation || msg.message.extendedTextMessage?.text
    const sender = msg.key.remoteJid

    // kirim ke n8n webhook
    await axios.post("https://your-n8n-domain/webhook/wa-in", {
      sender,
      text,
      timestamp: new Date().toISOString()
    })
  })

  // endpoint utk balasan dari n8n
  const app = express()
  app.use(express.json())
  app.post("/send", async (req, res) => {
    const { to, message } = req.body
    await sock.sendMessage(to, { text: message })
    res.send("ok")
  })
  app.listen(3000, () => console.log("Bot listening on 3000"))
}

start()
