import { useState, useEffect, useRef } from 'react';
import { Send, Smile, Paperclip, MessageSquare, User, Briefcase, CheckCircle, Image as ImageIcon, X, Mic, Square, FileText, Download, Play, Pause, Volume2, VolumeX, ArrowLeft, UserPlus, ChevronDown } from 'lucide-react';
import EmojiPicker, { EmojiClickData } from 'emoji-picker-react';
import { Contact } from './Sidebar';

interface ChatWindowProps {
  socket: any;
  user: { username: string };
  contact: Contact;
  config?: { departments: string[]; statuses: string[]; };
  onBack: () => void;
  onlineUsers: string[];
  typingInfo: { [chatId: string]: string };
}

interface Message {
  text: string;
  sender: string;
  timestamp: string;
  type?: string;
  mediaId?: string;
}

const CustomAudioPlayer = ({ src, isMe }: { src: string, isMe: boolean }) => {
  const [isPlaying, setIsPlaying] = useState(false); const [progress, setProgress] = useState(0); const [duration, setDuration] = useState(0); const [currentTime, setCurrentTime] = useState(0); const [playbackRate, setPlaybackRate] = useState(1); const [volume, setVolume] = useState(1); const [isMuted, setIsMuted] = useState(false); const [showVolumeSlider, setShowVolumeSlider] = useState(false); const [audioUrl, setAudioUrl] = useState<string | null>(null); const [isReady, setIsReady] = useState(false); const audioRef = useRef<HTMLAudioElement>(null);
  useEffect(() => { fetch(src).then(r => r.blob()).then(blob => { setAudioUrl(URL.createObjectURL(blob)); setIsReady(true); }).catch(e => console.error(e)); }, [src]);
  useEffect(() => { if (audioRef.current) { audioRef.current.playbackRate = playbackRate; audioRef.current.volume = isMuted ? 0 : volume; } }, [playbackRate, volume, isMuted]);
  const togglePlay = () => { const audio = audioRef.current; if (!audio) return; if (isPlaying) audio.pause(); else audio.play(); setIsPlaying(!isPlaying); };
  const toggleSpeed = () => { const speeds = [1, 1.25, 1.5, 2]; setPlaybackRate(speeds[(speeds.indexOf(playbackRate) + 1) % speeds.length]); };
  const toggleMute = () => setIsMuted(!isMuted);
  const onTimeUpdate = () => { const audio = audioRef.current; if (!audio) return; setCurrentTime(audio.currentTime); setProgress((audio.currentTime / (audio.duration || 1)) * 100); };
  const onLoadedMetadata = (e: any) => setDuration(e.currentTarget.duration);
  const onEnded = () => { setIsPlaying(false); setProgress(0); setCurrentTime(0); };
  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => { const audio = audioRef.current; if (!audio) return; const newTime = (Number(e.target.value) / 100) * duration; audio.currentTime = newTime; setProgress(Number(e.target.value)); };
  const formatTime = (time: number) => { if (isNaN(time)) return "0:00"; const min = Math.floor(time / 60); const sec = Math.floor(time % 60); return `${min}:${sec < 10 ? '0' : ''}${sec}`; };
  if (!isReady) return <div className="text-xs text-slate-400 p-2 italic">Cargando...</div>;
  return ( <div className={`flex items-start gap-2 p-2 rounded-xl w-full max-w-[320px] select-none transition-colors ${isMe ? 'bg-[#dcf8c6]' : 'bg-white border border-slate-100'}`}> <audio ref={audioRef} src={audioUrl!} onTimeUpdate={onTimeUpdate} onLoadedMetadata={onLoadedMetadata} onEnded={onEnded} className="hidden" /> <button onClick={togglePlay} className={`w-10 h-10 flex items-center justify-center rounded-full transition shadow-sm flex-shrink-0 mt-0.5 ${isMe ? 'bg-[#00a884] text-white hover:bg-[#008f6f]' : 'bg-slate-500 text-white hover:bg-slate-600'}`}> {isPlaying ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current ml-0.5" />} </button> <div className="flex-1 flex flex-col gap-1 w-full min-w-0"> <div className="h-5 flex items-center"><input type="range" min="0" max="100" value={progress} onChange={handleSeek} className={`w-full h-1.5 rounded-lg appearance-none cursor-pointer ${isMe ? 'accent-[#00a884] bg-green-200' : 'accent-slate-500 bg-slate-200'}`} /></div> <div className="flex justify-between items-center text-[10px] font-medium text-slate-500 h-5 w-full"> <span className="font-mono tabular-nums min-w-[35px]">{currentTime === 0 && !isPlaying ? formatTime(duration) : formatTime(currentTime)}</span> <div className="flex items-center gap-2"> <button onClick={toggleSpeed} className="px-1.5 py-0.5 bg-black/5 rounded text-[9px] font-bold min-w-[22px] text-center">{playbackRate}x</button> <div className="relative flex items-center group hidden sm:flex" onMouseEnter={() => setShowVolumeSlider(true)} onMouseLeave={() => setShowVolumeSlider(false)}> <button onClick={toggleMute} className="p-1 hover:text-slate-800"><Volume2 className="w-3.5 h-3.5" /></button> {showVolumeSlider && <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 bg-white shadow-xl rounded-lg p-2 z-20"><div className="h-16 w-4 flex items-center justify-center"><input type="range" min="0" max="1" step="0.1" value={isMuted ? 0 : volume} onChange={(e) => { setVolume(parseFloat(e.target.value)); setIsMuted(parseFloat(e.target.value) === 0); }} className="-rotate-90 w-14 h-1 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600" /></div></div>} </div> <a href={src} download="audio.webm" target="_blank" rel="noreferrer" className="p-1 hover:bg-black/5 rounded-full"><Download className="w-3.5 h-3.5" /></a> </div> </div> </div> </div> );
};

