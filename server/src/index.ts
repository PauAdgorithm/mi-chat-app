import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import Airtable from 'airtable';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
app.use(cors());

const PORT = process.env.PORT || 3000;

// Configurar Airtable
const airtableApiKey = process.env.AIRTABLE_API_KEY;
const airtableBaseId = process.env.AIRTABLE_BASE_ID;

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
  cors: {
    origin: "*", 
    methods: ["GET", "POST"]
  }
});

io.on('connection', async (socket) => {
  console.log(`Usuario conectado: ${socket.id}`);

  // CAMBIO IMPORTANTE: Ahora esperamos a que el cliente pida el historial
  socket.on('request_history', async () => {
    console.log("📜 El cliente ha pedido el historial...");
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
        .filter(msg => msg.text && msg.sender);

        socket.emit('history', history);
        console.log(`✅ Enviados ${history.length} mensajes antiguos.`);
      } catch (error) {
        console.error("❌ Error leyendo Airtable:", error);
      }
    }
  });

  socket.on('login', (data) => {
    console.log(`👤 Usuario logueado: ${data.username}`);
  });

  socket.on('chatMessage', async (msg) => {
    // Reenviar a todos inmediatamente (para que sea rápido)
    io.emit('message', msg);

    // Guardar en Airtable (segundo plano)
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
        // Si falla aquí, revisa que tu columna en Airtable se llame 'text' y no 'Name' o 'Notes'
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