import React, { useState, useEffect } from 'react';
import { 
  BarChart3, 
  Users, 
  MessageSquare, 
  TrendingUp, 
  UserCheck, 
  Calendar 
} from 'lucide-react';

const AnalyticsDashboard = () => {
  const isProduction = window.location.hostname.includes('render.com');
  const API_URL = isProduction ? 'https://chatgorithm.onrender.com/api' : 'http://localhost:3000/api';

  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API_URL}/analytics`)
      .then(res => res.json())
      .then(d => {
        setData(d);
        setLoading(false);
      })
      .catch(err => {
        console.error("Error fetching analytics", err);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return <div className="h-full flex items-center justify-center text-slate-400">Cargando datos...</div>;
  }

  if (!data) return <div className="p-10 text-center text-red-400">No se pudieron cargar los datos.</div>;

  // Encontrar el valor máximo para escalar la gráfica
  const maxActivity = Math.max(...data.activity.map((d:any) => d.count), 1);

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
              <h3 className="text-3xl font-bold text-slate-800">{data.kpis.totalMessages}</h3>
            </div>
          </div>

          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-4">
            <div className="p-3 bg-purple-50 text-purple-600 rounded-xl"><Users size={24} /></div>
            <div>
              <p className="text-sm text-slate-400 font-bold uppercase tracking-wider">Contactos Totales</p>
              <h3 className="text-3xl font-bold text-slate-800">{data.kpis.totalContacts}</h3>
            </div>
          </div>

          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-4">
            <div className="p-3 bg-green-50 text-green-600 rounded-xl"><TrendingUp size={24} /></div>
            <div>
              <p className="text-sm text-slate-400 font-bold uppercase tracking-wider">Nuevos Leads</p>
              <h3 className="text-3xl font-bold text-slate-800">{data.kpis.newLeads}</h3>
            </div>
          </div>
        </div>

        {/* Gráfico de Barras CSS (Actividad Semanal) */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <h3 className="font-bold text-slate-700 mb-6 flex items-center gap-2">
            <Calendar size={18} className="text-slate-400"/> Mensajes (Últimos 7 días)
          </h3>
          
          <div className="h-48 flex items-end justify-between gap-2">
            {data.activity.map((day: any, i: number) => {
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
                  <div className="absolute bottom-full mb-2 opacity-0 group-hover:opacity-100 transition-opacity bg-slate-800 text-white text-xs py-1 px-2 rounded pointer-events-none">
                    {day.count} msgs
                  </div>
                  <span className="text-xs text-slate-400 font-medium">{day.label}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Tablas Inferiores */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          
          {/* Top Agentes */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
            <h3 className="font-bold text-slate-700 mb-4 flex items-center gap-2">
              <UserCheck size={18} className="text-slate-400"/> Top Agentes (Chats Asignados)
            </h3>
            <div className="space-y-3">
              {data.agents.length > 0 ? data.agents.map((agent: any, i: number) => (
                <div key={i} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-bold text-xs">
                      {agent.name.charAt(0)}
                    </div>
                    <span className="font-bold text-sm text-slate-700">{agent.name}</span>
                  </div>
                  <span className="font-mono font-bold text-slate-500">{agent.count}</span>
                </div>
              )) : <p className="text-sm text-slate-400 italic">No hay datos suficientes.</p>}
            </div>
          </div>

          {/* Distribución Estados */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
             <h3 className="font-bold text-slate-700 mb-4">Estado de los Chats</h3>
             <div className="space-y-3">
                {data.statuses.map((st: any, i: number) => (
                  <div key={i}>
                    <div className="flex justify-between text-xs font-bold text-slate-500 mb-1">
                      <span>{st.name}</span>
                      <span>{st.count}</span>
                    </div>
                    <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                      <div 
                        className={`h-full rounded-full ${st.name === 'Nuevo' ? 'bg-green-500' : st.name === 'Abierto' ? 'bg-blue-500' : 'bg-slate-400'}`} 
                        style={{ width: `${(st.count / data.kpis.totalContacts) * 100}%` }}
                      ></div>
                    </div>
                  </div>
                ))}
             </div>
          </div>

        </div>
      </div>
    </div>
  );
};

export default AnalyticsDashboard;