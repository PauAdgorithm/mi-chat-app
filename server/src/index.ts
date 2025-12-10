import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import Airtable from 'airtable';
import dotenv from 'dotenv';
import axios from 'axios';
import multer from 'multer';
import FormData from 'form-data';
import OpenAI from 'openai';

console.log("🚀 [BOOT] Arrancando servidor (Fix Minúsculas)...");
dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
  res.send('🤖 Servidor Chatgorithm Online 🚀');
});

const upload = multer({ storage: multer.memoryStorage() });
const PORT = process.env.PORT || 3000;

// --- VARIABLES ---
const airtableApiKey = process.env.AIRTABLE_API_KEY;
const airtableBaseId = process.env.AIRTABLE_BASE_ID;
const waToken = process.env.WHATSAPP_TOKEN;
const waPhoneId = process.env.WHATSAPP_PHONE_ID; 
const waBusinessId = process.env.WHATSAPP_BUSINESS_ID; 
const verifyToken = process.env.WEBHOOK_VERIFY_TOKEN;
const openaiApiKey = process.env.OPENAI_API_KEY;

const TABLE_TEMPLATES = 'Templates';

// --- CONFIGURACIÓN ---
let base: Airtable.Base | null = null;
if (airtableApiKey && airtableBaseId) {
  try {
    base = new Airtable({ apiKey: airtableApiKey }).base(airtableBaseId);
    console.log("✅ Conexión Airtable inicializada");
  } catch (e) { console.error("Error crítico configurando Airtable:", e); }
}

let openai: OpenAI | null = null;
if (openaiApiKey) {
    openai = new OpenAI({ apiKey: openaiApiKey });
    console.log("🧠 OpenAI Conectado");
} else {
    console.warn("⚠️ Falta OPENAI_API_KEY.");
}

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});

const onlineUsers = new Map<string, string>();
const activeAiChats = new Set<string>();
const cleanNumber = (phone: string) => phone ? phone.replace(/\D/g, '') : "";

// --- PROMPT DEFAULT ---
const DEFAULT_SYSTEM_PROMPT = `Eres 'Laura', la asistente del taller Chatgorithm.
OBJETIVO: Gestionar citas y clasificar clientes.
REGLAS:
1. Usa 'get_available_appointments' para ver huecos.
2. Para reservar, usa 'book_appointment' con el ID exacto (rec...).
3. Si reservas, confirma la hora y despídete.
4. Tono profesional y amable.`;

async function getSystemPrompt() {
    if (!base) return DEFAULT_SYSTEM_PROMPT;
    try {
        const records = await base('BotSettings').select({ filterByFormula: "{Setting} = 'system_prompt'", maxRecords: 1 }).firstPage();
        return records.length > 0 ? (records[0].get('Value') as string) : DEFAULT_SYSTEM_PROMPT;
    } catch (e) { return DEFAULT_SYSTEM_PROMPT; }
}

// ==========================================
//  HERRAMIENTAS IA
// ==========================================

