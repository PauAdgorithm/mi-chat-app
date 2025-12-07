import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import Airtable from 'airtable';
import dotenv from 'dotenv';
import axios from 'axios';
import multer from 'multer';
import FormData from 'form-data';

console.log("🚀 [BOOT] Arrancando servidor...");
dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const upload = multer({ storage: multer.memoryStorage() });
const PORT = process.env.PORT || 3000;

const airtableApiKey = process.env.AIRTABLE_API_KEY;
const airtableBaseId = process.env.AIRTABLE_BASE_ID;
const waToken = process.env.WHATSAPP_TOKEN;
const waPhoneId = process.env.WHATSAPP_PHONE_ID; 
const waBusinessId = process.env.WHATSAPP_BUSINESS_ID; 
const verifyToken = process.env.WEBHOOK_VERIFY_TOKEN; 

const TABLE_TEMPLATES = 'Templates';

let base: Airtable.Base | null = null;
if (airtableApiKey && airtableBaseId) {
  try {
    Airtable.configure({ apiKey: airtableApiKey });
    base = Airtable.base(airtableBaseId);
    console.log("✅ Airtable configurado correctamente");
  } catch (e) { console.error("Error Airtable:", e); }
} else {
    console.error("❌ FALTA CONFIGURACIÓN: Revisa AIRTABLE_API_KEY y AIRTABLE_BASE_ID");
}

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});

const onlineUsers = new Map<string, string>();
const cleanNumber = (phone: string) => phone ? phone.replace(/\D/g, '') : "";

// --- RUTAS DE PLANTILLAS (CRUD + ENVÍO) ---
app.get('/api/templates', async (req, res) => {
    if (!base) return res.status(500).json({ error: "Airtable no conectado" });
    try {
        const records = await base(TABLE_TEMPLATES).select().all();
        const formatted = records.map((record) => ({
            id: record.id,
            name: (record.get('Name') as string) || '',
            category: (record.get('Category') as string) || 'MARKETING',
            language: (record.get('Language') as string) || 'es',
            body: (record.get('Body') as string) || '',
            footer: (record.get('Footer') as string) || '',
            status: (record.get('Status') as string) || 'PENDING',
            metaId: (record.get('MetaId') as string) || '',
            variableMapping: record.get('VariableMapping') ? JSON.parse(record.get('VariableMapping') as string) : {}
        }));
        res.json(formatted);
    } catch (error: any) { res.status(500).json({ error: "Error interno" }); }
});

app.post('/api/create-template', async (req, res) => {
    if (!base) return res.status(500).json({ error: "Airtable no conectado" });
    try {
        const { name, category, body, language, footer, variableExamples } = req.body;
        let metaId = "meta_simulado_" + Date.now();
        let status = "PENDING";
        if (waToken && waBusinessId) {
            try {
                const metaPayload: any = { name, category, allow_category_change: true, language, components: [{ type: "BODY", text: body }] };
                if (footer) metaPayload.components.push({ type: "FOOTER", text: footer });
                const metaRes = await axios.post(`https://graph.facebook.com/v18.0/${waBusinessId}/message_templates`, metaPayload, { headers: { 'Authorization': `Bearer ${waToken}`, 'Content-Type': 'application/json' } });
                metaId = metaRes.data.id; status = metaRes.data.status || "PENDING";
            } catch (metaError: any) { status = "REJECTED"; }
        }
        const createdRecords = await base(TABLE_TEMPLATES).create([{ fields: { "Name": name, "Category": category, "Language": language, "Body": body, "Footer": footer, "Status": status, "MetaId": metaId, "VariableMapping": JSON.stringify(variableExamples || {}) } }]);
        res.json({ success: true, template: { id: createdRecords[0].id, name, category, language, body, footer, status, variableMapping: variableExamples } });
    } catch (error: any) { res.status(400).json({ success: false, error: error.message }); }
});

app.delete('/api/delete-template/:id', async (req, res) => {
    if (!base) return res.status(500).json({ error: "Airtable no conectado" });
    try { await base(TABLE_TEMPLATES).destroy([req.params.id]); res.json({ success: true }); } catch (error: any) { res.status(500).json({ error: "No se pudo eliminar" }); }
});

