import { useState, useEffect } from 'react';
import { User, Plus, Briefcase, ArrowLeft, Trash2, ShieldAlert, CheckCircle, LayoutList, RefreshCw } from 'lucide-react';

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
    type: string; // "Department" o "Status"
}

export function Settings({ onBack, socket }: SettingsProps) {
  const [activeTab, setActiveTab] = useState<'team' | 'config'>('team');
  const [agents, setAgents] = useState<Agent[]>([]);
  const [configList, setConfigList] = useState<ConfigItem[]>([]);
  
  // Forms Agentes
  const [newName, setNewName] = useState('');
  const [newRole, setNewRole] = useState('Ventas');
  const [newPassword, setNewPassword] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  
  // Forms Configuración (SEPARADOS para evitar efecto espejo)
  const [newDept, setNewDept] = useState('');
  const [newStatus, setNewStatus] = useState('');

  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    if (socket) {
        socket.emit('request_agents');
        socket.emit('request_config');

        socket.on('agents_list', (list: Agent[]) => setAgents(list));
        socket.on('config_list', (list: ConfigItem[]) => {
            console.log("Config recibida:", list); // Debug para ver si llegan
            setConfigList(list);
        });
        
        socket.on('action_error', (msg: string) => setError(msg));
        socket.on('action_success', (msg: string) => {
            setSuccess(msg);
            // Limpiar todos los formularios
            setNewName(''); setNewPassword(''); setAdminPassword('');
            setNewDept(''); setNewStatus('');
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

  // Añadir Departamento
  const handleAddDept = (e: React.FormEvent) => {
      e.preventDefault();
      if (newDept.trim()) {
          socket.emit('add_config', { name: newDept, type: 'Department' });
      }
  };

  // Añadir Estado
  const handleAddStatus = (e: React.FormEvent) => {
      e.preventDefault();
      if (newStatus.trim()) {
          socket.emit('add_config', { name: newStatus, type: 'Status' });
      }
  };

  const handleDeleteConfig = (id: string) => {
      socket.emit('delete_config', id);
  };

  // Filtramos la lista general para pintarla en dos columnas
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
                                          <button onClick={() => handleDeleteAgent(agent.id)} className="text-slate-300 hover:text-red-500 transition p-2"><Trash2 className="w-4 h-4" /></button>
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
                      
                      {/* COLUMNA DEPARTAMENTOS */}
                      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm h-fit">
                          <h2 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2"><Briefcase className="w-5 h-5 text-purple-500"/> Departamentos</h2>
                          
                          {/* Lista existente */}
                          <div className="space-y-2 mb-4 max-h-[300px] overflow-y-auto">
                              {departments.length === 0 && <p className="text-sm text-slate-400 italic">No hay departamentos.</p>}
                              {departments.map(d => (
                                  <div key={d.id} className="flex justify-between items-center p-3 bg-purple-50 rounded-lg border border-purple-100 text-purple-700 text-sm font-medium group">
                                      {d.name}
                                      <button onClick={() => handleDeleteConfig(d.id)} className="text-purple-300 hover:text-red-500 transition opacity-0 group-hover:opacity-100"><Trash2 className="w-4 h-4" /></button>
                                  </div>
                              ))}
                          </div>
                          
                          {/* Input Nuevo */}
                          <form onSubmit={handleAddDept} className="flex gap-2">
                              <input 
                                value={newDept} 
                                onChange={e => setNewDept(e.target.value)} 
                                placeholder="Añadir Dpto..." 
                                className="flex-1 p-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-purple-500" 
                                required 
                              />
                              <button type="submit" className="bg-purple-600 text-white p-2 rounded-lg hover:bg-purple-700"><Plus className="w-4 h-4" /></button>
                          </form>
                      </div>

                      {/* COLUMNA ESTADOS */}
                      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm h-fit">
                          <h2 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2"><CheckCircle className="w-5 h-5 text-green-500"/> Estados</h2>
                          
                          {/* Lista existente */}
                          <div className="space-y-2 mb-4 max-h-[300px] overflow-y-auto">
                              {statuses.length === 0 && <p className="text-sm text-slate-400 italic">No hay estados.</p>}
                              {statuses.map(s => (
                                  <div key={s.id} className="flex justify-between items-center p-3 bg-green-50 rounded-lg border border-green-100 text-green-700 text-sm font-medium group">
                                      {s.name}
                                      <button onClick={() => handleDeleteConfig(s.id)} className="text-green-300 hover:text-red-500 transition opacity-0 group-hover:opacity-100"><Trash2 className="w-4 h-4" /></button>
                                  </div>
                              ))}
                          </div>

                          {/* Input Nuevo */}
                          <form onSubmit={handleAddStatus} className="flex gap-2">
                              <input 
                                value={newStatus} 
                                onChange={e => setNewStatus(e.target.value)} 
                                placeholder="Añadir Estado..." 
                                className="flex-1 p-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-green-500" 
                                required 
                              />
                              <button type="submit" className="bg-green-600 text-white p-2 rounded-lg hover:bg-green-700"><Plus className="w-4 h-4" /></button>
                          </form>
                      </div>

                  </div>
              )}
          </div>
      </div>
    </div>
  );
}