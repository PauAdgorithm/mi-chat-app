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

// --- HELPER: GESTIÓN DE CONTACTOS CRM (CORREGIDO CON TYPECAST) ---
async function handleContactUpdate(phone: string, text: string) {
  if (!base) return;
  
  // Limpiamos el número para búsquedas
  const cleanPhone = phone.replace(/\D/g, ''); 

  console.log(`🔍 Buscando contacto en Airtable: ${cleanPhone}`);

  try {
    // 1. Buscamos si el contacto ya existe
    const contacts = await base('Contacts').select({
      filterByFormula: `{phone} = '${phone}'`,
      maxRecords: 1
    }).firstPage();

    const now = new Date().toISOString();

    if (contacts.length > 0) {
      // EXISTE: Actualizamos su último mensaje
      // TRUCO: Usamos typecast: true para evitar errores de selección
      await base('Contacts').update([{
        id: contacts[0].id,
        fields: {
          "last_message": text,
          "last_message_time": now
        }
      }], { typecast: true });
      console.log(`🔄 Contacto actualizado: ${phone}`);
    } else {
      // NO EXISTE: Creamos uno nuevo
      console.log(`✨ Contacto no existe. Creando nuevo...`);
      await base('Contacts').create([{
        fields: {
          "phone": phone,
          "name": phone, // Al principio usamos el número como nombre
          "status": "Nuevo", // typecast creará esta opción si no existe
          "last_message": text,
          "last_message_time": now
        }
      }], { typecast: true });
      console.log(`✅ Nuevo contacto creado exitosamente.`);
    }
  } catch (error: any) {
    console.error("❌ ERROR CRÍTICO EN AIRTABLE CONTACTS:");
    console.error(error?.error || error);
  }
}

// --- WEBHOOK (Entrada de WhatsApp) ---
app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === verifyToken) {
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

app.post('/webhook', async (req, res) => {
  try {
    const body = req.body;
    
    if (body.object) {
      if (
        body.entry &&
        body.entry[0].changes &&
        body.entry[0].changes[0].value.messages &&
        body.entry[0].changes[0].value.messages[0]
      ) {
        const messageData = body.entry[0].changes[0].value.messages[0];
        const from = messageData.from; 
        const text = messageData.text?.body || "(Multimedia)"; 
        
        console.log(`📩 Recibido de ${from}: ${text}`);

        // 1. Actualizamos el CRM (Contactos) - AWAIT IMPORTANTE
        await handleContactUpdate(from, text);

        // 2. Guardamos el mensaje y avisamos al frontend
        await saveAndEmitMessage({
          text: text,
          sender: from, 
          timestamp: new Date().toISOString()
        });
      }
      res.sendStatus(200);
    } else {
      res.sendStatus(404);
    }
  } catch (error) {
    console.error("❌ Error Webhook:", error);
    res.sendStatus(500);
  }
});

// --- SOCKET.IO ---
io.on('connection', (socket) => {
  console.log(`Cliente conectado: ${socket.id}`);

  // Pedir lista de CONTACTOS
  socket.on('request_contacts', async () => {
    if (base) {
      try {
        const records = await base('Contacts').select({
          sort: [{ field: "last_message_time", direction: "desc" }]
        }).all();
        
        const contacts = records.map(r => ({
          id: r.id,
          phone: r.get('phone'),
          name: r.get('name'),
          status: r.get('status'),
          department: r.get('department'),
          last_message: r.get('last_message'),
          last_message_time: r.get('last_message_time')
        }));
        
        socket.emit('contacts_update', contacts);
      } catch (e) { console.error("Error pidiendo contactos:", e); }
    }
  });

  // Pedir MENSAJES de un chat concreto
  socket.on('request_conversation', async (phoneNumber) => {
    if (base) {
      try {
        // Buscamos mensajes de ese número
        const records = await base('Messages').select({
          filterByFormula: `{sender} = '${phoneNumber}'`, 
          sort: [{ field: "timestamp", direction: "asc" }]
        }).all();

        const messages = records.map(r => ({
          text: r.get('text'),
          sender: r.get('sender'),
          timestamp: r.get('timestamp')
        }));
        
        socket.emit('conversation_history', messages);
      } catch (e) { console.error(e); }
    }
  });

  // Enviar mensaje DESDE la web
  socket.on('chatMessage', async (msg) => {
    // msg trae: { text, sender: "Yo/Empresa", targetPhone: "+34..." }
    const targetPhone = msg.targetPhone || process.env.TEST_TARGET_PHONE;

    // 1. Enviar a WhatsApp
    if (waToken && waPhoneId) {
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
         console.log(`📤 Respondido a ${targetPhone}`);
         
         // 2. Guardar en Airtable (Como enviado por Agente)
         await saveAndEmitMessage({
             text: msg.text,
             sender: "Agente", 
             targetPhone: targetPhone, 
             timestamp: new Date().toISOString()
         });

         // 3. Actualizar el CRM (último mensaje)
         await handleContactUpdate(targetPhone, `Tú: ${msg.text}`);

       } catch (error: any) {
         console.error("❌ Error enviando a WhatsApp:", error.response?.data || error.message);
       }
    }
  });
});

async function saveAndEmitMessage(msg: any) {
  io.emit('message', msg); 
  
  if (base) {
    try {
      await base('Messages').create([{ 
        fields: { 
            "text": msg.text, 
            "sender": msg.sender, 
            "timestamp": msg.timestamp 
        } 
      }]);
    } catch (e) { console.error("Error guardando mensaje:", e); }
  }
}

httpServer.listen(PORT, () => {
  console.log(`🚀 Servidor CRM listo en puerto ${PORT}`);
});