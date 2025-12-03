import { useState, useEffect, useRef } from 'react';
import { Send, Smile, Paperclip, MessageSquare, User, Briefcase, CheckCircle, Image as ImageIcon, X } from 'lucide-react';
import EmojiPicker, { EmojiClickData } from 'emoji-picker-react'; // 1. IMPORTACIÓN ACTIVADA
import { Contact } from './Sidebar';

interface ChatWindowProps {
  socket: any;
  user: { username: string };
  contact: Contact;
}

interface Message {
  text: string;
  sender: string;
  timestamp: string;
  type?: string;
  mediaId?: string;
}

export function ChatWindow({ socket, user, contact }: ChatWindowProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  
  const [name, setName] = useState(contact.name || '');
  const [department, setDepartment] = useState(contact.department || '');
  const [status, setStatus] = useState(contact.status || '');

  const [selectedImage, setSelectedImage] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isProduction = window.location.hostname.includes('render.com');
  const API_URL = isProduction ? 'https://chatgorithm.onrender.com' : 'http://localhost:3000';

  const scrollToBottom = () => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  useEffect(() => scrollToBottom(), [messages]);

  useEffect(() => {
    setName(contact.name || '');
    setDepartment(contact.department || '');
    setStatus(contact.status || '');
    setMessages([]);
    setShowEmojiPicker(false);
    
    if (socket && contact.phone) {
        socket.emit('request_conversation', contact.phone);
    }
  }, [contact, socket]);

  useEffect(() => {
    const handleHistory = (history: Message[]) => setMessages(history);
    const handleNewMessage = (msg: any) => {
        if (msg.sender === contact.phone || msg.sender === 'Agente' || msg.recipient === contact.phone) {
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
  }, [socket, contact.phone]);

  const sendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim()) {
      const msg = { 
          text: input, 
          sender: user.username,
          targetPhone: contact.phone,
          timestamp: new Date().toISOString(),
          type: 'text'
      };
      socket.emit('chatMessage', msg);
      setInput('');
      setShowEmojiPicker(false);
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
        const file = e.target.files[0];
        setIsUploading(true);
        const formData = new FormData();
        formData.append('file', file);
        formData.append('targetPhone', contact.phone);
        formData.append('senderName', user.username);

        try {
            const response = await fetch(`${API_URL}/api/upload`, {
                method: 'POST',
                body: formData
            });
            if (!response.ok) throw new Error('Error subiendo imagen');
        } catch (error) {
            console.error(error);
            alert("Error al enviar la imagen.");
        } finally {
            setIsUploading(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    }
  };

  // 2. FUNCIÓN DE CLIC EN EMOJI ACTIVADA
  const onEmojiClick = (emojiData: EmojiClickData) => {
    // Añade el emoji al texto que ya tengas escrito
    setInput((prev) => prev + emojiData.emoji);
  };

  const updateCRM = (field: string, value: string) => {
      if (!socket) return;
      const updates: any = {};
      updates[field] = value;
      socket.emit('update_contact_info', { phone: contact.phone, updates: updates });
  };

  const safeTime = (time: string) => {
      try { return new Date(time).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}); } catch { return ''; }
  };

  return (
    <div className="flex flex-col h-full bg-slate-50 relative" onClick={() => setShowEmojiPicker(false)}>
      
      {/* LIGHTBOX */}
      {selectedImage && (
        <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4 animate-in fade-in duration-200" onClick={(e) => { e.stopPropagation(); setSelectedImage(null); }}>
            <button className="absolute top-4 right-4 text-white/70 hover:text-white p-2 rounded-full bg-white/10 hover:bg-white/20 transition z-50">
                <X className="w-6 h-6" />
            </button>
            <img src={selectedImage} alt="Grande" className="max-w-full max-h-[90vh] object-contain rounded-lg shadow-2xl" onClick={(e) => e.stopPropagation()} />
        </div>
      )}

      {/* BARRA SUPERIOR CRM */}
      <div className="bg-white border-b border-gray-200 p-3 flex gap-3 items-center shadow-sm z-10 flex-wrap" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 flex-1 min-w-[150px] bg-slate-50 px-2 rounded-md border border-slate-200">
            <User className="w-4 h-4 text-slate-400" />
            <input className="text-sm font-semibold text-slate-700 border-none focus:ring-0 w-full bg-transparent py-1.5" placeholder="Nombre" value={name} onChange={(e) => setName(e.target.value)} onBlur={() => updateCRM('name', name)} />
        </div>
        <div className="flex items-center gap-2 bg-slate-50 px-2 rounded-md border border-slate-200">
            <Briefcase className="w-4 h-4 text-slate-400" />
            <select className="text-xs bg-transparent border-none rounded-md py-1.5 pr-8 text-slate-600 focus:ring-0 cursor-pointer font-medium" value={department} onChange={(e) => { setDepartment(e.target.value); updateCRM('department', e.target.value); }}>
                <option value="">Sin Dpto</option><option value="Ventas">Ventas</option><option value="Taller">Taller</option><option value="Administración">Admin</option>
            </select>
        </div>
        <div className="flex items-center gap-2 bg-slate-50 px-2 rounded-md border border-slate-200">
            <CheckCircle className="w-4 h-4 text-slate-400" />
            <select className="text-xs bg-transparent border-none rounded-md py-1.5 pr-8 text-slate-600 focus:ring-0 cursor-pointer font-medium" value={status} onChange={(e) => { setStatus(e.target.value); updateCRM('status', e.target.value); }}>
                <option value="Nuevo">Nuevo</option><option value="Abierto">Abierto</option><option value="Cerrado">Cerrado</option>
            </select>
        </div>
      </div>

      {/* ÁREA MENSAJES */}
      <div className="flex-1 p-6 overflow-y-auto space-y-4" onClick={() => setShowEmojiPicker(false)}>
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-slate-400 opacity-60">
            <MessageSquare className="w-12 h-12 mb-2" />
            <p className="text-sm">Historial cargado.</p>
          </div>
        )}
        
        {messages.map((m, i) => {
          const isMe = m.sender !== contact.phone; 
          return (
            <div key={i} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[75%] p-3 rounded-xl shadow-sm text-sm relative text-slate-800 ${isMe ? 'bg-green-100 rounded-tr-none' : 'bg-white rounded-tl-none border border-slate-100'}`}>
                {m.type === 'image' && m.mediaId ? (
                    <div className="mb-1 group relative">
                        <img 
                            src={`${API_URL}/api/media/${m.mediaId}`} 
                            alt="Imagen" 
                            className="rounded-lg max-w-[280px] max-h-[280px] w-auto h-auto object-contain cursor-pointer hover:opacity-90 transition bg-black/5"
                            onClick={(e) => { e.stopPropagation(); setSelectedImage(`${API_URL}/api/media/${m.mediaId}`); }}
                        />
                        {m.text && !m.text.includes("Imagen") && <p className="mt-2 text-sm">{m.text}</p>}
                    </div>
                ) : (
                    m.text.includes("[Imagen") ? (
                        <div className="flex items-center gap-2 italic text-slate-500"><ImageIcon className="w-4 h-4" /><span>Imagen</span></div>
                    ) : <p className="whitespace-pre-wrap">{String(m.text || "")}</p>
                )}
                <span className="text-[10px] text-slate-400 block text-right mt-1 opacity-70">{safeTime(m.timestamp)}</span>
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* PICKER DE EMOJIS (FLOTANTE) */}
      {showEmojiPicker && (
        <div className="absolute bottom-20 left-4 z-50 shadow-2xl rounded-xl animate-in zoom-in-95 duration-200" onClick={(e) => e.stopPropagation()}>
            {/* 3. COMPONENTE ACTIVADO */}
            <EmojiPicker 
                onEmojiClick={onEmojiClick}
                width={300}
                height={400}
                previewConfig={{ showPreview: false }}
            />
        </div>
      )}

      {/* INPUT */}
      <div className="p-3 bg-white border-t border-slate-200 relative z-20">
        <form onSubmit={sendMessage} className="flex gap-2 items-center max-w-5xl mx-auto" onClick={(e) => e.stopPropagation()}>
          <input type="file" ref={fileInputRef} onChange={handleFileSelect} accept="image/*" className="hidden" />
          
          <button type="button" onClick={() => fileInputRef.current?.click()} disabled={isUploading} className="p-2 rounded-full text-slate-500 hover:bg-slate-200 transition">
            <Paperclip className="w-5 h-5" />
          </button>
          
          <input type="text" value={input} onChange={(e) => setInput(e.target.value)} placeholder={isUploading ? "Subiendo..." : "Escribe un mensaje..."} disabled={isUploading} className="flex-1 py-3 px-4 bg-slate-50 rounded-lg border border-slate-200 focus:outline-none focus:border-blue-300 text-sm" />
          
          <button 
            type="button" 
            className={`p-2 rounded-full transition ${showEmojiPicker ? 'text-blue-500 bg-blue-50' : 'text-slate-500 hover:bg-slate-200'}`}
            onClick={() => setShowEmojiPicker(!showEmojiPicker)}
          >
            <Smile className="w-5 h-5" />
          </button>

          <button type="submit" disabled={!input.trim() || isUploading} className="p-3 bg-blue-600 text-white rounded-full hover:bg-blue-700 transition shadow-sm">
            <Send className="w-5 h-5" />
          </button>
        </form>
      </div>
    </div>
  );
}