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
app.use(express.json());

const PORT = process.env.PORT || 3000;

// --- CONFIGURACIÓN ---
const airtableApiKey = process.env.AIRTABLE_API_KEY;
const airtableBaseId = process.env.AIRTABLE_BASE_ID;
const waToken = process.env.WHATSAPP_TOKEN;
const waPhoneId = process.env.WHATSAPP_PHONE_ID; 
const verifyToken = process.env.WEBHOOK_VERIFY_TOKEN; 

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

// --- HELPER: GESTIÓN DE CONTACTOS ---
async function handleContactUpdate(phone: string, text: string) {
  if (!base) return;
  const cleanPhone = phone.replace(/\D/g, ''); 

  try {
    const contacts = await base('Contacts').select({
      filterByFormula: `{phone} = '${phone}'`,
      maxRecords: 1
    }).firstPage();

    const now = new Date().toISOString();

    if (contacts.length > 0) {
      await base('Contacts').update([{
        id: contacts[0].id,
        fields: { "last_message": text, "last_message_time": now }
      }], { typecast: true });
    } else {
      await base('Contacts').create([{
        fields: {
          "phone": phone,
          "name": phone, 
          "status": "Nuevo",
          "last_message": text,
          "last_message_time": now
        }
      }], { typecast: true });
      console.log(`✨ Nuevo contacto creado: ${phone}`);
      io.emit('contact_updated_notification'); // Avisar para refrescar listas
    }
  } catch (error: any) {
    console.error("❌ Error Contactos:", error?.error || error);
  }
}

// --- WEBHOOK ---
app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  if (mode === 'subscribe' && token === verifyToken) res.status(200).send(challenge);
  else res.sendStatus(403);
});

app.post('/webhook', async (req, res) => {
  try {
    const body = req.body;
    if (body.object) {
      if (body.entry?.[0]?.changes?.[0]?.value?.messages?.[0]) {
        const messageData = body.entry[0].changes[0].value.messages[0];
        const from = messageData.from; 
        const text = messageData.text?.body || "(Multimedia)"; 
        
        console.log(`📩 WhatsApp de ${from}: ${text}`);
        await handleContactUpdate(from, text);
        await saveAndEmitMessage({ text: text, sender: from, timestamp: new Date().toISOString() });
      }
      res.sendStatus(200);
    } else res.sendStatus(404);
  } catch (error) {
    console.error("❌ Error Webhook:", error);
    res.sendStatus(500);
  }
});

// --- SOCKET.IO ---
io.on('connection', (socket) => {
  console.log(`Cliente conectado: ${socket.id}`);

  // 1. Enviar CONTACTOS
  socket.on('request_contacts', async () => {
    if (base) {
      try {
        const records = await base('Contacts').select({
          sort: [{ field: "last_message_time", direction: "desc" }]
        }).all();
        
        const contacts = records.map(r => ({
          id: r.id,
          phone: (r.get('phone') as string) || "",
          name: (r.get('name') as string) || (r.get('phone') as string) || "Desconocido",
          status: (r.get('status') as string) || "Nuevo",
          department: (r.get('department') as string) || "",
          last_message: (r.get('last_message') as string) || "",
          last_message_time: (r.get('last_message_time') as string) || new Date().toISOString()
        }));
        socket.emit('contacts_update', contacts);
      } catch (e) { console.error("Error contactos:", e); }
    }
  });

  // 2. Enviar MENSAJES
  socket.on('request_conversation', async (phoneNumber) => {
    if (base) {
      try {
        const records = await base('Messages').select({
          filterByFormula: `{sender} = '${phoneNumber}'`, 
          sort: [{ field: "timestamp", direction: "asc" }]
        }).all();

        const messages = records.map(r => ({
          text: (r.get('text') as string) || "",
          sender: (r.get('sender') as string) || "Desconocido",
          timestamp: (r.get('timestamp') as string) || new Date().toISOString()
        }));
        socket.emit('conversation_history', messages);
      } catch (e) { console.error(e); }
    }
  });

  // 3. NUEVO: Actualizar Info del Cliente (Nombre, Dept, Status)
  socket.on('update_contact_info', async (data) => {
    const { phone, updates } = data;
    console.log(`📝 Actualizando ${phone}:`, updates);
    if (base) {
      try {
        const records = await base('Contacts').select({
          filterByFormula: `{phone} = '${phone}'`,
          maxRecords: 1
        }).firstPage();

        if (records.length > 0) {
          await base('Contacts').update([{
            id: records[0].id,
            fields: updates
          }], { typecast: true });
          
          // Avisar a todos los clientes conectados para que refresquen su barra lateral
          io.emit('contact_updated_notification');
        }
      } catch (e) { console.error("Error update contact:", e); }
    }
  });

  // 4. Enviar Mensaje
  socket.on('chatMessage', async (msg) => {
    const targetPhone = msg.targetPhone || process.env.TEST_TARGET_PHONE;
    if (waToken && waPhoneId) {
       try {
         await axios.post(
           `https://graph.facebook.com/v17.0/${waPhoneId}/messages`,
           { messaging_product: "whatsapp", to: targetPhone, type: "text", text: { body: msg.text } },
           { headers: { Authorization: `Bearer ${waToken}` } }
         );
         await saveAndEmitMessage({ text: msg.text, sender: "Agente", targetPhone: targetPhone, timestamp: new Date().toISOString() });
         await handleContactUpdate(targetPhone, `Tú: ${msg.text}`);
       } catch (error: any) { console.error("❌ Error enviando WA:", error.response?.data || error.message); }
    }
  });
});

async function saveAndEmitMessage(msg: any) {
  io.emit('message', msg); 
  if (base) {
    try {
      await base('Messages').create([{ 
        fields: { "text": msg.text || "", "sender": msg.sender || "Desc", "timestamp": msg.timestamp || new Date().toISOString() } 
      }]);
    } catch (e) { console.error("Error guardando msg:", e); }
  }
}

httpServer.listen(PORT, () => {
  console.log(`🚀 Servidor CRM listo en puerto ${PORT}`);
});