app.post('/api/send-template', async (req, res) => {
    if (!waToken || !waPhoneId) return res.status(500).json({ error: "Faltan credenciales" });
    try {
        const { templateName, language, phone, variables, previewText } = req.body;
        const parameters = variables.map((val: string) => ({ type: "text", text: val }));
        await axios.post(`https://graph.facebook.com/v17.0/${waPhoneId}/messages`, { messaging_product: "whatsapp", to: cleanNumber(phone), type: "template", template: { name: templateName, language: { code: language }, components: [{ type: "body", parameters: parameters }] } }, { headers: { Authorization: `Bearer ${waToken}` } });
        const finalMessage = previewText || `📝 [Plantilla] ${templateName}`;
        await saveAndEmitMessage({ text: finalMessage, sender: "Agente", recipient: cleanNumber(phone), timestamp: new Date().toISOString(), type: "template" });
        res.json({ success: true });
    } catch (error: any) { res.status(400).json({ error: "Error al enviar" }); }
});

// --- MEDIA & UPLOAD ---
app.get('/api/media/:id', async (req, res) => {
    if (!waToken) return res.sendStatus(500);
    try {
        const urlRes = await axios.get(`https://graph.facebook.com/v17.0/${req.params.id}`, { headers: { 'Authorization': `Bearer ${waToken}` } });
        const mediaRes = await axios.get(urlRes.data.url, { headers: { 'Authorization': `Bearer ${waToken}` }, responseType: 'stream' });
        res.setHeader('Content-Type', mediaRes.headers['content-type']);
        mediaRes.data.pipe(res);
    } catch (e) { res.sendStatus(404); }
});

app.post('/api/upload', upload.single('file'), async (req: any, res: any) => {
  try {
    const file = req.file; const { targetPhone, senderName } = req.body;
    if (!file || !targetPhone) return res.status(400).json({ error: "Faltan datos" });
    const formData = new FormData(); formData.append('file', file.buffer, { filename: file.originalname, contentType: file.mimetype }); formData.append('messaging_product', 'whatsapp');
    const uploadRes = await axios.post(`https://graph.facebook.com/v17.0/${waPhoneId}/media`, formData, { headers: { 'Authorization': `Bearer ${waToken}`, ...formData.getHeaders() } });
    let msgType = 'document'; if (file.mimetype.startsWith('image')) msgType = 'image'; else if (file.mimetype.startsWith('audio')) msgType = 'audio';
    const payload: any = { messaging_product: "whatsapp", to: cleanNumber(targetPhone), type: msgType };
    payload[msgType] = { id: uploadRes.data.id, ...(msgType === 'document' && { filename: file.originalname }) };
    await axios.post(`https://graph.facebook.com/v17.0/${waPhoneId}/messages`, payload, { headers: { Authorization: `Bearer ${waToken}` } });
    await saveAndEmitMessage({ text: file.originalname, sender: senderName || "Agente", recipient: cleanNumber(targetPhone), timestamp: new Date().toISOString(), type: msgType, mediaId: uploadRes.data.id });
    res.json({ success: true });
  } catch (error: any) { res.status(500).json({ error: "Error subiendo" }); }
});

// --- WEBHOOKS ---
app.get('/webhook', (req, res) => { if (req.query['hub.verify_token'] === verifyToken) res.send(req.query['hub.challenge']); else res.sendStatus(403); });
app.post('/webhook', async (req, res) => {
  try {
    const body = req.body;
    if (body.object && body.entry?.[0]?.changes?.[0]?.value?.messages?.[0]) {
        const msg = body.entry[0].changes[0].value.messages[0];
        const from = msg.from; let text = "Media"; let type = msg.type; let mediaId = "";
        if (type === 'text') text = msg.text.body;
        else if (['image','audio','voice','document'].includes(type)) { text = type; mediaId = msg[type]?.id; }
        await handleContactUpdate(from, text, body.entry[0].changes[0].value.contacts?.[0]?.profile?.name);
        await saveAndEmitMessage({ text, sender: from, timestamp: new Date().toISOString(), type, mediaId });
    }
    res.sendStatus(200);
  } catch (e) { res.sendStatus(500); }
});

