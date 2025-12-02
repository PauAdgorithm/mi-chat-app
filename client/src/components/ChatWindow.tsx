import { useState, useEffect, useRef } from 'react';
import { Send, Smile, Paperclip, MessageSquare } from 'lucide-react';

interface ChatWindowProps {
  socket: any;
  user: { username: string };
  targetPhone: string;
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

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };
  useEffect(() => scrollToBottom(), [messages]);

  useEffect(() => {
    setMessages([]);
    if (socket && targetPhone) {
        socket.emit('request_conversation', targetPhone);
    }
  }, [targetPhone, socket]);

  useEffect(() => {
    const handleHistory = (history: Message[]) => setMessages(history);
    const handleNewMessage = (msg: any) => {
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
          sender: user.username,
          targetPhone: targetPhone,
          timestamp: new Date().toISOString()
      };
      socket.emit('chatMessage', msg);
      setInput('');
    }
  };

  // Protección: formatear hora de forma segura
  const safeTime = (time: string) => {
      try {
          return new Date(time).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
      } catch { return ''; }
  };

  return (
    <div className="flex flex-col h-full bg-slate-50"> 
      <div className="flex-1 p-6 overflow-y-auto space-y-4">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-slate-400 opacity-60">
            <MessageSquare className="w-12 h-12 mb-2" />
            <p className="text-sm">Historial cargado.</p>
          </div>
        )}
        
        {messages.map((m, i) => {
          const isMe = m.sender !== targetPhone; 
          return (
            <div key={i} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
              <div 
                className={`max-w-[75%] p-3 rounded-xl shadow-sm text-sm relative text-slate-800
                  ${isMe ? 'bg-green-100 rounded-tr-none' : 'bg-white rounded-tl-none border border-slate-100'}`}
              >
                <p className="whitespace-pre-wrap">{String(m.text || "")}</p>
                <span className="text-[10px] text-slate-400 block text-right mt-1 opacity-70">
                  {safeTime(m.timestamp)}
                </span>
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      <div className="p-3 bg-white border-t border-slate-200">
        <form onSubmit={sendMessage} className="flex gap-2 items-center max-w-5xl mx-auto">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Escribe un mensaje..."
            className="flex-1 py-3 px-4 bg-slate-50 rounded-lg border border-slate-200 focus:outline-none focus:border-blue-300 text-sm"
          />
          <button type="submit" disabled={!input.trim()} className="p-3 bg-blue-600 text-white rounded-full hover:bg-blue-700 transition shadow-sm">
            <Send className="w-5 h-5" />
          </button>
        </form>
      </div>
    </div>
  );
}