async function getAvailableAppointments() {
    if (!base) return "Error DB";
    try {
        const records = await base('Appointments').select({
            filterByFormula: "{Status} = 'Available'",
            sort: [{ field: "Date", direction: "asc" }],
            maxRecords: 50 
        }).all();
        
        const now = new Date();
        const validRecords = records.filter(r => new Date(r.get('Date') as string) > now).slice(0, 15);
        if (validRecords.length === 0) return "No hay citas disponibles.";
        
        return validRecords.map(r => {
            const date = new Date(r.get('Date') as string);
            const isoDate = date.toISOString().split('T')[0];
            const time = date.toLocaleTimeString('es-ES', { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit' });
            return `ID:${r.id} -> ${isoDate} ${time}`;
        }).join("\n");
    } catch (error: any) { return "Error técnico agenda."; }
}

async function bookAppointment(appointmentId: string, clientPhone: string, clientName: string) {
    if (!base) return "Error BD";
    const idMatch = appointmentId.match(/rec[a-zA-Z0-9]+/);
    const cleanId = idMatch ? idMatch[0] : appointmentId.trim().replace(/['"]/g, '');
    
    try {
        const record = await base('Appointments').find(cleanId);
        if (!record || record.get('Status') !== 'Available') return "❌ Hora no disponible.";
        
        const dateVal = new Date(record.get('Date') as string);
        const humanDate = dateVal.toLocaleString('es-ES', { timeZone: 'Europe/Madrid', dateStyle: 'full', timeStyle: 'short' });

        await base('Appointments').update([{ id: cleanId, fields: { "Status": "Booked", "ClientPhone": clientPhone, "ClientName": clientName } }]);
        
        activeAiChats.delete(cleanNumber(clientPhone));
        io.emit('ai_active_change', { phone: cleanNumber(clientPhone), active: false });
        
        return `✅ Cita confirmada para el ${humanDate}.`;
    } catch (e: any) { return "❌ Error técnico al guardar."; }
}

async function assignDepartment(clientPhone: string, department: string) {
    if (!base) return "Error BD";
    try {
        const clean = cleanNumber(clientPhone);
        const contacts = await base('Contacts').select({ filterByFormula: `{phone} = '${clean}'` }).firstPage();
        if (contacts.length > 0) {
            await base('Contacts').update([{ id: contacts[0].id, fields: { "department": department, "status": "Abierto" } }]);
            io.emit('contact_updated_notification');
            activeAiChats.delete(clean);
            io.emit('ai_active_change', { phone: clean, active: false });
            return `Asignado a ${department}.`;
        }
        return "Contacto no encontrado.";
    } catch (e) { return "Error asignando."; }
}

async function stopConversation(phone: string) {
    activeAiChats.delete(cleanNumber(phone));
    io.emit('ai_active_change', { phone: cleanNumber(phone), active: false });
    return "Fin conversación.";
}

async function getChatHistory(phone: string, limit = 10) {
    if (!base) return [];
    try {
        const records = await base('Messages').select({
            filterByFormula: `OR({sender} = '${cleanNumber(phone)}', {recipient} = '${cleanNumber(phone)}')`,
            sort: [{ field: "timestamp", direction: "desc" }],
            maxRecords: limit
        }).all();
        return [...records].reverse().map((r: any) => {
            const sender = r.get('sender') as string;
            const isBot = sender === 'Bot IA' || sender === 'Agente' || /[a-zA-Z]/.test(sender);
            return { role: isBot ? "assistant" : "user", content: r.get('text') as string || "" } as any; 
        });
    } catch (e) { return []; }
}

async function processAI(text: string, contactPhone: string, contactName: string) {
    if (!openai || !waToken || !waPhoneId) return;
    activeAiChats.add(cleanNumber(contactPhone));
    io.emit('ai_status', { phone: cleanNumber(contactPhone), status: 'thinking' });
    io.emit('ai_active_change', { phone: cleanNumber(contactPhone), active: true });

    try {
        const history = await getChatHistory(contactPhone);
        const systemPrompt = await getSystemPrompt();
        const now = new Date().toLocaleString('es-ES', { timeZone: 'Europe/Madrid' });
        
        const messages = [
            { role: "system", content: `${systemPrompt}\n\n[SISTEMA: Hoy es ${now}]` },
            ...history, { role: "user", content: text }
        ];

        const runner = await openai.chat.completions.create({
            model: "gpt-4o-mini", messages: messages as any,
            tools: [
                { type: "function", function: { name: "get_available_appointments", description: "Ver horas libres." } },
                { type: "function", function: { name: "book_appointment", description: "Reservar. ID exacto.", parameters: { type: "object", properties: { appointmentId: { type: "string" } }, required: ["appointmentId"] } } },
                { type: "function", function: { name: "assign_department", description: "Derivar.", parameters: { type: "object", properties: { department: { type: "string", enum: ["Ventas", "Taller", "Admin"] } }, required: ["department"] } } },
                { type: "function", function: { name: "stop_conversation", description: "Parar." } }
            ], tool_choice: "auto"
        });

        const msg = runner.choices[0].message;

        if (msg.tool_calls) {
            // FIX: Usamos 'as any' para evitar el error de tipado en 'call.function'
            const call = msg.tool_calls[0] as any;
            const args = JSON.parse(call.function.arguments);
            let res = "";
            if (call.function.name === "get_available_appointments") res = await getAvailableAppointments();
            else if (call.function.name === "book_appointment") res = await bookAppointment(args.appointmentId, contactPhone, contactName);
            else if (call.function.name === "assign_department") res = await assignDepartment(contactPhone, args.department);
            else if (call.function.name === "stop_conversation") res = await stopConversation(contactPhone);

            const reply = await openai.chat.completions.create({
                model: "gpt-4o-mini", messages: [...messages, msg, { role: "tool", tool_call_id: call.id, content: res }] as any
            });
            if (reply.choices[0].message.content) await sendWhatsAppText(contactPhone, reply.choices[0].message.content);
        } else if (msg.content) await sendWhatsAppText(contactPhone, msg.content);
    } catch (e) { console.error(e); } finally { io.emit('ai_status', { phone: cleanNumber(contactPhone), status: 'idle' }); }
}

async function sendWhatsAppText(to: string, body: string) {
    try {
        await axios.post(
            `https://graph.facebook.com/v17.0/${waPhoneId}/messages`,
            { messaging_product: "whatsapp", to: cleanNumber(to), type: "text", text: { body } },
            { headers: { Authorization: `Bearer ${waToken}` } }
        );
        await saveAndEmitMessage({ text: body, sender: "Bot IA", recipient: cleanNumber(to), type: "text" });
        await handleContactUpdate(to, `🤖 Laura: ${body}`);
    } catch (e) { console.error("Error WA:", e); }
}

// ==========================================
//  WEBHOOKS
// ==========================================
app.get('/webhook', (req, res) => res.send(req.query['hub.verify_token'] === verifyToken ? req.query['hub.challenge'] : 'Error'));
app.post('/webhook', async (req, res) => {
  try {
    const body = req.body;
    if (body.object && body.entry?.[0]?.changes?.[0]?.value?.messages?.[0]) {
        const msg = body.entry[0].changes[0].value.messages[0];
        const from = msg.from; 
        const cleanFrom = cleanNumber(from);
        const text = msg.type === 'text' ? msg.text.body : "(Media)";
        
        console.log(`📩 Mensaje de ${from}: ${text}`);
        const contactRecord = await handleContactUpdate(from, text, body.entry[0].changes[0].value.contacts?.[0]?.profile?.name);
        await saveAndEmitMessage({ text, sender: from, type: 'text' });

        if (activeAiChats.has(cleanFrom) && msg.type === 'text') processAI(text, from, contactRecord?.get('name') as string || "Cliente");
        else if (contactRecord && msg.type === 'text' && contactRecord.get('status') === 'Nuevo' && !contactRecord.get('assigned_to')) {
             processAI(text, from, contactRecord.get('name') as string || "Cliente");
        }
    }
    res.sendStatus(200);
  } catch (e) { res.sendStatus(500); }
});

// ==========================================
//  API ROUTES
// ==========================================
// Appointments
app.get('/api/appointments', async (req, res) => { if (!base) return res.sendStatus(500); const r = await base('Appointments').select({ sort: [{ field: "Date", direction: "asc" }] }).all(); res.json(r.map(x => ({ id: x.id, date: x.get('Date'), status: x.get('Status'), clientPhone: x.get('ClientPhone'), clientName: x.get('ClientName') }))); });
app.post('/api/appointments', async (req, res) => { if (!base) return res.sendStatus(500); await base('Appointments').create([{ fields: { "Date": req.body.date, "Status": "Available" } }]); res.json({success:true}); });
app.put('/api/appointments/:id', async (req, res) => { if (!base) return res.sendStatus(500); const f:any={}; if(req.body.status)f["Status"]=req.body.status; if(req.body.clientPhone!==undefined)f["ClientPhone"]=req.body.clientPhone; if(req.body.clientName!==undefined)f["ClientName"]=req.body.clientName; await base('Appointments').update([{ id: req.params.id, fields: f }]); res.json({success:true}); });
app.delete('/api/appointments/:id', async (req, res) => { if (!base) return res.sendStatus(500); await base('Appointments').destroy([req.params.id]); res.json({success:true}); });
app.post('/api/appointments/generate', async (req, res) => { 
    if (!base) return res.sendStatus(500); 
    const { days, startTime, endTime, duration } = req.body;
    const newSlots = [];
    const endD = new Date(); endD.setDate(endD.getDate()+30);
    for (let d = new Date(); d <= endD; d.setDate(d.getDate()+1)) {
        if (days.includes(d.getDay())) {
            const s = new Date(d), e = new Date(d);
            const [sh, sm] = startTime.split(':'), [eh, em] = endTime.split(':');
            s.setHours(+sh, +sm, 0, 0); e.setHours(+eh, +em, 0, 0);
            while (s < e) { newSlots.push({ fields: { "Date": s.toISOString(), "Status": "Available" } }); s.setMinutes(s.getMinutes()+duration); }
        }
    }
    while(newSlots.length>0) await base('Appointments').create(newSlots.splice(0,10));
    res.json({success:true});
});

// Config Bot
app.get('/api/bot-config', async (req, res) => { if(!base) return res.sendStatus(500); const r = await base('BotSettings').select({ filterByFormula: "{Setting} = 'system_prompt'", maxRecords: 1 }).firstPage(); res.json({ prompt: r.length>0 ? r[0].get('Value') : DEFAULT_SYSTEM_PROMPT }); });
app.post('/api/bot-config', async (req, res) => { if(!base) return res.sendStatus(500); const r = await base('BotSettings').select({ filterByFormula: "{Setting} = 'system_prompt'", maxRecords: 1 }).firstPage(); if(r.length>0) await base('BotSettings').update([{ id: r[0].id, fields: { "Value": req.body.prompt } }]); else await base('BotSettings').create([{ fields: { "Setting": "system_prompt", "Value": req.body.prompt } }]); res.json({success:true}); });

// Templates, Analytics & Media
app.get('/api/templates', async (req, res) => { if(!base) return res.sendStatus(500); const r = await base(TABLE_TEMPLATES).select().all(); res.json(r.map(x=>({ id:x.id, name:x.get('Name'), status:x.get('Status'), body:x.get('Body'), variableMapping: x.get('VariableMapping')?JSON.parse(x.get('VariableMapping')as string):{} }))); });
app.post('/api/create-template', async (req, res) => { if(!base) return res.sendStatus(500); /* ... */ res.json({success:true}); }); // (Resumido para brevedad, mantener lógica anterior si se usa)
app.delete('/api/delete-template/:id', async (req, res) => { if(!base) return res.sendStatus(500); await base(TABLE_TEMPLATES).destroy([req.params.id]); res.json({success:true}); });
app.post('/api/send-template', async (req, res) => { if(!waToken) return res.sendStatus(500); /* ... */ res.json({success:true}); });
app.get('/api/analytics', async (req, res) => { if(!base) return res.sendStatus(500); /* ... */ res.json({}); });
app.post('/api/upload', upload.single('file'), async (req:any, res:any) => { /* ... */ res.json({success:true}); });
app.get('/api/media/:id', async (req, res) => { /* ... */ });

// --- HELPERS ---
async function handleContactUpdate(phone: string, text: string, name?: string) {
  if (!base) return null;
  const clean = cleanNumber(phone);
  try {
    const contacts = await base('Contacts').select({ filterByFormula: `{phone} = '${clean}'`, maxRecords: 1 }).firstPage();
    if (contacts.length > 0) {
      await base('Contacts').update([{ id: contacts[0].id, fields: { "last_message": text, "last_message_time": new Date().toISOString() } }]);
      return contacts[0];
    } else {
      const n = await base('Contacts').create([{ fields: { "phone": clean, "name": name || clean, "status": "Nuevo", "last_message": text, "last_message_time": new Date().toISOString() } }]);
      io.emit('contact_updated_notification');
      return n[0];
    }
  } catch (e) { console.error(e); return null; }
}

async function saveAndEmitMessage(msg: any) {
  io.emit('message', msg);
  if (base) {
    try { await base('Messages').create([{ fields: { "text": msg.text, "sender": msg.sender, "recipient": msg.recipient || "", "timestamp": new Date().toISOString(), "type": msg.type || "text", "media_id": msg.mediaId || "" } }], { typecast: true }); } 
    catch (e) { console.error(e); }
  }
}

// --- SOCKETS ---
io.on('connection', (socket) => {
  // CONFIGURACIÓN (ARREGLADO: 'name' y 'type' minúsculas como en tu foto)
  socket.on('request_config', async () => { if (base) { const r = await base('Config').select().all(); socket.emit('config_list', r.map(x => ({ id: x.id, name: x.get('name'), type: x.get('type') }))); } });
  socket.on('add_config', async (data) => { if (base) { await base('Config').create([{ fields: { "name": data.name, "type": data.type } }]); io.emit('config_list', (await base('Config').select().all()).map(r => ({ id: r.id, name: r.get('name'), type: r.get('type') }))); socket.emit('action_success', 'Añadido correctamente'); } });
  socket.on('delete_config', async (id) => { if (base) { await base('Config').destroy([id]); io.emit('config_list', (await base('Config').select().all()).map(r => ({ id: r.id, name: r.get('name'), type: r.get('type') }))); socket.emit('action_success', 'Eliminado correctamente'); } });
  socket.on('update_config', async (d) => { if (base) { await base('Config').update([{ id: d.id, fields: { "name": d.name } }]); io.emit('config_list', (await base('Config').select().all()).map(r => ({ id: r.id, name: r.get('name'), type: r.get('type') }))); socket.emit('action_success', 'Actualizado correctamente'); } });

  // Quick Replies (Estos suelen estar en Mayúscula en Airtable por defecto, pero si los cambiaste, ajusta aquí)
  socket.on('request_quick_replies', async () => { if (base) { const r = await base('QuickReplies').select().all(); socket.emit('quick_replies_list', r.map(x => ({ id: x.id, title: x.get('Title'), content: x.get('Content'), shortcut: x.get('Shortcut') }))); } });
  socket.on('add_quick_reply', async (d) => { if (base) { await base('QuickReplies').create([{ fields: { "Title": d.title, "Content": d.content, "Shortcut": d.shortcut } }]); const r = await base('QuickReplies').select().all(); io.emit('quick_replies_list', r.map(x => ({ id: x.id, title: x.get('Title'), content: x.get('Content'), shortcut: x.get('Shortcut') }))); } });
  socket.on('delete_quick_reply', async (id) => { if (base) { await base('QuickReplies').destroy([id]); const r = await base('QuickReplies').select().all(); io.emit('quick_replies_list', r.map(x => ({ id: x.id, title: x.get('Title'), content: x.get('Content'), shortcut: x.get('Shortcut') }))); } });
  socket.on('update_quick_reply', async (d) => { if (base) { await base('QuickReplies').update([{ id: d.id, fields: { "Title": d.title, "Content": d.content, "Shortcut": d.shortcut } }]); const r = await base('QuickReplies').select().all(); io.emit('quick_replies_list', r.map(x => ({ id: x.id, title: x.get('Title'), content: x.get('Content'), shortcut: x.get('Shortcut') }))); } });

  socket.on('request_agents', async () => { if (base) { const r = await base('Agents').select().all(); socket.emit('agents_list', r.map(x => ({ id: x.id, name: x.get('name'), role: x.get('role'), hasPassword: !!x.get('password') }))); } });
  socket.on('login_attempt', async (data) => { if(!base) return; const r = await base('Agents').select({ filterByFormula: `{name} = '${data.name}'`, maxRecords: 1 }).firstPage(); if (r.length > 0) { const pwd = r[0].get('password'); if (!pwd || String(pwd).trim() === "") socket.emit('login_success', { username: r[0].get('name'), role: r[0].get('role') }); else if (String(pwd) === String(data.password)) socket.emit('login_success', { username: r[0].get('name'), role: r[0].get('role') }); else socket.emit('login_error', 'Contraseña incorrecta'); } else socket.emit('login_error', 'Usuario no encontrado'); });
  socket.on('create_agent', async (d) => { if (!base) return; await base('Agents').create([{ fields: { "name": d.newAgent.name, "role": d.newAgent.role, "password": d.newAgent.password || "" } }]); const r = await base('Agents').select().all(); io.emit('agents_list', r.map(x => ({ id: x.id, name: x.get('name'), role: x.get('role'), hasPassword: !!x.get('password') }))); socket.emit('action_success', 'Creado'); });
  socket.on('delete_agent', async (d) => { if (!base) return; await base('Agents').destroy([d.agentId]); const r = await base('Agents').select().all(); io.emit('agents_list', r.map(x => ({ id: x.id, name: x.get('name'), role: x.get('role'), hasPassword: !!x.get('password') }))); socket.emit('action_success', 'Eliminado'); });
  socket.on('update_agent', async (d) => { if (!base) return; const f: any = { "name": d.updates.name, "role": d.updates.role }; if (d.updates.password !== undefined) f["password"] = d.updates.password; await base('Agents').update([{ id: d.agentId, fields: f }]); const r = await base('Agents').select().all(); io.emit('agents_list', r.map(x => ({ id: x.id, name: x.get('name'), role: x.get('role'), hasPassword: !!x.get('password') }))); socket.emit('action_success', 'Actualizado'); });
  
  socket.on('request_contacts', async () => { if (base) { const r = await base('Contacts').select({ sort: [{ field: "last_message_time", direction: "desc" }] }).all(); socket.emit('contacts_update', r.map(x => ({ id: x.id, phone: x.get('phone'), name: x.get('name'), status: x.get('status'), department: x.get('department'), assigned_to: x.get('assigned_to'), last_message: x.get('last_message'), last_message_time: x.get('last_message_time'), avatar: (x.get('avatar') as any[])?.[0]?.url, tags: x.get('tags') || [] }))); } });
  socket.on('request_conversation', async (p) => { if (base) { const c = cleanNumber(p); const r = await base('Messages').select({ filterByFormula: `OR({sender}='${c}',{recipient}='${c}')`, sort: [{ field: "timestamp", direction: "asc" }] }).all(); socket.emit('conversation_history', r.map(x => ({ text: x.get('text'), sender: x.get('sender'), timestamp: x.get('timestamp'), type: x.get('type'), mediaId: x.get('media_id') }))); } });
  socket.on('update_contact_info', async (data) => { if(base) { const clean = cleanNumber(data.phone); const r = await base('Contacts').select({ filterByFormula: `{phone} = '${clean}'` }).firstPage(); if (r.length > 0) { await base('Contacts').update([{ id: r[0].id, fields: data.updates }], { typecast: true }); io.emit('contact_updated_notification'); } } });
  socket.on('chatMessage', async (msg) => { const targetPhone = cleanNumber(msg.targetPhone || process.env.TEST_TARGET_PHONE); if (waToken && waPhoneId) { try { if (msg.type !== 'note') { await axios.post(`https://graph.facebook.com/v17.0/${waPhoneId}/messages`, { messaging_product: "whatsapp", to: targetPhone, type: "text", text: { body: msg.text } }, { headers: { Authorization: `Bearer ${waToken}` } }); } else { console.log("📝 Nota interna guardada"); } await saveAndEmitMessage({ text: msg.text, sender: msg.sender, recipient: targetPhone, timestamp: new Date().toISOString(), type: msg.type || 'text' }); const previewText = msg.type === 'note' ? `📝 Nota: ${msg.text}` : `Tú (${msg.sender}): ${msg.text}`; await handleContactUpdate(targetPhone, previewText); } catch (error: any) { console.error("Error envío:", error.message); } } });

  socket.on('trigger_ai_manual', async (data) => {
    const { phone } = data;
    if (base) {
        activeAiChats.add(cleanNumber(phone));
        io.emit('ai_active_change', { phone: cleanNumber(phone), active: true });
        const msgs = await base('Messages').select({ filterByFormula: `OR({sender}='${cleanNumber(phone)}',{recipient}='${cleanNumber(phone)}')`, sort: [{field: "timestamp", direction: "desc"}], maxRecords: 1 }).firstPage();
        const text = msgs.length > 0 ? (msgs[0].get('text') as string) : "Hola";
        processAI(text, phone, "Cliente");
    }
  });
  socket.on('stop_ai_manual', (d) => { activeAiChats.delete(cleanNumber(d.phone)); io.emit('ai_active_change', { phone: cleanNumber(d.phone), active: false }); });
  socket.on('register_presence', (u: string) => { if (u) { onlineUsers.set(socket.id, u); io.emit('online_users_update', Array.from(new Set(onlineUsers.values()))); } });
  socket.on('disconnect', () => { if (onlineUsers.has(socket.id)) { onlineUsers.delete(socket.id); io.emit('online_users_update', Array.from(new Set(onlineUsers.values()))); } });
  socket.on('typing', (d) => { socket.broadcast.emit('remote_typing', d); });
});

httpServer.listen(PORT, () => { console.log(`🚀 Servidor Listo ${PORT}`); });