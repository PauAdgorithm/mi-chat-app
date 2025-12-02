import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import Airtable from 'airtable';
import dotenv from 'dotenv';
import axios from 'axios';

dotenv.config();

const app = express();
app.use(cors());
// IMPORTANTE: Esto permite leer el JSON que envía WhatsApp
app.use(express.json()); 

const PORT = process.env.PORT || 3000;

// --- CONFIGURACIÓN DE VARIABLES ---
const airtableApiKey = process.env.AIRTABLE_API_KEY;
const airtableBaseId = process.env.AIRTABLE_BASE_ID;
const waToken = process.env.WHATSAPP_TOKEN;
const waPhoneId = process.env.WHATSAPP_PHONE_ID; 
const verifyToken = process.env.WEBHOOK_VERIFY_TOKEN; 

// Configurar Airtable
let base: Airtable.Base | null = null;
if (airtableApiKey && airtableBaseId) {
  Airtable.configure({ apiKey: airtableApiKey });
  base = Airtable.base(airtableBaseId);
  console.log("✅ Airtable configurado correctamente");
} else {
  console.warn("⚠️ FALTA CONFIGURACIÓN DE AIRTABLE");
}

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});

// --- 1. VERIFICACIÓN DEL WEBHOOK (Meta comprueba que existes) ---
app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode && token) {
    if (mode === 'subscribe' && token === verifyToken) {
      console.log('✅ Webhook verificado correctamente!');
      res.status(200).send(challenge);
    } else {
      console.log('❌ Fallo de verificación de token');
      res.sendStatus(403);
    }
  }
});

// --- 2. RECIBIR MENSAJES DE WHATSAPP (CON DIAGNÓSTICO) ---
app.post('/webhook', async (req, res) => {
  try {
    const body = req.body;
    
    // LOG CHIVATO: Esto nos dirá qué está llegando exactamente
    console.log("📥 WEBHOOK RECIBIDO:");
    console.log(JSON.stringify(body, null, 2)); 

    // Verificar si es un evento válido
    if (body.object) {
      if (
        body.entry &&
        body.entry[0].changes &&
        body.entry[0].changes[0].value.messages &&
        body.entry[0].changes[0].value.messages[0]
      ) {
        const messageData = body.entry[0].changes[0].value.messages[0];
        
        const from = messageData.from; // Número del cliente
        const text = messageData.text?.body || "(Multimedia o desconocido)"; 
        
        console.log(`✅ MENSAJE VALIDO DE ${from}: ${text}`);

        // Guardar y mostrar en la web
        await saveAndEmitMessage({
          text: text,
          sender: from, 
          timestamp: new Date().toISOString()
        });

      } else if (
        body.entry &&
        body.entry[0].changes &&
        body.entry[0].changes[0].value.statuses
      ) {
        // Esto son los ticks (enviado, leído), los ignoramos por ahora
        const status = body.entry[0].changes[0].value.statuses[0].status;
        console.log(`ℹ️ Info de estado: ${status}`);
      } else {
        console.log("⚠️ Evento recibido pero no es un mensaje de texto.");
      }
      res.sendStatus(200);
    } else {
      res.sendStatus(404);
    }
  } catch (error) {
    console.error("❌ ERROR EN WEBHOOK:", error);
    res.sendStatus(500);
  }
});

// --- 3. SOCKET.IO (Tu Chat Web) ---
io.on('connection', async (socket) => {
  console.log(`Usuario conectado: ${socket.id}`);

  // Cargar historial
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
        }))
        // Filtro para quitar mensajes vacíos
        .filter(msg => msg.text && msg.sender && msg.text.trim() !== "");

        socket.emit('history', history);
      } catch (error) { console.error("Error historial:", error); }
    }
  });

  // ENVIAR MENSAJE (Web -> WhatsApp)
  socket.on('chatMessage', async (msg) => {
    // 1. Mostrar en web y guardar
    await saveAndEmitMessage(msg);

    // 2. Enviar a WhatsApp Real
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
         console.log("📤 Enviado a WhatsApp correctamente");
       } catch (error: any) {
         console.error("❌ Error enviando a WhatsApp:", error.response?.data || error.message);
       }
    } else {
        console.log("⚠️ No se envió a WhatsApp: Faltan claves o teléfono destino");
    }
  });
});

// Función auxiliar para guardar en Airtable y avisar al frontend
async function saveAndEmitMessage(msg: any) {
  io.emit('message', msg); 
  if (base) {
    try {
      await base('Messages').create([{ fields: { "text": msg.text, "sender": msg.sender, "timestamp": new Date().toISOString() } }]);
    } catch (e) { console.error("Error guardando en Airtable:", e); }
  }
}

httpServer.listen(PORT, () => {
  console.log(`🚀 Servidor listo en puerto ${PORT}`);
});