import { useState } from 'react';
import { MessageSquare } from 'lucide-react';

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
    <div className="flex flex-col items-center justify-center min-h-[400px] w-full max-w-md px-4">
      <div className="bg-white p-8 rounded-2xl shadow-xl w-full border border-gray-100">
        <div className="flex flex-col items-center mb-8">
          <div className="bg-blue-600 p-3 rounded-full mb-4 shadow-lg shadow-blue-200">
            <MessageSquare className="w-8 h-8 text-white" />
          </div>
          <h2 className="text-2xl font-bold text-gray-800">¡Bienvenido!</h2>
          <p className="text-gray-500 text-sm mt-1">Únete al chat global</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2 ml-1">
              Elige tu nombre
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full px-5 py-3 border border-gray-300 rounded-xl focus:ring-4 focus:ring-blue-100 focus:border-blue-500 outline-none transition-all duration-200 bg-gray-50 focus:bg-white"
              placeholder="Ej: Alex, Laura..."
              required
            />
          </div>
          <button
            type="submit"
            className="w-full bg-blue-600 text-white py-3.5 rounded-xl hover:bg-blue-700 active:scale-95 transition-all duration-200 font-semibold shadow-lg shadow-blue-200 flex items-center justify-center gap-2"
          >
            Entrar al Chat
          </button>
        </form>
      </div>
      <p className="mt-8 text-gray-400 text-xs">Chatgorithm v1.0 • Powered by Render</p>
    </div>
  );
}