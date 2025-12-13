import React, { useState } from 'react';
import { User, Lock, LogIn, Loader2 } from 'lucide-react';

interface LoginProps {
  onLogin: (username: string, role: string, password: '', remember: boolean) => void;
  socket: any;
}

export function Login({ onLogin, socket }: LoginProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState(''); // Campo contraseña (opcional para agentes simples)
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [remember, setRemember] = useState(true);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim()) return;
    
    setIsLoading(true);
    setError('');

    // Emitimos intento de login al servidor
    socket.emit('login_attempt', { name: username, password });

    // Escuchamos la respuesta una sola vez
    socket.once('login_success', (data: { username: string, role: string }) => {
        setIsLoading(false);
        onLogin(data.username, data.role, '', remember);
    });

    socket.once('login_error', (msg: string) => {
        setIsLoading(false);
        setError(msg || 'Error de conexión');
    });

    // Timeout de seguridad por si el servidor no responde
    setTimeout(() => {
        if(isLoading) {
            setIsLoading(false);
            setError("El servidor no responde. Verifica tu conexión.");
        }
    }, 5000);
  };

  return (
    <div className="bg-white p-8 rounded-2xl shadow-xl w-full max-w-sm border border-slate-100 animate-in fade-in zoom-in-95 duration-300">
      <div className="flex justify-center mb-6">
        <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center shadow-lg shadow-blue-200">
            <span className="text-3xl">💬</span>
        </div>
      </div>
      
      <h2 className="text-2xl font-bold text-center text-slate-800 mb-1">Chatgorithm</h2>
      <p className="text-center text-slate-400 text-sm mb-8">Acceso al CRM</p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs font-bold text-slate-500 uppercase mb-1 ml-1">Usuario</label>
          <div className="relative">
            <User className="w-5 h-5 absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all text-slate-700 font-medium"
              placeholder="Ej: Pedro"
              autoFocus
            />
          </div>
        </div>

        <div>
            <label className="block text-xs font-bold text-slate-500 uppercase mb-1 ml-1">Contraseña <span className="text-slate-300 font-normal normal-case">(Opcional)</span></label>
            <div className="relative">
                <Lock className="w-5 h-5 absolute left-3 top-2.5 text-slate-400" />
                <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all text-slate-700"
                placeholder="••••••"
                />
            </div>
        </div>

        <div className="flex items-center ml-1">
            <input 
                type="checkbox" 
                id="remember" 
                checked={remember} 
                onChange={e => setRemember(e.target.checked)}
                className="rounded text-blue-600 focus:ring-blue-500 border-gray-300"
            />
            <label htmlFor="remember" className="ml-2 text-xs text-slate-500 cursor-pointer select-none">Mantener sesión iniciada</label>
        </div>

        {error && (
          <div className="bg-red-50 text-red-500 text-sm p-3 rounded-lg flex items-center gap-2 animate-in slide-in-from-top-1">
            <span className="font-bold">Error:</span> {error}
          </div>
        )}

        <button
          type="submit"
          disabled={isLoading || !username}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-xl transition-all shadow-lg shadow-blue-100 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex justify-center items-center gap-2"
        >
          {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <><LogIn className="w-5 h-5" /> Entrar</>}
        </button>
      </form>

      <p className="text-center text-xs text-slate-300 mt-6">v2.4.0 • Enterprise Edition</p>
    </div>
  );
}