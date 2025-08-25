const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require("@whiskeysockets/baileys")
const QRCode = require("qrcode")
const express = require("express")
const axios = require("axios")
const fs = require("fs")
const path = require("path")

async function start() {
  // 📌 lokasi folder auth
  const authPath = path.join(__dirname, "auth")
  const credsFile = path.join(authPath, "creds.json")

  // kalau ada ENV AUTH_DATA → buatkan file auth/creds.json
  if (process.env.AUTH_DATA) {
    if (!fs.existsSync(authPath)) fs.mkdirSync(authPath)
    fs.writeFileSync(credsFile, process.env.AUTH_DATA)
    console.log("✅ AUTH_DATA dari ENV ditulis ke auth/creds.json")
  }

  // load state Baileys
  const { state, saveCreds } = await useMultiFileAuthState(authPath)
  const sock = makeWASocket({ auth: state, printQRInTerminal: false })

  // simpan session tiap ada update
  sock.ev.on("creds.update", saveCreds)

  // tampilkan QR kalau perlu login baru
  sock.ev.on("connection.update", ({ qr, connection, lastDisconnect }) => {
    if (qr) {
      QRCode.toDataURL(qr, function (err, url) {
        if (err) return console.error("QR gagal dibuat:", err)
        console.log("✅ Buka link ini di browser untuk scan QR:")
        console.log(url) // buka di browser → muncul QR
      })
    }
    if (connection === "open") {
      console.log("✅ WhatsApp Bot sudah terhubung!")
    }
    if (connection === "close") {
      const reason = lastDisconnect?.error?.output?.statusCode
      console.error("❌ Connection closed. Reason:", reason || lastDisconnect?.error)
      console.log("🔄 Reconnecting in 5s...")
      setTimeout(start, 5000) // auto restart
    }
  })

  // event pesan masuk
  sock.ev.on("messages.upsert", async ({ messages }) => {
    const msg = messages[0]
    if (!msg.message) return

    const text = msg.message.conversation || msg.message.extendedTextMessage?.text
    const sender = msg.key.remoteJid

    console.log("📩 Pesan masuk:", sender, text)

    // kirim ke n8n webhook
    try {
      await axios.post("https://adamar.app.n8n.cloud/webhook/wa-in", {
        sender,
        text,
        timestamp: new Date().toISOString()
      })
    } catch (err) {
      console.error("❌ Gagal kirim ke n8n:", err.message)
    }
  })

  // endpoint utk balasan dari n8n → Railway expose API ini
  const app = express()
  app.use(express.json())
  app.post("/send", async (req, res) => {
    const { to, message } = req.body
    try {
      await sock.sendMessage(to, { text: message })
      res.send("✅ Pesan terkirim")
    } catch (err) {
      console.error("❌ Gagal kirim pesan:", err.message)
      res.status(500).send("Error kirim pesan")
    }
  })

  // pakai port dari Railway
  const PORT = process.env.PORT || 3000
  app.listen(PORT, () => console.log("🚀 Bot listening on " + PORT))
}

start()
