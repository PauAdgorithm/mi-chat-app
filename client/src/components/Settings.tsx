import { useState, useEffect } from 'react';
import { 
  User, Plus, Briefcase, ArrowLeft, Trash2, ShieldAlert, CheckCircle, 
  LayoutList, RefreshCw, Pencil, X, MessageSquare, Tag, Zap, BarChart3,
  Calendar, Bot, Save, Bell, UserPlus 
} from 'lucide-react';

// @ts-ignore
import WhatsAppTemplatesManager from './WhatsAppTemplatesManager';
// @ts-ignore
import AnalyticsDashboard from './AnalyticsDashboard';
// @ts-ignore
import CalendarDashboard from './CalendarDashboard';

interface SettingsProps {
  onBack: () => void;
  socket: any;
  currentUserRole: string;
  quickReplies?: any[];
  currentUser?: any;
}

interface Agent { id: string; name: string; role: string; preferences?: any; }
interface ConfigItem { id: string; name: string; type: string; }

export function Settings({ onBack, socket, currentUserRole, quickReplies = [], currentUser }: SettingsProps) {
  const [activeTab, setActiveTab] = useState<'team' | 'config' | 'whatsapp' | 'quick_replies' | 'analytics' | 'agenda' | 'bot_config' | 'notifications'>('team');
  const [agents, setAgents] = useState<Agent[]>([]);
  const [configList, setConfigList] = useState<ConfigItem[]>([]);
  const [phoneLines, setPhoneLines] = useState<{id:string, name:string}[]>([]); 
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showMobileMenu, setShowMobileMenu] = useState(true);

  // Estados modal
  const [modalType, setModalType] = useState<'none' | 'create_agent' | 'edit_agent' | 'delete_agent' | 'add_config' | 'edit_config' | 'delete_config' | 'add_quick_reply' | 'edit_quick_reply' | 'delete_quick_reply' | 'edit_notifications'>('none');
  const [selectedItem, setSelectedItem] = useState<any>(null);
  
  const [formName, setFormName] = useState('');
  const [formRole, setFormRole] = useState('Ventas');
  const [formPass, setFormPass] = useState('');
  const [formType, setFormType] = useState('Department');
  const [qrTitle, setQrTitle] = useState('');
  const [qrContent, setQrContent] = useState('');
  const [qrShortcut, setQrShortcut] = useState('');
  
  // ESTADOS NOTIFICACIONES
  const [prefDepts, setPrefDepts] = useState<string[]>([]);
  const [prefLines, setPrefLines] = useState<string[]>([]);
  const [prefNewLeads, setPrefNewLeads] = useState(true); 
  const [isSaving, setIsSaving] = useState(false); // Estado de carga del botón

  const [botPrompt, setBotPrompt] = useState('');
  const [isLoadingPrompt, setIsLoadingPrompt] = useState(false);
  const isProduction = window.location.hostname.includes('render.com');
  const API_URL = isProduction ? 'https://chatgorithm.onrender.com/api' : 'http://localhost:3000/api';

  useEffect(() => {
    if (socket) {
        socket.emit('request_agents');
        socket.emit('request_config');
        fetch(`${API_URL}/accounts`).then(r=>r.json()).then(setPhoneLines).catch(()=>{});

        socket.on('agents_list', (list: Agent[]) => { setAgents(list); });
        socket.on('config_list', (list: ConfigItem[]) => setConfigList(list));
        
        socket.on('action_error', (msg: string) => {
            setError(msg);
            setIsSaving(false);
        });
        
        socket.on('action_success', (msg: string) => { 
            setSuccess(msg); 
            setIsSaving(false);
            closeModal(); 
            setTimeout(() => setSuccess(''), 3000); 
        });
    }
    return () => { 
        socket?.off('agents_list'); 
        socket?.off('config_list'); 
        socket?.off('action_error'); 
        socket?.off('action_success'); 
    };
  }, [socket, currentUser]);

  useEffect(() => {
      if (activeTab === 'bot_config') {
          setIsLoadingPrompt(true);
          fetch(`${API_URL}/bot-config`).then(r => r.json()).then(d => { setBotPrompt(d.prompt); setIsLoadingPrompt(false); }).catch(() => setIsLoadingPrompt(false));
      }
  }, [activeTab]);

  const handleSavePrompt = async () => {
      setIsLoadingPrompt(true);
      try { await fetch(`${API_URL}/bot-config`, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ prompt: botPrompt }) }); setSuccess("Guardado"); } 
      catch (e) { setError("Error"); } finally { setIsLoadingPrompt(false); }
  };

  const openEditNotifications = (agent: Agent) => {
      setSelectedItem(agent);
      const prefs = agent.preferences || {};
      setPrefDepts(prefs.departments || []);
      setPrefLines(prefs.phoneIds || []);
      setPrefNewLeads(prefs.notifyNewLeads !== undefined ? prefs.notifyNewLeads : true); 
      setModalType('edit_notifications');
  };

  const handleSaveNotifications = (e: React.FormEvent) => {
      e.preventDefault();
      if (!selectedItem) return;
      
      setIsSaving(true); // Activamos loading

      const newPrefs = {
          departments: prefDepts,
          phoneIds: prefLines,
          notifyNewLeads: prefNewLeads
      };

      socket.emit('update_agent', { 
          agentId: selectedItem.id, 
          updates: { 
              name: selectedItem.name, 
              role: selectedItem.role, 
              preferences: newPrefs 
          } 
      });
  };
  
  const toggleSelection = (list: string[], item: string, setList: any) => {
      if (list.includes(item)) setList(list.filter(i => i !== item));
      else setList([...list, item]);
  };

  const closeModal = () => { setModalType('none'); setFormName(''); setFormPass(''); setError(''); setSelectedItem(null); setQrTitle(''); setQrContent(''); setQrShortcut(''); setIsSaving(false); };
  const openCreateAgent = () => { setModalType('create_agent'); setFormName(''); setFormRole('Ventas'); setFormPass(''); };
  const openEditAgent = (agent: Agent) => { setSelectedItem(agent); setFormName(agent.name); setFormRole(agent.role); setFormPass(''); setModalType('edit_agent'); };
  const openDeleteAgent = (agent: Agent) => { setSelectedItem(agent); setModalType('delete_agent'); };
  const openAddConfig = (type: string) => { setFormType(type); setFormName(''); setModalType('add_config'); };
  const openEditConfig = (item: ConfigItem) => { setSelectedItem(item); setFormName(item.name); setModalType('edit_config'); };
  const openDeleteConfig = (item: ConfigItem) => { setSelectedItem(item); setModalType('delete_config'); };
  const openAddQR = () => { setQrTitle(''); setQrContent(''); setQrShortcut(''); setModalType('add_quick_reply'); };
  const openEditQR = (qr: any) => { setSelectedItem(qr); setQrTitle(qr.title); setQrContent(qr.content); setQrShortcut(qr.shortcut || ''); setModalType('edit_quick_reply'); };
  const openDeleteQR = (qr: any) => { setSelectedItem(qr); setModalType('delete_quick_reply'); };

  const handleSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      if (!socket) return;
      setIsSaving(true);
      switch (modalType) {
          case 'create_agent': socket.emit('create_agent', { newAgent: { name: formName, role: formRole, password: formPass } }); break;
          case 'edit_agent': const updates: any = { name: formName, role: formRole }; if (formPass) updates.password = formPass; socket.emit('update_agent', { agentId: selectedItem.id, updates }); break;
          case 'delete_agent': socket.emit('delete_agent', { agentId: selectedItem.id }); break;
          case 'add_config': socket.emit('add_config', { name: formName, type: formType }); break;
          case 'edit_config': socket.emit('update_config', { id: selectedItem.id, name: formName }); break;
          case 'delete_config': socket.emit('delete_config', selectedItem.id); break;
          case 'add_quick_reply': socket.emit('add_quick_reply', { title: qrTitle, content: qrContent, shortcut: qrShortcut }); break;
          case 'edit_quick_reply': socket.emit('update_quick_reply', { id: selectedItem.id, title: qrTitle, content: qrContent, shortcut: qrShortcut }); break;
          case 'delete_quick_reply': socket.emit('delete_quick_reply', selectedItem.id); break;
      }
  };

  const departments = configList.filter(c => c.type === 'Department');
  const statuses = configList.filter(c => c.type === 'Status');
  const tags = configList.filter(c => c.type === 'Tag'); 

  // @ts-ignore
  const handleTabClick = (tab: any) => { setActiveTab(tab); setShowMobileMenu(false); };
  const handleBack = () => { if (!showMobileMenu) setShowMobileMenu(true); else onBack(); };

  if (currentUserRole !== 'Admin' && activeTab !== 'notifications') return <div className="fixed inset-0 bg-slate-50 z-50 flex flex-col"><div className="bg-white border-b border-gray-200 p-4 flex items-center gap-4 shadow-sm"><button onClick={onBack} className="p-2 hover:bg-slate-100 rounded-full transition"><ArrowLeft className="w-6 h-6 text-slate-600" /></button><h1 className="text-xl font-bold text-slate-800">Configuración</h1></div><div className="flex flex-col items-center justify-center h-full text-slate-400 p-8 text-center animate-in fade-in"><div className="bg-red-50 p-6 rounded-full mb-4 border border-red-100"><ShieldAlert className="w-16 h-16 text-red-400" /></div><h3 className="text-2xl font-bold text-slate-700 mb-2">Acceso Restringido</h3><p className="text-slate-500 max-w-md">Solo los administradores tienen permiso.</p></div></div>;

  const getTitle = () => {
    if (showMobileMenu) return 'Configuración';
    switch(activeTab) {
      case 'team': return 'Gestión Equipo';
      case 'config': return 'Ajustes CRM';
      case 'whatsapp': return 'Plantillas WhatsApp';
      case 'quick_replies': return 'Respuestas Rápidas';
      case 'analytics': return 'Analíticas';
      case 'agenda': return 'Agenda';
      case 'bot_config': return 'Configuración IA';
      case 'notifications': return 'Notificaciones';
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-50 z-50 flex flex-col h-full w-full">
      <div className="bg-white border-b border-gray-200 p-4 flex items-center justify-between shadow-sm flex-shrink-0">
          <div className="flex items-center gap-3"><button onClick={handleBack} className="p-2 hover:bg-slate-100 rounded-full transition"><ArrowLeft className="w-6 h-6 text-slate-600" /></button><h1 className="text-lg md:text-xl font-bold text-slate-800 truncate">{getTitle()}</h1></div>
          <div className="fixed top-4 right-4 z-[70] flex flex-col gap-2 items-end pointer-events-none">{success && <div className="bg-green-100 text-green-700 px-4 py-2 rounded-lg text-xs md:text-sm font-bold animate-in slide-in-from-right shadow-md pointer-events-auto">{success}</div>}{error && <div className="bg-red-100 text-red-700 px-4 py-2 rounded-lg text-xs md:text-sm font-bold animate-in slide-in-from-right shadow-md pointer-events-auto">{error}</div>}</div>
      </div>
      <div className="flex flex-1 overflow-hidden relative">
          <div className={`absolute inset-0 bg-white z-10 flex flex-col p-4 space-y-2 transition-transform duration-300 md:relative md:translate-x-0 md:w-64 md:border-r md:border-gray-200 ${!showMobileMenu ? '-translate-x-full' : 'translate-x-0'}`}>
              <button onClick={() => handleTabClick('analytics')} className={`w-full flex items-center gap-3 p-4 rounded-xl text-sm font-bold transition-all ${activeTab === 'analytics' ? 'bg-indigo-50 text-indigo-600' : 'text-slate-500 hover:bg-slate-50 border border-transparent hover:border-slate-100'}`}><BarChart3 className="w-5 h-5" /> Analíticas</button>
              <div className="h-px bg-slate-100 my-2"></div>
              <button onClick={() => handleTabClick('notifications')} className={`w-full flex items-center gap-3 p-4 rounded-xl text-sm font-bold transition-all ${activeTab === 'notifications' ? 'bg-orange-50 text-orange-600' : 'text-slate-500 hover:bg-slate-50 border border-transparent hover:border-slate-100'}`}><Bell className="w-5 h-5" /> Notificaciones</button>
              <button onClick={() => handleTabClick('agenda')} className={`w-full flex items-center gap-3 p-4 rounded-xl text-sm font-bold transition-all ${activeTab === 'agenda' ? 'bg-purple-50 text-purple-600' : 'text-slate-500 hover:bg-slate-50 border border-transparent hover:border-slate-100'}`}><Calendar className="w-5 h-5" /> Agenda</button>
              <button onClick={() => handleTabClick('bot_config')} className={`w-full flex items-center gap-3 p-4 rounded-xl text-sm font-bold transition-all ${activeTab === 'bot_config' ? 'bg-teal-50 text-teal-600' : 'text-slate-500 hover:bg-slate-50 border border-transparent hover:border-slate-100'}`}><Bot className="w-5 h-5" /> Configurar IA</button>
              <div className="h-px bg-slate-100 my-2"></div>
              <button onClick={() => handleTabClick('team')} className={`w-full flex items-center gap-3 p-4 rounded-xl text-sm font-bold transition-all ${activeTab === 'team' ? 'bg-blue-50 text-blue-600' : 'text-slate-500 hover:bg-slate-50 border border-transparent hover:border-slate-100'}`}><User className="w-5 h-5" /> Gestión de Equipo</button>
              <button onClick={() => handleTabClick('config')} className={`w-full flex items-center gap-3 p-4 rounded-xl text-sm font-bold transition-all ${activeTab === 'config' ? 'bg-purple-50 text-purple-600' : 'text-slate-500 hover:bg-slate-50 border border-transparent hover:border-slate-100'}`}><LayoutList className="w-5 h-5" /> Ajustes CRM</button>
              <button onClick={() => handleTabClick('whatsapp')} className={`w-full flex items-center gap-3 p-4 rounded-xl text-sm font-bold transition-all ${activeTab === 'whatsapp' ? 'bg-green-50 text-green-600' : 'text-slate-500 hover:bg-slate-50 border border-transparent hover:border-slate-100'}`}><MessageSquare className="w-5 h-5" /> Plantillas WhatsApp</button>
              <button onClick={() => handleTabClick('quick_replies')} className={`w-full flex items-center gap-3 p-4 rounded-xl text-sm font-bold transition-all ${activeTab === 'quick_replies' ? 'bg-yellow-50 text-yellow-600' : 'text-slate-500 hover:bg-slate-50 border border-transparent hover:border-slate-100'}`}><Zap className="w-5 h-5" /> Respuestas Rápidas</button>
          </div>

          <div className={`flex-1 p-4 md:p-8 overflow-y-auto w-full bg-slate-50 absolute inset-0 md:static transition-transform duration-300 ${showMobileMenu ? 'translate-x-full md:translate-x-0' : 'translate-x-0'}`}>
              
              {activeTab === 'team' && ( <div className="max-w-3xl mx-auto bg-white p-4 md:p-6 rounded-2xl border border-slate-200 shadow-sm"><div className="flex justify-between items-center mb-6"><h2 className="text-lg font-bold text-slate-800">Agentes</h2><button onClick={openCreateAgent} className="bg-blue-600 text-white px-3 py-2 rounded-lg font-bold text-sm hover:bg-blue-700 flex items-center gap-2 shadow-md active:scale-95 transition-transform"><Plus className="w-4 h-4"/> Nuevo</button></div><div className="space-y-3">{agents.map(agent => (<div key={agent.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100 group"><div className="flex items-center gap-3 overflow-hidden"><div className={`w-9 h-9 rounded-full flex-shrink-0 flex items-center justify-center text-white font-bold ${agent.role === 'Admin' ? 'bg-purple-500' : 'bg-blue-500'}`}>{agent.name.charAt(0).toUpperCase()}</div><div className="min-w-0"><p className="font-bold text-slate-700 text-sm truncate">{agent.name}</p><p className="text-xs text-slate-400 truncate">{agent.role}</p></div></div><div className="flex gap-1 md:opacity-0 md:group-hover:opacity-100 transition-opacity"><button onClick={() => openEditAgent(agent)} className="p-2 text-slate-400 hover:text-blue-500 bg-white border border-slate-200 rounded-lg"><Pencil className="w-4 h-4" /></button><button onClick={() => openDeleteAgent(agent)} className="p-2 text-slate-400 hover:text-red-500 bg-white border border-slate-200 rounded-lg"><Trash2 className="w-4 h-4" /></button></div></div>))}</div></div> )}
              {activeTab === 'config' && ( <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-6 pb-10"><div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm h-fit"><div className="flex justify-between items-center mb-4"><h2 className="text-base md:text-lg font-bold text-slate-800 flex items-center gap-2"><Briefcase className="w-5 h-5 text-purple-500"/> Departamentos</h2><button onClick={() => openAddConfig('Department')} className="bg-purple-100 text-purple-700 p-2 rounded-lg hover:bg-purple-200 transition"><Plus className="w-4 h-4"/></button></div><div className="space-y-2">{departments.map(d => (<div key={d.id} className="flex justify-between items-center p-3 bg-purple-50 rounded-xl border border-purple-100 text-purple-700 text-sm font-medium group"><span className="truncate">{d.name}</span><div className="flex gap-1 md:opacity-0 md:group-hover:opacity-100 transition-opacity flex-shrink-0"><button onClick={() => openEditConfig(d)} className="p-1.5 bg-white rounded-md hover:text-purple-900 shadow-sm"><Pencil className="w-3.5 h-3.5"/></button><button onClick={() => openDeleteConfig(d)} className="p-1.5 bg-white rounded-md hover:text-red-600 shadow-sm"><Trash2 className="w-3.5 h-3.5"/></button></div></div>))}</div></div><div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm h-fit"><div className="flex justify-between items-center mb-4"><h2 className="text-base md:text-lg font-bold text-slate-800 flex items-center gap-2"><CheckCircle className="w-5 h-5 text-green-500"/> Estados</h2><button onClick={() => openAddConfig('Status')} className="bg-green-100 text-green-700 p-2 rounded-lg hover:bg-green-200 transition"><Plus className="w-4 h-4"/></button></div><div className="space-y-2">{statuses.map(s => (<div key={s.id} className="flex justify-between items-center p-3 bg-green-50 rounded-xl border border-green-100 text-green-700 text-sm font-medium group"><span className="truncate">{s.name}</span><div className="flex gap-1 md:opacity-0 md:group-hover:opacity-100 transition-opacity flex-shrink-0"><button onClick={() => openEditConfig(s)} className="p-1.5 bg-white rounded-md hover:text-green-900 shadow-sm"><Pencil className="w-3.5 h-3.5"/></button><button onClick={() => openDeleteConfig(s)} className="p-1.5 bg-white rounded-md hover:text-red-600 shadow-sm"><Trash2 className="w-3.5 h-3.5"/></button></div></div>))}</div></div><div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm h-fit"><div className="flex justify-between items-center mb-4"><h2 className="text-base md:text-lg font-bold text-slate-800 flex items-center gap-2"><Tag className="w-5 h-5 text-orange-500"/> Etiquetas</h2><button onClick={() => openAddConfig('Tag')} className="bg-orange-100 text-orange-700 p-2 rounded-lg hover:bg-orange-200 transition"><Plus className="w-4 h-4"/></button></div><div className="space-y-2">{tags.map(t => (<div key={t.id} className="flex justify-between items-center p-3 bg-orange-50 rounded-xl border border-orange-100 text-orange-700 text-sm font-medium group"><span className="truncate">{t.name}</span><div className="flex gap-1 md:opacity-0 md:group-hover:opacity-100 transition-opacity flex-shrink-0"><button onClick={() => openEditConfig(t)} className="p-1.5 bg-white rounded-md hover:text-orange-900 shadow-sm"><Pencil className="w-3.5 h-3.5"/></button><button onClick={() => openDeleteConfig(t)} className="p-1.5 bg-white rounded-md hover:text-red-600 shadow-sm"><Trash2 className="w-3.5 h-3.5"/></button></div></div>))}</div></div></div> )}
              {activeTab === 'whatsapp' && <WhatsAppTemplatesManager />}
              {activeTab === 'analytics' && <AnalyticsDashboard />}
              {activeTab === 'agenda' && <CalendarDashboard />}
              {activeTab === 'bot_config' && ( <div className="max-w-4xl mx-auto bg-white p-6 rounded-2xl border border-slate-200 shadow-sm"><div className="mb-6"><h2 className="text-xl font-bold text-slate-800 flex items-center gap-2"><Bot className="w-6 h-6 text-teal-600" /> Configuración del Cerebro IA</h2><p className="text-sm text-slate-500">Define la personalidad, reglas y tono del asistente virtual.</p></div>{isLoadingPrompt ? (<div className="p-10 text-center text-slate-400"><RefreshCw className="animate-spin inline mr-2"/> Cargando prompt...</div>) : (<div className="space-y-4"><label className="text-xs font-bold text-slate-400 uppercase block">Instrucciones del Sistema (System Prompt)</label><textarea value={botPrompt} onChange={(e) => setBotPrompt(e.target.value)} className="w-full h-96 p-4 bg-slate-50 border border-slate-200 rounded-xl font-mono text-sm text-slate-700 focus:ring-2 focus:ring-teal-500 outline-none resize-none leading-relaxed" placeholder="Escribe aquí las instrucciones para la IA..."/><div className="flex justify-end"><button onClick={handleSavePrompt} className="bg-teal-600 hover:bg-teal-700 text-white font-bold py-3 px-8 rounded-xl shadow-lg shadow-teal-100 active:scale-95 transition-all flex items-center gap-2"><Save size={18}/> Guardar Cambios</button></div></div>)}</div> )}

              {/* PESTAÑA NOTIFICACIONES */}
              {activeTab === 'notifications' && (
                  <div className="max-w-4xl mx-auto bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                      <div className="flex justify-between items-center mb-6">
                          <div>
                              <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2"><Bell className="w-6 h-6 text-orange-500" /> Configurar Alertas</h2>
                              <p className="text-sm text-slate-500">Define qué mensajes deben sonar para cada agente.</p>
                          </div>
                      </div>

                      <div className="grid gap-4">
                          {agents.map(agent => (
                              <div key={agent.id} className="flex items-center justify-between p-4 bg-slate-50 border border-slate-200 rounded-xl">
                                  <div className="flex items-center gap-3">
                                      <div className="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center font-bold text-slate-600">{agent.name.charAt(0)}</div>
                                      <div>
                                          <p className="font-bold text-slate-800">{agent.name}</p>
                                          <p className="text-xs text-slate-500">
                                              {(agent.preferences?.departments?.length || 0) + (agent.preferences?.phoneIds?.length || 0) + (agent.preferences?.notifyNewLeads ? 1 : 0)} reglas activas
                                          </p>
                                      </div>
                                  </div>
                                  <button onClick={() => openEditNotifications(agent)} className="px-4 py-2 bg-white border border-slate-300 text-slate-600 rounded-lg text-sm font-bold hover:bg-slate-50 transition">Configurar</button>
                              </div>
                          ))}
                      </div>
                  </div>
              )}
          </div>
      </div>
      
      {/* MODAL (IGUAL + NOTIFICACIONES) */}
      {modalType !== 'none' && (
          <div className="fixed inset-0 bg-black/50 z-[60] flex items-end md:items-center justify-center p-0 md:p-4 animate-in fade-in backdrop-blur-sm">
              <div className="bg-white w-full md:max-w-md rounded-t-2xl md:rounded-2xl shadow-2xl p-6 animate-in slide-in-from-bottom-10 md:zoom-in-95 max-h-[90vh] overflow-y-auto">
                  <div className="flex justify-between items-center mb-6"><h3 className="text-xl font-bold text-slate-800">{modalType === 'edit_notifications' ? 'Preferencias' : (modalType.includes('create') || modalType.includes('add') ? 'Crear' : modalType.includes('edit') ? 'Editar' : 'Eliminar')}</h3><button onClick={closeModal} className="p-2 bg-slate-100 rounded-full hover:bg-slate-200"><X className="w-5 h-5 text-slate-600"/></button></div>
                  
                  {modalType === 'edit_notifications' ? (
                      <form onSubmit={handleSaveNotifications} className="space-y-6">
                          {/* OPCIÓN: CONTACTOS NUEVOS (AÑADIDO) */}
                          <div className="flex items-center justify-between p-3 border rounded-lg bg-white border-slate-200">
                              <div className="flex items-center gap-2">
                                  <UserPlus className="text-green-500" size={18} />
                                  <span className="text-sm font-bold text-slate-700">Contactos Nuevos (Leads)</span>
                              </div>
                              <button type="button" onClick={() => setPrefNewLeads(!prefNewLeads)} className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition ${prefNewLeads ? 'bg-green-600 text-white border-green-600' : 'bg-white text-slate-500 border-slate-200'}`}>
                                  {prefNewLeads ? 'Sí' : 'No'}
                              </button>
                          </div>

                          <div>
                              <h4 className="text-xs font-bold text-slate-400 uppercase mb-3">Departamentos</h4>
                              <div className="grid grid-cols-2 gap-2">
                                  {departments.map(d => (
                                      <button type="button" key={d.id} onClick={() => toggleSelection(prefDepts, d.name, setPrefDepts)} className={`p-2 rounded-lg text-xs font-bold border transition ${prefDepts.includes(d.name) ? 'bg-blue-50 border-blue-500 text-blue-700' : 'bg-white border-slate-200 text-slate-500'}`}>{d.name}</button>
                                  ))}
                              </div>
                          </div>
                          <div>
                              <h4 className="text-xs font-bold text-slate-400 uppercase mb-3">Líneas de Teléfono</h4>
                              <div className="space-y-2">
                                  {phoneLines.map(line => (
                                      <button type="button" key={line.id} onClick={() => toggleSelection(prefLines, line.id, setPrefLines)} className={`w-full text-left p-3 rounded-lg text-xs font-bold border transition flex justify-between items-center ${prefLines.includes(line.id) ? 'bg-green-50 border-green-500 text-green-700' : 'bg-white border-slate-200 text-slate-500'}`}><span>{line.name}</span>{prefLines.includes(line.id) && <CheckCircle size={14}/>}</button>
                                  ))}
                              </div>
                          </div>
                          <button type="submit" disabled={isSaving} className="w-full py-3 rounded-xl font-bold text-white bg-slate-900 hover:bg-slate-800 shadow-lg disabled:opacity-75">{isSaving ? 'Guardando...' : 'Guardar Preferencias'}</button>
                      </form>
                  ) : (
                      <form onSubmit={handleSubmit} className="space-y-5 pb-safe">
                          {/* ... FORMULARIOS ANTERIORES ... */}
                          {(modalType.includes('agent') && !modalType.includes('delete')) && (<><div><label className="text-xs font-bold text-slate-400 uppercase ml-1 mb-1 block">Nombre</label><input value={formName} onChange={e => setFormName(e.target.value)} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl" required /></div><div><label className="text-xs font-bold text-slate-400 uppercase ml-1 mb-1 block">Rol</label><select value={formRole} onChange={e => setFormRole(e.target.value)} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl"><option value="Ventas">Ventas</option><option value="Taller">Taller</option><option value="Admin">Admin</option></select></div></>)}
                          {(modalType.includes('config') && !modalType.includes('delete')) && (<div><label className="text-xs font-bold text-slate-400 uppercase ml-1 mb-1 block">Nombre {formType === 'Department' ? 'Departamento' : formType === 'Status' ? 'Estado' : 'Etiqueta'}</label><input value={formName} onChange={e => setFormName(e.target.value)} placeholder="Ej: VIP" className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl" required /></div>)}
                          {(modalType === 'add_quick_reply' || modalType === 'edit_quick_reply') && (<><div><label className="text-xs font-bold text-slate-400 uppercase ml-1 mb-1 block">Título</label><input value={qrTitle} onChange={e => setQrTitle(e.target.value)} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl" required /></div><div><label className="text-xs font-bold text-slate-400 uppercase ml-1 mb-1 block">Contenido</label><textarea value={qrContent} onChange={e => setQrContent(e.target.value)} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl resize-none" required /></div><div><label className="text-xs font-bold text-slate-400 uppercase ml-1 mb-1 block">Atajo (Opcional)</label><input value={qrShortcut} onChange={e => setQrShortcut(e.target.value)} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl font-mono" /></div></>)}
                          {(modalType.includes('delete')) && <div className="bg-red-50 p-4 rounded-xl text-red-600 text-sm font-medium border border-red-100">¿Estás seguro? Esta acción es irreversible.</div>}
                          <button type="submit" className={`w-full py-4 rounded-xl font-bold text-white shadow-lg ${modalType.includes('delete') ? 'bg-red-600' : 'bg-slate-900'}`}>Confirmar</button>
                      </form>
                  )}
              </div>
          </div>
      )}
    </div>
  );
}