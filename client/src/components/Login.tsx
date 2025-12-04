import { useState, useEffect } from 'react';
import { User, Plus, Briefcase, ArrowRight, RefreshCw, Lock, Trash2, ShieldAlert, LogIn } from 'lucide-react';

interface LoginProps {
  onLogin: (username: string, role: string) => void;
  socket: any;
}

interface Agent {
  id: string;
  name: string;
  role: string;
  hasPassword?: boolean; // Nuevo flag del servidor
}

export function Login({ onLogin, socket }: LoginProps) {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [view, setView] = useState<'list' | 'login' | 'create' | 'authorize_delete'>('list');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [passwordInput, setPasswordInput] = useState('');
  const [adminPasswordInput, setAdminPasswordInput] = useState('');
  
  const [newName, setNewName] = useState('');
  const [newRole, setNewRole] = useState('Ventas');
  const [newPassword, setNewPassword] = useState('');

  useEffect(() => {
    if (socket) {
        socket.emit('request_agents');
        
        socket.on('agents_list', (list: Agent[]) => {
            setAgents(list);
            setLoading(false);
            if (list.length === 0) setView('create');
        });

        socket.on('login_success', (user: any) => {
            onLogin(user.username, user.role);
        });

        socket.on('login_error', (msg: string) => setError(msg));
        socket.on('action_error', (msg: string) => setError(msg));
        
        socket.on('action_success', () => {
            setView('list');
            resetForms();
        });
    }
    return () => { 
        socket?.off('agents_list'); 
        socket?.off('login_success'); 
        socket?.off('login_error');
        socket?.off('action_error');
        socket?.off('action_success');
    };
  }, [socket]);

  const resetForms = () => {
      setPasswordInput('');
      setAdminPasswordInput('');
      setNewName('');
      setNewPassword('');
      setError('');
      setSelectedAgent(null);
  };

  const handleLoginSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      if (selectedAgent) {
          // Si no tiene password, enviamos string vacía, el server ya sabe que es válido
          socket.emit('login_attempt', { name: selectedAgent.name, password: passwordInput });
      }
  };

  const handleCreateSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      setError('');
      if (newRole === 'Admin' && !newPassword.trim()) {
          setError("El perfil Administrador OBLIGATORIAMENTE necesita contraseña.");
          return;
      }
      socket.emit('create_agent', {
          newAgent: { name: newName, role: newRole, password: newPassword },
          adminPassword: adminPasswordInput
      });
  };

  const handleDeleteSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      if (selectedAgent && adminPasswordInput) {
          socket.emit('delete_agent', { agentId: selectedAgent.id, adminPassword: adminPasswordInput });
      }
  };

  // Helper para iniciales
  const getInitial = (name: string) => (name || "?").charAt(0).toUpperCase();

  return (
    <div className="flex flex-col items-center justify-center min-h-[500px] w-full max-w-md px-6 animate-in fade-in zoom-in duration-300">
      
      <div className="text-center mb-8">
        <div className="bg-blue-600 w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-blue-200 rotate-3">
            <User className="w-8 h-8 text-white" />
        </div>
        <h2 className="text-3xl font-bold text-slate-800">
            {view === 'list' ? 'Equipo' : view === 'login' ? `Hola, ${selectedAgent?.name}` : 'Gestión'}
        </h2>
        <p className="text-slate-500 mt-2">
            {view === 'list' ? 'Selecciona tu perfil' : view === 'login' ? (selectedAgent?.hasPassword ? 'Introduce tu contraseña' : 'Haz clic para entrar') : 'Configuración del sistema'}
        </p>
      </div>

      {view === 'list' && (
        <div className="w-full space-y-3">
            <div className="max-h-[300px] overflow-y-auto space-y-3 pr-2 custom-scrollbar">
                {loading ? <RefreshCw className="w-6 h-6 animate-spin mx-auto text-slate-400" /> : 
                 agents.map((agent) => (
                    <div key={agent.id} className="group flex items-center gap-2">
                        <button
                            onClick={() => { setSelectedAgent(agent); setView('login'); setError(''); }}
                            className="flex-1 flex items-center justify-between p-4 bg-white border border-slate-200 rounded-xl hover:border-blue-500 hover:shadow-md transition-all text-left"
                        >
                            <div className="flex items-center gap-3">
                                <div className={`h-10 w-10 rounded-full flex items-center justify-center text-white font-bold ${agent.role === 'Admin' ? 'bg-purple-600' : 'bg-blue-500'}`}>
                                    {getInitial(agent.name)}
                                </div>
                                <div>
                                    <h3 className="font-bold text-slate-700">{agent.name}</h3>
                                    <div className="flex items-center gap-2">
                                        <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full border border-slate-100">{agent.role}</span>
                                        {!agent.hasPassword && <span className="text-[10px] text-green-600 bg-green-50 px-1.5 rounded border border-green-100">Libre</span>}
                                        {agent.hasPassword && <Lock className="w-3 h-3 text-slate-300" />}
                                    </div>
                                </div>
                            </div>
                            <ArrowRight className="w-5 h-5 text-slate-300 group-hover:text-blue-500" />
                        </button>
                        
                        {agents.length > 1 && (
                            <button 
                                onClick={() => { setSelectedAgent(agent); setView('authorize_delete'); setError(''); }}
                                className="p-4 bg-white border border-slate-200 rounded-xl text-slate-400 hover:text-red-500 hover:border-red-200 transition"
                            >
                                <Trash2 className="w-5 h-5" />
                            </button>
                        )}
                    </div>
                ))}
            </div>

            <button onClick={() => { setView('create'); setError(''); }} className="w-full py-3 border-2 border-dashed border-slate-300 rounded-xl text-slate-500 font-semibold hover:border-blue-400 hover:text-blue-500 transition-colors flex items-center justify-center gap-2 mt-4">
                <Plus className="w-5 h-5" /> Crear Nuevo Perfil
            </button>
        </div>
      )}

      {/* LOGIN */}
      {view === 'login' && (
        <form onSubmit={handleLoginSubmit} className="w-full bg-white p-6 rounded-2xl shadow-lg border border-slate-100">
            {selectedAgent?.hasPassword ? (
                <div className="mb-4">
                    <label className="text-xs font-bold text-slate-500 uppercase">Contraseña</label>
                    <div className="relative mt-1">
                        <Lock className="w-4 h-4 absolute left-3 top-3.5 text-slate-400" />
                        <input type="password" autoFocus value={passwordInput} onChange={(e) => setPasswordInput(e.target.value)} className="w-full p-3 pl-10 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:border-blue-500" placeholder="••••••" />
                    </div>
                </div>
            ) : (
                <div className="mb-6 text-center p-4 bg-green-50 rounded-xl border border-green-100 text-green-700 text-sm font-medium">
                    Este perfil no tiene contraseña.
                    <br/>Puedes entrar directamente.
                </div>
            )}
            
            {error && <p className="text-xs text-red-500 mb-4 text-center">{error}</p>}
            <div className="flex gap-2">
                <button type="button" onClick={() => { setView('list'); resetForms(); }} className="flex-1 py-2 text-slate-500 hover:bg-slate-50 rounded-lg">Volver</button>
                <button type="submit" className="flex-1 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-bold flex items-center justify-center gap-2">
                    {selectedAgent?.hasPassword ? "Verificar" : <>Entrar <LogIn className="w-4 h-4"/></>}
                </button>
            </div>
        </form>
      )}

      {/* CREAR */}
      {view === 'create' && (
        <form onSubmit={handleCreateSubmit} className="w-full bg-white p-6 rounded-2xl shadow-lg border border-slate-100">
            <h3 className="font-bold text-lg text-slate-800 mb-4">Nuevo Perfil</h3>
            <div className="space-y-3">
                <input value={newName} onChange={(e) => setNewName(e.target.value)} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-lg" placeholder="Nombre (ej: Laura)" required />
                <select value={newRole} onChange={(e) => setNewRole(e.target.value)} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-lg">
                    <option value="Ventas">Ventas</option>
                    <option value="Taller">Taller</option>
                    <option value="Admin">Administrador (Solo 1)</option>
                </select>
                
                <div>
                    <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-lg" placeholder={newRole === 'Admin' ? "Contraseña (Obligatoria)" : "Contraseña (Opcional)"} required={newRole === 'Admin'} />
                    {newRole !== 'Admin' && <p className="text-[10px] text-slate-400 mt-1 ml-1">Si la dejas vacía, podrá entrar cualquiera.</p>}
                </div>
                
                {agents.length > 0 && (
                    <div className="pt-4 border-t border-slate-100 mt-2">
                        <label className="text-xs font-bold text-red-500 uppercase flex items-center gap-1 mb-1"><ShieldAlert className="w-3 h-3"/> Autorización Admin</label>
                        <input type="password" value={adminPasswordInput} onChange={(e) => setAdminPasswordInput(e.target.value)} className="w-full p-3 bg-red-50 border border-red-100 rounded-lg text-red-900 placeholder:text-red-300" placeholder="Contraseña del Admin" required />
                    </div>
                )}
            </div>
            {error && <p className="text-xs text-red-500 mt-3 text-center">{error}</p>}
            <div className="flex gap-2 mt-4">
                <button type="button" onClick={() => { setView('list'); resetForms(); }} className="flex-1 py-2 text-slate-500">Cancelar</button>
                <button type="submit" className="flex-1 py-2 bg-green-600 text-white rounded-lg font-bold">Crear</button>
            </div>
        </form>
      )}

      {/* BORRAR */}
      {view === 'authorize_delete' && (
        <form onSubmit={handleDeleteSubmit} className="w-full bg-white p-6 rounded-2xl shadow-lg border border-red-100">
            <h3 className="font-bold text-lg text-red-600 mb-2">Eliminar a {selectedAgent?.name}</h3>
            <p className="text-sm text-slate-500 mb-4">Esta acción es irreversible. Se requiere permiso de administrador.</p>
            <div className="mb-4">
                <label className="text-xs font-bold text-slate-500 uppercase">Contraseña del Admin</label>
                <input type="password" autoFocus value={adminPasswordInput} onChange={(e) => setAdminPasswordInput(e.target.value)} className="w-full mt-1 p-3 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:border-red-500" placeholder="••••••" required />
            </div>
            {error && <p className="text-xs text-red-500 mb-4 text-center">{error}</p>}
            <div className="flex gap-2">
                <button type="button" onClick={() => { setView('list'); resetForms(); }} className="flex-1 py-2 text-slate-500 hover:bg-slate-50 rounded-lg">Cancelar</button>
                <button type="submit" className="flex-1 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 font-bold">Eliminar</button>
            </div>
        </form>
      )}
    </div>
  );
}