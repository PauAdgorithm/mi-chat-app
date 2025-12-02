import { useState, useEffect, useRef } from 'react';
import { Send, Smile, Paperclip, MessageSquare } from 'lucide-react';

interface ChatWindowProps {
  socket: any;
  user: { username: string };
  targetPhone: string; // ¡Ahora necesitamos saber a quién hablamos!
}

interface Message {
  text: string;
  sender: string;
  timestamp: string;
}

export function ChatWindow({ socket, user, targetPhone }: ChatWindowProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll al fondo
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };
  useEffect(() => scrollToBottom(), [messages]);

  // Cargar conversación al cambiar de cliente (targetPhone)
  useEffect(() => {
    setMessages([]); // Limpiar chat anterior
    if (socket && targetPhone) {
        console.log("Cargando chat con:", targetPhone);
        socket.emit('request_conversation', targetPhone);
    }
  }, [targetPhone, socket]);

  // Escuchar mensajes entrantes
  useEffect(() => {
    const handleHistory = (history: Message[]) => {
      setMessages(history);
    };

    const handleNewMessage = (msg: any) => {
        // Solo añadimos el mensaje si pertenece a este chat o si lo enviamos nosotros (Agente)
        // NOTA: Esto es una simplificación. Lo ideal es filtrar por sender o receiver.
        // Como 'sender' viene con el número del cliente:
        if (msg.sender === targetPhone || msg.sender === 'Agente') {
            setMessages((prev) => [...prev, msg]);
        }
    };
    
    if (socket) {
        socket.on('conversation_history', handleHistory);
        socket.on('message', handleNewMessage);

        return () => { 
          socket.off('conversation_history', handleHistory);
          socket.off('message', handleNewMessage);
        };
    }
  }, [socket, targetPhone]);

  const sendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim()) {
      const msg = { 
          text: input, 
          sender: user.username, // Nombre del agente
          targetPhone: targetPhone, // A quién se lo enviamos (Para WhatsApp)
          timestamp: new Date().toISOString()
      };
      
      socket.emit('chatMessage', msg);
      // Optimista: Lo añadimos ya a la lista (aunque el socket lo devuelva luego, React gestiona duplicados por key si usáramos ids)
      // Pero para evitar duplicados visuales simples, esperamos al evento 'message' del servidor que rebota el mensaje.
      // Si quieres feedback instantáneo, descomenta esto:
      // setMessages(prev => [...prev, { ...msg, sender: 'Agente' }]); 
      
      setInput('');
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#efeae2] bg-opacity-30"> 
      {/* (Fondo estilo WhatsApp web sutil) */}
      
      {/* Área de mensajes */}
      <div className="flex-1 p-6 overflow-y-auto space-y-4">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-slate-400 opacity-60">
            <MessageSquare className="w-12 h-12 mb-2" />
            <p className="text-sm">Historial cargado. ¡Escribe algo!</p>
          </div>
        )}
        
        {messages.map((m, i) => {
          // Si el sender NO es el teléfono del cliente, es el Agente (nosotros)
          const isMe = m.sender !== targetPhone; 
          
          return (
            <div key={i} className={`flex ${isMe ? 'justify-end' : 'justify-start'} animate-in fade-in slide-in-from-bottom-1 duration-200`}>
              <div 
                className={`max-w-[75%] p-3 rounded-xl shadow-sm text-sm relative text-slate-800
                  ${isMe 
                    ? 'bg-[#d9fdd3] rounded-tr-none' // Color verde WhatsApp para mí
                    : 'bg-white rounded-tl-none border border-slate-100' // Blanco para cliente
                  }`}
              >
                <p className="leading-relaxed whitespace-pre-wrap">{m.text}</p>
                <span className="text-[10px] text-slate-400 block text-right mt-1 opacity-70">
                  {new Date(m.timestamp).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}
                </span>
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Área de Input */}
      <div className="p-3 bg-[#f0f2f5] border-t border-slate-200">
        <form onSubmit={sendMessage} className="flex gap-2 items-center max-w-5xl mx-auto">
          <button type="button" className="p-2 text-slate-500 hover:bg-slate-200 rounded-full transition">
            <Paperclip className="w-5 h-5" />
          </button>
          
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Escribe un mensaje..."
            className="flex-1 py-3 px-4 bg-white rounded-lg border border-slate-200 focus:outline-none focus:border-slate-300 text-sm"
          />
          
          <button 
            type="submit" 
            disabled={!input.trim()}
            className="p-3 bg-[#00a884] text-white rounded-full hover:bg-[#008f6f] disabled:opacity-50 disabled:cursor-not-allowed transition shadow-sm"
          >
            <Send className="w-5 h-5" />
          </button>
        </form>
      </div>
    </div>
  );
}