const express = require('express');
const axios = require('axios');
const cors = require('cors');
const bodyParser = require('body-parser');
require('dotenv').config(); 

const app = express();
const PORT = process.env.PORT || 3000;

// Configuración de Meta
const ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN; 
const BUSINESS_ACCOUNT_ID = process.env.WHATSAPP_BUSINESS_ID; 

app.use(cors()); 
app.use(bodyParser.json());

// --- BASE DE DATOS SIMULADA (Sustituir por Prisma/MongoDB) ---
let db_templates = [
  // Datos iniciales de ejemplo
];

/**
 * RUTA 1: OBTENER PLANTILLAS (GET)
 * Carga las plantillas guardadas al iniciar la app
 */
app.get('/api/templates', (req, res) => {
  // TODO: PRISMA -> const templates = await prisma.template.findMany();
  res.json(db_templates);
});

/**
 * RUTA 2: CREAR PLANTILLA (POST)
 * Guarda en DB local y envía a Meta
 */
app.post('/api/create-template', async (req, res) => {
  try {
    const { name, category, body, language, footer, variableExamples } = req.body;
    const formattedName = name.toLowerCase().trim().replace(/\s+/g, '_');

    // 1. Preparar Payload para Meta
    const metaPayload = {
      name: formattedName,
      category: category,
      allow_category_change: true,
      language: language,
      components: [
        { 
          type: "BODY", 
          text: body,
          // Meta pide ejemplos de variables si existen
          ...(variableExamples && Object.keys(variableExamples).length > 0 && {
             example: {
               body_text: [Object.values(variableExamples)] // Ej: ["Juan", "#123"]
             }
          })
        }
      ]
    };

    if (footer && footer.trim().length > 0) {
      metaPayload.components.push({ type: "FOOTER", text: footer });
    }

    console.log(`Enviando a Meta: ${formattedName}`);

    // 2. Enviar a Meta (Descomentar con credenciales reales)
    // const response = await axios.post(...)
    
    // Simulación de respuesta de Meta
    const metaId = "meta_" + Date.now(); 
    const status = "PENDING"; // Meta siempre las crea en PENDING

    // 3. Guardar en Base de Datos Local
    const newTemplate = {
      id: Date.now(),
      metaId: metaId,
      name: formattedName,
      category,
      language,
      body,
      footer,
      status,
      variableMapping: variableExamples, // Guardamos qué significa cada variable
      lastUpdated: new Date().toLocaleDateString()
    };

    // TODO: PRISMA -> await prisma.template.create({ data: newTemplate });
    db_templates.unshift(newTemplate); // Añadir al principio

    res.json({ success: true, template: newTemplate });

  } catch (error) {
    console.error("Error:", error);
    res.status(400).json({ success: false, error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Servidor Backend corriendo en http://localhost:${PORT}`);
});