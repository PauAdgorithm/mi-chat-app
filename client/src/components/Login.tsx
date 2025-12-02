import { useState } from 'react';
import { MessageSquare, ArrowRight } from 'lucide-react';

interface LoginProps {
  onLogin: (username: string) => void;
  socket: any;
}

export function Login({ onLogin }: LoginProps) {
  const [username, setUsername] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (username.trim()) {
      onLogin(username);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] w-full max-w-md px-6">
      <div className="bg-white p-10 rounded-3xl shadow-xl w-full border border-gray-100 relative overflow-hidden">
        <div className="flex flex-col items-center mb-8 relative z-10">
          <div className="bg-gradient-to-tr from-blue-600 to-indigo-600 p-4 rounded-2xl mb-5 shadow-lg shadow-blue-200 transform rotate-3">
            <MessageSquare className="w-8 h-8 text-white" />
          </div>
          <h2 className="text-3xl font-extrabold text-slate-800 tracking-tight">Bienvenido</h2>
          <p className="text-slate-500 mt-2 text-center">Ingresa tu nombre para unirte.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5 relative z-10">
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider ml-1">
              Nombre de usuario
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-xl focus:ring-4 focus:ring-blue-50 focus:border-blue-500 outline-none transition-all duration-200 font-medium text-slate-800 placeholder:text-slate-400"
              placeholder="Ej: Alex..."
              required
            />
          </div>
          <button
            type="submit"
            className="group w-full bg-slate-900 text-white py-4 rounded-xl hover:bg-blue-600 active:scale-[0.98] transition-all duration-300 font-bold text-lg shadow-lg hover:shadow-blue-500/25 flex items-center justify-center gap-2"
          >
            Comenzar
            <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
          </button>
        </form>
      </div>
    </div>
  );
}