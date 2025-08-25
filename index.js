const { default: makeWASocket, useMultiFileAuthState } = require("@whiskeysockets/baileys")
const QRCode = require("qrcode")   // biar QR bisa discan gampang
const express = require("express")
const axios = require("axios")

async function start() {
  const { state, saveCreds } = await useMultiFileAuthState("auth")
  const sock = makeWASocket({ auth: state })

  // simpan session creds
  sock.ev.on("creds.update", saveCreds)

  // tampilkan QR saat pertama kali login
  sock.ev.on("connection.update", ({ qr, connection }) => {
    if (qr) {
      QRCode.toDataURL(qr, function (err, url) {
        if (err) return console.error("QR gagal dibuat:", err)
        console.log("✅ Buka link ini di browser untuk scan QR:")
        console.log(url) // buka di browser → keluar QR code PNG
      })
    }
    if (connection === "open") {
      console.log("✅ WhatsApp Bot sudah terhubung!")
    }
  })

  // event ketika pesan baru masuk
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
