import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import Airtable from 'airtable';
import dotenv from 'dotenv';
import axios from 'axios';
import multer from 'multer';
import FormData from 'form-data';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const upload = multer({ storage: multer.memoryStorage() });
const PORT = process.env.PORT || 3000;

// --- CONFIG ---
const airtableApiKey = process.env.AIRTABLE_API_KEY;
const airtableBaseId = process.env.AIRTABLE_BASE_ID;
const waToken = process.env.WHATSAPP_TOKEN;
const waPhoneId = process.env.WHATSAPP_PHONE_ID; 
const verifyToken = process.env.WEBHOOK_VERIFY_TOKEN; 

let base: Airtable.Base | null = null;
if (airtableApiKey && airtableBaseId) {
  try {
    Airtable.configure({ apiKey: airtableApiKey });
    base = Airtable.base(airtableBaseId);
    console.log("✅ Airtable configurado");
  } catch (e) { console.error("Error Airtable config:", e); }
}

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});

// ... (RUTAS API MEDIA/UPLOAD/WEBHOOK IGUAL QUE ANTES) ...
app.get('/api/media/:id', async (req, res) => {
    const { id } = req.params;
    if (!waToken) return res.sendStatus(500);
    try {
        const urlRes = await axios.get(`https://graph.facebook.com/v17.0/${id}`, { headers: { 'Authorization': `Bearer ${waToken}` } });
        const mediaRes = await axios.get(urlRes.data.url, { headers: { 'Authorization': `Bearer ${waToken}` }, responseType: 'stream' });
        res.setHeader('Content-Type', mediaRes.headers['content-type']);
        if (mediaRes.headers['content-length']) res.setHeader('Content-Length', mediaRes.headers['content-length']);
        res.setHeader('Accept-Ranges', 'bytes');
        mediaRes.data.pipe(res);
    } catch (e) { res.sendStatus(404); }
});

app.post('/api/upload', upload.single('file'), async (req: any, res: any) => {
  try {
    const file = req.file;
    const targetPhone = req.body.targetPhone;
    const senderName = req.body.senderName || "Agente";
    if (!file || !targetPhone) return res.status(400).json({ error: "Faltan datos" });
    const cleanTarget = cleanNumber(targetPhone);
    const mime = file.mimetype;
    let msgType = 'document'; 
    if (mime === 'image/jpeg' || mime === 'image/png') msgType = 'image';
    else if (['audio/aac', 'audio/mp4', 'audio/amr', 'audio/mpeg', 'audio/ogg'].includes(mime) || mime.includes('audio')) msgType = 'audio';

    const formData = new FormData();
    formData.append('file', file.buffer, { filename: file.originalname, contentType: file.mimetype });
    formData.append('messaging_product', 'whatsapp');

    const uploadRes = await axios.post(`https://graph.facebook.com/v17.0/${waPhoneId}/media`, formData, { headers: { 'Authorization': `Bearer ${waToken}`, ...formData.getHeaders() } });
    const mediaId = uploadRes.data.id;

    const payload: any = { messaging_product: "whatsapp", to: cleanTarget, type: msgType };
    if (msgType === 'image') payload.image = { id: mediaId };
    else if (msgType === 'audio') payload.audio = { id: mediaId };
    else payload.document = { id: mediaId, filename: file.originalname };

    await axios.post(`https://graph.facebook.com/v17.0/${waPhoneId}/messages`, payload, { headers: { Authorization: `Bearer ${waToken}` } });

    let textLog = file.originalname; let saveType = 'document';
    if (msgType === 'image') { textLog = "📷 [Imagen]"; saveType = 'image'; } else if (msgType === 'audio') { textLog = "🎤 [Audio]"; saveType = 'audio'; }

    await saveAndEmitMessage({ text: textLog, sender: senderName, recipient: cleanTarget, timestamp: new Date().toISOString(), type: saveType, mediaId: mediaId });
    await handleContactUpdate(cleanTarget, `Tú (${senderName}): 📎 Archivo`);
    res.json({ success: true });
  } catch (error: any) { res.status(500).json({ error: "Error subiendo archivo" }); }
});

app.get('/webhook', (req, res) => {
  if (req.query['hub.mode'] === 'subscribe' && req.query['hub.verify_token'] === verifyToken) res.status(200).send(req.query['hub.challenge']);
  else res.sendStatus(403);
});

