import { useState, useEffect } from 'react';
import { User, Plus, Briefcase, ArrowLeft, Trash2, ShieldAlert, CheckCircle, LayoutList } from 'lucide-react';

interface SettingsProps {
  onBack: () => void;
  socket: any;
}

interface Agent {
  id: string;
  name: string;
  role: string;
}

interface ConfigItem {
    id: string;
    name: string;
    type: string;
}

export function Settings({ onBack, socket }: SettingsProps) {
  const [activeTab, setActiveTab] = useState<'team' | 'config'>('team');
  const [agents, setAgents] = useState<Agent[]>([]);
  const [configList, setConfigList] = useState<ConfigItem[]>([]);
  
  // Forms
  const [newName, setNewName] = useState('');
  const [newRole, setNewRole] = useState('Ventas');
  const [newPassword, setNewPassword] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  
  const [newConfigName, setNewConfigName] = useState('');
  const [newConfigType, setNewConfigType] = useState('Department');

  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    if (socket) {
        socket.emit('request_agents');
        socket.emit('request_config');

        socket.on('agents_list', (list: Agent[]) => setAgents(list));
        socket.on('config_list', (list: ConfigItem[]) => setConfigList(list));
        
        socket.on('action_error', (msg: string) => setError(msg));
        socket.on('action_success', (msg: string) => {
            setSuccess(msg);
            setNewName('');
            setNewPassword('');
            setAdminPassword('');
            setNewConfigName('');
            setTimeout(() => setSuccess(''), 3000);
        });
    }
    return () => {
        socket?.off('agents_list');
        socket?.off('config_list');
        socket?.off('action_error');
        socket?.off('action_success');
    };
  }, [socket]);

  const handleCreateAgent = (e: React.FormEvent) => {
      e.preventDefault();
      setError('');
      socket.emit('create_agent', {
          newAgent: { name: newName, role: newRole, password: newPassword },
          adminPassword: adminPassword
      });
  };

  const handleDeleteAgent = (id: string) => {
      if(!adminPassword) { setError("Introduce la contraseña de Admin abajo para borrar."); return; }
      socket.emit('delete_agent', { agentId: id, adminPassword });
  };

  const handleAddConfig = (e: React.FormEvent) => {
      e.preventDefault();
      if (newConfigName.trim()) {
          socket.emit('add_config', { name: newConfigName, type: newConfigType });
          setNewConfigName('');
      }
  };

  const handleDeleteConfig = (id: string) => {
      socket.emit('delete_config', id);
  };

  const departments = configList.filter(c => c.type === 'Department');
  const statuses = configList.filter(c => c.type === 'Status');

  return (
    <div className="fixed inset-0 bg-slate-50 z-50 flex flex-col">
      
      {/* Header */}
      <div className="bg-white border-b border-gray-200 p-4 flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-4">
              <button onClick={onBack} className="p-2 hover:bg-slate-100 rounded-full transition"><ArrowLeft className="w-6 h-6 text-slate-600" /></button>
              <h1 className="text-xl font-bold text-slate-800">Configuración</h1>
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
              
              {/* --- PESTAÑA EQUIPO --- */}
              {activeTab === 'team' && (
                  <div className="max-w-3xl mx-auto space-y-8">
                      {/* Lista */}
                      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                          <h2 className="text-lg font-bold text-slate-800 mb-4">Agentes Activos</h2>
                          <div className="space-y-2">
                              {agents.map(agent => (
                                  <div key={agent.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-100">
                                      <div className="flex items-center gap-3">
                                          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white font-bold ${agent.role === 'Admin' ? 'bg-purple-500' : 'bg-blue-500'}`}>{agent.name[0]}</div>
                                          <div>
                                              <p className="font-bold text-slate-700 text-sm">{agent.name}</p>
                                              <p className="text-xs text-slate-400">{agent.role}</p>
                                          </div>
                                      </div>
                                      {agents.length > 1 && (
                                          <button onClick={() => handleDeleteAgent(agent.id)} className="text-slate-300 hover:text-red-500 transition"><Trash2 className="w-4 h-4" /></button>
                                      )}
                                  </div>
                              ))}
                          </div>
                      </div>

                      {/* Crear */}
                      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                          <h2 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2"><Plus className="w-5 h-5" /> Añadir Agente</h2>
                          <form onSubmit={handleCreateAgent} className="space-y-4">
                              <div className="grid grid-cols-2 gap-4">
                                  <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Nombre" className="p-3 bg-slate-50 border rounded-lg" required />
                                  <select value={newRole} onChange={e => setNewRole(e.target.value)} className="p-3 bg-slate-50 border rounded-lg">
                                      <option value="Ventas">Ventas</option>
                                      <option value="Taller">Taller</option>
                                      <option value="Admin">Admin</option>
                                  </select>
                              </div>
                              <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder={newRole === 'Admin' ? "Contraseña (Obligatoria)" : "Contraseña (Opcional)"} className="w-full p-3 bg-slate-50 border rounded-lg" />
                              
                              <div className="pt-4 border-t border-slate-100">
                                  <label className="text-xs font-bold text-red-500 uppercase flex items-center gap-1 mb-2"><ShieldAlert className="w-3 h-3"/> Confirmación de Admin (Para crear o borrar)</label>
                                  <div className="flex gap-2">
                                      <input type="password" value={adminPassword} onChange={e => setAdminPassword(e.target.value)} placeholder="Contraseña del Admin actual" className="flex-1 p-3 bg-red-50 border border-red-100 rounded-lg text-red-900" required />
                                      <button type="submit" className="bg-slate-900 text-white px-6 rounded-lg font-bold hover:bg-slate-800 transition">Ejecutar</button>
                                  </div>
                              </div>
                          </form>
                      </div>
                  </div>
              )}

              {/* --- PESTAÑA CONFIG --- */}
              {activeTab === 'config' && (
                  <div className="max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-8">
                      
                      {/* Departamentos */}
                      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm h-fit">
                          <h2 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2"><Briefcase className="w-5 h-5 text-purple-500"/> Departamentos</h2>
                          <div className="space-y-2 mb-4">
                              {departments.map(d => (
                                  <div key={d.id} className="flex justify-between items-center p-2 bg-purple-50 rounded border border-purple-100 text-purple-700 text-sm font-medium">
                                      {d.name}
                                      <button onClick={() => handleDeleteConfig(d.id)} className="text-purple-300 hover:text-purple-700"><XIcon /></button>
                                  </div>
                              ))}
                          </div>
                          <form onSubmit={handleAddConfig} className="flex gap-2">
                              <input value={newConfigName} onChange={e => { setNewConfigName(e.target.value); setNewConfigType('Department'); }} placeholder="Nuevo Dpto..." className="flex-1 p-2 border rounded text-sm" required={newConfigType === 'Department'} />
                              <button type="submit" onClick={() => setNewConfigType('Department')} className="bg-purple-600 text-white p-2 rounded"><Plus className="w-4 h-4" /></button>
                          </form>
                      </div>

                      {/* Estados */}
                      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm h-fit">
                          <h2 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2"><CheckCircle className="w-5 h-5 text-green-500"/> Estados</h2>
                          <div className="space-y-2 mb-4">
                              {statuses.map(s => (
                                  <div key={s.id} className="flex justify-between items-center p-2 bg-green-50 rounded border border-green-100 text-green-700 text-sm font-medium">
                                      {s.name}
                                      <button onClick={() => handleDeleteConfig(s.id)} className="text-green-300 hover:text-green-700"><XIcon /></button>
                                  </div>
                              ))}
                          </div>
                          <form onSubmit={handleAddConfig} className="flex gap-2">
                              <input value={newConfigName} onChange={e => { setNewConfigName(e.target.value); setNewConfigType('Status'); }} placeholder="Nuevo Estado..." className="flex-1 p-2 border rounded text-sm" required={newConfigType === 'Status'} />
                              <button type="submit" onClick={() => setNewConfigType('Status')} className="bg-green-600 text-white p-2 rounded"><Plus className="w-4 h-4" /></button>
                          </form>
                      </div>

                  </div>
              )}
          </div>
      </div>
    </div>
  );
}

const XIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>;