import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import Airtable from 'airtable';
import dotenv from 'dotenv';
import axios from 'axios'; // IMPORTANTE: Librería para hablar con WhatsApp

dotenv.config();

const app = express();
app.use(cors());
// IMPORTANTE: Esto permite leer los datos que envía WhatsApp (JSON)
app.use(express.json()); 

const PORT = process.env.PORT || 3000;

// --- CONFIGURACIÓN DE VARIABLES ---
const airtableApiKey = process.env.AIRTABLE_API_KEY;
const airtableBaseId = process.env.AIRTABLE_BASE_ID;

// Variables de WhatsApp (Las pondremos en Render luego)
const waToken = process.env.WHATSAPP_TOKEN;
const waPhoneId = process.env.WHATSAPP_PHONE_ID; 
const verifyToken = process.env.WEBHOOK_VERIFY_TOKEN; 

// Configurar Airtable
let base: Airtable.Base | null = null;
if (airtableApiKey && airtableBaseId) {
  Airtable.configure({ apiKey: airtableApiKey });
  base = Airtable.base(airtableBaseId);
  console.log("✅ Airtable configurado");
}

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});

// --- 1. VERIFICACIÓN DEL WEBHOOK (Meta te saluda por aquí) ---
app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode && token) {
    if (mode === 'subscribe' && token === verifyToken) {
      console.log('✅ Webhook de WhatsApp verificado!');
      res.status(200).send(challenge);
    } else {
      res.sendStatus(403);
    }
  }
});

// --- 2. RECIBIR MENSAJES DE WHATSAPP ---
app.post('/webhook', async (req, res) => {
  const body = req.body;

  // Verificar si viene de WhatsApp
  if (body.object) {
    if (
      body.entry &&
      body.entry[0].changes &&
      body.entry[0].changes[0].value.messages &&
      body.entry[0].changes[0].value.messages[0]
    ) {
      const messageData = body.entry[0].changes[0].value.messages[0];
      const from = messageData.from; // Número del cliente
      const text = messageData.text?.body || "(Archivo multimedia)"; 

      console.log(`📩 WhatsApp de ${from}: ${text}`);

      // Guardar en Airtable y mostrar en tu web
      await saveAndEmitMessage({
        text: text,
        sender: from, // El nombre será el número de teléfono
        timestamp: new Date().toISOString()
      });
    }
    res.sendStatus(200);
  } else {
    res.sendStatus(404);
  }
});

// --- 3. TU CHAT INTERNO (Socket.io) ---
io.on('connection', async (socket) => {
  console.log(`Usuario conectado: ${socket.id}`);

  // Cargar historial antiguo
  socket.on('request_history', async () => {
    if (base) {
      try {
        const records = await base('Messages').select({
          maxRecords: 50,
          sort: [{ field: "timestamp", direction: "asc" }]
        }).all();
        const history = records.map(record => ({
          text: record.get('text') as string,
          sender: record.get('sender') as string,
          timestamp: record.get('timestamp') as string
        })).filter(msg => msg.text && msg.sender);
        socket.emit('history', history);
      } catch (error) { console.error("Error historial:", error); }
    }
  });

  // ENVIAR MENSAJE (Tú escribes en la web -> Va a WhatsApp)
  socket.on('chatMessage', async (msg) => {
    // 1. Mostrar en tu pantalla
    await saveAndEmitMessage(msg);

    // 2. Enviar a WhatsApp Real
    // Aquí pondremos el número destino (para pruebas, tu propio móvil)
    const targetPhone = process.env.TEST_TARGET_PHONE; 

    if (targetPhone && waToken && waPhoneId) {
       try {
         await axios.post(
           `https://graph.facebook.com/v17.0/${waPhoneId}/messages`,
           {
             messaging_product: "whatsapp",
             to: targetPhone,
             type: "text",
             text: { body: msg.text }
           },
           { headers: { Authorization: `Bearer ${waToken}` } }
         );
         console.log("📤 Enviado a WhatsApp");
       } catch (error: any) {
         console.error("❌ Error enviando a WhatsApp:", error.response?.data || error.message);
       }
    } else {
        console.log("⚠️ No se envió a WhatsApp (Faltan claves o número destino)");
    }
  });
});

// Función auxiliar para guardar y emitir
async function saveAndEmitMessage(msg: any) {
  io.emit('message', msg); // Enviar a la web
  if (base) {
    try {
      await base('Messages').create([{ fields: { "text": msg.text, "sender": msg.sender, "timestamp": new Date().toISOString() } }]);
    } catch (e) { console.error("Error guardando:", e); }
  }
}

httpServer.listen(PORT, () => {
  console.log(`🚀 Servidor CRM WhatsApp listo en puerto ${PORT}`);
});