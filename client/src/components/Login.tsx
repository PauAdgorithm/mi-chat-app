import { useState, useEffect } from 'react';
import { User, Lock, ArrowRight, RefreshCw, LogIn, CheckSquare, Square } from 'lucide-react';

interface LoginProps {
  onLogin: (username: string, role: string, password: string, remember: boolean) => void;
  socket: any;
}

interface Agent { id: string; name: string; role: string; hasPassword?: boolean; }

export function Login({ onLogin, socket }: LoginProps) {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [passwordInput, setPasswordInput] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [rememberMe, setRememberMe] = useState(true);

  useEffect(() => {
    if (socket) {
        socket.emit('request_agents');
        socket.on('agents_list', (list: Agent[]) => {
            setAgents(list);
            setLoading(false);
        });
        socket.on('login_success', (user: any) => {
            onLogin(user.username, user.role, passwordInput, rememberMe);
        });
        socket.on('login_error', (msg: string) => setError(msg));
    }
  }, [socket, passwordInput, rememberMe]);

  const handleLogin = (e: React.FormEvent) => {
      e.preventDefault();
      if (selectedAgent) {
          const passToSend = selectedAgent.hasPassword ? passwordInput : "";
          socket.emit('login_attempt', { name: selectedAgent.name, password: passToSend });
      }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-[500px] w-full max-w-md px-6 animate-in fade-in zoom-in duration-300">
      <div className="text-center mb-8">
        <div className="bg-blue-600 w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-blue-200 rotate-3"><User className="w-8 h-8 text-white" /></div>
        <h2 className="text-3xl font-bold text-slate-800">{selectedAgent ? `Hola, ${selectedAgent.name}` : 'Bienvenido'}</h2>
        <p className="text-slate-500 mt-2">Sistema de Gestión</p>
      </div>
      {!selectedAgent && (
          <div className="w-full space-y-3 max-h-[400px] overflow-y-auto custom-scrollbar pr-2">
              {loading ? <RefreshCw className="w-6 h-6 animate-spin mx-auto text-slate-400" /> : agents.map((agent) => (
                  <button key={agent.id} onClick={() => { setSelectedAgent(agent); setError(''); setPasswordInput(''); }} className="w-full flex items-center justify-between p-4 bg-white border border-slate-200 rounded-xl hover:border-blue-500 hover:shadow-md transition-all group text-left">
                      <div className="flex items-center gap-3"><div className={`h-10 w-10 rounded-full flex items-center justify-center text-white font-bold ${agent.role === 'Admin' ? 'bg-purple-600' : 'bg-blue-500'}`}>{agent.name.charAt(0).toUpperCase()}</div><div><h3 className="font-bold text-slate-700">{agent.name}</h3><span className="text-xs text-slate-400">{agent.role}</span></div></div>
                      <ArrowRight className="w-5 h-5 text-slate-300 group-hover:text-blue-500" />
                  </button>
              ))}
              {agents.length === 0 && !loading && <div className="text-center text-slate-400 italic border-2 border-dashed border-slate-200 p-4 rounded-lg">No hay agentes. Crea uno desde el panel de control (cuando entres como Admin).</div>}
          </div>
      )}
      {selectedAgent && (
          <form onSubmit={handleLogin} className="w-full bg-white p-6 rounded-2xl shadow-lg border border-slate-100">
              {selectedAgent.hasPassword ? (<div className="mb-4"><label className="text-xs font-bold text-slate-500 uppercase">Contraseña</label><div className="relative mt-1"><Lock className="w-4 h-4 absolute left-3 top-3.5 text-slate-400" /><input type="password" autoFocus value={passwordInput} onChange={(e) => setPasswordInput(e.target.value)} className="w-full p-3 pl-10 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:border-blue-500" placeholder="••••••" /></div></div>) : <div className="mb-6 text-center p-4 bg-green-50 rounded-xl border border-green-100 text-green-700 text-sm font-medium">Acceso libre</div>}
              <div className="flex items-center gap-2 mb-4 cursor-pointer w-fit select-none" onClick={() => setRememberMe(!rememberMe)}>{rememberMe ? <CheckSquare className="w-5 h-5 text-blue-600" /> : <Square className="w-5 h-5 text-slate-400" />}<span className={`text-sm ${rememberMe ? 'text-slate-700 font-medium' : 'text-slate-400'}`}>Mantener sesión iniciada</span></div>
              {error && <p className="text-xs text-red-500 mb-4 text-center">{error}</p>}
              <div className="flex gap-2"><button type="button" onClick={() => { setSelectedAgent(null); setPasswordInput(''); }} className="flex-1 py-2 text-slate-500 hover:bg-slate-50 rounded-lg">Volver</button><button type="submit" className="flex-1 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-bold flex items-center justify-center gap-2">{selectedAgent.hasPassword ? "Verificar" : <>Entrar <LogIn className="w-4 h-4"/></>}</button></div>
          </form>
      )}
    </div>
  );
}