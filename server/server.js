const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const Airtable = require('airtable');
require('dotenv').config(); 

const app = express();
const PORT = process.env.PORT || 3000;

// Configuración Airtable
// Asegúrate de tener estas variables en tu archivo .env
const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY }).base(process.env.AIRTABLE_BASE_ID);
const TABLE_NAME = 'Templates';

app.use(cors()); 
app.use(bodyParser.json());

// --- RUTA 1: OBTENER PLANTILLAS (GET) ---
app.get('/api/templates', async (req, res) => {
  try {
    const records = await base(TABLE_NAME).select({
      sort: [{ field: "Created", direction: "desc" }] // Opcional: crea campo 'Created' tipo 'Created time' si quieres ordenar
    }).all();

    // Mapeamos el formato de Airtable al formato que espera tu React
    const formattedTemplates = records.map(record => ({
      id: record.id, // ID interno de Airtable (recXXXXXXXX)
      name: record.get('Name') || '',
      category: record.get('Category') || 'MARKETING',
      language: record.get('Language') || 'es',
      body: record.get('Body') || '',
      footer: record.get('Footer') || '',
      status: record.get('Status') || 'PENDING',
      metaId: record.get('MetaId'),
      // Parseamos el JSON de variables
      variableMapping: record.get('VariableMapping') ? JSON.parse(record.get('VariableMapping')) : {}
    }));

    res.json(formattedTemplates);
  } catch (error) {
    console.error("Error Airtable:", error);
    res.status(500).json({ error: "No se pudieron cargar las plantillas" });
  }
});

// --- RUTA 2: CREAR PLANTILLA (POST) ---
app.post('/api/create-template', async (req, res) => {
  try {
    const { name, category, body, language, footer, variableExamples } = req.body;
    
    // 1. Aquí iría la llamada a la API de Meta para registrarla oficialmente
    // const metaResponse = await axios.post(...)
    const simuladoMetaId = "meta_" + Date.now();

    // 2. Guardar en Airtable
    const createdRecords = await base(TABLE_NAME).create([
      {
        "fields": {
          "Name": name,
          "Category": category,
          "Language": language,
          "Body": body,
          "Footer": footer,
          "Status": "PENDING", // Por defecto
          "MetaId": simuladoMetaId,
          "VariableMapping": JSON.stringify(variableExamples || {}) // Guardamos objeto como texto
        }
      }
    ]);

    const record = createdRecords[0];

    // 3. Responder al Frontend
    res.json({
      success: true,
      template: {
        id: record.id,
        name: record.get('Name'),
        category: record.get('Category'),
        language: record.get('Language'),
        body: record.get('Body'),
        footer: record.get('Footer'),
        status: record.get('Status'),
        variableMapping: variableExamples
      }
    });

  } catch (error) {
    console.error("Error creando en Airtable:", error);
    res.status(400).json({ success: false, error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Servidor Airtable corriendo en http://localhost:${PORT}`);
});