import React, { useState, useEffect } from 'react';
import { 
  BarChart3, 
  Users, 
  MessageSquare, 
  TrendingUp, 
  UserCheck, 
  Calendar,
  MessageCircle,
  AlertCircle,
  Loader2
} from 'lucide-react';

const AnalyticsDashboard = () => {
  const isProduction = window.location.hostname.includes('render.com');
  const API_URL = isProduction ? 'https://chatgorithm.onrender.com/api' : 'http://localhost:3000/api';

  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${API_URL}/analytics`)
      .then(async res => {
          const json = await res.json();
          if (!res.ok) throw new Error(json.error || "Error al cargar datos");
          return json;
      })
      .then(d => {
        setData(d);
        setLoading(false);
      })
      .catch(err => {
        console.error("Error fetching analytics:", err);
        setError(err.message);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
        <div className="h-full flex flex-col items-center justify-center text-slate-400 gap-2">
            <Loader2 className="animate-spin" size={32} />
            <p className="text-sm font-medium">Calculando métricas...</p>
        </div>
    );
  }

  if (error) {
    return (
        <div className="h-full flex flex-col items-center justify-center text-red-400 gap-4 p-8 text-center">
            <div className="bg-red-50 p-4 rounded-full"><AlertCircle size={48} /></div>
            <div>
                <h3 className="text-lg font-bold text-slate-700">No se pudieron cargar las analíticas</h3>
                <p className="text-sm mt-1 max-w-md mx-auto">{error}</p>
                <p className="text-xs mt-4 text-slate-400">Verifica que las tablas 'Contacts' y 'Messages' existen en Airtable.</p>
            </div>
            <button onClick={() => window.location.reload()} className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg text-sm font-bold transition">Reintentar</button>
        </div>
    );
  }

  // --- PROTECCIÓN CONTRA PANTALLA BLANCA ---
  // Si data es null o vacío, usamos valores por defecto para que pinte algo
  const safeData = data || {};
  const kpis = safeData.kpis || { totalMessages: 0, totalContacts: 0, newLeads: 0 };
  const activity = safeData.activity || [];
  const agents = safeData.agents || [];
  const statuses = safeData.statuses || [];

  // Escalar gráfica (evitar división por cero)
  const maxActivity = Math.max(...(activity.map((d:any) => d.count) || [0]), 1);

  if (!data && !loading && !error) {
     return (
        <div className="h-full flex flex-col items-center justify-center text-slate-400 p-8">
            <p>No se han recibido datos del servidor.</p>
            <button onClick={() => window.location.reload()} className="mt-4 px-4 py-2 bg-slate-100 hover:bg-slate-200 rounded-lg text-sm">Recargar</button>
        </div>
     );
  }

  return (
    <div className="p-8 h-full overflow-y-auto bg-slate-50">
      <div className="max-w-6xl mx-auto space-y-8">
        
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <BarChart3 className="text-blue-600" /> Dashboard de Rendimiento
          </h1>
          <p className="text-slate-500">Resumen de actividad de los últimos 7 días.</p>
        </div>

        {/* KPIs Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-4">
            <div className="p-3 bg-blue-50 text-blue-600 rounded-xl"><MessageSquare size={24} /></div>
            <div>
              <p className="text-sm text-slate-400 font-bold uppercase tracking-wider">Total Mensajes</p>
              <h3 className="text-3xl font-bold text-slate-800">{kpis.totalMessages}</h3>
            </div>
          </div>

          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-4">
            <div className="p-3 bg-purple-50 text-purple-600 rounded-xl"><Users size={24} /></div>
            <div>
              <p className="text-sm text-slate-400 font-bold uppercase tracking-wider">Contactos Totales</p>
              <h3 className="text-3xl font-bold text-slate-800">{kpis.totalContacts}</h3>
            </div>
          </div>

          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-4">
            <div className="p-3 bg-green-50 text-green-600 rounded-xl"><TrendingUp size={24} /></div>
            <div>
              <p className="text-sm text-slate-400 font-bold uppercase tracking-wider">Nuevos Leads</p>
              <h3 className="text-3xl font-bold text-slate-800">{kpis.newLeads}</h3>
            </div>
          </div>
        </div>

        {/* Gráfico de Barras CSS (Actividad Semanal) */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <h3 className="font-bold text-slate-700 mb-6 flex items-center gap-2">
            <Calendar size={18} className="text-slate-400"/> Mensajes (Últimos 7 días)
          </h3>
          
          <div className="h-48 flex items-end justify-between gap-2">
            {activity.length > 0 ? activity.map((day: any, i: number) => {
              const heightPercent = (day.count / maxActivity) * 100;
              return (
                <div key={i} className="flex-1 flex flex-col items-center gap-2 group relative">
                  <div className="w-full bg-slate-100 rounded-t-lg relative overflow-hidden transition-all hover:bg-blue-50" style={{ height: '100%' }}>
                    <div 
                      className="absolute bottom-0 left-0 right-0 bg-blue-500 rounded-t-lg transition-all duration-500 group-hover:bg-blue-600"
                      style={{ height: `${heightPercent}%` }}
                    ></div>
                  </div>
                  {/* Tooltip */}
                  <div className="absolute bottom-full mb-2 opacity-0 group-hover:opacity-100 transition-opacity bg-slate-800 text-white text-xs py-1 px-2 rounded pointer-events-none whitespace-nowrap z-10">
                    {day.count} msgs
                  </div>
                  <span className="text-xs text-slate-400 font-medium truncate w-full text-center">{day.label}</span>
                </div>
              );
            }) : <div className="w-full text-center text-slate-400 py-10">No hay actividad reciente</div>}
          </div>
        </div>

        {/* Tablas Inferiores */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          
          {/* Top Agentes */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
            <h3 className="font-bold text-slate-700 mb-4 flex items-center gap-2">
              <UserCheck size={18} className="text-slate-400"/> Productividad Agentes
            </h3>
            <div className="space-y-3">
              {agents.length > 0 ? agents.map((agent: any, i: number) => (
                <div key={i} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-50 hover:border-slate-100 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-bold text-xs">
                      {agent.name ? agent.name.charAt(0).toUpperCase() : '?'}
                    </div>
                    <span className="font-bold text-sm text-slate-700">{agent.name || "Desconocido"}</span>
                  </div>
                  <div className="flex gap-4 text-right">
                    <div title="Mensajes Enviados">
                        <div className="flex items-center justify-end gap-1 text-[10px] text-slate-400 uppercase font-bold">Msgs</div>
                        <span className="font-mono font-bold text-slate-600 text-sm">{agent.msgCount}</span>
                    </div>
                    <div title="Chats Únicos">
                        <div className="flex items-center justify-end gap-1 text-[10px] text-slate-400 uppercase font-bold">Chats</div>
                        <span className="font-mono font-bold text-blue-600 text-sm">{agent.chatCount}</span>
                    </div>
                  </div>
                </div>
              )) : <p className="text-sm text-slate-400 italic py-4 text-center">No hay datos de actividad reciente.</p>}
            </div>
          </div>

          {/* Distribución Estados */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
             <h3 className="font-bold text-slate-700 mb-4">Estado de los Chats</h3>
             <div className="space-y-4">
                {statuses.length > 0 ? statuses.map((st: any, i: number) => (
                  <div key={i}>
                    <div className="flex justify-between text-xs font-bold text-slate-500 mb-1.5">
                      <span>{st.name}</span>
                      <span className="bg-slate-100 px-2 py-0.5 rounded text-slate-600">{st.count}</span>
                    </div>
                    <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                      <div 
                        className={`h-full rounded-full transition-all duration-1000 ${st.name === 'Nuevo' ? 'bg-green-500' : st.name === 'Abierto' ? 'bg-blue-500' : 'bg-slate-400'}`} 
                        style={{ width: `${(st.count / (kpis.totalContacts || 1)) * 100}%` }}
                      ></div>
                    </div>
                  </div>
                )) : <p className="text-sm text-slate-400 italic py-4 text-center">No hay estados registrados.</p>}
             </div>
          </div>

        </div>
      </div>
    </div>
  );
};

export default AnalyticsDashboard;