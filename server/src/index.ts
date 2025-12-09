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

console.log("🚀 [BOOT] Arrancando servidor con IA Configurable...");
dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
  res.send('🤖 Servidor Chatgorithm (Laura v10) funcionando correctamente 🚀');
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

// --- PROMPT POR DEFECTO (Si no hay nada en Airtable) ---
const DEFAULT_SYSTEM_PROMPT = `Eres 'Laura', la asistente del taller Chatgorithm.
TU OBJETIVO: Gestionar citas y clasificar clientes.
REGLAS:
1. Usa SIEMPRE 'get_available_appointments' para ver horas reales.
2. Para reservar, usa 'book_appointment' con el ID exacto.
3. Si asignas departamento o el cliente se despide, usa 'stop_conversation'.
4. Tono profesional, amable, SIN EMOJIS.`;

// ==========================================
//  HELPER: OBTENER PROMPT DINÁMICO
// ==========================================
async function getSystemPrompt() {
    if (!base) return DEFAULT_SYSTEM_PROMPT;
    try {
        const records = await base('BotSettings').select({
            filterByFormula: "{Setting} = 'system_prompt'",
            maxRecords: 1
        }).firstPage();

        if (records.length > 0) {
            return records[0].get('Value') as string;
        } else {
            // Si no existe, lo creamos para que el usuario pueda editarlo luego
            await base('BotSettings').create([{ fields: { "Setting": "system_prompt", "Value": DEFAULT_SYSTEM_PROMPT } }]);
            return DEFAULT_SYSTEM_PROMPT;
        }
    } catch (e) {
        console.error("Error leyendo BotSettings (¿Creaste la tabla?):", e);
        return DEFAULT_SYSTEM_PROMPT;
    }
}

// ==========================================
//  HERRAMIENTAS IA
// ==========================================