app.post('/webhook', async (req, res) => {
  try {
    const body = req.body;
    if (body.object && body.entry?.[0]?.changes?.[0]?.value?.messages?.[0]) {
        const value = body.entry[0].changes[0].value;
        const msgData = value.messages[0];
        const profileName = value.contacts?.[0]?.profile?.name || "";
        const from = msgData.from; 
        let text = "(Desconocido)"; let type = msgData.type; let mediaId = "";
        if (type === 'text') text = msgData.text.body; else if (type === 'image') { text = msgData.image.caption || "📷 Imagen"; mediaId = msgData.image.id; } else if (type === 'audio' || type === 'voice') { text = "🎤 Audio"; mediaId = (msgData.audio || msgData.voice).id; type = 'audio'; } else if (type === 'document') { text = msgData.document.filename || "📄 Documento"; mediaId = msgData.document.id; }
        await handleContactUpdate(from, text, profileName);
        await saveAndEmitMessage({ text, sender: from, timestamp: new Date().toISOString(), type, mediaId });
    }
    res.sendStatus(200);
  } catch (e) { res.sendStatus(500); }
});

const cleanNumber = (phone: string) => phone ? phone.replace(/\D/g, '') : "";

async function handleContactUpdate(phone: string, text: string, profileName?: string) {
  if (!base) return;
  const cleanPhone = cleanNumber(phone);
  try {
    const contacts = await base('Contacts').select({ filterByFormula: `{phone} = '${cleanPhone}'`, maxRecords: 1 }).firstPage();
    const now = new Date().toISOString();
    if (contacts.length > 0) {
      await base('Contacts').update([{ id: contacts[0].id, fields: { "last_message": text, "last_message_time": now } }], { typecast: true });
    } else {
      const newName = profileName ? `${cleanPhone} (${profileName})` : cleanPhone;
      await base('Contacts').create([{ fields: { "phone": cleanPhone, "name": newName, "status": "Nuevo", "last_message": text, "last_message_time": now } }], { typecast: true });
      io.emit('contact_updated_notification');
    }
  } catch (e) { console.error("Error Contactos:", e); }
}

async function saveAndEmitMessage(msg: any) {
  io.emit('message', msg); 
  if (base) {
    try {
      await base('Messages').create([{ fields: { "text": msg.text || "", "sender": msg.sender || "Desc", "recipient": msg.recipient || "", "timestamp": msg.timestamp || new Date().toISOString(), "type": msg.type || "text", "media_id": msg.mediaId || "" } }], { typecast: true });
    } catch (e) { console.error("Error guardando:", e); }
  }
}

