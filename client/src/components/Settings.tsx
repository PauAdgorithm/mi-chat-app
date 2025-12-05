import { useState, useEffect } from 'react';
import { User, Plus, Briefcase, ArrowLeft, Trash2, ShieldAlert, CheckCircle, LayoutList, RefreshCw, Pencil, X } from 'lucide-react';

interface SettingsProps {
  onBack: () => void;
  socket: any;
  currentUserRole: string;
}

interface Agent { id: string; name: string; role: string; }
interface ConfigItem { id: string; name: string; type: string; }

export function Settings({ onBack, socket, currentUserRole }: SettingsProps) {
  const [activeTab, setActiveTab] = useState<'team' | 'config'>('team');
  const [agents, setAgents] = useState<Agent[]>([]);
  const [configList, setConfigList] = useState<ConfigItem[]>([]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showMobileMenu, setShowMobileMenu] = useState(true);

  const [modalType, setModalType] = useState<'none' | 'create_agent' | 'edit_agent' | 'delete_agent' | 'add_config' | 'edit_config' | 'delete_config'>('none');
  const [selectedItem, setSelectedItem] = useState<any>(null);
  
  const [formName, setFormName] = useState('');
  const [formRole, setFormRole] = useState('Ventas');
  const [formPass, setFormPass] = useState('');
  const [formType, setFormType] = useState('Department');

  useEffect(() => {
    if (socket) {
        socket.emit('request_agents');
        socket.emit('request_config');
        socket.on('agents_list', (list: Agent[]) => setAgents(list));
        socket.on('config_list', (list: ConfigItem[]) => setConfigList(list));
        socket.on('action_error', (msg: string) => setError(msg));
        socket.on('action_success', (msg: string) => { setSuccess(msg); closeModal(); setTimeout(() => setSuccess(''), 3000); });
    }
    return () => { socket?.off('agents_list'); socket?.off('config_list'); socket?.off('action_error'); socket?.off('action_success'); };
  }, [socket]);

  const closeModal = () => { setModalType('none'); setFormName(''); setFormPass(''); setError(''); setSelectedItem(null); };
  const openCreateAgent = () => { setModalType('create_agent'); setFormName(''); setFormRole('Ventas'); setFormPass(''); };
  const openEditAgent = (agent: Agent) => { setSelectedItem(agent); setFormName(agent.name); setFormRole(agent.role); setFormPass(''); setModalType('edit_agent'); };
  const openDeleteAgent = (agent: Agent) => { setSelectedItem(agent); setModalType('delete_agent'); };
  const openAddConfig = (type: string) => { setFormType(type); setFormName(''); setModalType('add_config'); };
  const openEditConfig = (item: ConfigItem) => { setSelectedItem(item); setFormName(item.name); setModalType('edit_config'); };
  const openDeleteConfig = (item: ConfigItem) => { setSelectedItem(item); setModalType('delete_config'); };

  const handleSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      if (!socket) return;
      switch (modalType) {
          case 'create_agent': socket.emit('create_agent', { newAgent: { name: formName, role: formRole, password: formPass } }); break;
          case 'edit_agent':
              const updates: any = { name: formName, role: formRole };
              if (formPass) updates.password = formPass;
              socket.emit('update_agent', { agentId: selectedItem.id, updates });
              break;
          case 'delete_agent': socket.emit('delete_agent', { agentId: selectedItem.id }); break;
          case 'add_config': socket.emit('add_config', { name: formName, type: formType }); break;
          case 'edit_config': socket.emit('update_config', { id: selectedItem.id, name: formName }); break;
          case 'delete_config': socket.emit('delete_config', { id: selectedItem.id }); break;
      }
  };

  const departments = configList.filter(c => c.type === 'Department');
  const statuses = configList.filter(c => c.type === 'Status');
  const handleTabClick = (tab: 'team' | 'config') => { setActiveTab(tab); setShowMobileMenu(false); };
  const handleBack = () => { if (!showMobileMenu) setShowMobileMenu(true); else onBack(); };

  if (currentUserRole !== 'Admin') return <div className="fixed inset-0 bg-slate-50 z-50 flex flex-col"><div className="bg-white border-b border-gray-200 p-4 flex items-center gap-4 shadow-sm"><button onClick={onBack} className="p-2 hover:bg-slate-100 rounded-full transition"><ArrowLeft className="w-6 h-6 text-slate-600" /></button><h1 className="text-xl font-bold text-slate-800">Configuración</h1></div><div className="flex flex-col items-center justify-center h-full text-slate-400 p-8 text-center animate-in fade-in"><div className="bg-red-50 p-6 rounded-full mb-4 border border-red-100"><ShieldAlert className="w-16 h-16 text-red-400" /></div><h3 className="text-2xl font-bold text-slate-700 mb-2">Acceso Restringido</h3><p className="text-slate-500 max-w-md">Solo los administradores tienen permiso.</p></div></div>;

  return (
    <div className="fixed inset-0 bg-slate-50 z-50 flex flex-col h-full w-full">
      <div className="bg-white border-b border-gray-200 p-4 flex items-center justify-between shadow-sm flex-shrink-0">
          <div className="flex items-center gap-3"><button onClick={handleBack} className="p-2 hover:bg-slate-100 rounded-full transition"><ArrowLeft className="w-6 h-6 text-slate-600" /></button><h1 className="text-lg md:text-xl font-bold text-slate-800 truncate">{!showMobileMenu ? (activeTab === 'team' ? 'Gestión Equipo' : 'Dptos. y Estados') : 'Configuración'}</h1></div>
          <div className="fixed top-4 right-4 z-[70] flex flex-col gap-2 items-end pointer-events-none">{success && <div className="bg-green-100 text-green-700 px-4 py-2 rounded-lg text-xs md:text-sm font-bold animate-in slide-in-from-right shadow-md pointer-events-auto">{success}</div>}{error && <div className="bg-red-100 text-red-700 px-4 py-2 rounded-lg text-xs md:text-sm font-bold animate-in slide-in-from-right shadow-md pointer-events-auto">{error}</div>}</div>
      </div>
      <div className="flex flex-1 overflow-hidden relative">
          <div className={`absolute inset-0 bg-white z-10 flex flex-col p-4 space-y-2 transition-transform duration-300 md:relative md:translate-x-0 md:w-64 md:border-r md:border-gray-200 ${!showMobileMenu ? '-translate-x-full' : 'translate-x-0'}`}>
              <button onClick={() => handleTabClick('team')} className={`w-full flex items-center gap-3 p-4 rounded-xl text-sm font-bold transition-all ${activeTab === 'team' ? 'bg-blue-50 text-blue-600' : 'text-slate-500 hover:bg-slate-50 border border-transparent hover:border-slate-100'}`}><User className="w-5 h-5" /> Gestión de Equipo</button>
              <button onClick={() => handleTabClick('config')} className={`w-full flex items-center gap-3 p-4 rounded-xl text-sm font-bold transition-all ${activeTab === 'config' ? 'bg-purple-50 text-purple-600' : 'text-slate-500 hover:bg-slate-50 border border-transparent hover:border-slate-100'}`}><LayoutList className="w-5 h-5" /> Dptos. y Estados</button>
          </div>
          <div className={`flex-1 p-4 md:p-8 overflow-y-auto w-full bg-slate-50 absolute inset-0 md:static transition-transform duration-300 ${showMobileMenu ? 'translate-x-full md:translate-x-0' : 'translate-x-0'}`}>
              {activeTab === 'team' && (
                  <div className="max-w-3xl mx-auto bg-white p-4 md:p-6 rounded-2xl border border-slate-200 shadow-sm">
                      <div className="flex justify-between items-center mb-6"><h2 className="text-lg font-bold text-slate-800">Agentes</h2><button onClick={openCreateAgent} className="bg-blue-600 text-white px-3 py-2 rounded-lg font-bold text-sm hover:bg-blue-700 flex items-center gap-2 shadow-md active:scale-95 transition-transform"><Plus className="w-4 h-4"/> Nuevo</button></div>
                      <div className="space-y-3">{agents.map(agent => (<div key={agent.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100 group"><div className="flex items-center gap-3 overflow-hidden"><div className={`w-9 h-9 rounded-full flex-shrink-0 flex items-center justify-center text-white font-bold ${agent.role === 'Admin' ? 'bg-purple-500' : 'bg-blue-500'}`}>{agent.name.charAt(0).toUpperCase()}</div><div className="min-w-0"><p className="font-bold text-slate-700 text-sm truncate">{agent.name}</p><p className="text-xs text-slate-400 truncate">{agent.role}</p></div></div><div className="flex gap-1 md:opacity-0 md:group-hover:opacity-100 transition-opacity"><button onClick={() => openEditAgent(agent)} className="p-2 text-slate-400 hover:text-blue-500 bg-white border border-slate-200 rounded-lg"><Pencil className="w-4 h-4" /></button><button onClick={() => openDeleteAgent(agent)} className="p-2 text-slate-400 hover:text-red-500 bg-white border border-slate-200 rounded-lg"><Trash2 className="w-4 h-4" /></button></div></div>))}</div>
                  </div>
              )}
              {activeTab === 'config' && (
                  <div className="max-w-4xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-6 pb-10">
                      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm h-fit"><div className="flex justify-between items-center mb-4"><h2 className="text-base md:text-lg font-bold text-slate-800 flex items-center gap-2"><Briefcase className="w-5 h-5 text-purple-500"/> Departamentos</h2><button onClick={() => openAddConfig('Department')} className="bg-purple-100 text-purple-700 p-2 rounded-lg hover:bg-purple-200 transition"><Plus className="w-4 h-4"/></button></div><div className="space-y-2">{departments.map(d => (<div key={d.id} className="flex justify-between items-center p-3 bg-purple-50 rounded-xl border border-purple-100 text-purple-700 text-sm font-medium group"><span className="truncate">{d.name}</span><div className="flex gap-1 md:opacity-0 md:group-hover:opacity-100 transition-opacity flex-shrink-0"><button onClick={() => openEditConfig(d)} className="p-1.5 bg-white rounded-md hover:text-purple-900 shadow-sm"><Pencil className="w-3.5 h-3.5"/></button><button onClick={() => openDeleteConfig(d)} className="p-1.5 bg-white rounded-md hover:text-red-600 shadow-sm"><Trash2 className="w-3.5 h-3.5"/></button></div></div>))}</div></div>
                      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm h-fit"><div className="flex justify-between items-center mb-4"><h2 className="text-base md:text-lg font-bold text-slate-800 flex items-center gap-2"><CheckCircle className="w-5 h-5 text-green-500"/> Estados</h2><button onClick={() => openAddConfig('Status')} className="bg-green-100 text-green-700 p-2 rounded-lg hover:bg-green-200 transition"><Plus className="w-4 h-4"/></button></div><div className="space-y-2">{statuses.map(s => (<div key={s.id} className="flex justify-between items-center p-3 bg-green-50 rounded-xl border border-green-100 text-green-700 text-sm font-medium group"><span className="truncate">{s.name}</span><div className="flex gap-1 md:opacity-0 md:group-hover:opacity-100 transition-opacity flex-shrink-0"><button onClick={() => openEditConfig(s)} className="p-1.5 bg-white rounded-md hover:text-green-900 shadow-sm"><Pencil className="w-3.5 h-3.5"/></button><button onClick={() => openDeleteConfig(s)} className="p-1.5 bg-white rounded-md hover:text-red-600 shadow-sm"><Trash2 className="w-3.5 h-3.5"/></button></div></div>))}</div></div>
                  </div>
              )}
          </div>
      </div>
      {modalType !== 'none' && (
          <div className="fixed inset-0 bg-black/50 z-[60] flex items-end md:items-center justify-center p-0 md:p-4 animate-in fade-in backdrop-blur-sm">
              <div className="bg-white w-full md:max-w-md rounded-t-2xl md:rounded-2xl shadow-2xl p-6 animate-in slide-in-from-bottom-10 md:zoom-in-95 max-h-[90vh] overflow-y-auto">
                  <div className="flex justify-between items-center mb-6"><h3 className="text-xl font-bold text-slate-800">{modalType.includes('create') || modalType.includes('add') ? 'Crear' : modalType.includes('edit') ? 'Editar' : 'Eliminar'}</h3><button onClick={closeModal} className="p-2 bg-slate-100 rounded-full hover:bg-slate-200"><X className="w-5 h-5 text-slate-600"/></button></div>
                  <form onSubmit={handleSubmit} className="space-y-5 pb-safe">
                      {(modalType.includes('agent') && !modalType.includes('delete')) && (<><div><label className="text-xs font-bold text-slate-400 uppercase ml-1 mb-1 block">Nombre</label><input value={formName} onChange={e => setFormName(e.target.value)} placeholder="Ej: Laura" className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all" required /></div><div><label className="text-xs font-bold text-slate-400 uppercase ml-1 mb-1 block">Rol</label><select value={formRole} onChange={e => setFormRole(e.target.value)} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all appearance-none"><option value="Ventas">Ventas</option><option value="Taller">Taller</option><option value="Admin">Admin</option></select></div><div><label className="text-xs font-bold text-slate-400 uppercase ml-1 mb-1 block">Contraseña</label><input type="password" value={formPass} onChange={e => setFormPass(e.target.value)} placeholder={modalType === 'edit_agent' ? "Nueva contraseña (Opcional)" : "Contraseña (Opcional)"} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all" /></div></>)}
                      {(modalType.includes('config') && !modalType.includes('delete')) && (<div><label className="text-xs font-bold text-slate-400 uppercase ml-1 mb-1 block">Nombre del {formType === 'Department' ? 'Departamento' : 'Estado'}</label><input value={formName} onChange={e => setFormName(e.target.value)} placeholder="Ej: Post-Venta" className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all" required /></div>)}
                      {(modalType.includes('delete')) && <div className="bg-red-50 p-4 rounded-xl text-red-600 text-sm font-medium border border-red-100">¿Estás seguro? Esta acción es irreversible.</div>}
                      <button type="submit" className={`w-full py-4 rounded-xl font-bold text-white shadow-lg active:scale-95 transition-transform ${modalType.includes('delete') ? 'bg-red-600 hover:bg-red-700 shadow-red-200' : 'bg-slate-900 hover:bg-slate-800 shadow-slate-200'}`}>Confirmar Acción</button>
                  </form>
              </div>
          </div>
      )}
    </div>
  );
}