// --- HELPERS & SOCKETS ---
async function handleContactUpdate(phone: string, text: string, profileName?: string) {
  if (!base) return;
  const clean = cleanNumber(phone); 
  try {
    const contacts = await base('Contacts').select({ filterByFormula: `{phone} = '${clean}'`, maxRecords: 1 }).firstPage();
    if (contacts.length > 0) {
      await base('Contacts').update([{ id: contacts[0].id, fields: { "last_message": text, "last_message_time": new Date().toISOString() } }]);
    } else {
      await base('Contacts').create([{ fields: { "phone": clean, "name": profileName || clean, "status": "Nuevo", "last_message": text, "last_message_time": new Date().toISOString() } }]);
      io.emit('contact_updated_notification');
    }
  } catch (e) { console.error(e); }
}

async function saveAndEmitMessage(msg: any) {
  io.emit('message', msg); 
  if (base) base('Messages').create([{ fields: { "text": msg.text, "sender": msg.sender, "recipient": msg.recipient, "timestamp": msg.timestamp, "type": msg.type, "media_id": msg.mediaId || "" } }]);
}

io.on('connection', (socket) => {
  // Config: Ahora carga Departments, Statuses Y TAGS
  socket.on('request_config', async () => { 
      if (base) { 
          const r = await base('Config').select().all(); 
          socket.emit('config_list', r.map(x => ({ id: x.id, name: x.get('name'), type: x.get('type') }))); 
      } 
  });
  
  // CRUD Config (Tags incluido)
  socket.on('add_config', async (data) => { if (base) { await base('Config').create([{ fields: { "name": data.name, "type": data.type } }]); io.emit('config_list', (await base('Config').select().all()).map(r => ({ id: r.id, name: r.get('name'), type: r.get('type') }))); socket.emit('action_success', 'Añadido'); } });
  socket.on('delete_config', async (id) => { if (base) { await base('Config').destroy([id]); io.emit('config_list', (await base('Config').select().all()).map(r => ({ id: r.id, name: r.get('name'), type: r.get('type') }))); socket.emit('action_success', 'Eliminado'); } });
  socket.on('update_config', async (d) => { if (base) { await base('Config').update([{ id: d.id, fields: { "name": d.name } }]); io.emit('config_list', (await base('Config').select().all()).map(r => ({ id: r.id, name: r.get('name'), type: r.get('type') }))); socket.emit('action_success', 'Actualizado'); } });

  // Contactos: AHORA INCLUYE TAGS
  socket.on('request_contacts', async () => { 
      if (base) { 
          const r = await base('Contacts').select({ sort: [{ field: "last_message_time", direction: "desc" }] }).all(); 
          socket.emit('contacts_update', r.map(x => ({ 
              id: x.id, 
              phone: x.get('phone'), 
              name: x.get('name'), 
              status: x.get('status'), 
              department: x.get('department'),
              assigned_to: x.get('assigned_to'),
              last_message: x.get('last_message'), 
              last_message_time: x.get('last_message_time'), 
              avatar: (x.get('avatar') as any[])?.[0]?.url,
              email: x.get('email'),
              address: x.get('address'),
              notes: x.get('notes'),
              signup_date: x.get('signup_date'),
              tags: x.get('tags') || [] // <--- NUEVO CAMPO
          }))); 
      } 
  });

  socket.on('update_contact_info', async (data) => { if(base) { const clean = cleanNumber(data.phone); const r = await base('Contacts').select({ filterByFormula: `{phone} = '${clean}'` }).firstPage(); if (r.length > 0) { await base('Contacts').update([{ id: r[0].id, fields: data.updates }], { typecast: true }); io.emit('contact_updated_notification'); } } });
  
  // Chat, Agents, Login, etc. (Igual que antes)
  socket.on('request_conversation', async (p) => { if (base) { const c = cleanNumber(p); const r = await base('Messages').select({ filterByFormula: `OR({sender}='${c}',{recipient}='${c}')`, sort: [{ field: "timestamp", direction: "asc" }] }).all(); socket.emit('conversation_history', r.map(x => ({ text: x.get('text'), sender: x.get('sender'), timestamp: x.get('timestamp'), type: x.get('type'), mediaId: x.get('media_id') }))); } });
  socket.on('chatMessage', async (msg) => { /* ... Lógica envío ... */ }); 
  // ... (Resto de sockets se mantiene igual)
});

httpServer.listen(PORT, () => { console.log(`🚀 Servidor Listo en puerto ${PORT}`); });