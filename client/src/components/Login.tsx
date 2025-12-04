import { useState, useEffect } from 'react';
import { User, Plus, Briefcase, ArrowRight, RefreshCw } from 'lucide-react';

interface LoginProps {
  onLogin: (username: string, role: string) => void;
  socket: any;
}

interface Agent {
  id: string;
  name: string;
  role: string;
}

export function Login({ onLogin, socket }: LoginProps) {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newRole, setNewRole] = useState('Ventas');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (socket) {
        // Pedir lista al cargar
        socket.emit('request_agents');
        
        socket.on('agents_list', (list: any[]) => {
            console.log("👥 Lista de agentes recibida:", list);
            
            // PROTECCIÓN ANTI-CRASH: 
            // 1. Aseguramos que sea un array
            // 2. Filtramos agentes que sean null o no tengan nombre (filas vacías de Airtable)
            const safeList = Array.isArray(list) 
                ? list.filter(agent => agent && agent.name && agent.name.trim() !== "") 
                : [];
                
            setAgents(safeList);
            setLoading(false);
        });
    }
    return () => { socket?.off('agents_list'); };
  }, [socket]);

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (newName.trim()) {
        setLoading(true);
        socket.emit('create_agent', { name: newName, role: newRole });
        setNewName('');
        setIsCreating(false);
    }
  };

  // Helper seguro para iniciales
  const getInitial = (name: string) => {
      return (name || "?").charAt(0).toUpperCase();
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-[500px] w-full max-w-md px-6 animate-in fade-in zoom-in duration-300">
      
      <div className="text-center mb-8">
        <div className="bg-blue-600 w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-blue-200 rotate-3">
            <User className="w-8 h-8 text-white" />
        </div>
        <h2 className="text-3xl font-bold text-slate-800">¿Quién eres?</h2>
        <p className="text-slate-500 mt-2">Selecciona tu perfil para entrar</p>
      </div>

      {!isCreating ? (
        <div className="w-full space-y-3">
            {/* LISTA DE PERFILES */}
            <div className="max-h-[300px] overflow-y-auto space-y-3 pr-2 custom-scrollbar">
                {loading ? (
                    <div className="text-center py-8 text-slate-400 flex flex-col items-center">
                        <RefreshCw className="w-6 h-6 animate-spin mb-2" />
                        <p>Cargando equipo...</p>
                    </div>
                ) : agents.length === 0 ? (
                    <div className="text-center text-slate-400 py-4 italic border-2 border-dashed border-slate-200 rounded-xl">
                        No hay perfiles creados. ¡Crea el primero!
                    </div>
                ) : (
                    agents.map((agent) => (
                        <button
                            key={agent.id || Math.random()}
                            onClick={() => onLogin(agent.name, agent.role)}
                            className="w-full flex items-center justify-between p-4 bg-white border border-slate-200 rounded-xl hover:border-blue-500 hover:shadow-md transition-all group text-left relative overflow-hidden"
                        >
                            <div className="absolute inset-0 bg-blue-50 opacity-0 group-hover:opacity-100 transition-opacity duration-200" />
                            <div className="flex items-center gap-4 relative z-10">
                                <div className="h-12 w-12 rounded-full bg-gradient-to-br from-slate-100 to-slate-200 flex items-center justify-center text-slate-600 font-bold text-lg group-hover:from-blue-500 group-hover:to-indigo-600 group-hover:text-white transition-all shadow-sm">
                                    {getInitial(agent.name)}
                                </div>
                                <div>
                                    <h3 className="font-bold text-slate-700 group-hover:text-blue-700 text-lg">
                                        {agent.name || "Sin Nombre"}
                                    </h3>
                                    <span className="text-xs font-medium text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md border border-slate-200 group-hover:bg-white group-hover:border-blue-200">
                                        {agent.role || "Agente"}
                                    </span>
                                </div>
                            </div>
                            <ArrowRight className="w-5 h-5 text-slate-300 group-hover:text-blue-500 transition-transform group-hover:translate-x-1 relative z-10" />
                        </button>
                    ))
                )}
            </div>

            {/* BOTÓN CREAR NUEVO */}
            <button 
                onClick={() => setIsCreating(true)}
                className="w-full py-3.5 border-2 border-dashed border-slate-300 rounded-xl text-slate-500 font-bold hover:border-blue-400 hover:text-blue-600 hover:bg-blue-50 transition-all flex items-center justify-center gap-2 mt-4"
            >
                <Plus className="w-5 h-5" /> Crear Nuevo Perfil
            </button>
        </div>
      ) : (
        // FORMULARIO DE CREACIÓN
        <div className="w-full bg-white p-6 rounded-2xl shadow-xl border border-slate-100 animate-in slide-in-from-bottom-4">
            <h3 className="font-bold text-lg text-slate-800 mb-4 flex items-center gap-2">
                <div className="bg-green-100 p-1.5 rounded-lg text-green-600"><Plus className="w-4 h-4" /></div>
                Nuevo Agente
            </h3>
            <form onSubmit={handleCreate} className="space-y-4">
                <div>
                    <label className="text-xs font-bold text-slate-500 uppercase ml-1">Nombre</label>
                    <input 
                        autoFocus
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                        className="w-full mt-1 p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all"
                        placeholder="Ej: Laura"
                    />
                </div>
                <div>
                    <label className="text-xs font-bold text-slate-500 uppercase ml-1">Departamento</label>
                    <div className="relative mt-1">
                        <Briefcase className="w-4 h-4 absolute left-3 top-3.5 text-slate-400" />
                        <select 
                            value={newRole}
                            onChange={(e) => setNewRole(e.target.value)}
                            className="w-full p-3 pl-9 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all appearance-none cursor-pointer"
                        >
                            <option value="Ventas">Ventas</option>
                            <option value="Taller">Taller</option>
                            {/* CORRECCIÓN: El valor interno debe ser "Admin" para coincidir con Airtable */}
                            <option value="Admin">Administración</option>
                        </select>
                    </div>
                </div>
                <div className="flex gap-3 pt-4">
                    <button type="button" onClick={() => setIsCreating(false)} className="flex-1 py-3 text-slate-500 hover:bg-slate-100 rounded-xl transition font-medium">Cancelar</button>
                    <button type="submit" className="flex-1 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition font-bold shadow-lg shadow-blue-200">Guardar</button>
                </div>
            </form>
        </div>
      )}
    </div>
  );
}