import React, { useState, useEffect } from 'react';
import { 
  Calendar as CalendarIcon, Clock, Plus, Trash2, User, CheckCircle, 
  RefreshCw, Phone, ChevronLeft, ChevronRight, Zap, X, Save, Eye 
} from 'lucide-react';

interface Appointment {
  id: string;
  date: string;
  status: 'Available' | 'Booked';
  clientPhone?: string;
  clientName?: string;
}

// DEFINICIÓN DE PROPS (ESTO ARREGLA EL ERROR)
interface CalendarDashboardProps {
    readOnly?: boolean;
}

const CalendarDashboard: React.FC<CalendarDashboardProps> = ({ readOnly = false }) => {
  const isProduction = window.location.hostname.includes('render.com');
  const API_URL = isProduction ? 'https://chatgorithm.onrender.com/api' : 'http://localhost:3000/api';

  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentDate, setCurrentDate] = useState(new Date());

  // Modal Edición
  const [selectedAppt, setSelectedAppt] = useState<Appointment | null>(null);
  const [editStatus, setEditStatus] = useState('');
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');

  // Generador
  const [showGenerator, setShowGenerator] = useState(false);
  const [genConfig, setGenConfig] = useState({ days: [] as number[], startTime: '09:00', endTime: '17:00', duration: 30 });
  const [isGenerating, setIsGenerating] = useState(false);
  const [newDate, setNewDate] = useState('');
  const [newTime, setNewTime] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => { fetchAppointments(); }, []);

  const fetchAppointments = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/appointments`);
      const data = await res.json();
      setAppointments(data);
    } catch (err) { console.error(err); } finally { setLoading(false); }
  };

  const handleOpenEdit = (appt: Appointment) => {
      setSelectedAppt(appt);
      setEditStatus(appt.status);
      setEditName(appt.clientName || '');
      setEditPhone(appt.clientPhone || '');
  };

  const handleUpdateAppt = async () => {
      if (!selectedAppt) return;
      try {
          const res = await fetch(`${API_URL}/appointments/${selectedAppt.id}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                  status: editStatus,
                  clientName: editName,
                  clientPhone: editPhone
              })
          });
          if (res.ok) {
              await fetchAppointments();
              setSelectedAppt(null);
          } else alert("Error guardando");
      } catch(e) { alert("Error"); }
  };
  
  const handleCreateSlot = async () => {
    if (!newDate || !newTime) return alert("Datos incompletos");
    setIsCreating(true);
    try {
      await fetch(`${API_URL}/appointments`, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ date: new Date(`${newDate}T${newTime}`).toISOString(), status: 'Available' }) });
      await fetchAppointments(); setNewDate('');
    } catch (e) { alert("Error"); } finally { setIsCreating(false); }
  };

  const handleDelete = async (id: string) => {
      if (!window.confirm("¿Borrar?")) return;
      await fetch(`${API_URL}/appointments/${id}`, { method: 'DELETE' });
      setAppointments(prev => prev.filter(a => a.id !== id));
      if (selectedAppt?.id === id) setSelectedAppt(null);
  };
  
  const handleGenerate = async () => {
      setIsGenerating(true);
      await fetch(`${API_URL}/appointments/generate`, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(genConfig) });
      setIsGenerating(false); setShowGenerator(false); fetchAppointments();
  };
  
  const toggleDay = (d: number) => setGenConfig(p => ({...p, days: p.days.includes(d) ? p.days.filter(x => x!==d) : [...p.days, d]}));

  // Render Helpers
  const getDaysInMonth = (date: Date) => {
      const year = date.getFullYear();
      const month = date.getMonth();
      const days = new Date(year, month + 1, 0).getDate();
      const firstDay = new Date(year, month, 1).getDay(); 
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
    <div className="p-8 h-full overflow-y-auto bg-slate-50 relative">
      <div className="max-w-6xl mx-auto space-y-6">
        
        {/* Header */}
        <div className="flex justify-between items-center bg-white p-4 rounded-2xl shadow-sm border border-slate-200">
            <div className="flex items-center gap-4">
                <button onClick={() => setCurrentDate(new Date(currentDate.setMonth(currentDate.getMonth() - 1)))} className="p-2 hover:bg-slate-100 rounded-full"><ChevronLeft/></button>
                <h2 className="text-xl font-bold text-slate-800 w-40 text-center">{monthNames[currentDate.getMonth()]} {currentDate.getFullYear()}</h2>
                <button onClick={() => setCurrentDate(new Date(currentDate.setMonth(currentDate.getMonth() + 1)))} className="p-2 hover:bg-slate-100 rounded-full"><ChevronRight/></button>
            </div>
            <div className="flex gap-2">
                {/* Ocultamos Generador si es ReadOnly */}
                {!readOnly && (
                    <button onClick={() => setShowGenerator(!showGenerator)} className="flex items-center gap-2 bg-purple-600 text-white px-4 py-2 rounded-xl font-bold hover:bg-purple-700 transition shadow-sm active:scale-95"><Zap size={18}/> {showGenerator ? 'Cerrar' : 'Generar Auto'}</button>
                )}
                <button onClick={fetchAppointments} className="p-2 text-slate-400 hover:text-blue-500 bg-slate-100 rounded-xl"><RefreshCw size={20}/></button>
            </div>
        </div>

        {/* Generador y Crear Manual (Oculto en ReadOnly) */}
        {!readOnly && showGenerator && <div className="bg-purple-50 p-6 rounded-2xl border border-purple-100">
            <div className="grid grid-cols-4 gap-4">
                <div className="col-span-2 flex gap-2">{['L','M','X','J','V','S','D'].map((d, i) => <button key={d} onClick={() => toggleDay(i+1===7?0:i+1)} className={`w-10 h-10 rounded-lg font-bold ${genConfig.days.includes(i+1===7?0:i+1) ? 'bg-purple-600 text-white' : 'bg-white'}`}>{d}</button>)}</div>
                <div className="flex gap-2"><input type="time" value={genConfig.startTime} onChange={e=>setGenConfig({...genConfig, startTime:e.target.value})} className="p-2 rounded-lg border"/><input type="time" value={genConfig.endTime} onChange={e=>setGenConfig({...genConfig, endTime:e.target.value})} className="p-2 rounded-lg border"/></div>
                <button onClick={handleGenerate} disabled={isGenerating} className="bg-purple-800 text-white font-bold rounded-xl">{isGenerating ? '...' : 'Generar'}</button>
            </div>
        </div>}

        {!readOnly && (
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-end gap-4">
                <div className="flex-1"><label className="text-xs font-bold text-slate-400 block mb-1">Fecha</label><input type="date" value={newDate} onChange={e=>setNewDate(e.target.value)} className="w-full p-2 border rounded-lg"/></div>
                <div className="flex-1"><label className="text-xs font-bold text-slate-400 block mb-1">Hora</label><input type="time" value={newTime} onChange={e=>setNewTime(e.target.value)} className="w-full p-2 border rounded-lg"/></div>
                <button onClick={handleCreateSlot} disabled={isCreating} className="bg-purple-600 text-white font-bold py-2 px-4 rounded-lg"><Plus size={20}/> Crear Hueco</button>
            </div>
        )}

        {/* CALENDARIO */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="grid grid-cols-7 bg-slate-50 border-b border-slate-200">{['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'].map(d=><div key={d} className="p-3 text-center text-xs font-bold text-slate-400 uppercase">{d}</div>)}</div>
            <div className="grid grid-cols-7 auto-rows-fr">
                {blanks.map((_, i) => <div key={`blank-${i}`} className="bg-slate-50/30 border-b border-r border-slate-100 min-h-[120px]"></div>)}
                {daysArray.map(day => {
                    const slots = getSlotsForDay(day);
                    const booked = slots.filter(s => s.status === 'Booked').length;
                    const total = slots.length;
                    
                    return (
                        <div key={day} className="min-h-[120px] p-2 border-b border-r border-slate-100 hover:bg-slate-50 relative group">
                            <div className="flex justify-between items-start mb-2">
                                <span className="text-sm font-bold text-slate-700">{day}</span>
                                {total > 0 && <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${booked === total ? 'bg-red-100 text-red-600' : 'bg-blue-100 text-blue-600'}`}>{booked}/{total} Ocupadas</span>}
                            </div>
                            
                            <div className="space-y-1 max-h-[100px] overflow-y-auto">
                                {slots.map(s => (
                                    <div 
                                        key={s.id} 
                                        onClick={() => handleOpenEdit(s)}
                                        className={`text-[10px] px-2 py-1.5 rounded cursor-pointer transition flex justify-between items-center ${s.status === 'Booked' ? 'bg-purple-100 text-purple-700 hover:bg-purple-200' : 'bg-green-50 text-green-700 hover:bg-green-100'}`}
                                    >
                                        <span className="font-bold">{new Date(s.date).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</span>
                                        {s.status === 'Booked' && <User size={10}/>}
                                        {/* Solo mostrar botón eliminar si NO es ReadOnly */}
                                        {!readOnly && (
                                            <button onClick={(e) => { e.stopPropagation(); handleDelete(s.id); }} className="hidden group-hover/slot:block text-red-500 hover:bg-white rounded-full p-0.5"><Trash2 size={10}/></button>
                                        )}
                                    </div>
                                ))}
                            </div>
                            
                            {/* Botón rápido + (Oculto en ReadOnly) */}
                            {!readOnly && (
                                <button 
                                    onClick={() => { setNewDate(`${currentDate.getFullYear()}-${String(currentDate.getMonth()+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`); }}
                                    className="absolute bottom-2 right-2 opacity-0 group-hover:opacity-100 bg-slate-200 p-1 rounded-full text-slate-500 hover:bg-purple-500 hover:text-white transition"
                                >
                                    <Plus size={14}/>
                                </button>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>

      </div>

      {/* MODAL EDICIÓN CITA */}
      {selectedAppt && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in">
              <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
                  <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                      <h3 className="font-bold text-slate-800 flex items-center gap-2">
                        {readOnly ? <Eye size={18} className="text-blue-500"/> : null} 
                        {readOnly ? 'Detalles Cita' : 'Gestionar Cita'}
                      </h3>
                      <button onClick={() => setSelectedAppt(null)}><X size={20} className="text-slate-400 hover:text-slate-600"/></button>
                  </div>
                  <div className="p-6 space-y-4">
                      <div className="text-center mb-4">
                          <div className="text-3xl font-bold text-slate-800">{new Date(selectedAppt.date).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</div>
                          <div className="text-sm text-slate-500">{new Date(selectedAppt.date).toLocaleDateString()}</div>
                      </div>

                      {/* Selector Estado */}
                      <div>
                          <label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Estado</label>
                          <select 
                            value={editStatus} 
                            onChange={(e) => setEditStatus(e.target.value)} 
                            className="w-full p-2 border rounded-lg bg-white"
                            disabled={readOnly}
                          >
                              <option value="Available">🟢 Disponible</option>
                              <option value="Booked">🔴 Reservada</option>
                          </select>
                      </div>

                      {/* Datos Cliente (Solo si reservada o en modo edición) */}
                      {(editStatus === 'Booked' || readOnly) && (
                          <div className="bg-purple-50 p-4 rounded-xl border border-purple-100 space-y-3">
                              <div>
                                  <label className="text-xs font-bold text-purple-700 uppercase mb-1 block">Nombre Cliente</label>
                                  <input 
                                    type="text" 
                                    value={editName} 
                                    onChange={(e) => setEditName(e.target.value)} 
                                    className="w-full p-2 border border-purple-200 rounded-lg text-sm" 
                                    placeholder="Ej: Juan Pérez"
                                    disabled={readOnly}
                                  />
                              </div>
                              <div>
                                  <label className="text-xs font-bold text-purple-700 uppercase mb-1 block">Teléfono</label>
                                  <input 
                                    type="text" 
                                    value={editPhone} 
                                    onChange={(e) => setEditPhone(e.target.value)} 
                                    className="w-full p-2 border border-purple-200 rounded-lg text-sm" 
                                    placeholder="Ej: 34600..."
                                    disabled={readOnly}
                                  />
                              </div>
                          </div>
                      )}

                      {/* Botones de Acción (Ocultos en ReadOnly) */}
                      {!readOnly && (
                          <div className="flex gap-2 pt-2">
                              <button onClick={() => handleDelete(selectedAppt.id)} className="p-3 text-red-500 bg-red-50 rounded-xl hover:bg-red-100 transition"><Trash2 size={20}/></button>
                              <button onClick={handleUpdateAppt} className="flex-1 bg-slate-900 text-white font-bold rounded-xl hover:bg-slate-800 transition flex items-center justify-center gap-2">
                                  <Save size={18}/> Guardar Cambios
                              </button>
                          </div>
                      )}
                  </div>
              </div>
          </div>
      )}
    </div>
  );
};

export default CalendarDashboard;