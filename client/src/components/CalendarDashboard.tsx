import React, { useState, useEffect } from 'react';
import { 
  Calendar as CalendarIcon, 
  Clock, 
  Plus, 
  Trash2, 
  User, 
  CheckCircle,
  RefreshCw,
  Phone
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
  
  // Estado para crear nueva cita
  const [newDate, setNewDate] = useState('');
  const [newTime, setNewTime] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    fetchAppointments();
  }, []);

  const fetchAppointments = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/appointments`);
      const data = await res.json();
      setAppointments(data);
    } catch (err) {
      console.error("Error cargando citas:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateSlot = async () => {
    if (!newDate || !newTime) return alert("Selecciona fecha y hora");
    setIsCreating(true);

    const fullDate = new Date(`${newDate}T${newTime}`).toISOString();

    try {
      const res = await fetch(`${API_URL}/appointments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            date: fullDate,
            status: 'Available'
        })
      });
      
      if (res.ok) {
          await fetchAppointments();
          setNewDate(''); // Limpiar fecha
          // No limpiamos la hora para facilitar crear varias seguidas
      } else {
          alert("Error al crear el hueco");
      }
    } catch (e) { alert("Error de conexión"); }
    finally { setIsCreating(false); }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("¿Borrar esta cita?")) return;
    try {
        await fetch(`${API_URL}/appointments/${id}`, { method: 'DELETE' });
        setAppointments(prev => prev.filter(a => a.id !== id));
    } catch (e) { alert("Error eliminando"); }
  };

  // Agrupar citas por día para mostrarlas ordenadas
  const groupedAppointments = appointments.reduce((acc, appt) => {
      const dateObj = new Date(appt.date);
      const dateKey = dateObj.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
      
      if (!acc[dateKey]) acc[dateKey] = [];
      acc[dateKey].push(appt);
      // Ordenar por hora dentro del día
      acc[dateKey].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      
      return acc;
  }, {} as Record<string, Appointment[]>);

  // Ordenar los días cronológicamente
  const sortedDateKeys = Object.keys(groupedAppointments).sort((a, b) => {
      // Truco sucio pero efectivo: cogemos el primer elemento de cada grupo para comparar fechas
      const dateA = new Date(groupedAppointments[a][0].date).getTime();
      const dateB = new Date(groupedAppointments[b][0].date).getTime();
      return dateA - dateB;
  });

  return (
    <div className="p-8 h-full overflow-y-auto bg-slate-50">
      <div className="max-w-5xl mx-auto space-y-8">
        
        {/* Header */}
        <div className="flex justify-between items-end">
            <div>
                <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                    <CalendarIcon className="text-purple-600" /> Agenda Inteligente
                </h1>
                <p className="text-slate-500 mt-1">Crea huecos libres para que la IA pueda ofrecerlos a los clientes.</p>
            </div>
            <button onClick={fetchAppointments} className="p-2 text-slate-400 hover:text-blue-500 transition bg-white rounded-lg border border-slate-200 shadow-sm"><RefreshCw size={20}/></button>
        </div>

        {/* Panel de Creación Rápida */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-wrap items-end gap-4">
            <div className="flex-1 min-w-[200px]">
                <label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Fecha</label>
                <input type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-purple-500 outline-none transition-all" />
            </div>
            <div className="flex-1 min-w-[150px]">
                <label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Hora</label>
                <input type="time" value={newTime} onChange={(e) => setNewTime(e.target.value)} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-purple-500 outline-none transition-all" />
            </div>
            <button 
                onClick={handleCreateSlot}
                disabled={isCreating || !newDate || !newTime}
                className="bg-purple-600 hover:bg-purple-700 text-white font-bold py-3 px-6 rounded-xl shadow-lg shadow-purple-100 active:scale-95 transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
                <Plus size={20} /> Añadir Hueco
            </button>
        </div>

        {/* Lista de Citas */}
        {loading ? (
            <div className="text-center py-10 text-slate-400 flex items-center justify-center gap-2">
                <RefreshCw className="animate-spin" size={18}/> Cargando agenda...
            </div>
        ) : (
            <div className="space-y-8 pb-10">
                {sortedDateKeys.length === 0 ? (
                    <div className="text-center py-12 bg-white rounded-2xl border border-dashed border-slate-300">
                        <CalendarIcon size={48} className="mx-auto text-slate-200 mb-3" />
                        <p className="text-slate-400 font-medium">No hay citas programadas.</p>
                        <p className="text-sm text-slate-400">Añade huecos libres arriba para empezar.</p>
                    </div>
                ) : (
                    sortedDateKeys.map(dateKey => (
                        <div key={dateKey} className="animate-in slide-in-from-bottom-2 duration-300">
                            <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-4 ml-1 flex items-center gap-2 border-b border-slate-200 pb-2">
                                <span className="w-2 h-2 rounded-full bg-purple-400"></span> {dateKey}
                            </h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                {groupedAppointments[dateKey].map(appt => (
                                    <div key={appt.id} className={`p-4 rounded-xl border transition-all relative group ${appt.status === 'Booked' ? 'bg-white border-purple-200 shadow-md ring-1 ring-purple-100' : 'bg-white border-slate-200 border-dashed hover:border-purple-300 hover:bg-purple-50/30'}`}>
                                        
                                        <div className="flex justify-between items-start mb-3">
                                            <div className="flex items-center gap-2">
                                                <div className={`p-1.5 rounded-lg ${appt.status === 'Booked' ? 'bg-purple-100 text-purple-600' : 'bg-slate-100 text-slate-500'}`}>
                                                    <Clock size={16} />
                                                </div>
                                                <span className="font-bold text-lg text-slate-700">
                                                    {new Date(appt.date).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                                                </span>
                                            </div>
                                            <button onClick={() => handleDelete(appt.id)} className="text-slate-300 hover:text-red-500 transition p-1 rounded-md hover:bg-red-50 opacity-0 group-hover:opacity-100">
                                                <Trash2 size={16} />
                                            </button>
                                        </div>

                                        {appt.status === 'Booked' ? (
                                            <div className="space-y-2">
                                                <div className="flex items-center gap-2 text-slate-700">
                                                    <User size={14} className="text-purple-400" />
                                                    <span className="font-bold text-sm truncate">{appt.clientName || "Cliente Web"}</span>
                                                </div>
                                                <div className="flex items-center gap-2 text-slate-500">
                                                    <Phone size={14} className="text-purple-400" />
                                                    <span className="text-xs font-mono">{appt.clientPhone}</span>
                                                </div>
                                                <div className="pt-2 mt-2 border-t border-purple-50">
                                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-purple-100 text-purple-700 text-[10px] font-bold rounded-full uppercase tracking-wide">
                                                        <CheckCircle size={10} /> Reservada
                                                    </span>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="mt-2">
                                                <span className="inline-flex items-center gap-1.5 px-2 py-1 bg-green-50 text-green-700 text-xs font-bold rounded-lg border border-green-100">
                                                    <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></div>
                                                    Disponible
                                                </span>
                                                <p className="text-[10px] text-slate-400 mt-2">La IA puede ofrecer esta hora.</p>
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))
                )}
            </div>
        )}
      </div>
    </div>
  );
};

export default CalendarDashboard;