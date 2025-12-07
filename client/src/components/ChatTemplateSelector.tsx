import React, { useState, useEffect } from 'react';
import { 
  X, 
  Search, 
  ChevronRight, 
  Send, 
  Loader2, 
  User,
  LayoutTemplate
} from 'lucide-react';

interface Template {
  id: string;
  name: string;
  body: string;
  status: string;
  variableMapping?: Record<string, string>;
  language: string;
}

// ESTA INTERFAZ ES LA CLAVE PARA QUE APP.TSX NO DE ERROR
interface ChatTemplateSelectorProps {
  isOpen: boolean;
  onClose: () => void;
  targetPhone: string;
}

const ChatTemplateSelector: React.FC<ChatTemplateSelectorProps> = ({ isOpen, onClose, targetPhone }) => {
  const isProduction = window.location.hostname.includes('render.com');
  const API_URL_BASE = isProduction
    ? 'https://chatgorithm.onrender.com/api' 
    : 'http://localhost:3000/api';

  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  const [variableValues, setVariableValues] = useState<Record<string, string>>({});
  const [isSending, setIsSending] = useState(false);

  useEffect(() => {
    if (isOpen) {
      fetchApprovedTemplates();
      setSelectedTemplate(null);
      setVariableValues({});
      setSearchTerm('');
    }
  }, [isOpen]);

  const fetchApprovedTemplates = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL_BASE}/templates`);
      const data = await res.json();
      // Solo mostramos las aprobadas para evitar errores
      const approved = data.filter((t: any) => t.status === 'APPROVED');
      setTemplates(approved);
    } catch (err) {
      console.error("Error cargando plantillas:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectTemplate = (template: Template) => {
    setSelectedTemplate(template);
    const initialVars: Record<string, string> = {};
    if (template.variableMapping) {
      Object.keys(template.variableMapping).forEach(key => initialVars[key] = '');
    }
    setVariableValues(initialVars);
  };

  const constructFinalText = (body: string, vars: Record<string, string>) => {
    let text = body;
    Object.keys(vars).forEach(key => {
        text = text.replace(`{{${key}}}`, vars[key]);
    });
    return text;
  };

  const handleSend = async () => {
    if (!selectedTemplate) return;
    setIsSending(true);

    const finalText = constructFinalText(selectedTemplate.body, variableValues);

    try {
      const payload = {
        templateName: selectedTemplate.name,
        language: selectedTemplate.language,
        phone: targetPhone,
        variables: Object.values(variableValues),
        previewText: finalText
      };

      const response = await fetch(`${API_URL_BASE}/send-template`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await response.json();

      if (response.ok && data.success) {
        onClose();
      } else {
        alert(`Error al enviar: ${data.error}`);
      }
    } catch (error) {
      alert("Error de conexión al enviar");
    } finally {
      setIsSending(false);
    }
  };

  const renderPreview = (text: string) => {
    return text.split(/({{\d+}})/g).map((part, i) => {
      if (part.match(/^{{\d+}}$/)) {
        const num = part.replace(/[{}]/g, '');
        const val = variableValues[num];
        return <span key={i} className="font-bold text-slate-900 bg-yellow-100 px-1 rounded mx-0.5">{val || '...'}</span>;
      }
      return <span key={i}>{part}</span>;
    });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col max-h-[85vh] overflow-hidden">
        
        <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
          <h3 className="font-bold text-slate-800 flex items-center gap-2">
            <LayoutTemplate size={18} className="text-blue-600"/> 
            {selectedTemplate ? 'Personalizar Mensaje' : 'Seleccionar Plantilla'}
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1 rounded-full hover:bg-slate-200 transition">
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {!selectedTemplate ? (
            <>
              <div className="relative mb-4">
                <Search className="absolute left-3 top-2.5 text-slate-400" size={16} />
                <input type="text" placeholder="Buscar plantilla..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full pl-9 p-2 bg-slate-100 border-none rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
              </div>
              {loading ? (
                <div className="py-10 text-center text-slate-400 flex flex-col items-center gap-2"><Loader2 className="animate-spin" /> Cargando...</div>
              ) : (
                <div className="space-y-2">
                  {templates.filter(t => t.name.toLowerCase().includes(searchTerm.toLowerCase())).map(template => (
                    <button key={template.id} onClick={() => handleSelectTemplate(template)} className="w-full text-left p-3 hover:bg-blue-50 border border-slate-100 hover:border-blue-200 rounded-xl transition-all group flex justify-between items-center">
                      <div><div className="font-bold text-slate-700 text-sm mb-0.5">{template.name}</div><div className="text-xs text-slate-400 line-clamp-1 group-hover:text-blue-600/70">{template.body}</div></div>
                      <ChevronRight size={16} className="text-slate-300 group-hover:text-blue-500" />
                    </button>
                  ))}
                  {templates.length === 0 && <div className="text-center text-slate-400 py-8 text-sm">No hay plantillas aprobadas disponibles.</div>}
                </div>
              )}
            </>
          ) : (
            <div className="space-y-4 animate-in slide-in-from-right duration-200">
              <div className="bg-[#EFEAE2] p-4 rounded-xl border border-slate-200">
                <div className="bg-white p-3 rounded-lg shadow-sm text-sm text-slate-800 whitespace-pre-wrap leading-relaxed">
                  {renderPreview(selectedTemplate.body)}
                </div>
              </div>
              {selectedTemplate.variableMapping && Object.keys(selectedTemplate.variableMapping).length > 0 ? (
                <div className="space-y-3">
                  <h4 className="text-xs font-bold text-slate-400 uppercase">Rellenar datos</h4>
                  {Object.keys(selectedTemplate.variableMapping).sort().map(key => (
                    <div key={key}>
                      <label className="text-xs font-semibold text-blue-600 mb-1 flex items-center gap-1"><User size={12}/> {selectedTemplate.variableMapping![key] || `Variable {{${key}}}`}</label>
                      <input type="text" value={variableValues[key]} onChange={(e) => setVariableValues({...variableValues, [key]: e.target.value})} className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all" placeholder="Escribe aquí..." autoFocus={key === '1'} />
                    </div>
                  ))}
                </div>
              ) : ( <p className="text-sm text-slate-500 text-center py-2">Esta plantilla no requiere variables.</p> )}
            </div>
          )}
        </div>

        {selectedTemplate && (
          <div className="p-4 border-t border-slate-100 bg-slate-50 flex gap-3">
            <button onClick={() => setSelectedTemplate(null)} className="px-4 py-2 text-slate-600 font-bold text-sm hover:bg-slate-200 rounded-lg transition">Atrás</button>
            <button onClick={handleSend} disabled={isSending} className="flex-1 bg-green-600 hover:bg-green-700 text-white py-2 rounded-lg font-bold text-sm shadow-sm active:scale-95 transition flex justify-center items-center gap-2">{isSending ? <Loader2 className="animate-spin" size={16}/> : <Send size={16} />} {isSending ? 'Enviando...' : 'Enviar Plantilla'}</button>
          </div>
        )}
      </div>
    </div>
  );
};

export default ChatTemplateSelector;