export function ChatWindow({ socket, user, contact, config, onBack, onlineUsers, typingInfo }: ChatWindowProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [name, setName] = useState(contact.name || '');
  const [department, setDepartment] = useState(contact.department || '');
  const [status, setStatus] = useState(contact.status || '');
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  
  // Estado para el menú de asignación
  const [showAssignMenu, setShowAssignMenu] = useState(false);

  const typingUser = typingInfo[contact.phone] || null;
  const isOnline = onlineUsers.some(u => {
      if (!u) return false;
      const userLower = u.toLowerCase().trim();
      const contactName = (contact.name || '').toLowerCase().trim();
      const contactPhone = (contact.phone || '').replace(/\D/g, ''); 
      if (contactName && userLower === contactName) return true;
      if (contactPhone && userLower === contactPhone) return true;
      return false;
  });

  const lastTypingTimeRef = useRef<number>(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  const isProduction = window.location.hostname.includes('render.com');
  const API_URL = isProduction ? 'https://chatgorithm.onrender.com' : 'http://localhost:3000';

  const scrollToBottom = () => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  useEffect(() => scrollToBottom(), [messages]);

  useEffect(() => {
    setName(contact.name || ''); setDepartment(contact.department || ''); setStatus(contact.status || '');
    setMessages([]); setShowEmojiPicker(false); setIsRecording(false);
    setShowAssignMenu(false); // Reset menú
    
    if (socket && contact.phone) socket.emit('request_conversation', contact.phone);
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

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      setInput(e.target.value);
      const now = Date.now();
      if (socket && (now - lastTypingTimeRef.current > 2000)) {
          socket.emit('typing', { user: user.username, phone: contact.phone });
          lastTypingTimeRef.current = now;
      }
  };

  const sendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim()) {
      const msg = { text: input, sender: user.username, targetPhone: contact.phone, timestamp: new Date().toISOString(), type: 'text' };
      socket.emit('chatMessage', msg); setInput(''); setShowEmojiPicker(false);
    }
  };

  const updateCRM = (field: string, value: string) => { if (socket) { const updates: any = {}; updates[field] = value; socket.emit('update_contact_info', { phone: contact.phone, updates: updates }); }};
  
  // FUNCIÓN PARA ASIGNAR Y ABRIR CHAT
  const handleAssign = (target: 'me' | string) => {
      if (!socket) return;
      
      const updates: any = { status: 'Abierto' }; // Cambiamos estado automáticamente
      
      if (target === 'me') {
          updates.assigned_to = user.username;
      } else {
          updates.department = target;
          updates.assigned_to = null; // Limpiamos asignado si va a pool de depto
      }

      socket.emit('update_contact_info', { phone: contact.phone, updates });
      
      // Actualización optimista de UI
      setStatus('Abierto');
      if (target !== 'me') setDepartment(target);
      
      setShowAssignMenu(false);
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => { if (e.target.files && e.target.files[0]) uploadFile(e.target.files[0]); };
  const uploadFile = async (file: File) => { setIsUploading(true); const formData = new FormData(); formData.append('file', file); formData.append('targetPhone', contact.phone); formData.append('senderName', user.username); try { await fetch(`${API_URL}/api/upload`, { method: 'POST', body: formData }); } catch (e) { alert("Error envío"); } finally { setIsUploading(false); if(fileInputRef.current) fileInputRef.current.value = ''; } };
  const startRecording = async () => { try { const stream = await navigator.mediaDevices.getUserMedia({ audio: true }); let mimeType = 'audio/webm'; if (MediaRecorder.isTypeSupported('audio/mp4')) mimeType = 'audio/mp4'; const mediaRecorder = new MediaRecorder(stream, { mimeType }); mediaRecorderRef.current = mediaRecorder; audioChunksRef.current = []; mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data); }; mediaRecorder.onstop = async () => { const audioBlob = new Blob(audioChunksRef.current, { type: mimeType }); const ext = mimeType.includes('mp4') ? 'm4a' : 'webm'; const audioFile = new File([audioBlob], `voice.${ext}`, { type: mimeType }); await uploadFile(audioFile); stream.getTracks().forEach(t => t.stop()); }; mediaRecorder.start(); setIsRecording(true); } catch (e:any) { alert(`Error micro: ${e.message}`); } };
  const stopRecording = () => { if (mediaRecorderRef.current && isRecording) { mediaRecorderRef.current.stop(); setIsRecording(false); } };
  const onEmojiClick = (emojiData: EmojiClickData) => setInput((prev) => prev + emojiData.emoji);
  const safeTime = (time: string) => { try { return new Date(time).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}); } catch { return ''; } };

  // --- FUNCIÓN DE FECHAS ---
  const getDateLabel = (dateString: string) => {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return ""; 
      const today = new Date();
      const yesterday = new Date(); yesterday.setDate(today.getDate() - 1);

      if (date.toDateString() === today.toDateString()) return "Hoy";
      if (date.toDateString() === yesterday.toDateString()) return "Ayer";
      return date.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  const renderedItems: JSX.Element[] = [];
  let lastDateLabel = "";

  for (let i = 0; i < messages.length; i++) {
      const m = messages[i];
      const dateLabel = getDateLabel(m.timestamp);
      
      if (dateLabel && dateLabel !== lastDateLabel) {
          renderedItems.push(
              <div key={`date-${dateLabel}-${i}`} className="flex justify-center my-6 sticky top-2 z-10 opacity-90">
                  <span className="bg-slate-200/80 backdrop-blur-sm text-slate-600 text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-wide shadow-sm border border-slate-300/50">
                      {dateLabel}
                  </span>
              </div>
          );
          lastDateLabel = dateLabel;
      }

      const isMe = m.sender !== contact.phone;
      renderedItems.push(
        <div key={i} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
          <div className={`flex flex-col max-w-[90%] md:max-w-[75%]`}>
            {isMe && <span className="text-[10px] text-slate-500 font-bold mb-1 block text-right mr-1 uppercase tracking-wide">{m.sender === 'Agente' ? 'Yo' : m.sender}</span>}
            <div className={`p-3 rounded-xl shadow-sm text-sm relative text-slate-800 ${isMe ? 'bg-[#e0f2fe] rounded-tr-none text-slate-900' : 'bg-white rounded-tl-none border border-slate-100'}`}>
                {m.type === 'image' && m.mediaId ? <div className="mb-1 group relative"><img src={`${API_URL}/api/media/${m.mediaId}`} alt="Imagen" className="rounded-lg max-w-full md:max-w-[280px] h-auto object-contain cursor-pointer" onClick={(e) => { e.stopPropagation(); setSelectedImage(`${API_URL}/api/media/${m.mediaId}`); }} /></div>
                : m.type === 'audio' && m.mediaId ? <CustomAudioPlayer src={`${API_URL}/api/media/${m.mediaId}`} isMe={isMe} />
                : m.type === 'document' && m.mediaId ? <div className="flex items-center gap-3 bg-slate-50 p-2 rounded-lg border border-slate-200 min-w-[150px]"><div className="bg-red-100 p-2 rounded-full text-red-500"><FileText className="w-6 h-6" /></div><div className="flex-1 min-w-0"><p className="font-semibold text-slate-700 truncate text-xs">{m.text}</p><p className="text-[10px] text-slate-400">Documento</p></div><a href={`${API_URL}/api/media/${m.mediaId}`} target="_blank" rel="noopener noreferrer" className="p-2 text-slate-400 hover:text-blue-500 hover:bg-slate-100 rounded-full transition"><Download className="w-4 h-4" /></a></div>
                : <p className="whitespace-pre-wrap break-words">{String(m.text || "")}</p>}
                <span className="text-[10px] text-slate-400 block text-right mt-1 opacity-70">{safeTime(m.timestamp)}</span>
            </div>
          </div>
        </div>
      );
  }

  return (
    <div className="flex flex-col h-full bg-slate-50 relative" onClick={() => { setShowEmojiPicker(false); setShowAssignMenu(false); }}>
      {selectedImage && <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4" onClick={(e) => { e.stopPropagation(); setSelectedImage(null); }}><button className="absolute top-4 right-4 text-white/70 hover:text-white p-2" onClick={() => setSelectedImage(null)}><X className="w-6 h-6" /></button><img src={selectedImage} alt="Grande" className="max-w-full max-h-[90vh] object-contain rounded-lg" onClick={(e) => e.stopPropagation()} /></div>}

      <div className="bg-white border-b border-gray-200 p-3 flex flex-wrap gap-3 items-center shadow-sm z-10" onClick={(e) => e.stopPropagation()}>
        {onBack && <button onClick={onBack} className="md:hidden p-2 rounded-full text-slate-500 hover:bg-slate-100"><ArrowLeft className="w-5 h-5" /></button>}
        
        <div className="flex flex-col flex-1 min-w-[140px]">
            <div className="flex items-center gap-2 bg-slate-50 px-2 rounded-md border border-slate-200">
                <User className="w-4 h-4 text-slate-400" />
                <input className="text-sm font-semibold text-slate-700 border-none focus:ring-0 w-full bg-transparent py-1.5" placeholder="Nombre" value={name} onChange={(e) => setName(e.target.value)} onBlur={() => updateCRM('name', name)} />
            </div>
            
            <div className={`overflow-hidden transition-all duration-300 ${(typingUser || isOnline) ? 'max-h-6 opacity-100 mt-1' : 'max-h-0 opacity-0'}`}>
                {typingUser ? (
                    <span className="text-[11px] text-green-600 font-bold flex items-center gap-1.5 bg-green-50 px-2 py-0.5 rounded-full w-fit">
                        <span className="relative flex h-2 w-2">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                        </span>
                        {typingUser} está escribiendo...
                    </span>
                ) : isOnline ? (
                    <span className="text-[11px] text-slate-500 font-medium flex items-center gap-1.5 px-1 w-fit">
                        <span className="relative flex h-2 w-2">
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                        </span>
                        En línea
                    </span>
                ) : null}
            </div>
        </div>
        
        {/* BOTÓN ASIGNAR INTELIGENTE (Solo si es NUEVO) */}
        {status === 'Nuevo' ? (
            <div className="relative">
                <button 
                    onClick={(e) => { e.stopPropagation(); setShowAssignMenu(!showAssignMenu); }}
                    className="bg-blue-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1 hover:bg-blue-700 transition shadow-sm animate-pulse"
                >
                    <UserPlus className="w-3.5 h-3.5" /> Asignar
                </button>

                {showAssignMenu && (
                    <div className="absolute top-full right-0 mt-2 w-48 bg-white rounded-xl shadow-xl border border-slate-100 z-50 overflow-hidden animate-in fade-in zoom-in-95" onClick={(e) => e.stopPropagation()}>
                        <div className="p-1">
                            <button onClick={() => handleAssign('me')} className="w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-blue-50 rounded-lg flex items-center gap-2 font-medium transition-colors">
                                <User className="w-4 h-4 text-blue-500" /> A mí ({user.username})
                            </button>
                            <div className="h-px bg-slate-100 my-1"></div>
                            <p className="px-3 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wide">Departamentos</p>
                            {config?.departments?.map(dept => (
                                <button key={dept} onClick={() => handleAssign(dept)} className="w-full text-left px-3 py-2 text-sm text-slate-600 hover:bg-purple-50 rounded-lg hover:text-purple-700 flex items-center gap-2 transition-colors">
                                    <Briefcase className="w-3.5 h-3.5 opacity-50" /> {dept}
                                </button>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        ) : (
            // Si NO es nuevo, mostramos los selectores normales
            <>
                <div className="flex items-center gap-2 bg-purple-50 px-2 rounded-md border border-purple-200"><Briefcase className="w-4 h-4 text-purple-600" /><select className="text-xs bg-transparent border-none rounded-md py-1.5 pr-6 text-purple-700 focus:ring-0 cursor-pointer font-bold uppercase tracking-wide" value={department} onChange={(e) => { setDepartment(e.target.value); updateCRM('department', e.target.value); }}><option value="">Sin Dpto</option>{config?.departments?.map(d => <option key={d} value={d}>{d}</option>) || <option value="Ventas">Ventas</option>}</select></div>
                <div className="flex items-center gap-2 bg-slate-50 px-2 rounded-md border border-slate-200"><CheckCircle className="w-4 h-4 text-slate-400" /><select className="text-xs bg-transparent border-none rounded-md py-1.5 pr-6 text-slate-600 focus:ring-0 cursor-pointer font-medium" value={status} onChange={(e) => { setStatus(e.target.value); updateCRM('status', e.target.value); }}>{config?.statuses?.map(s => <option key={s} value={s}>{s}</option>) || <option value="Nuevo">Nuevo</option>}</select></div>
            </>
        )}
      </div>

      <div className="flex-1 p-6 overflow-y-auto space-y-4 bg-[#f2f6fc]" onClick={() => { setShowEmojiPicker(false); setShowAssignMenu(false); }}>
        {messages.length === 0 && <div className="flex flex-col items-center justify-center h-full text-slate-400 opacity-60"><MessageSquare className="w-12 h-12 mb-2" /><p className="text-sm">Historial cargado.</p></div>}
        
        {renderedItems}
        
        <div ref={messagesEndRef} />
      </div>
      {showEmojiPicker && <div className="absolute bottom-20 left-4 z-50 shadow-2xl rounded-xl animate-in zoom-in-95 duration-200" onClick={(e) => e.stopPropagation()}><EmojiPicker onEmojiClick={onEmojiClick} width={300} height={400} previewConfig={{ showPreview: false }} /></div>}
      <div className="p-3 bg-white border-t border-slate-200 relative z-20">
        <form onSubmit={sendMessage} className="flex gap-2 items-center max-w-5xl mx-auto" onClick={(e) => e.stopPropagation()}>
          <input type="file" ref={fileInputRef} onChange={handleFileSelect} className="hidden" />
          <button type="button" onClick={() => fileInputRef.current?.click()} disabled={isUploading} className="p-2 rounded-full text-slate-500 hover:bg-slate-200 transition" title="Adjuntar"><Paperclip className="w-5 h-5" /></button>
          
          <input type="text" value={input} onChange={handleInputChange} placeholder={isUploading ? "Enviando..." : isRecording ? "Grabando..." : "Mensaje"} disabled={isUploading || isRecording} className="flex-1 py-3 px-4 bg-slate-50 rounded-lg border border-slate-200 focus:outline-none focus:border-blue-300 text-sm" />
          
          <button type="button" className={`p-2 rounded-full transition ${showEmojiPicker ? 'text-blue-500 bg-blue-50' : 'text-slate-500 hover:bg-slate-200'}`} onClick={() => setShowEmojiPicker(!showEmojiPicker)}><Smile className="w-5 h-5" /></button>
          {input.trim() ? <button type="submit" disabled={isUploading} className="p-3 bg-blue-600 text-white rounded-full hover:bg-blue-700 transition shadow-sm"><Send className="w-5 h-5" /></button> : <button type="button" onClick={isRecording ? stopRecording : startRecording} className={`p-3 rounded-full text-white transition shadow-sm ${isRecording ? 'bg-red-500 animate-pulse' : 'bg-slate-700'}`} title="Grabar"><Mic className="w-5 h-5" /></button>}
        </form>
      </div>
    </div>
  );
}