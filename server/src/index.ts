import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import Airtable from 'airtable';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
app.use(cors());

// Configuración básica
const PORT = process.env.PORT || 3000;

// Configurar Airtable
// Si no hay claves, avisamos por consola pero no explotamos al inicio
const airtableApiKey = process.env.AIRTABLE_API_KEY;
const airtableBaseId = process.env.AIRTABLE_BASE_ID;

let base: Airtable.Base | null = null;

if (airtableApiKey && airtableBaseId) {
  Airtable.configure({ apiKey: airtableApiKey });
  base = Airtable.base(airtableBaseId);
  console.log("✅ Airtable configurado correctamente");
} else {
  console.warn("⚠️ FALTA CONFIGURACIÓN DE AIRTABLE (API KEY o BASE ID)");
}

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "*", // Permitir conexiones desde cualquier lugar (Frontend Render)
    methods: ["GET", "POST"]
  }
});

io.on('connection', async (socket) => {
  console.log(`Usuario conectado: ${socket.id}`);

  // 1. CARGAR HISTORIAL AL CONECTARSE
  if (base) {
    try {
      const records = await base('Messages').select({
        maxRecords: 50,
        sort: [{ field: "timestamp", direction: "asc" }] // Los más viejos primero
      }).all();

      const history = records.map(record => ({
        text: record.get('text'),
        sender: record.get('sender'),
        timestamp: record.get('timestamp')
      }));

      // Enviamos el historial solo a este usuario
      socket.emit('history', history);
    } catch (error) {
      console.error("❌ Error leyendo Airtable:", error);
    }
  }

  socket.on('login', (data) => {
    console.log(`👤 Usuario logueado: ${data.username}`);
  });

  // 2. GUARDAR MENSAJE AL RECIBIRLO
  socket.on('chatMessage', async (msg) => {
    // Reenviar a todos (incluido el que lo envió) para verlo al instante
    io.emit('message', msg);

    // Guardar en Airtable en segundo plano
    if (base) {
      try {
        await base('Messages').create([
          {
            "fields": {
              "text": msg.text,
              "sender": msg.sender,
              "timestamp": new Date().toISOString()
            }
          }
        ]);
        console.log("💾 Mensaje guardado en Airtable");
      } catch (error) {
        console.error("❌ Error guardando en Airtable:", error);
      }
    }
  });

  socket.on('disconnect', () => {
    console.log('Usuario desconectado');
  });
});

httpServer.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en puerto ${PORT}`);
});