import React, { useState, useEffect } from 'react';
import { 
  Calendar as CalendarIcon, 
  Clock, 
  Plus, 
  Trash2, 
  User, 
  CheckCircle, // <--- Asegurado que está aquí
  RefreshCw, 
  Phone, 
  ChevronLeft, 
  ChevronRight, 
  Zap 
} from 'lucide-react';

interface Appointment {
  id: string;
  date: string;
  status: 'Available' | 'Booked';
  clientPhone?: string;
  clientName?: string;
}

const CalendarDashboard = () => {
  const isProduction = window.location.hostname.includes('render.com');
  const API_URL = isProduction ? 'https://chatgorithm.onrender.com/api' : 'http://localhost:3000/api';

  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentDate, setCurrentDate] = useState(new Date());

  // Estado Generador
  const [showGenerator, setShowGenerator] = useState(false);
  const [genConfig, setGenConfig] = useState({
      days: [] as number[], // 1=Lun, 2=Mar...
      startTime: '09:00',
      endTime: '17:00',
      duration: 30
  });
  const [isGenerating, setIsGenerating] = useState(false);

  useEffect(() => { fetchAppointments(); }, []);

  const fetchAppointments = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/appointments`);
      const data = await res.json();
      setAppointments(data);
    } catch (err) { console.error(err); } finally { setLoading(false); }
  };

  const handleGenerate = async () => {
      if (genConfig.days.length === 0) return alert("Selecciona al menos un día de la semana.");
      setIsGenerating(true);
      try {
          await fetch(`${API_URL}/appointments/generate`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(genConfig)
          });
          alert("¡Agenda generada con éxito!");
          setShowGenerator(false);
          fetchAppointments();
      } catch (e) { alert("Error generando"); } 
      finally { setIsGenerating(false); }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("¿Borrar hueco?")) return;
    try {
        await fetch(`${API_URL}/appointments/${id}`, { method: 'DELETE' });
        setAppointments(prev => prev.filter(a => a.id !== id));
    } catch (e) { alert("Error"); }
  };

  const toggleDay = (day: number) => {
      setGenConfig(prev => ({
          ...prev,
          days: prev.days.includes(day) ? prev.days.filter(d => d !== day) : [...prev.days, day]
      }));
  };

  // Renderizado del Calendario
  const getDaysInMonth = (date: Date) => {
      const year = date.getFullYear();
      const month = date.getMonth();
      const days = new Date(year, month + 1, 0).getDate();
      const firstDay = new Date(year, month, 1).getDay(); // 0 Dom, 1 Lun
      // Ajustar para que semana empiece en Lunes (Español)
      const adjustedFirstDay = firstDay === 0 ? 6 : firstDay - 1;
      return { days, firstDay: adjustedFirstDay };
  };

  const { days: totalDays, firstDay } = getDaysInMonth(currentDate);
  const blanks = Array(firstDay).fill(null);
  const daysArray = Array.from({ length: totalDays }, (_, i) => i + 1);

  const getSlotsForDay = (day: number) => {
      return appointments.filter(a => {
          const d = new Date(a.date);
          return d.getDate() === day && d.getMonth() === currentDate.getMonth() && d.getFullYear() === currentDate.getFullYear();
      });
  };

  const monthNames = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

  return (
    <div className="p-8 h-full overflow-y-auto bg-slate-50">
      <div className="max-w-6xl mx-auto space-y-6">
        
        {/* Header */}
        <div className="flex justify-between items-center bg-white p-4 rounded-2xl shadow-sm border border-slate-200">
            <div className="flex items-center gap-4">
                <button onClick={() => setCurrentDate(new Date(currentDate.setMonth(currentDate.getMonth() - 1)))} className="p-2 hover:bg-slate-100 rounded-full"><ChevronLeft/></button>
                <h2 className="text-xl font-bold text-slate-800 w-40 text-center">
                    {monthNames[currentDate.getMonth()]} {currentDate.getFullYear()}
                </h2>
                <button onClick={() => setCurrentDate(new Date(currentDate.setMonth(currentDate.getMonth() + 1)))} className="p-2 hover:bg-slate-100 rounded-full"><ChevronRight/></button>
            </div>
            
            <div className="flex gap-2">
                <button onClick={() => setShowGenerator(!showGenerator)} className="flex items-center gap-2 bg-purple-600 text-white px-4 py-2 rounded-xl font-bold hover:bg-purple-700 transition shadow-sm active:scale-95">
                    <Zap size={18}/> {showGenerator ? 'Cerrar Generador' : 'Generar Huecos Auto'}
                </button>
                <button onClick={fetchAppointments} className="p-2 text-slate-400 hover:text-blue-500 bg-slate-100 rounded-xl"><RefreshCw size={20}/></button>
            </div>
        </div>

        {/* Panel Generador */}
        {showGenerator && (
            <div className="bg-purple-50 p-6 rounded-2xl border border-purple-100 animate-in slide-in-from-top-4">
                <h3 className="font-bold text-purple-800 mb-4 flex items-center gap-2"><Zap size={20}/> Configurar Disponibilidad Recurrente</h3>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                    <div className="md:col-span-2">
                        <label className="text-xs font-bold text-purple-400 uppercase mb-2 block">Días de la semana</label>
                        <div className="flex gap-2">
                            {['L','M','X','J','V','S','D'].map((d, i) => {
                                const dayIdx = i + 1 === 7 ? 0 : i + 1; // Ajuste Domingo=0
                                const isSelected = genConfig.days.includes(dayIdx);
                                return (
                                    <button key={d} onClick={() => toggleDay(dayIdx)} className={`w-10 h-10 rounded-lg font-bold text-sm transition-all ${isSelected ? 'bg-purple-600 text-white shadow-md' : 'bg-white text-slate-500 border border-slate-200 hover:border-purple-300'}`}>{d}</button>
                                )
                            })}
                        </div>
                    </div>
                    <div>
                        <label className="text-xs font-bold text-purple-400 uppercase mb-2 block">Horario</label>
                        <div className="flex items-center gap-2">
                            <input type="time" value={genConfig.startTime} onChange={e => setGenConfig({...genConfig, startTime: e.target.value})} className="p-2 rounded-lg border border-purple-200 text-sm font-bold text-slate-700 w-full"/>
                            <span className="text-purple-300">-</span>
                            <input type="time" value={genConfig.endTime} onChange={e => setGenConfig({...genConfig, endTime: e.target.value})} className="p-2 rounded-lg border border-purple-200 text-sm font-bold text-slate-700 w-full"/>
                        </div>
                    </div>
                    <div className="flex items-end">
                        <button onClick={handleGenerate} disabled={isGenerating} className="w-full bg-purple-800 text-white font-bold py-2.5 rounded-xl hover:bg-purple-900 transition shadow-lg disabled:opacity-50">
                            {isGenerating ? 'Generando...' : 'Crear Huecos (Próx. 30 días)'}
                        </button>
                    </div>
                </div>
            </div>
        )}

        {/* CALENDARIO GRID */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="grid grid-cols-7 bg-slate-50 border-b border-slate-200">
                {['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map(d => (
                    <div key={d} className="p-3 text-center text-xs font-bold text-slate-400 uppercase">{d}</div>
                ))}
            </div>
            <div className="grid grid-cols-7 auto-rows-fr">
                {blanks.map((_, i) => <div key={`blank-${i}`} className="bg-slate-50/30 border-b border-r border-slate-100 min-h-[120px]"></div>)}
                
                {daysArray.map(day => {
                    const slots = getSlotsForDay(day);
                    const isToday = day === new Date().getDate() && currentDate.getMonth() === new Date().getMonth();
                    
                    return (
                        <div key={day} className={`min-h-[120px] p-2 border-b border-r border-slate-100 relative group transition-colors hover:bg-slate-50 ${isToday ? 'bg-blue-50/30' : ''}`}>
                            <span className={`text-sm font-bold mb-2 block w-7 h-7 flex items-center justify-center rounded-full ${isToday ? 'bg-blue-600 text-white' : 'text-slate-700'}`}>{day}</span>
                            
                            <div className="space-y-1 max-h-[100px] overflow-y-auto no-scrollbar">
                                {slots.map(s => (
                                    <div key={s.id} className={`text-[10px] px-1.5 py-1 rounded flex justify-between items-center group/slot cursor-pointer ${s.status === 'Booked' ? 'bg-purple-100 text-purple-700 border border-purple-200' : 'bg-green-50 text-green-700 border border-green-100'}`}>
                                        <span className="font-bold">{new Date(s.date).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</span>
                                        {s.status === 'Booked' ? <User size={10}/> : null}
                                        
                                        <button onClick={(e) => { e.stopPropagation(); handleDelete(s.id); }} className="hidden group-hover/slot:block text-red-500 hover:bg-white rounded-full p-0.5"><Trash2 size={10}/></button>
                                    </div>
                                ))}
                            </div>
                            {slots.length === 0 && <div className="h-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"><button onClick={() => alert("Usa el generador arriba para añadir huecos")} className="text-slate-300 hover:text-purple-500"><Plus size={20}/></button></div>}
                        </div>
                    );
                })}
            </div>
        </div>

      </div>
    </div>
  );
};

export default CalendarDashboard;