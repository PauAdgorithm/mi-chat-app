import { useState, useEffect, useRef } from 'react';
import { Send, Smile, Paperclip, MessageSquare } from 'lucide-react';

interface ChatWindowProps {
  socket: any;
  user: { username: string };
}

interface Message {
  text: string;
  sender: string;
  timestamp: string | Date;
}

export function ChatWindow({ socket, user }: ChatWindowProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    // 1. Manejadores de eventos
    const handleMessage = (msg: Message) => {
      setMessages((prev) => [...prev, msg]);
    };

    const handleHistory = (history: Message[]) => {
      console.log("📜 Historial recibido:", history.length, "mensajes");
      setMessages(history); 
    };
    
    if (socket) {
        // 2. ¡AQUÍ ESTÁ LA CLAVE! Pedimos el historial al montar el componente
        socket.emit('request_history');

        // 3. Escuchamos las respuestas
        socket.on('message', handleMessage);
        socket.on('history', handleHistory);

        return () => { 
          socket.off('message', handleMessage); 
          socket.off('history', handleHistory);
        };
    }
  }, [socket]);

  const sendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim()) {
      const msg = { text: input, sender: user.username, timestamp: new Date() };
      socket.emit('chatMessage', msg);
      // Limpiamos el input pero NO añadimos el mensaje manual.
      // Esperamos a que el servidor nos lo devuelva con 'io.emit' para evitar duplicados.
      setInput('');
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-50/30">
      {/* Área de mensajes */}
      <div className="flex-1 p-6 overflow-y-auto space-y-6">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-slate-400 space-y-4 opacity-60">
            <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center">
              <MessageSquare className="w-8 h-8 text-slate-300" />
            </div>
            <div className="text-center">
              <p className="font-medium">La sala está tranquila...</p>
              <p className="text-sm">¡Sé el primero en decir hola!</p>
            </div>
          </div>
        )}
        
        {messages.map((m, i) => {
          const isMe = m.sender === user.username;
          return (
            <div key={i} className={`flex ${isMe ? 'justify-end' : 'justify-start'} group animate-in fade-in slide-in-from-bottom-2 duration-300`}>
              <div className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} max-w-[75%]`}>
                <div className="flex items-baseline gap-2 mb-1 px-1">
                  <span className={`text-xs font-bold ${isMe ? 'text-blue-600' : 'text-slate-600'}`}>
                    {m.sender}
                  </span>
                </div>
                <div 
                  className={`p-4 rounded-2xl shadow-sm text-sm leading-relaxed ${
                    isMe 
                      ? 'bg-blue-600 text-white rounded-br-none shadow-blue-200' 
                      : 'bg-white text-slate-700 border border-slate-100 rounded-bl-none shadow-sm'
                  }`}
                >
                  <p>{m.text}</p>
                </div>
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Área de Input */}
      <div className="p-4 bg-white border-t border-slate-100 px-6 pb-6">
        <form onSubmit={sendMessage} className="flex gap-3 items-end max-w-4xl mx-auto bg-slate-50 p-2 pr-2 rounded-[24px] border border-slate-200 focus-within:ring-4 focus-within:ring-blue-100 focus-within:border-blue-300 transition-all shadow-sm">
          <button type="button" className="p-3 text-slate-400 hover:text-blue-500 transition-colors rounded-full hover:bg-slate-200">
            <Paperclip className="w-5 h-5" />
          </button>
          
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Escribe un mensaje..."
            className="flex-1 bg-transparent border-none focus:ring-0 py-3 text-slate-700 placeholder:text-slate-400 font-medium"
          />
          
          <button type="button" className="p-3 text-slate-400 hover:text-yellow-500 transition-colors rounded-full hover:bg-slate-200">
            <Smile className="w-5 h-5" />
          </button>

          <button 
            type="submit" 
            disabled={!input.trim()}
            className="bg-blue-600 text-white p-3 rounded-full hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md shadow-blue-200 hover:shadow-lg active:scale-90"
          >
            <Send className="w-5 h-5 ml-0.5" />
          </button>
        </form>
      </div>
    </div>
  );
}