// --- SOCKET.IO ---
io.on('connection', (socket) => {
  // Gestión Agentes (Igual que antes)
  socket.on('request_agents', async () => {
    if (base) {
        try {
            const records = await base('Agents').select().all();
            const agents = records.map(r => {
                const pass = r.get('password');
                return { id: r.id, name: r.get('name'), role: r.get('role'), hasPassword: !!(pass && String(pass).trim().length > 0) };
            });
            socket.emit('agents_list', agents);
        } catch (e) { console.error(e); }
    }
  });
  socket.on('login_attempt', async (data) => { /* ... lógica de login igual ... */
      if(!base) return;
      try {
          const records = await base('Agents').select({ filterByFormula: `{name} = '${data.name}'`, maxRecords: 1 }).firstPage();
          if (records.length > 0) {
              const dbPassword = records[0].get('password');
              if (!dbPassword || String(dbPassword).trim() === "") { socket.emit('login_success', { username: records[0].get('name'), role: records[0].get('role') }); } 
              else { if (String(dbPassword) === String(data.password)) { socket.emit('login_success', { username: records[0].get('name'), role: records[0].get('role') }); } else { socket.emit('login_error', 'Contraseña incorrecta'); } }
          } else { socket.emit('login_error', 'Usuario no encontrado'); }
      } catch (e) { socket.emit('login_error', 'Error servidor'); }
  });
  socket.on('create_agent', async (data) => { /* ... lógica crear igual ... */
      if (!base) return;
      const { newAgent, adminPassword } = data; 
      try {
          const allAgents = await base('Agents').select().all();
          if (allAgents.length === 0) {
               if (!newAgent.password) { socket.emit('action_error', 'El primer usuario (Admin) debe tener contraseña.'); return; }
               await base('Agents').create([{ fields: { "name": newAgent.name, "role": "Admin", "password": newAgent.password } }]);
               const updated = await base('Agents').select().all();
               io.emit('agents_list', updated.map(r => ({ id: r.id, name: r.get('name'), role: r.get('role'), hasPassword: true })));
               return;
          }
          if (newAgent.role === 'Admin') {
              const existingAdmin = allAgents.find(r => r.get('role') === 'Admin');
              if (existingAdmin) { socket.emit('action_error', 'Ya existe un Administrador.'); return; }
              if (!newAgent.password) { socket.emit('action_error', 'El perfil Admin requiere contraseña.'); return; }
          }
          const adminUser = allAgents.find(r => r.get('role') === 'Admin');
          if (adminUser && String(adminUser.get('password')) !== String(adminPassword)) { socket.emit('action_error', 'Contraseña de Admin incorrecta.'); return; }
          await base('Agents').create([{ fields: { "name": newAgent.name, "role": newAgent.role, "password": newAgent.password || "" } }]);
          const updatedRecords = await base('Agents').select().all();
          io.emit('agents_list', updatedRecords.map(r => { const p = r.get('password'); return { id: r.id, name: r.get('name'), role: r.get('role'), hasPassword: !!(p && String(p).trim().length > 0) }; }));
          socket.emit('action_success', 'Perfil creado');
      } catch (e) { console.error("Error creating:", e); }
  });
  socket.on('delete_agent', async (data) => { /* ... lógica borrar igual ... */
      if (!base) return;
      const { agentId, adminPassword } = data;
      try {
          const records = await base('Agents').select({ filterByFormula: `{role} = 'Admin'`, maxRecords: 1 }).firstPage();
          const admin = records[0];
          if (!admin || String(admin.get('password')) !== String(adminPassword)) { socket.emit('action_error', 'Contraseña incorrecta.'); return; }
          if (admin.id === agentId) { socket.emit('action_error', 'Admin no puede borrarse.'); return; }
          await base('Agents').destroy([agentId]);
          const updatedRecords = await base('Agents').select().all();
          io.emit('agents_list', updatedRecords.map(r => { const p = r.get('password'); return { id: r.id, name: r.get('name'), role: r.get('role'), hasPassword: !!(p && String(p).trim().length > 0) }; }));
          socket.emit('action_success', 'Eliminado');
      } catch (e) { console.error(e); }
  });

  // NUEVO: Enviamos 'assigned_to' al pedir contactos
  socket.on('request_contacts', async () => {
    if (base) {
      try {
        const records = await base('Contacts').select({ sort: [{ field: "last_message_time", direction: "desc" }] }).all();
        socket.emit('contacts_update', records.map(r => {
            const avatarField = r.get('avatar') as any[];
            return {
              id: r.id,
              phone: (r.get('phone') as string) || "",
              name: (r.get('name') as string) || (r.get('phone') as string) || "Desconocido",
              status: (r.get('status') as string) || "Nuevo",
              department: (r.get('department') as string) || "",
              // AÑADIDO: Enviamos quién tiene asignado el chat
              assigned_to: (r.get('assigned_to') as string) || "", 
              last_message: (r.get('last_message') as string) || "",
              last_message_time: (r.get('last_message_time') as string) || new Date().toISOString(),
              avatar: (avatarField && avatarField.length > 0) ? avatarField[0].url : null
            };
        }));
      } catch (e) { console.error("Error contacts:", e); }
    }
  });

  socket.on('request_conversation', async (phone) => { /* ... igual ... */
    if (base) {
      const records = await base('Messages').select({ filterByFormula: `OR({sender} = '${cleanNumber(phone)}', {recipient} = '${cleanNumber(phone)}')`, sort: [{ field: "timestamp", direction: "asc" }] }).all();
      socket.emit('conversation_history', records.map(r => ({ text: (r.get('text') as string) || "", sender: (r.get('sender') as string) || "", timestamp: (r.get('timestamp') as string) || "", type: (r.get('type') as string) || "text", mediaId: (r.get('media_id') as string) || "" })));
    }
  });

  socket.on('update_contact_info', async (data) => { /* ... igual ... */
      if(base) {
          const records = await base('Contacts').select({ filterByFormula: `{phone} = '${cleanNumber(data.phone)}'`, maxRecords: 1 }).firstPage();
          if (records.length > 0) {
              await base('Contacts').update([{ id: records[0].id, fields: data.updates }], { typecast: true });
              io.emit('contact_updated_notification');
          }
      }
  });

  socket.on('chatMessage', async (msg) => { /* ... igual ... */
    const targetPhone = cleanNumber(msg.targetPhone || process.env.TEST_TARGET_PHONE);
    if (waToken && waPhoneId) {
       try {
         await axios.post(`https://graph.facebook.com/v17.0/${waPhoneId}/messages`, { messaging_product: "whatsapp", to: targetPhone, type: "text", text: { body: msg.text } }, { headers: { Authorization: `Bearer ${waToken}` } });
         await saveAndEmitMessage({ text: msg.text, sender: msg.sender, recipient: targetPhone, timestamp: new Date().toISOString() });
         await handleContactUpdate(targetPhone, `Tú (${msg.sender}): ${msg.text}`);
       } catch (error: any) { console.error("Error envío:", error.message); }
    }
  });
});

httpServer.listen(PORT, () => { console.log(`🚀 Listo ${PORT}`); });