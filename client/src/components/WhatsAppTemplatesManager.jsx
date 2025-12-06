import React, { useState } from 'react';
import { 
  MessageSquarePlus, 
  CheckCircle2, 
  Clock, 
  XCircle, 
  RefreshCw, 
  Plus, 
  Trash2, 
  Info,
  Send
} from 'lucide-react';

const WhatsAppTemplatesManager = () => {
  // CONFIGURACIÓN: Cambia esto por la URL real de tu backend cuando lo subas
  const API_URL = 'http://localhost:3000/api/create-template';

  // Estado para simular la base de datos de plantillas
  const [templates, setTemplates] = useState([
    {
      id: 1,
      name: 'confirmacion_pedido',
      category: 'UTILITY',
      language: 'es',
      status: 'APPROVED',
      body: 'Hola {{1}}, hemos recibido tu pedido #{{2}}. Te avisaremos cuando salga del almacén.',
      lastUpdated: '2023-10-25',
      reason: '' // Añadido para evitar errores de acceso
    },
    {
      id: 2,
      name: 'promo_verano_24',
      category: 'MARKETING',
      language: 'es',
      status: 'REJECTED',
      reason: 'Contenido promocional excesivo o formato incorrecto.',
      body: '¡Gran oferta! Compra ahora y gana dinero rápido. Haz clic aquí.',
      lastUpdated: '2023-10-26'
    }
  ]);

  const [isModalOpen, setIsModalOpen] = useState(false);
  
  // Formulario para nueva plantilla
  const [formData, setFormData] = useState({
    name: '',
    category: 'MARKETING',
    language: 'es',
    body: '',
    header: '',
    footer: ''
  });

  // Estado de envío
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Helper para insertar variables
  const insertVariable = () => {
    const currentVars = (formData.body.match(/{{\d+}}/g) || []).length;
    const newVar = `{{${currentVars + 1}}}`;
    setFormData({ ...formData, body: formData.body + newVar });
  };

  const handleCreateTemplate = async () => {
    if (!formData.name || !formData.body) return;

    setIsSubmitting(true);

    try {
      // 1. LLAMADA REAL AL BACKEND
      const response = await fetch(API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        // 2. Éxito: Agregamos a la lista local como PENDING
        const newTemplate = {
          id: data.id, // ID real que nos devuelve Meta
          name: formData.name, // El backend podría haberlo normalizado
          category: formData.category,
          language: formData.language,
          status: 'PENDING', // Siempre nace pendiente de revisión
          body: formData.body,
          lastUpdated: new Date().toLocaleDateString(),
          reason: ''
        };

        setTemplates([newTemplate, ...templates]);
        setIsModalOpen(false);
        setFormData({ name: '', category: 'MARKETING', language: 'es', body: '', header: '', footer: '' });
        
        // Opcional: Mostrar un toast/notificación de éxito
        alert("Plantilla enviada a Meta correctamente. Esperando aprobación.");
      } else {
        // Error del servidor o de Meta
        console.error("Error al crear plantilla:", data);
        alert(`Error: ${data.error || 'No se pudo crear la plantilla'}`);
      }
    } catch (error) {
      console.error("Error de conexión:", error);
      // Fallback para demo si falla la conexión
      alert("Error de conexión (Backend no detectado). Creando en modo local para demo.");
       const newTemplate = {
          id: Date.now(),
          name: formData.name,
          category: formData.category,
          language: formData.language,
          status: 'PENDING',
          body: formData.body,
          lastUpdated: new Date().toLocaleDateString(),
          reason: ''
        };
        setTemplates([newTemplate, ...templates]);
        setIsModalOpen(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Funciones auxiliares sin tipos explícitos para compatibilidad con JS
  const getStatusColor = (status) => {
    switch (status) {
      case 'APPROVED': return 'bg-green-100 text-green-700 border-green-200';
      case 'PENDING': return 'bg-yellow-100 text-yellow-700 border-yellow-200';
      case 'REJECTED': return 'bg-red-100 text-red-700 border-red-200';
      default: return 'bg-gray-100 text-gray-600';
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'APPROVED': return <CheckCircle2 size={16} />;
      case 'PENDING': return <Clock size={16} />;
      case 'REJECTED': return <XCircle size={16} />;
      default: return null;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-8 font-sans text-gray-800">
      
      {/* Header */}
      <div className="max-w-6xl mx-auto mb-8">
        <div className="flex justify-between items-center mb-2">
          <h1 className="text-3xl font-bold text-gray-900">Plantillas de WhatsApp</h1>
          <button 
            onClick={() => setIsModalOpen(true)}
            className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg font-medium transition-colors shadow-sm"
          >
            <Plus size={20} />
            Nueva Plantilla
          </button>
        </div>
        <p className="text-gray-500">
          Gestiona las plantillas para iniciar conversaciones fuera de la ventana de 24 horas.
          Estas se sincronizan automáticamente con tu cuenta de Meta Business.
        </p>
      </div>

      {/* Main Grid */}
      <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Lista de Plantillas (Left Column) */}
        <div className="lg:col-span-3 bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50">
            <h2 className="font-semibold text-lg text-gray-700">Mis Plantillas</h2>
            <button className="text-gray-400 hover:text-green-600 transition-colors">
              <RefreshCw size={18} />
            </button>
          </div>
          
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-white text-gray-500 text-sm border-b border-gray-100">
                  <th className="p-4 font-medium">Nombre & Categoría</th>
                  <th className="p-4 font-medium">Idioma</th>
                  <th className="p-4 font-medium">Estado (Meta)</th>
                  <th className="p-4 font-medium">Última Act.</th>
                  <th className="p-4 font-medium text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {templates.map((template) => (
                  <tr key={template.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                    <td className="p-4">
                      <div className="font-medium text-gray-900">{template.name}</div>
                      <div className="text-xs text-gray-500 mt-1 flex items-center gap-1">
                        <span className="bg-gray-100 px-2 py-0.5 rounded text-gray-600">{template.category}</span>
                      </div>
                    </td>
                    <td className="p-4 text-gray-600 uppercase text-sm">{template.language}</td>
                    <td className="p-4">
                      <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${getStatusColor(template.status)}`}>
                        {getStatusIcon(template.status)}
                        {template.status === 'APPROVED' ? 'Aprobada' : template.status === 'PENDING' ? 'En Revisión' : 'Rechazada'}
                      </div>
                      {template.status === 'REJECTED' && (
                        <div className="text-xs text-red-500 mt-1 max-w-xs truncate" title={template.reason}>
                          {template.reason}
                        </div>
                      )}
                    </td>
                    <td className="p-4 text-gray-500 text-sm">{template.lastUpdated}</td>
                    <td className="p-4 text-right">
                      <button className="text-gray-400 hover:text-red-500 transition-colors p-2">
                        <Trash2 size={18} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          
          {templates.length === 0 && (
            <div className="p-12 text-center text-gray-400">
              <MessageSquarePlus size={48} className="mx-auto mb-4 opacity-50" />
              <p>No tienes plantillas creadas aún.</p>
            </div>
          )}
        </div>
      </div>

      {/* Modal de Creación */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col md:flex-row">
            
            {/* Formulario (Izquierda) */}
            <div className="flex-1 p-6 md:p-8 overflow-y-auto">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold text-gray-800">Nueva Plantilla</h2>
                <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                  <XCircle size={24} />
                </button>
              </div>

              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Nombre de la Plantilla</label>
                  <input 
                    type="text" 
                    value={formData.name}
                    onChange={(e) => setFormData({...formData, name: e.target.value})}
                    placeholder="ej: bienvenida_cliente_nuevo"
                    className="w-full border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none text-sm"
                  />
                  <p className="text-xs text-gray-500 mt-1">Solo minúsculas y guiones bajos.</p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Categoría</label>
                    <select 
                      value={formData.category}
                      onChange={(e) => setFormData({...formData, category: e.target.value})}
                      className="w-full border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-green-500 outline-none text-sm bg-white"
                    >
                      <option value="MARKETING">Marketing</option>
                      <option value="UTILITY">Utilidad (Utility)</option>
                      <option value="AUTHENTICATION">Autenticación (OTP)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Idioma</label>
                    <select 
                      value={formData.language}
                      onChange={(e) => setFormData({...formData, language: e.target.value})}
                      className="w-full border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-green-500 outline-none text-sm bg-white"
                    >
                      <option value="es">Español (ES)</option>
                      <option value="en_US">Inglés (US)</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Cuerpo del Mensaje</label>
                  <div className="relative">
                    <textarea 
                      value={formData.body}
                      onChange={(e) => setFormData({...formData, body: e.target.value})}
                      rows={5}
                      className="w-full border border-gray-300 rounded-lg p-3 focus:ring-2 focus:ring-green-500 outline-none text-sm resize-none"
                      placeholder="Hola {{1}}, gracias por contactarnos..."
                    />
                    <button 
                      onClick={insertVariable}
                      className="absolute bottom-3 right-3 text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 px-2 py-1 rounded border border-gray-300 transition-colors"
                    >
                      + Añadir Variable
                    </button>
                  </div>
                  <p className="text-xs text-gray-500 mt-1 flex gap-1">
                    <Info size={12} className="mt-0.5" />
                    Usa variables como {'{{1}}'}, {'{{2}}'} para personalizar el mensaje dinámicamente.
                  </p>
                </div>
                
                {/* Footer opcional */}
                <div>
                   <label className="block text-sm font-medium text-gray-700 mb-1">Pie de página (Opcional)</label>
                   <input 
                    type="text" 
                    value={formData.footer}
                    onChange={(e) => setFormData({...formData, footer: e.target.value})}
                    placeholder="ej: Enviado desde MiEmpresa"
                    className="w-full border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-green-500 outline-none text-sm"
                  />
                </div>

                <div className="pt-4 flex justify-end gap-3">
                  <button 
                    onClick={() => setIsModalOpen(false)}
                    className="px-4 py-2 text-gray-600 font-medium hover:bg-gray-100 rounded-lg transition-colors"
                  >
                    Cancelar
                  </button>
                  <button 
                    onClick={handleCreateTemplate}
                    disabled={isSubmitting || !formData.name || !formData.body}
                    className="px-6 py-2 bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white font-medium rounded-lg shadow-sm transition-all flex items-center gap-2"
                  >
                    {isSubmitting ? <RefreshCw className="animate-spin" size={18} /> : <Send size={18} />}
                    {isSubmitting ? 'Enviando a Meta...' : 'Enviar a Revisión'}
                  </button>
                </div>
              </div>
            </div>

            {/* Previsualización (Derecha) */}
            <div className="w-full md:w-80 bg-gray-100 p-6 border-l border-gray-200 flex flex-col items-center justify-center">
              <h3 className="text-sm font-semibold text-gray-500 mb-4 uppercase tracking-wide">Vista Previa</h3>
              
              <div className="w-full max-w-[280px] bg-white rounded-lg shadow-md border border-gray-200 overflow-hidden relative">
                {/* WhatsApp Header Fake */}
                <div className="bg-[#075E54] h-14 flex items-center px-4 text-white gap-3">
                  <div className="w-8 h-8 rounded-full bg-gray-300/50"></div>
                  <div className="text-sm font-medium">Mi Empresa</div>
                </div>
                
                {/* Chat Area */}
                <div className="bg-[#E5DDD5] p-4 min-h-[300px] relative">
                  <div className="bg-white rounded-tr-lg rounded-br-lg rounded-bl-lg p-2 shadow-sm max-w-[90%] relative">
                    
                    {/* Body Text */}
                    <p className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">
                      {formData.body ? formData.body.replace(/{{\d+}}/g, (match) => {
                        return `<span class="bg-blue-100 text-blue-800 px-1 rounded mx-0.5 border border-blue-200 font-mono text-xs">${match}</span>`;
                      }).split('<span').map((part, i) => {
                         if (i === 0) return part;
                         const [content, rest] = part.split('</span>');
                         const [cls, val] = content.split('>');
                         return <React.Fragment key={i}><span className={cls.replace('class="', '').replace('"', '')}>{val}</span>{rest}</React.Fragment>
                      }) : <span className="text-gray-400 italic">Escribe el contenido...</span>}
                    </p>

                    {/* Footer Text */}
                    {formData.footer && (
                      <p className="text-[10px] text-gray-500 mt-2 pt-1 border-t border-gray-100">
                        {formData.footer}
                      </p>
                    )}

                    <div className="text-[10px] text-gray-400 text-right mt-1 flex justify-end gap-1">
                       12:30 PM <CheckCircle2 size={10} className="text-blue-500" />
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-6 p-4 bg-blue-50 text-blue-700 text-xs rounded-lg border border-blue-100 flex gap-2">
                <Info size={16} className="shrink-0" />
                <p>
                  Al hacer clic en "Enviar a Revisión", esta plantilla se enviará directamente a Meta. Recibirás una notificación cuando sea aprobada.
                </p>
              </div>
            </div>

          </div>
        </div>
      )}

    </div>
  );
};

export default WhatsAppTemplatesManager;