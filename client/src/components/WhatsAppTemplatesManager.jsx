import React, { useState, useEffect } from 'react';
import { 
  MessageSquarePlus, 
  CheckCircle2, 
  Clock, 
  XCircle, 
  RefreshCw, 
  Plus, 
  Trash2, 
  Info,
  Send,
  Braces,
  Database,
  BookOpen,
  AlertTriangle,
  Lightbulb,
  Phone,
  User
} from 'lucide-react';

const WhatsAppTemplatesManager = () => {
  const isProduction = window.location.hostname.includes('render.com');
  const API_URL_BASE = isProduction
    ? 'https://chatgorithm.onrender.com/api' 
    : 'http://localhost:3000/api';

  const [templates, setTemplates] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  
  // Modales
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [isSendModalOpen, setIsSendModalOpen] = useState(false); // Nuevo modal de envío

  // Estado para creación
  const [formData, setFormData] = useState({
    name: '',
    category: 'MARKETING',
    language: 'es',
    body: '',
    footer: ''
  });
  const [variableMap, setVariableMap] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Estado para envío
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [sendData, setSendData] = useState({
    phone: '',
    variables: {}
  });

  useEffect(() => { fetchTemplates(); }, []);

  const fetchTemplates = async () => {
    try {
      setIsLoading(true);
      const res = await fetch(`${API_URL_BASE}/templates`);
      if (!res.ok) throw new Error("Error fetching templates");
      const data = await res.json();
      setTemplates(data);
    } catch (err) {
      console.error("No se pudo conectar al backend:", err);
    } finally {
      setIsLoading(false);
    }
  };

  // --- CREACIÓN ---
  useEffect(() => {
    const matches = formData.body.match(/{{\d+}}/g) || [];
    const varNumbers = [...new Set(matches.map(m => m.replace(/[{}]/g, '')))].sort();
    const newMap = { ...variableMap };
    varNumbers.forEach(num => { if (!newMap[num]) newMap[num] = ''; });
    setVariableMap(newMap);
  }, [formData.body]);

  const insertVariable = () => {
    const currentVars = (formData.body.match(/{{\d+}}/g) || []).length;
    const newVar = `{{${currentVars + 1}}}`;
    setFormData({ ...formData, body: formData.body + newVar });
  };

  const handleCreateTemplate = async () => {
    if (!formData.name || !formData.body) return;
    setIsSubmitting(true);
    try {
      const payload = { ...formData, variableExamples: variableMap };
      const response = await fetch(`${API_URL_BASE}/create-template`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (response.ok && data.success) {
        setTemplates([data.template, ...templates]);
        setIsModalOpen(false);
        resetForm();
        alert("Plantilla enviada a revisión.");
      } else {
        alert(`Error: ${data.error || 'Fallo desconocido'}`);
      }
    } catch (error) {
      console.error("Error conexión:", error);
      alert("Error de conexión con el backend.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // --- ENVÍO DE PLANTILLA ---
  const openSendModal = (template) => {
    setSelectedTemplate(template);
    // Inicializar variables vacías
    const initialVars = {};
    if (template.variableMapping) {
      Object.keys(template.variableMapping).forEach(key => initialVars[key] = '');
    }
    setSendData({ phone: '', variables: initialVars });
    setIsSendModalOpen(true);
  };

  const handleSendTemplate = async () => {
    if (!sendData.phone) return alert("Escribe un teléfono");
    setIsSubmitting(true);

    try {
        const payload = {
            templateName: selectedTemplate.name,
            language: selectedTemplate.language,
            phone: sendData.phone,
            variables: Object.values(sendData.variables) // Enviamos array de valores en orden
        };

        const response = await fetch(`${API_URL_BASE}/send-template`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const data = await response.json();
        
        if (response.ok && data.success) {
            alert("✅ Mensaje enviado correctamente");
            setIsSendModalOpen(false);
        } else {
            alert(`❌ Error al enviar: ${data.error}`);
        }
    } catch (error) {
        alert("Error de conexión");
    } finally {
        setIsSubmitting(false);
    }
  };

  // --- UI HELPERS ---
  const handleDelete = async (id, name) => {
    if (!window.confirm(`¿Estás seguro de eliminar "${name}"?`)) return;
    try {
        await fetch(`${API_URL_BASE}/delete-template/${id}`, { method: 'DELETE' });
        setTemplates(prev => prev.filter(t => t.id !== id));
    } catch (e) { alert("Error al eliminar"); }
  };

  const resetForm = () => {
    setFormData({ name: '', category: 'MARKETING', language: 'es', body: '', footer: '' });
    setVariableMap({});
  };

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

  const renderPreviewText = (text, values) => {
    if (!text) return <span className="text-gray-400 italic">Escribe el contenido...</span>;
    const parts = text.split(/({{\d+}})/g);
    return parts.map((part, i) => {
      if (part.match(/^{{\d+}}$/)) {
        const num = part.replace(/[{}]/g, '');
        // Si estamos en modo envío, mostramos el valor real que escribe el usuario
        if (values) {
            const val = values[num];
            return <span key={i} className="font-bold text-slate-900 bg-yellow-100 px-1 rounded">{val || `[...]`}</span>;
        }
        // Modo diseño
        const label = variableMap[num] || `Variable ${num}`;
        return <span key={i} className="bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded mx-0.5 border border-blue-200 text-xs font-semibold inline-block">[{label}]</span>;
      }
      return <span key={i}>{part}</span>;
    });
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
      
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2"><MessageSquarePlus className="text-green-600" /> Plantillas de WhatsApp</h1>
          <p className="text-slate-500 text-sm mt-1">Define y envía mensajes automáticos para iniciar conversaciones.</p>
        </div>
        <div className="flex gap-3">
          <button onClick={() => setIsHelpOpen(true)} className="flex items-center gap-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 px-4 py-2.5 rounded-xl font-bold transition-all shadow-sm active:scale-95">
            <BookOpen size={18} className="text-blue-500" /> Guía de Uso
          </button>
          <button onClick={() => setIsModalOpen(true)} className="flex items-center gap-2 bg-slate-900 hover:bg-slate-800 text-white px-4 py-2.5 rounded-xl font-bold transition-all shadow-lg shadow-slate-200 active:scale-95"><Plus size={18} /> Nueva Plantilla</button>
        </div>
      </div>

      {/* Lista */}
      <div className="bg-slate-50 rounded-2xl border border-slate-200 overflow-hidden">
        {isLoading ? (
          <div className="p-12 text-center text-slate-400"><RefreshCw className="animate-spin mx-auto mb-2" /> Cargando plantillas...</div>
        ) : templates.length === 0 ? (
          <div className="p-12 text-center text-slate-400"><Database size={48} className="mx-auto mb-4 opacity-20" /><p className="font-medium">No hay plantillas guardadas.</p><p className="text-sm mt-1">Crea la primera para empezar.</p></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-white border-b border-slate-200 text-slate-500 text-xs font-bold uppercase tracking-wider">
                  <th className="p-4">Nombre</th>
                  <th className="p-4">Categoría</th>
                  <th className="p-4">Idioma</th>
                  <th className="p-4">Estado</th>
                  <th className="p-4 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {templates.map((template) => (
                  <tr key={template.id} className="hover:bg-white transition-colors">
                    <td className="p-4"><div className="font-bold text-slate-700">{template.name}</div><div className="text-xs text-slate-400 truncate max-w-[200px] mt-0.5 opacity-75">{template.body}</div></td>
                    <td className="p-4"><span className="bg-slate-200 text-slate-600 px-2 py-1 rounded text-xs font-bold">{template.category}</span></td>
                    <td className="p-4 text-slate-600 text-sm uppercase">{template.language}</td>
                    <td className="p-4"><div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border ${getStatusColor(template.status)}`}>{getStatusIcon(template.status)} {template.status === 'APPROVED' ? 'Aprobada' : template.status === 'PENDING' ? 'Revisión' : 'Rechazada'}</div></td>
                    <td className="p-4 text-right flex justify-end gap-2">
                      {/* BOTÓN ENVIAR */}
                      {template.status === 'APPROVED' && (
                          <button 
                            onClick={() => openSendModal(template)}
                            className="bg-green-100 text-green-700 hover:bg-green-200 hover:text-green-800 transition-colors p-2 rounded-lg"
                            title="Enviar plantilla"
                          >
                            <Send size={16} />
                          </button>
                      )}
                      <button onClick={() => handleDelete(template.id, template.name)} className="text-slate-400 hover:text-red-500 transition-colors p-2 hover:bg-red-50 rounded-lg" title="Eliminar">
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* --- MODAL ENVÍO (NUEVO) --- */}
      {isSendModalOpen && selectedTemplate && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4 animate-in fade-in duration-200">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-200">
                <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                    <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                        <Send className="text-green-600" size={20}/> Enviar Plantilla
                    </h2>
                    <button onClick={() => setIsSendModalOpen(false)} className="text-slate-400 hover:text-slate-600"><XCircle size={24} /></button>
                </div>
                
                <div className="p-6 space-y-6">
                    {/* Destinatario */}
                    <div>
                        <label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Número de Teléfono</label>
                        <div className="relative">
                            <Phone className="absolute left-3 top-3 text-slate-400" size={18} />
                            <input 
                                type="text" 
                                placeholder="Ej: 34600123456"
                                value={sendData.phone}
                                onChange={(e) => setSendData({...sendData, phone: e.target.value})}
                                className="w-full pl-10 p-3 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-green-500 outline-none font-mono"
                            />
                        </div>
                    </div>

                    {/* Variables */}
                    {Object.keys(sendData.variables).length > 0 && (
                        <div className="bg-blue-50 p-4 rounded-xl border border-blue-100 space-y-3">
                            <h3 className="text-sm font-bold text-blue-800 flex items-center gap-2"><User size={16}/> Personalizar Mensaje</h3>
                            {Object.keys(sendData.variables).map(key => {
                                const label = selectedTemplate.variableMapping?.[key] || `Variable {{${key}}}`;
                                return (
                                    <div key={key}>
                                        <label className="text-xs font-semibold text-blue-600 mb-1 block">{label}</label>
                                        <input 
                                            type="text"
                                            value={sendData.variables[key]}
                                            onChange={(e) => setSendData({
                                                ...sendData, 
                                                variables: {...sendData.variables, [key]: e.target.value}
                                            })}
                                            placeholder={`Valor para ${label}`}
                                            className="w-full p-2 bg-white border border-blue-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                                        />
                                    </div>
                                )
                            })}
                        </div>
                    )}

                    {/* Preview Final */}
                    <div className="bg-[#EFEAE2] p-4 rounded-xl border border-slate-200 relative">
                        <div className="bg-white p-3 rounded-lg shadow-sm rounded-tr-none relative">
                            <p className="text-sm text-slate-800 whitespace-pre-wrap">
                                {renderPreviewText(selectedTemplate.body, sendData.variables)}
                            </p>
                            <div className="text-[10px] text-slate-400 text-right mt-1">Ahora</div>
                        </div>
                    </div>

                    <button 
                        onClick={handleSendTemplate}
                        disabled={isSubmitting}
                        className="w-full py-3 bg-green-600 hover:bg-green-700 text-white font-bold rounded-xl shadow-lg shadow-green-100 active:scale-95 transition-all flex justify-center items-center gap-2"
                    >
                        {isSubmitting ? <RefreshCw className="animate-spin"/> : <Send/>}
                        {isSubmitting ? 'Enviando...' : 'Enviar Mensaje'}
                    </button>
                </div>
            </div>
        </div>
      )}

      {/* Modal Nueva Plantilla (Mismo de antes) */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl h-[90vh] flex overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="flex-1 flex flex-col border-r border-slate-100">
              <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50"><h2 className="text-xl font-bold text-slate-800">Diseñar Plantilla</h2><button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600 hover:bg-slate-100 p-2 rounded-full transition-all"><XCircle size={24} /></button></div>
              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2"><label className="text-xs font-bold text-slate-400 uppercase mb-1.5 block ml-1">Nombre Único</label><input type="text" value={formData.name} onChange={(e) => setFormData({...formData, name: e.target.value})} placeholder="ej: oferta_navidad_2025" className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-green-500 outline-none font-medium text-slate-700 placeholder:text-slate-300 transition-all"/></div>
                  <div><label className="text-xs font-bold text-slate-400 uppercase mb-1.5 block ml-1">Categoría</label><select value={formData.category} onChange={(e) => setFormData({...formData, category: e.target.value})} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-green-500 outline-none font-medium text-slate-700 transition-all appearance-none"><option value="MARKETING">Marketing (Ofertas)</option><option value="UTILITY">Utilidad (Pedidos)</option><option value="AUTHENTICATION">Autenticación (OTP)</option></select></div>
                  <div><label className="text-xs font-bold text-slate-400 uppercase mb-1.5 block ml-1">Idioma</label><select value={formData.language} onChange={(e) => setFormData({...formData, language: e.target.value})} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-green-500 outline-none font-medium text-slate-700 transition-all appearance-none"><option value="es">Español (ES)</option><option value="en_US">Inglés (US)</option></select></div>
                </div>
                <div><div className="flex justify-between items-end mb-1.5 ml-1"><label className="text-xs font-bold text-slate-400 uppercase">Mensaje</label><button onClick={insertVariable} className="text-xs font-bold text-green-600 hover:text-green-700 flex items-center gap-1 bg-green-50 px-2 py-1 rounded-lg hover:bg-green-100 transition-colors"><Braces size={12} /> Insertar Variable</button></div><div className="relative group"><textarea value={formData.body} onChange={(e) => setFormData({...formData, body: e.target.value})} rows={6} className="w-full p-4 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-green-500 outline-none text-slate-700 resize-none shadow-sm group-hover:border-slate-300 transition-all leading-relaxed" placeholder="Hola {{1}}, gracias por tu compra..." /></div></div>
                {Object.keys(variableMap).length > 0 && (<div className="bg-blue-50/50 border border-blue-100 rounded-xl p-4 animate-in fade-in slide-in-from-top-2"><h3 className="text-sm font-bold text-blue-800 mb-3 flex items-center gap-2"><Info size={16} /> Definir Variables</h3><div className="space-y-3">{Object.keys(variableMap).sort().map(num => (<div key={num} className="flex items-center gap-3"><span className="bg-white text-blue-600 font-mono text-xs font-bold px-2 py-1.5 rounded-lg border border-blue-100 shadow-sm shrink-0">{`{{${num}}}`}</span><span className="text-slate-400 text-sm">=</span><input type="text" value={variableMap[num]} onChange={(e) => setVariableMap({...variableMap, [num]: e.target.value})} placeholder={`Ej: Nombre Cliente, Número Pedido...`} className="flex-1 p-2 bg-white border border-blue-100 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none" /></div>))}</div><p className="text-xs text-blue-400 mt-3">* Define qué significa cada variable para que tu equipo sepa qué datos rellenar al usarla.</p></div>)}
                <div><label className="text-xs font-bold text-slate-400 uppercase mb-1.5 block ml-1">Pie de página (Opcional)</label><input type="text" value={formData.footer} onChange={(e) => setFormData({...formData, footer: e.target.value})} placeholder="ej: Enviado desde MiEmpresa" className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-green-500 outline-none font-medium text-slate-700 transition-all" /></div>
              </div>
              <div className="p-6 border-t border-slate-100 bg-white flex justify-end gap-3">
                <button onClick={() => setIsModalOpen(false)} className="px-5 py-3 text-slate-600 font-bold hover:bg-slate-50 rounded-xl transition-colors">Cancelar</button>
                <button onClick={handleCreateTemplate} disabled={isSubmitting || !formData.name || !formData.body} className="px-6 py-3 bg-green-600 hover:bg-green-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-bold rounded-xl shadow-lg shadow-green-200 active:scale-95 transition-all flex items-center gap-2">{isSubmitting ? <RefreshCw className="animate-spin" size={18} /> : <Send size={18} />} {isSubmitting ? 'Guardando...' : 'Guardar y Enviar a Meta'}</button>
              </div>
            </div>
            <div className="w-[380px] bg-slate-100 p-8 flex flex-col items-center justify-center border-l border-slate-200 relative overflow-hidden">
              <div className="absolute inset-0 bg-[radial-gradient(#cbd5e1_1px,transparent_1px)] [background-size:16px_16px] opacity-40"></div>
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-6 relative z-10">Vista Previa en WhatsApp</h3>
              <div className="w-[300px] bg-white rounded-2xl shadow-2xl overflow-hidden relative z-10 border border-slate-200 transform hover:scale-[1.02] transition-transform duration-500">
                <div className="bg-[#008069] h-16 flex items-center px-4 text-white gap-3 shadow-md"><div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center font-bold text-sm">ME</div><div><div className="font-bold text-sm">Mi Empresa</div><div className="text-[10px] opacity-80">Cuenta de empresa</div></div></div>
                <div className="bg-[#EFEAE2] p-4 min-h-[380px] relative bg-[url('https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png')] bg-opacity-10">
                  <div className="bg-white rounded-tr-xl rounded-br-xl rounded-bl-xl p-3 shadow-[0_1px_0.5px_rgba(0,0,0,0.13)] max-w-[95%] relative mb-2">
                    <p className="text-sm text-slate-800 whitespace-pre-wrap leading-relaxed">{renderPreviewText(formData.body)}</p>
                    {formData.footer && (<p className="text-[11px] text-slate-400 mt-2 pt-1.5 border-t border-slate-50 font-medium">{formData.footer}</p>)}
                    <div className="text-[10px] text-slate-400 text-right mt-1.5 flex justify-end gap-1">12:30 PM <CheckCircle2 size={12} className="text-[#53bdeb]" /></div>
                  </div>
                </div>
                <div className="bg-[#F0F2F5] h-14 border-t border-slate-200 flex items-center justify-center"><div className="w-full mx-3 bg-white h-9 rounded-lg border border-slate-200"></div></div>
              </div>
              <div className="mt-8 p-4 bg-white/80 backdrop-blur-sm border border-slate-200 rounded-xl text-xs text-slate-500 max-w-[300px] relative z-10 shadow-sm"><p><span className="font-bold text-slate-700">Nota:</span> Las variables marcadas en <span className="text-blue-600 font-bold bg-blue-50 px-1 rounded">azul</span> son las que tu equipo tendrá que rellenar manualmente al enviar el mensaje.</p></div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Ayuda (Sin cambios) */}
      {isHelpOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2"><BookOpen className="text-blue-600" /> Guía Maestra de Plantillas</h2>
              <button onClick={() => setIsHelpOpen(false)} className="text-slate-400 hover:text-slate-600 hover:bg-slate-100 p-2 rounded-full transition-all"><XCircle size={24} /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-8 text-slate-700 space-y-8">
              <div className="bg-blue-50 p-5 rounded-xl border border-blue-100">
                <h3 className="font-bold text-blue-800 text-lg mb-2">👋 ¿Por qué usar plantillas?</h3>
                <p className="text-sm text-blue-700 leading-relaxed">En WhatsApp Business, cuando un cliente te escribe, tienes <strong>24 horas</strong> para responderle libremente. Pasado ese tiempo, la "ventana" se cierra. Las <strong>Plantillas</strong> son la única forma ("llave maestra") de volver a abrir esa conversación.</p>
              </div>
              <div className="space-y-4">
                <h3 className="font-bold text-slate-900 text-lg border-b border-slate-100 pb-2">🚦 Las 3 Categorías (Elige bien)</h3>
                <div className="grid md:grid-cols-3 gap-4">
                  <div className="p-4 bg-slate-50 rounded-xl border border-slate-100"><div className="font-bold text-slate-800 mb-1 flex items-center gap-2"><CheckCircle2 size={16} className="text-green-500"/> UTILIDAD</div><p className="text-xs text-slate-500 mb-2">Transaccional / Informativo</p><p className="text-sm">Para informar de algo acordado: Citas, Pedidos listos, Facturas. <strong>No vendas nada aquí.</strong></p></div>
                  <div className="p-4 bg-slate-50 rounded-xl border border-slate-100"><div className="font-bold text-slate-800 mb-1 flex items-center gap-2"><CheckCircle2 size={16} className="text-blue-500"/> MARKETING</div><p className="text-xs text-slate-500 mb-2">Promocional / Inicio</p><p className="text-sm">Ofertas, Felicitaciones o <strong>abrir conversación sin motivo específico</strong> (ej: "Buenos días").</p></div>
                  <div className="p-4 bg-slate-50 rounded-xl border border-slate-100"><div className="font-bold text-slate-800 mb-1 flex items-center gap-2"><CheckCircle2 size={16} className="text-purple-500"/> AUTENTICACIÓN</div><p className="text-xs text-slate-500 mb-2">Códigos OTP</p><p className="text-sm">Solo para enviar códigos de seguridad de un solo uso.</p></div>
                </div>
              </div>
              <div className="space-y-4">
                <h3 className="font-bold text-slate-900 text-lg border-b border-slate-100 pb-2">📝 Ejemplos Prácticos</h3>
                <div className="bg-green-50/50 p-4 rounded-xl border border-green-100"><div className="font-bold text-green-800 text-sm mb-2">✅ Caso A: Coche/Pedido listo (UTILIDAD)</div><p className="text-sm italic bg-white p-3 rounded-lg border border-green-200 text-slate-600">"Hola <span className="font-bold text-blue-600">{'{{1}}'}</span>, buenas noticias. Tu vehículo con matrícula <span className="font-bold text-blue-600">{'{{2}}'}</span> ya está reparado. El importe es <span className="font-bold text-blue-600">{'{{3}}'}</span>. ¡Te esperamos!"</p></div>
                <div className="bg-yellow-50/50 p-4 rounded-xl border border-yellow-100"><div className="font-bold text-yellow-800 text-sm mb-2">⚠️ Caso B: El saludo trampa</div><p className="text-sm mb-2">Si envías solo "Buenos días", Meta lo marcará como Marketing (más caro) o lo rechazará.</p><p className="text-sm font-bold text-slate-700">Truco Pro:</p><p className="text-sm italic bg-white p-3 rounded-lg border border-yellow-200 text-slate-600 mt-1">"Buenos días <span className="font-bold text-blue-600">{'{{1}}'}</span>, te contactamos porque hay novedades sobre el recambio <span className="font-bold text-blue-600">{'{{2}}'}</span>. ¿Tienes un momento?"</p></div>
              </div>
              <div className="bg-red-50 p-5 rounded-xl border border-red-100 flex gap-4"><AlertTriangle className="text-red-500 shrink-0" /><div><h3 className="font-bold text-red-800 mb-1">🚫 Los 3 Pecados Capitales</h3><ul className="text-sm text-red-700 space-y-1 list-disc pl-4"><li><strong>Plantillas Mudas:</strong> No envíes solo variables (ej: "<code>{'{{1}} - {{2}}'}</code>"). Explica el motivo.</li><li><strong>Publicidad encubierta:</strong> No uses Utilidad para meter ofertas en las variables.</li><li><strong>Mala ortografía:</strong> Meta rechaza textos con muchos errores o formatos raros.</li></ul></div></div>
              <div className="flex items-center gap-3 bg-slate-100 p-4 rounded-xl"><Lightbulb className="text-yellow-500 shrink-0" /><p className="text-sm text-slate-600"><strong>Recuerda:</strong> La plantilla solo abre la puerta. ¡Una vez el cliente contesta, la ventana de 24h se abre y ya puedes escribir libremente!</p></div>
            </div>
            <div className="p-6 border-t border-slate-100 bg-white flex justify-end"><button onClick={() => setIsHelpOpen(false)} className="px-6 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-bold transition-all shadow-lg active:scale-95">Entendido, ¡Gracias!</button></div>
          </div>
        </div>
      )}

    </div>
  );
};

export default WhatsAppTemplatesManager;