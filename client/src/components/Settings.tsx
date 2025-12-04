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

  // MODAL STATE
  const [modalType, setModalType] = useState<'none' | 'create_agent' | 'edit_agent' | 'delete_agent' | 'add_config' | 'edit_config' | 'delete_config'>('none');
  const [selectedItem, setSelectedItem] = useState<any>(null);
  
  // Form Inputs
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
        socket.on('action_success', (msg: string) => {
            setSuccess(msg);
            closeModal();
            setTimeout(() => setSuccess(''), 3000);
        });
    }
    return () => {
        socket?.off('agents_list'); socket?.off('config_list'); socket?.off('action_error'); socket?.off('action_success');
    };
  }, [socket]);

  const closeModal = () => {
      setModalType('none');
      setFormName(''); setFormPass(''); setError(''); setSelectedItem(null);
  };

  const openCreateAgent = () => { setModalType('create_agent'); setFormName(''); setFormRole('Ventas'); setFormPass(''); };
  const openEditAgent = (agent: Agent) => { setSelectedItem(agent); setFormName(agent.name); setFormRole(agent.role); setFormPass(''); setModalType('edit_agent'); };
  const openDeleteAgent = (agent: Agent) => { setSelectedItem(agent); setModalType('delete_agent'); };
  
  const openAddConfig = (type: string) => { setFormType(type); setFormName(''); setModalType('add_config'); };
  const openEditConfig = (item: ConfigItem) => { setSelectedItem(item); setFormName(item.name); setModalType('edit_config'); };
  const openDeleteConfig = (item: ConfigItem) => { setSelectedItem(item); setModalType('delete_config'); };

  const handleSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      if (!socket) return;
      
      // YA NO PEDIMOS CONTRASEÑA DE ADMIN AQUÍ, SE ASUME AUTORIZADO POR ESTAR EN ESTA PANTALLA
      switch (modalType) {
          case 'create_agent':
              socket.emit('create_agent', { newAgent: { name: formName, role: formRole, password: formPass } });
              break;
          case 'edit_agent':
              const updates: any = { name: formName, role: formRole };
              if (formPass) updates.password = formPass;
              socket.emit('update_agent', { agentId: selectedItem.id, updates });
              break;
          case 'delete_agent':
              socket.emit('delete_agent', { agentId: selectedItem.id });
              break;
          case 'add_config':
              socket.emit('add_config', { name: formName, type: formType });
              break;
          case 'edit_config':
              socket.emit('update_config', { id: selectedItem.id, name: formName });
              break;
          case 'delete_config':
              socket.emit('delete_config', { id: selectedItem.id });
              break;
      }
  };

  const departments = configList.filter(c => c.type === 'Department');
  const statuses = configList.filter(c => c.type === 'Status');

  return (
    <div className="fixed inset-0 bg-slate-50 z-50 flex flex-col">
      
      {/* Header */}
      <div className="bg-white border-b border-gray-200 p-4 flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-4">
              <button onClick={onBack} className="p-2 hover:bg-slate-100 rounded-full transition"><ArrowLeft className="w-6 h-6 text-slate-600" /></button>
              <h1 className="text-xl font-bold text-slate-800">Configuración Global</h1>
          </div>
          {success && <div className="bg-green-100 text-green-700 px-4 py-2 rounded-lg text-sm font-bold animate-in fade-in">{success}</div>}
          {error && <div className="bg-red-100 text-red-700 px-4 py-2 rounded-lg text-sm font-bold animate-in fade-in">{error}</div>}
      </div>

      <div className="flex flex-1 overflow-hidden">
          
          {/* Sidebar Tabs */}
          <div className="w-64 bg-white border-r border-gray-200 p-4 space-y-2">
              <button 
                onClick={() => setActiveTab('team')}
                className={`w-full flex items-center gap-3 p-3 rounded-xl text-sm font-bold transition-all ${activeTab === 'team' ? 'bg-blue-50 text-blue-600' : 'text-slate-500 hover:bg-slate-50'}`}
              >
                  <User className="w-5 h-5" /> Gestión de Equipo
              </button>
              <button 
                onClick={() => setActiveTab('config')}
                className={`w-full flex items-center gap-3 p-3 rounded-xl text-sm font-bold transition-all ${activeTab === 'config' ? 'bg-purple-50 text-purple-600' : 'text-slate-500 hover:bg-slate-50'}`}
              >
                  <LayoutList className="w-5 h-5" /> Dptos. y Estados
              </button>
          </div>

          {/* Content */}
          <div className="flex-1 p-8 overflow-y-auto">
              
              {/* PROTECCIÓN GLOBAL: SI NO ES ADMIN, BLOQUEADO TODO */}
              {currentUserRole !== 'Admin' ? (
                  <div className="flex flex-col items-center justify-center h-full text-slate-400 animate-in fade-in">
                      <div className="bg-red-50 p-6 rounded-full mb-4">
                        <ShieldAlert className="w-12 h-12 text-red-400" />
                      </div>
                      <h3 className="text-xl font-bold text-slate-700">Acceso Restringido</h3>
                      <p className="text-slate-500 mt-2 text-center max-w-md">
                        Solo los administradores tienen permiso para gestionar el equipo y la configuración del sistema.
                      </p>
                  </div>
              ) : (
                  <>
                    {/* --- PESTAÑA EQUIPO --- */}
                    {activeTab === 'team' && (
                        <div className="max-w-3xl mx-auto bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                            <div className="flex justify-between items-center mb-6">
                                <h2 className="text-lg font-bold text-slate-800">Agentes Activos</h2>
                                <button onClick={openCreateAgent} className="bg-blue-600 text-white px-4 py-2 rounded-lg font-bold text-sm hover:bg-blue-700 flex items-center gap-2"><Plus className="w-4 h-4"/> Nuevo</button>
                            </div>
                            <div className="space-y-2">
                                {agents.map(agent => (
                                    <div key={agent.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-100 group">
                                        <div className="flex items-center gap-3">
                                            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white font-bold ${agent.role === 'Admin' ? 'bg-purple-500' : 'bg-blue-500'}`}>{agent.name[0].toUpperCase()}</div>
                                            <div>
                                                <p className="font-bold text-slate-700 text-sm">{agent.name}</p>
                                                <p className="text-xs text-slate-400">{agent.role}</p>
                                            </div>
                                        </div>
                                        <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition">
                                            <button onClick={() => openEditAgent(agent)} className="p-2 text-slate-400 hover:text-blue-500 hover:bg-blue-50 rounded"><Pencil className="w-4 h-4" /></button>
                                            <button onClick={() => openDeleteAgent(agent)} className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded"><Trash2 className="w-4 h-4" /></button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* --- PESTAÑA CONFIG --- */}
                    {activeTab === 'config' && (
                        <div className="max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-8">
                            {/* DEPARTAMENTOS */}
                            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm h-fit">
                                <div className="flex justify-between items-center mb-4">
                                    <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2"><Briefcase className="w-5 h-5 text-purple-500"/> Departamentos</h2>
                                    <button onClick={() => openAddConfig('Department')} className="bg-purple-100 text-purple-700 p-2 rounded-lg hover:bg-purple-200"><Plus className="w-4 h-4"/></button>
                                </div>
                                <div className="space-y-2">
                                    {departments.map(d => (
                                        <div key={d.id} className="flex justify-between items-center p-2 bg-purple-50 rounded border border-purple-100 text-purple-700 text-sm font-medium group">
                                            {d.name}
                                            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition">
                                                <button onClick={() => openEditConfig(d)} className="p-1 hover:text-purple-900"><Pencil className="w-3.5 h-3.5"/></button>
                                                <button onClick={() => openDeleteConfig(d)} className="p-1 hover:text-red-600"><Trash2 className="w-3.5 h-3.5"/></button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                            {/* ESTADOS */}
                            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm h-fit">
                                <div className="flex justify-between items-center mb-4">
                                    <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2"><CheckCircle className="w-5 h-5 text-green-500"/> Estados</h2>
                                    <button onClick={() => openAddConfig('Status')} className="bg-green-100 text-green-700 p-2 rounded-lg hover:bg-green-200"><Plus className="w-4 h-4"/></button>
                                </div>
                                <div className="space-y-2">
                                    {statuses.map(s => (
                                        <div key={s.id} className="flex justify-between items-center p-2 bg-green-50 rounded border border-green-100 text-green-700 text-sm font-medium group">
                                            {s.name}
                                            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition">
                                                <button onClick={() => openEditConfig(s)} className="p-1 hover:text-green-900"><Pencil className="w-3.5 h-3.5"/></button>
                                                <button onClick={() => openDeleteConfig(s)} className="p-1 hover:text-red-600"><Trash2 className="w-3.5 h-3.5"/></button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}
                  </>
              )}
          </div>
      </div>

      {/* --- MODAL UNIFICADO (SIN PEDIR ADMIN PASS) --- */}
      {modalType !== 'none' && (
          <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4 animate-in fade-in">
              <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl p-6 animate-in zoom-in-95">
                  <div className="flex justify-between items-center mb-4">
                      <h3 className="text-xl font-bold text-slate-800">
                          {modalType === 'create_agent' && 'Crear Agente'}
                          {modalType === 'edit_agent' && 'Editar Agente'}
                          {modalType === 'delete_agent' && 'Eliminar Agente'}
                          {modalType === 'add_config' && 'Añadir Elemento'}
                          {modalType === 'edit_config' && 'Editar Elemento'}
                          {modalType === 'delete_config' && 'Eliminar Elemento'}
                      </h3>
                      <button onClick={closeModal} className="p-1 hover:bg-slate-100 rounded-full"><X className="w-5 h-5 text-slate-500"/></button>
                  </div>
                  
                  <form onSubmit={handleSubmit} className="space-y-4">
                      {/* Inputs Nombre/Rol */}
                      {(modalType === 'create_agent' || modalType === 'edit_agent') && (
                          <>
                            <input value={formName} onChange={e => setFormName(e.target.value)} placeholder="Nombre" className="w-full p-3 bg-slate-50 border border-slate-200 rounded-lg" required />
                            <select value={formRole} onChange={e => setFormRole(e.target.value)} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-lg">
                                <option value="Ventas">Ventas</option><option value="Taller">Taller</option><option value="Admin">Admin</option>
                            </select>
                            <input type="password" value={formPass} onChange={e => setFormPass(e.target.value)} placeholder={modalType === 'edit_agent' ? "Nueva contraseña (Opcional)" : "Contraseña (Opcional)"} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-lg" />
                          </>
                      )}

                      {/* Input Config */}
                      {(modalType === 'add_config' || modalType === 'edit_config') && (
                          <input value={formName} onChange={e => setFormName(e.target.value)} placeholder={`Nombre del ${formType}`} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-lg" required />
                      )}

                      {/* Mensaje Borrar */}
                      {(modalType.includes('delete')) && <p className="text-sm text-red-500 bg-red-50 p-3 rounded-lg">¿Estás seguro? Esta acción no se puede deshacer.</p>}

                      {error && <p className="text-sm text-red-600 text-center bg-red-50 p-2 rounded">{error}</p>}

                      <button type="submit" className="w-full py-3 bg-slate-900 text-white rounded-xl font-bold hover:bg-slate-800 transition">Confirmar</button>
                  </form>
              </div>
          </div>
      )}
    </div>
  );
}