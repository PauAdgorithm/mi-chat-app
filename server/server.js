const express = require('express');
const axios = require('axios');
const cors = require('cors');
const bodyParser = require('body-parser');
require('dotenv').config(); // Para leer variables de entorno .env

const app = express();
const PORT = process.env.PORT || 3000;

// Configuración de Meta (Pon esto en tu archivo .env)
const ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN; // Tu token permanente
const BUSINESS_ACCOUNT_ID = process.env.WHATSAPP_BUSINESS_ID; // ID de tu cuenta de negocio

// Middleware
app.use(cors()); // Permite peticiones desde tu React
app.use(bodyParser.json());

/**
 * RUTA 1: CREAR PLANTILLA
 * Recibe los datos del Frontend y los envía a Meta Graph API
 */
app.post('/api/create-template', async (req, res) => {
  try {
    const { name, category, body, language, footer } = req.body;

    // 1. Limpieza básica del nombre (Meta es estricto: solo minúsculas y guiones bajos)
    const formattedName = name.toLowerCase().trim().replace(/\s+/g, '_');

    // 2. Construir el payload para Meta
    const metaPayload = {
      name: formattedName,
      category: category, // MARKETING, UTILITY, AUTHENTICATION
      allow_category_change: true,
      language: language,
      components: [
        {
          type: "BODY",
          text: body
        }
      ]
    };

    // Añadir footer si existe
    if (footer && footer.trim().length > 0) {
      metaPayload.components.push({
        type: "FOOTER",
        text: footer
      });
    }

    // 3. Enviar petición a Meta API
    console.log(`Enviando plantilla ${formattedName} a Meta...`);
    
    const response = await axios.post(
      `https://graph.facebook.com/v18.0/${BUSINESS_ACCOUNT_ID}/message_templates`,
      metaPayload,
      {
        headers: {
          'Authorization': `Bearer ${ACCESS_TOKEN}`,
          'Content-Type': 'application/json'
        }
      }
    );

    // 4. Éxito
    console.log("Plantilla creada en Meta con ID:", response.data.id);
    res.json({ 
      success: true, 
      id: response.data.id,
      status: response.data.status || 'PENDING'
    });

  } catch (error) {
    // Manejo de errores de Meta
    const metaError = error.response ? error.response.data : error.message;
    console.error("Error creando plantilla:", JSON.stringify(metaError, null, 2));
    
    res.status(400).json({ 
      success: false, 
      error: metaError.error ? metaError.error.message : 'Error desconocido al contactar con Meta'
    });
  }
});

/**
 * RUTA 2: WEBHOOK (Opcional por ahora)
 * Aquí Meta te avisará cuando aprueben o rechacen la plantilla
 */
app.post('/webhook', (req, res) => {
  // Verificación básica del webhook
  // Aquí recibirás eventos como 'message_template_status_update'
  console.log("Evento recibido del Webhook:", JSON.stringify(req.body, null, 2));
  
  // TODO: Actualizar estado en tu base de datos local
  
  res.sendStatus(200);
});

// Verificación del webhook (GET) requerida por Meta al configurarlo
app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  
  if (mode && token) {
    if (mode === 'subscribe' && token === process.env.WEBHOOK_VERIFY_TOKEN) {
      console.log('Webhook verificado!');
      res.status(200).send(challenge);
    } else {
      res.sendStatus(403);
    }
  }
});

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`Servidor Backend corriendo en http://localhost:${PORT}`);
});