async function getAvailableAppointments() {
    if (!base) return "Error: Base de datos no conectada";
    try {
        console.log("🔍 IA solicitando agenda...");
        const records = await base('Appointments').select({
            filterByFormula: "{Status} = 'Available'",
            sort: [{ field: "Date", direction: "asc" }],
            maxRecords: 50 
        }).all();
        
        const now = new Date();
        const validRecords = records.filter(r => new Date(r.get('Date') as string) > now).slice(0, 15);

        if (validRecords.length === 0) return "No hay citas disponibles. Pide al cliente otra fecha.";
        
        return validRecords.map(r => {
            const date = new Date(r.get('Date') as string);
            const isoDate = date.toISOString().split('T')[0];
            const time = date.toLocaleTimeString('es-ES', { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit' });
            const weekday = date.toLocaleDateString('es-ES', { timeZone: 'Europe/Madrid', weekday: 'long' });
            return `ID:${r.id} - ${weekday} ${isoDate} a las ${time}`;
        }).join("\n");
    } catch (error: any) {
        return "Error técnico al leer la agenda.";
    }
}

async function bookAppointment(appointmentId: string, clientPhone: string, clientName: string) {
    if (!base) return "Error BD";
    let cleanId = appointmentId.trim().replace(/['"]/g, '');
    if (cleanId.toUpperCase().startsWith("ID:")) cleanId = cleanId.substring(3).trim();
    if (cleanId.toUpperCase().startsWith("ID")) cleanId = cleanId.substring(2).trim();
    if (cleanId.endsWith(".")) cleanId = cleanId.slice(0, -1);
    
    console.log(`📅 RESERVA: ID "${cleanId}" para ${clientName}`);
    
    try {
        const record = await base('Appointments').find(cleanId);
        if (!record) return "❌ Error: ID no encontrado.";
        if (record.get('Status') !== 'Available') return "❌ Esa hora ya no está libre.";

        // Formato humano para confirmar
        const dateVal = new Date(record.get('Date') as string);
        const humanDate = dateVal.toLocaleString('es-ES', { timeZone: 'Europe/Madrid', dateStyle: 'full', timeStyle: 'short' });

        await base('Appointments').update([{ id: cleanId, fields: { "Status": "Booked", "ClientPhone": clientPhone, "ClientName": clientName } }]);
        
        activeAiChats.delete(cleanNumber(clientPhone));
        io.emit('ai_active_change', { phone: cleanNumber(clientPhone), active: false });
        
        return `✅ RESERVA ÉXITO para el ${humanDate}. CONFIRMA AL CLIENTE.`;
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
    return "Fin de conversación.";
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

// ==========================================
//  PROCESADOR INTELIGENTE (USANDO PROMPT DINÁMICO)
// ==========================================

async function processAI(text: string, contactPhone: string, contactName: string) {
    if (!openai || !waToken || !waPhoneId) return;
    
    activeAiChats.add(cleanNumber(contactPhone));
    io.emit('ai_status', { phone: cleanNumber(contactPhone), status: 'thinking' });
    io.emit('ai_active_change', { phone: cleanNumber(contactPhone), active: true });

    try {
        const history = await getChatHistory(contactPhone);
        
        // 1. CARGAMOS EL PROMPT DESDE AIRTABLE
        const systemPrompt = await getSystemPrompt();
        
        const now = new Date().toLocaleString('es-ES', { 
            timeZone: 'Europe/Madrid', weekday: 'long', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' 
        });

        const messages = [
            { role: "system", content: `${systemPrompt}\n\n[CONTEXTO ACTUAL: ${now}]` },
            ...history, 
            { role: "user", content: text } 
        ];

        const runner = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: messages as any,
            tools: [
                { type: "function", function: { name: "get_available_appointments", description: "Ver lista de ID y Fechas libres." } },
                { type: "function", function: { name: "book_appointment", description: "Reservar cita. REQUIERE ID.", parameters: { type: "object", properties: { appointmentId: { type: "string" } }, required: ["appointmentId"] } } },
                { type: "function", function: { name: "assign_department", description: "Derivar a humano.", parameters: { type: "object", properties: { department: { type: "string", enum: ["Ventas", "Taller", "Admin"] } }, required: ["department"] } } },
                { type: "function", function: { name: "stop_conversation", description: "Detener bot." } }
            ],
            tool_choice: "auto"
        });

        const msg = runner.choices[0].message;

        if (msg.tool_calls && msg.tool_calls.length > 0) {
            const toolCall = msg.tool_calls[0];
            // @ts-ignore
            const fnName = toolCall.function.name;
            // @ts-ignore
            const args = JSON.parse(toolCall.function.arguments);
            let toolResult = "";

            if (fnName === "get_available_appointments") toolResult = await getAvailableAppointments();
            else if (fnName === "book_appointment") toolResult = await bookAppointment(args.appointmentId, contactPhone, contactName);
            else if (fnName === "assign_department") toolResult = await assignDepartment(contactPhone, args.department);
            else if (fnName === "stop_conversation") toolResult = await stopConversation(contactPhone);

            const secondResponse = await openai.chat.completions.create({
                model: "gpt-4o-mini",
                messages: [ ...messages, msg, { role: "tool", tool_call_id: toolCall.id, content: toolResult } ] as any
            });
            
            const finalReply = secondResponse.choices[0].message.content;
            if (finalReply) await sendWhatsAppText(contactPhone, finalReply);

        } else if (msg.content) {
            await sendWhatsAppText(contactPhone, msg.content);
        }

    } catch (error) { console.error("❌ Error OpenAI:", error); } finally { io.emit('ai_status', { phone: cleanNumber(contactPhone), status: 'idle' }); }
}

async function sendWhatsAppText(to: string, body: string) {
    try {
        await axios.post(
            `https://graph.facebook.com/v17.0/${waPhoneId}/messages`,
            { messaging_product: "whatsapp", to: cleanNumber(to), type: "text", text: { body } },
            { headers: { Authorization: `Bearer ${waToken}` } }
        );
        await saveAndEmitMessage({ 
            text: body, sender: "Bot IA", recipient: cleanNumber(to), 
            timestamp: new Date().toISOString(), type: "text" 
        });
        await handleContactUpdate(to, `🤖 Laura: ${body}`);
    } catch (e) { console.error("Error enviando WA:", e); }
}

// ==========================================
//  WEBHOOKS
// ==========================================
app.get('/webhook', (req, res) => { if (req.query['hub.mode'] === 'subscribe' && req.query['hub.verify_token'] === verifyToken) res.status(200).send(req.query['hub.challenge']); else res.sendStatus(403); });
app.post('/webhook', async (req, res) => {
  try {
    const body = req.body;
    if (body.object && body.entry?.[0]?.changes?.[0]?.value?.messages?.[0]) {
        const msg = body.entry[0].changes[0].value.messages[0];
        const from = msg.from; 
        const cleanFrom = cleanNumber(from);
        let text = "(Media)";
        if (msg.type === 'text') text = msg.text.body;

        console.log(`📩 Mensaje de ${from}: ${text}`);

        const contactRecord = await handleContactUpdate(from, text, body.entry[0].changes[0].value.contacts?.[0]?.profile?.name);
        await saveAndEmitMessage({ text, sender: from, timestamp: new Date().toISOString(), type: 'text' });

        if (activeAiChats.has(cleanFrom) && msg.type === 'text') {
             processAI(text, from, contactRecord?.get('name') as string || "Cliente");
        } else if (contactRecord && msg.type === 'text') {
             const status = contactRecord.get('status');
             const assigned = contactRecord.get('assigned_to');
             if (status === 'Nuevo' && !assigned) {
                 processAI(text, from, contactRecord.get('name') as string || "Cliente");
             }
        }
    }
    
    if (body.object && body.entry?.[0]?.changes?.[0]?.field === 'message_template_status_update') {
        const event = body.entry[0].changes[0].value;
        const metaId = event.message_template_id;
        const newStatus = event.event; 
        if (base) {
            try {
                const records = await base(TABLE_TEMPLATES).select({ filterByFormula: `{MetaId} = '${metaId}'` }).firstPage();
                if (records.length > 0) await base(TABLE_TEMPLATES).update([{ id: records[0].id, fields: { "Status": newStatus } }]);
            } catch(e) { console.error("Error status plantilla:", e); }
        }
    }
    res.sendStatus(200);
  } catch (e) { res.sendStatus(500); }
});

// ==========================================
//  RUTAS DE CONFIGURACIÓN DEL BOT (NUEVAS)
// ==========================================

app.get('/api/bot-config', async (req, res) => {
    if (!base) return res.status(500).json({ error: "DB" });
    try {
        const records = await base('BotSettings').select({
            filterByFormula: "{Setting} = 'system_prompt'",
            maxRecords: 1
        }).firstPage();
        
        let prompt = DEFAULT_SYSTEM_PROMPT;
        if (records.length > 0) prompt = records[0].get('Value') as string;
        
        res.json({ prompt });
    } catch(e) { res.status(500).json({error: "Error fetching config"}); }
});

app.post('/api/bot-config', async (req, res) => {
    if (!base) return res.status(500).json({ error: "DB" });
    try {
        const { prompt } = req.body;
        
        // Buscamos si ya existe
        const records = await base('BotSettings').select({
            filterByFormula: "{Setting} = 'system_prompt'",
            maxRecords: 1
        }).firstPage();

        if (records.length > 0) {
            // Actualizar
            await base('BotSettings').update([{ id: records[0].id, fields: { "Value": prompt } }]);
        } else {
            // Crear
            await base('BotSettings').create([{ fields: { "Setting": "system_prompt", "Value": prompt } }]);
        }
        res.json({ success: true });
    } catch(e) { res.status(500).json({error: "Error saving config"}); }
});

// ... (RESTO DE RUTAS IGUALES: CALENDARIO, PLANTILLAS, ANALYTICS, ETC) ...

app.get('/api/appointments', async (req, res) => { if (!base) return res.status(500).json({}); const r = await base('Appointments').select({ sort: [{ field: "Date", direction: "asc" }] }).all(); res.json(r.map(x => ({ id: x.id, date: x.get('Date'), status: x.get('Status'), clientPhone: x.get('ClientPhone'), clientName: x.get('ClientName') }))); });
app.post('/api/appointments', async (req, res) => { if (!base) return res.status(500).json({}); await base('Appointments').create([{ fields: { "Date": req.body.date, "Status": req.body.status || 'Available' } }]); res.json({success:true}); });
app.put('/api/appointments/:id', async (req, res) => { if (!base) return res.status(500).json({}); const f:any={}; if(req.body.date)f["Date"]=req.body.date; if(req.body.status)f["Status"]=req.body.status; if(req.body.clientPhone!==undefined)f["ClientPhone"]=req.body.clientPhone; if(req.body.clientName!==undefined)f["ClientName"]=req.body.clientName; await base('Appointments').update([{ id: req.params.id, fields: f }]); res.json({success:true}); });
app.delete('/api/appointments/:id', async (req, res) => { if (!base) return res.status(500).json({}); await base('Appointments').destroy([req.params.id]); res.json({success:true}); });
app.post('/api/appointments/generate', async (req, res) => { if (!base) return res.status(500).json({}); /* Lógica generar igual */ res.json({success:true}); });

app.get('/api/templates', async (req, res) => { if (!base) return res.status(500).json({}); const r = await base(TABLE_TEMPLATES).select().all(); res.json(r.map(x => ({ id: x.id, name: x.get('Name'), status: x.get('Status'), body: x.get('Body'), variableMapping: x.get('VariableMapping') ? JSON.parse(x.get('VariableMapping') as string) : {} }))); });
app.post('/api/create-template', async (req, res) => { if (!base) return res.status(500).json({}); /* Create template logic */ res.json({success:true}); });
app.delete('/api/delete-template/:id', async (req, res) => { if (!base) return res.status(500).json({}); await base(TABLE_TEMPLATES).destroy([req.params.id]); res.json({success:true}); });
app.post('/api/send-template', async (req, res) => { if (!waToken) return res.status(500).json({}); /* Send template logic */ res.json({success:true}); });

app.get('/api/analytics', async (req, res) => { if (!base) return res.status(500).json({}); /* Analytics logic */ res.json({}); });
app.post('/api/upload', upload.single('file'), async (req: any, res: any) => { /* Upload logic */ res.json({success:true}); });
app.get('/api/media/:id', async (req, res) => { /* Media logic */ });

// --- HELPERS ---
async function handleContactUpdate(phone: string, text: string, profileName?: string) { if (!base) return null; const clean = cleanNumber(phone); try { const contacts = await base('Contacts').select({ filterByFormula: `{phone} = '${clean}'`, maxRecords: 1 }).firstPage(); if (contacts.length > 0) { await base('Contacts').update([{ id: contacts[0].id, fields: { "last_message": text, "last_message_time": new Date().toISOString() } }]); return contacts[0]; } else { const newContact = await base('Contacts').create([{ fields: { "phone": clean, "name": profileName || clean, "status": "Nuevo", "last_message": text, "last_message_time": new Date().toISOString() } }]); io.emit('contact_updated_notification'); return newContact[0]; } } catch (e) { console.error("Error Contactos:", e); return null; } }
async function saveAndEmitMessage(msg: any) { io.emit('message', msg); if (base) { try { await base('Messages').create([{ fields: { "text": msg.text, "sender": msg.sender, "recipient": msg.recipient, "timestamp": msg.timestamp, "type": msg.type, "media_id": msg.mediaId || "" } }], { typecast: true }); } catch (e) { console.error("Error guardando:", e); } } }

// --- SOCKETS ---
io.on('connection', (socket) => {
  // ... (Tus sockets anteriores) ...
  // Mantén todos los sockets que ya funcionaban: request_config, agents, chat, trigger_ai_manual...
  socket.on('request_config', async () => { if (base) { const r = await base('Config').select().all(); socket.emit('config_list', r.map(x => ({ id: x.id, name: x.get('Name'), type: x.get('Type') }))); } });
  socket.on('trigger_ai_manual', async (data) => {
    const { phone } = data;
    if (base) {
        activeAiChats.add(cleanNumber(phone));
        io.emit('ai_active_change', { phone: cleanNumber(phone), active: true });
        const msgs = await base('Messages').select({ filterByFormula: `OR({sender}='${cleanNumber(phone)}',{recipient}='${cleanNumber(phone)}')`, sort: [{field: "timestamp", direction: "desc"}], maxRecords: 1 }).firstPage();
        processAI(msgs.length > 0 ? msgs[0].get('text') as string : "Hola", phone, "Cliente");
    }
  });
  // ...
});

httpServer.listen(PORT, () => { console.log(`🚀 Servidor Listo en puerto ${PORT}`); });