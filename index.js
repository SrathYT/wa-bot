const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion
} = require("@adiwajshing/baileys")
const { Boom } = require("@hapi/boom")
const qrcode = require("qrcode-terminal")

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState("./auth")
    const { version } = await fetchLatestBaileysVersion()

    const sock = makeWASocket({
        version,
        printQRInTerminal: true,
        auth: state
    })

    sock.ev.on("creds.update", saveCreds)

    sock.ev.on("connection.update", (update) => {
        const { connection, lastDisconnect } = update
        if (connection === "close") {
            const reason = new Boom(lastDisconnect?.error)?.output?.statusCode
            if (reason !== DisconnectReason.loggedOut) {
                console.log("Reconnecting...")
                startBot()
            } else {
                console.log("❌ Logged out. Scan again to reconnect.")
            }
        } else if (connection === "open") {
            console.log("✅ WhatsApp bot connected successfully!")
        }
    })

    sock.ev.on("messages.upsert", async (m) => {
        const msg = m.messages[0]
        if (!msg.message || msg.key.fromMe) return

        const from = msg.key.remoteJid
        const sender = msg.key.participant
        const message = msg.message.conversation || msg.message.extendedTextMessage?.text || ""

        // Group only commands
        if (from.endsWith("@g.us") && message.startsWith("/")) {
            const groupMetadata = await sock.groupMetadata(from)
            const admins = groupMetadata.participants.filter(p => p.admin).map(p => p.id)
            const isAdmin = admins.includes(sender)

            if (!isAdmin) {
                await sock.sendMessage(from, { text: "❌ Only group admins can use this command." }, { quoted: msg })
                return
            }

            // /clear command
            if (message === "/clear") {
                await sock.sendMessage(from, { text: "✅ Messages cleared (simulation)." })
            }

            // /tagall command
            if (message === "/tagall") {
                const participants = groupMetadata.participants.map(p => p.id)
                const text = "📢 *Tagging all members:*\n" + participants.map(p => `@${p.split("@")[0]}`).join(" ")
                await sock.sendMessage(from, { text, mentions: participants })
            }
        }
    })
}

startBot()
