import { useState, useEffect, useRef } from 'react';
import { Send, Smile, Paperclip, MessageSquare, User, Briefcase, CheckCircle, Image as ImageIcon, X, Mic, Square, FileText, Download, Play, Pause, Volume2, VolumeX, UserCheck } from 'lucide-react';
import EmojiPicker, { EmojiClickData } from 'emoji-picker-react';
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

// ... (El componente CustomAudioPlayer se mantiene IGUAL que el que ya tenías, cópialo del anterior o de abajo si quieres)...
// Por brevedad, aquí pongo el ChatWindow actualizado, asumiendo que CustomAudioPlayer está arriba.
const CustomAudioPlayer = ({ src, isMe }: { src: string, isMe: boolean }) => {
    // ... (Copia el código del reproductor PRO del paso anterior aquí) ...
    // Si quieres te lo pego entero abajo para no fallar.
    const [isPlaying, setIsPlaying] = useState(false);
    const [progress, setProgress] = useState(0);
    const [duration, setDuration] = useState(0);
    const [currentTime, setCurrentTime] = useState(0);
    const [playbackRate, setPlaybackRate] = useState(1);
    const [volume, setVolume] = useState(1);
    const [isMuted, setIsMuted] = useState(false);
    const [showVolumeSlider, setShowVolumeSlider] = useState(false);
    const [audioUrl, setAudioUrl] = useState<string | null>(null);
    const [isReady, setIsReady] = useState(false);
    const audioRef = useRef<HTMLAudioElement>(null);

    useEffect(() => {
        fetch(src).then(r => r.blob()).then(blob => { setAudioUrl(URL.createObjectURL(blob)); setIsReady(true); }).catch(e => console.error(e));
    }, [src]);

    useEffect(() => {
        if (audioRef.current) { audioRef.current.playbackRate = playbackRate; audioRef.current.volume = isMuted ? 0 : volume; }
    }, [playbackRate, volume, isMuted]);

    const togglePlay = () => { const audio = audioRef.current; if (!audio) return; if (isPlaying) audio.pause(); else audio.play(); setIsPlaying(!isPlaying); };
    const toggleSpeed = () => { const speeds = [1, 1.25, 1.5, 2]; setPlaybackRate(speeds[(speeds.indexOf(playbackRate) + 1) % speeds.length]); };
    const onTimeUpdate = () => { const audio = audioRef.current; if (!audio) return; setCurrentTime(audio.currentTime); setProgress((audio.currentTime / (audio.duration || 1)) * 100); };
    const onEnded = () => { setIsPlaying(false); setProgress(0); setCurrentTime(0); };
    const handleSeek = (e: any) => { const audio = audioRef.current; if (!audio) return; const newTime = (Number(e.target.value) / 100) * duration; audio.currentTime = newTime; setProgress(Number(e.target.value)); };
    const formatTime = (time: number) => { if (isNaN(time)) return "0:00"; const min = Math.floor(time / 60); const sec = Math.floor(time % 60); return `${min}:${sec < 10 ? '0' : ''}${sec}`; };

    if (!isReady) return <div className="text-xs text-slate-400 p-2 italic">Cargando...</div>;

    return (
        <div className={`flex items-center gap-3 p-3 rounded-xl min-w-[280px] max-w-[380px] select-none transition-colors ${isMe ? 'bg-[#dcf8c6]' : 'bg-white border border-slate-100'}`}>
            <audio ref={audioRef} src={audioUrl!} onTimeUpdate={onTimeUpdate} onLoadedMetadata={(e:any) => setDuration(e.currentTarget.duration)} onEnded={onEnded} className="hidden" />
            <button onClick={togglePlay} className={`w-10 h-10 flex items-center justify-center rounded-full transition shadow-sm flex-shrink-0 ${isMe ? 'bg-[#00a884] text-white' : 'bg-slate-200 text-slate-600'}`}>{isPlaying ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current ml-0.5" />}</button>
            <div className="flex-1 flex flex-col gap-1 w-full min-w-0">
                <div className="h-5 flex items-center"><input type="range" min="0" max="100" value={progress} onChange={handleSeek} className={`w-full h-1.5 rounded-lg appearance-none cursor-pointer ${isMe ? 'accent-[#00a884] bg-green-200' : 'accent-slate-500 bg-slate-200'}`} /></div>
                <div className="flex justify-between items-center text-[11px] font-medium text-slate-500 h-5"><span className="font-mono tabular-nums min-w-[35px]">{currentTime === 0 && !isPlaying ? formatTime(duration) : formatTime(currentTime)}</span><div className="flex items-center gap-2"><button onClick={toggleSpeed} className="px-1.5 py-0.5 bg-black/5 rounded text-[10px] font-bold">{playbackRate}x</button><div className="relative flex items-center group" onMouseEnter={() => setShowVolumeSlider(true)} onMouseLeave={() => setShowVolumeSlider(false)}><button onClick={() => setIsMuted(!isMuted)} className="p-1">{isMuted || volume === 0 ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}</button>{showVolumeSlider && <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 bg-white shadow-xl rounded-lg p-2 z-20"><div className="h-16 w-4 flex items-center justify-center"><input type="range" min="0" max="1" step="0.1" value={isMuted ? 0 : volume} onChange={(e) => { setVolume(parseFloat(e.target.value)); setIsMuted(parseFloat(e.target.value) === 0); }} className="-rotate-90 w-14 h-1 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600" /></div></div>}</div><a href={src} download="audio.webm" target="_blank" rel="noreferrer" className="p-1 hover:bg-black/5 rounded-full"><Download className="w-3.5 h-3.5" /></a></div></div>
            </div>
        </div>
    );
};

export function ChatWindow({ socket, user, contact }: ChatWindowProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  
  // Estados CRM
  const [name, setName] = useState(contact.name || '');
  const [department, setDepartment] = useState(contact.department || '');
  const [status, setStatus] = useState(contact.status || '');
  // Nuevo: Asignado A
  const [assignedTo, setAssignedTo] = useState(contact.assigned_to || '');

  const [selectedImage, setSelectedImage] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  const isProduction = window.location.hostname.includes('render.com');
  const API_URL = isProduction ? 'https://chatgorithm.onrender.com' : 'http://localhost:3000';

  const scrollToBottom = () => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  useEffect(() => scrollToBottom(), [messages]);

  useEffect(() => {
    setName(contact.name || '');
    setDepartment(contact.department || '');
    setStatus(contact.status || '');
    setAssignedTo(contact.assigned_to || '');
    setMessages([]);
    setShowEmojiPicker(false); setIsRecording(false);
    if (socket && contact.phone) socket.emit('request_conversation', contact.phone);
  }, [contact, socket]);

  useEffect(() => {
    const handleHistory = (history: Message[]) => setMessages(history);
    const handleNewMessage = (msg: any) => {
        if (msg.sender === contact.phone || msg.sender === 'Agente' || msg.recipient === contact.phone) setMessages((prev) => [...prev, msg]);
    };
    if (socket) {
        socket.on('conversation_history', handleHistory);
        socket.on('message', handleNewMessage);
        return () => { socket.off('conversation_history', handleHistory); socket.off('message', handleNewMessage); };
    }
  }, [socket, contact.phone]);

  const sendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim()) {
      const msg = { text: input, sender: user.username, targetPhone: contact.phone, timestamp: new Date().toISOString(), type: 'text' };
      socket.emit('chatMessage', msg);
      setInput(''); setShowEmojiPicker(false);
    }
  };

  const updateCRM = (field: string, value: string) => {
      if (!socket) return;
      const updates: any = {}; updates[field] = value;
      socket.emit('update_contact_info', { phone: contact.phone, updates: updates });
  };

  // ... (Funciones multimedia uploadFile, startRecording, etc. IGUAL QUE ANTES) ...
  // Por brevedad en el chat, asumo que copias el bloque multimedia del archivo anterior o te lo paso completo si lo necesitas.
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => { if (e.target.files && e.target.files[0]) uploadFile(e.target.files[0]); };
  const uploadFile = async (file: File) => { setIsUploading(true); const formData = new FormData(); formData.append('file', file); formData.append('targetPhone', contact.phone); formData.append('senderName', user.username); try { await fetch(`${API_URL}/api/upload`, { method: 'POST', body: formData }); } catch (e) { alert("Error envío"); } finally { setIsUploading(false); if(fileInputRef.current) fileInputRef.current.value = ''; } };
  const startRecording = async () => { try { const stream = await navigator.mediaDevices.getUserMedia({ audio: true }); let mimeType = 'audio/webm'; if (MediaRecorder.isTypeSupported('audio/mp4')) mimeType = 'audio/mp4'; const mediaRecorder = new MediaRecorder(stream, { mimeType }); mediaRecorderRef.current = mediaRecorder; audioChunksRef.current = []; mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data); }; mediaRecorder.onstop = async () => { const audioBlob = new Blob(audioChunksRef.current, { type: mimeType }); const ext = mimeType.includes('mp4') ? 'm4a' : 'webm'; const audioFile = new File([audioBlob], `voice.${ext}`, { type: mimeType }); await uploadFile(audioFile); stream.getTracks().forEach(t => t.stop()); }; mediaRecorder.start(); setIsRecording(true); } catch (e:any) { alert(`Error micro: ${e.message}`); } };
  const stopRecording = () => { if (mediaRecorderRef.current && isRecording) { mediaRecorderRef.current.stop(); setIsRecording(false); } };
  const onEmojiClick = (emojiData: EmojiClickData) => setInput((prev) => prev + emojiData.emoji);
  const safeTime = (time: string) => { try { return new Date(time).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}); } catch { return ''; } };

  return (
    <div className="flex flex-col h-full bg-slate-50 relative" onClick={() => setShowEmojiPicker(false)}>
      {selectedImage && (
        <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4" onClick={(e) => { e.stopPropagation(); setSelectedImage(null); }}>
            <button className="absolute top-4 right-4 text-white/70 hover:text-white p-2" onClick={() => setSelectedImage(null)}><X className="w-6 h-6" /></button>
            <img src={selectedImage} alt="Grande" className="max-w-full max-h-[90vh] object-contain rounded-lg" onClick={(e) => e.stopPropagation()} />
        </div>
      )}

      {/* BARRA SUPERIOR CRM */}
      <div className="bg-white border-b border-gray-200 p-3 flex flex-wrap gap-3 items-center shadow-sm z-10" onClick={(e) => e.stopPropagation()}>
        
        {/* Nombre */}
        <div className="flex items-center gap-2 flex-1 min-w-[140px] bg-slate-50 px-2 rounded-md border border-slate-200">
            <User className="w-4 h-4 text-slate-400" />
            <input className="text-sm font-semibold text-slate-700 border-none focus:ring-0 w-full bg-transparent py-1.5" placeholder="Nombre" value={name} onChange={(e) => setName(e.target.value)} onBlur={() => updateCRM('name', name)} />
        </div>

        {/* Dpto */}
        <div className="flex items-center gap-2 bg-slate-50 px-2 rounded-md border border-slate-200">
            <Briefcase className="w-4 h-4 text-slate-400" />
            <select className="text-xs bg-transparent border-none rounded-md py-1.5 pr-6 text-slate-600 focus:ring-0 cursor-pointer font-medium" value={department} onChange={(e) => { setDepartment(e.target.value); updateCRM('department', e.target.value); }}>
                <option value="">Sin Dpto</option><option value="Ventas">Ventas</option><option value="Taller">Taller</option><option value="Administración">Admin</option>
            </select>
        </div>

        {/* Estado */}
        <div className="flex items-center gap-2 bg-slate-50 px-2 rounded-md border border-slate-200">
            <CheckCircle className="w-4 h-4 text-slate-400" />
            <select className="text-xs bg-transparent border-none rounded-md py-1.5 pr-6 text-slate-600 focus:ring-0 cursor-pointer font-medium" value={status} onChange={(e) => { setStatus(e.target.value); updateCRM('status', e.target.value); }}>
                <option value="Nuevo">Nuevo</option><option value="Abierto">Abierto</option><option value="Cerrado">Cerrado</option>
            </select>
        </div>

        {/* NUEVO: Asignar a (Input simple para escribir el nombre del agente) */}
        <div className="flex items-center gap-2 bg-blue-50 px-2 rounded-md border border-blue-100 ml-auto">
            <UserCheck className="w-4 h-4 text-blue-500" />
            <input 
                className="text-xs bg-transparent border-none rounded-md py-1.5 text-blue-700 focus:ring-0 w-[80px] font-bold placeholder:text-blue-300"
                placeholder="Asignar..."
                value={assignedTo}
                onChange={(e) => setAssignedTo(e.target.value)}
                onBlur={() => updateCRM('assigned_to', assignedTo)}
                title="Escribe el nombre del agente para asignarle el chat"
            />
        </div>

      </div>

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
               <div className={`flex flex-col max-w-[75%]`}>
                {isMe && (
                    <span className="text-[10px] text-slate-500 font-bold mb-1 block text-right mr-1 uppercase tracking-wide">
                        {m.sender === 'Agente' ? 'Yo' : m.sender}
                    </span>
                )}
                <div className={`p-3 rounded-xl shadow-sm text-sm relative text-slate-800 ${isMe ? 'bg-green-100 rounded-tr-none' : 'bg-white rounded-tl-none border border-slate-100'}`}>
                    {m.type === 'image' && m.mediaId ? (
                        <div className="mb-1 group relative">
                            <img src={`${API_URL}/api/media/${m.mediaId}`} alt="Imagen" className="rounded-lg max-w-[200px] max-h-[200px] w-auto h-auto object-contain cursor-pointer hover:opacity-90 transition bg-black/5" onClick={(e) => { e.stopPropagation(); setSelectedImage(`${API_URL}/api/media/${m.mediaId}`); }} />
                        </div>
                    ) : m.type === 'audio' && m.mediaId ? (
                        <CustomAudioPlayer src={`${API_URL}/api/media/${m.mediaId}`} isMe={isMe} />
                    ) : m.type === 'document' && m.mediaId ? (
                        <div className="flex items-center gap-3 bg-slate-50 p-2 rounded-lg border border-slate-200 min-w-[200px]">
                            <div className="bg-red-100 p-2 rounded-full text-red-500"><FileText className="w-6 h-6" /></div>
                            <div className="flex-1 min-w-0">
                                <p className="font-semibold text-slate-700 truncate">{m.text}</p>
                                <p className="text-xs text-slate-400">Documento</p>
                            </div>
                            <a href={`${API_URL}/api/media/${m.mediaId}`} target="_blank" rel="noopener noreferrer" className="p-2 text-slate-400 hover:text-blue-500 hover:bg-slate-100 rounded-full transition"><Download className="w-5 h-5" /></a>
                        </div>
                    ) : (
                        <p className="whitespace-pre-wrap">{String(m.text || "")}</p>
                    )}
                    <span className="text-[10px] text-slate-400 block text-right mt-1 opacity-70">{safeTime(m.timestamp)}</span>
                </div>
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {showEmojiPicker && (
        <div className="absolute bottom-20 left-4 z-50 shadow-2xl rounded-xl animate-in zoom-in-95 duration-200" onClick={(e) => e.stopPropagation()}>
            <EmojiPicker onEmojiClick={onEmojiClick} width={300} height={400} previewConfig={{ showPreview: false }} />
        </div>
      )}

      <div className="p-3 bg-white border-t border-slate-200 relative z-20">
        <form onSubmit={sendMessage} className="flex gap-2 items-center max-w-5xl mx-auto" onClick={(e) => e.stopPropagation()}>
          <input type="file" ref={fileInputRef} onChange={handleFileSelect} className="hidden" />
          <button type="button" onClick={() => fileInputRef.current?.click()} disabled={isUploading} className="p-2 rounded-full text-slate-500 hover:bg-slate-200 transition" title="Adjuntar"><Paperclip className="w-5 h-5" /></button>
          <input type="text" value={input} onChange={(e) => setInput(e.target.value)} placeholder={isUploading ? "Enviando..." : isRecording ? "Grabando audio..." : "Escribe un mensaje..."} disabled={isUploading || isRecording} className="flex-1 py-3 px-4 bg-slate-50 rounded-lg border border-slate-200 focus:outline-none focus:border-blue-300 text-sm" />
          <button type="button" className={`p-2 rounded-full transition ${showEmojiPicker ? 'text-blue-500 bg-blue-50' : 'text-slate-500 hover:bg-slate-200'}`} onClick={() => setShowEmojiPicker(!showEmojiPicker)}><Smile className="w-5 h-5" /></button>
          {input.trim() ? (
              <button type="submit" disabled={isUploading} className="p-3 bg-blue-600 text-white rounded-full hover:bg-blue-700 transition shadow-sm"><Send className="w-5 h-5" /></button>
          ) : (
              <button type="button" onClick={isRecording ? stopRecording : startRecording} className={`p-3 rounded-full text-white transition shadow-sm ${isRecording ? 'bg-red-500 hover:bg-red-600 animate-pulse' : 'bg-slate-700 hover:bg-slate-800'}`} title="Grabar audio">{isRecording ? <Square className="w-5 h-5 fill-current" /> : <Mic className="w-5 h-5" />}</button>
          )}
        </form>
      </div>
    </div>
  );
}