import React, { useState, useEffect } from 'react';
import { 
  BarChart3, 
  Users, 
  MessageSquare, 
  TrendingUp, 
  UserCheck, 
  Calendar,
  AlertCircle,
  Loader2,
  ServerCrash
} from 'lucide-react';

const AnalyticsDashboard = () => {
  const isProduction = window.location.hostname.includes('render.com');
  const API_URL = isProduction ? 'https://chatgorithm.onrender.com/api' : 'http://localhost:3000/api';

  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [missingData, setMissingData] = useState(false);

  useEffect(() => {
    fetch(`${API_URL}/analytics`)
      .then(async res => {
          const json = await res.json();
          if (!res.ok) throw new Error(json.error || "Error al cargar datos");
          return json;
      })
      .then(d => {
        // Verificamos si el servidor envió los KPIs o está vacío
        if (!d || !d.kpis) {
            setMissingData(true);
        } else {
            setData(d);
        }
        setLoading(false);
      })
      .catch(err => {
        console.error("Error fetching analytics:", err);
        setError(err.message);
        setLoading(false);
      });
  }, []);

  // --- Renderizado de Estados ---

  if (loading) {
    return (
        <div className="w-full h-64 flex flex-col items-center justify-center text-slate-400 gap-2">
            <Loader2 className="animate-spin" size={32} />
            <p className="text-sm font-medium">Calculando métricas...</p>
        </div>
    );
  }

  if (error) {
    return (
        <div className="w-full p-8 flex flex-col items-center justify-center text-center bg-red-50 rounded-2xl border border-red-100">
            <AlertCircle className="text-red-400 mb-3" size={48} />
            <h3 className="text-lg font-bold text-slate-700">Error de conexión</h3>
            <p className="text-sm text-slate-500 mt-1 max-w-md">{error}</p>
            <button onClick={() => window.location.reload()} className="mt-4 px-4 py-2 bg-white border border-slate-200 text-slate-600 rounded-lg text-sm font-bold hover:bg-slate-50 transition">Reintentar</button>
        </div>
    );
  }

  // AVISO ESPECÍFICO: El servidor responde pero sin datos (Ruta vacía)
  if (missingData) {
      return (
        <div className="w-full p-8 flex flex-col items-center justify-center text-center bg-yellow-50 rounded-2xl border border-yellow-100">
            <ServerCrash className="text-yellow-500 mb-3" size={48} />
            <h3 className="text-lg font-bold text-slate-700">Falta Lógica en el Servidor</h3>
            <p className="text-sm text-slate-600 mt-2 max-w-md">
                La ruta <code>/api/analytics</code> existe pero devuelve datos vacíos. 
                <br/>Probablemente copiaste una versión resumida del archivo <code>index.ts</code>.
            </p>
            <p className="text-xs text-slate-400 mt-4">Copia y pega el bloque de código de Analíticas en tu servidor.</p>
        </div>
      );
  }

  // --- Preparación de Datos Seguros ---
  const safeData = data || {};
  const kpis = safeData.kpis || { totalMessages: 0, totalContacts: 0, newLeads: 0 };
  const activity = safeData.activity || [];
  const agents = safeData.agents || [];
  const statuses = safeData.statuses || [];

  // Escalar gráfica
  const maxActivity = Math.max(...(activity.map((d:any) => d.count) || [0]), 1);

  return (
    <div className="max-w-6xl mx-auto space-y-8 pb-10">
        
        {/* Header */}
        <div className="border-b border-slate-200 pb-4">
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <BarChart3 className="text-indigo-600" /> Dashboard de Rendimiento
          </h1>
          <p className="text-slate-500 mt-1">Resumen de actividad de los últimos 7 días.</p>
        </div>

        {/* KPIs Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-4">
            <div className="p-3 bg-blue-50 text-blue-600 rounded-xl"><MessageSquare size={24} /></div>
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total Mensajes</p>
              <h3 className="text-3xl font-bold text-slate-800">{kpis.totalMessages}</h3>
            </div>
          </div>

          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-4">
            <div className="p-3 bg-purple-50 text-purple-600 rounded-xl"><Users size={24} /></div>
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Contactos Totales</p>
              <h3 className="text-3xl font-bold text-slate-800">{kpis.totalContacts}</h3>
            </div>
          </div>

          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-4">
            <div className="p-3 bg-green-50 text-green-600 rounded-xl"><TrendingUp size={24} /></div>
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Nuevos Leads</p>
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
                <div key={i} className="flex-1 flex flex-col items-center gap-2 group relative h-full justify-end">
                  <div className="w-full bg-slate-100 rounded-t-lg relative overflow-hidden transition-all hover:bg-indigo-50 flex-1 flex items-end">
                    <div 
                      className="w-full bg-indigo-500 rounded-t-lg transition-all duration-500 group-hover:bg-indigo-600 relative"
                      style={{ height: `${heightPercent || 1}%` }}
                    ></div>
                  </div>
                  {/* Tooltip */}
                  <div className="absolute bottom-full mb-1 opacity-0 group-hover:opacity-100 transition-opacity bg-slate-800 text-white text-[10px] py-1 px-2 rounded pointer-events-none whitespace-nowrap z-10 font-bold">
                    {day.count} msgs
                  </div>
                  <span className="text-[10px] text-slate-400 font-bold uppercase truncate w-full text-center">{day.label}</span>
                </div>
              );
            }) : <div className="w-full h-full flex items-center justify-center text-slate-400 italic">No hay actividad reciente</div>}
          </div>
        </div>

        {/* Tablas Inferiores */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          
          {/* Top Agentes */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm h-fit">
            <h3 className="font-bold text-slate-700 mb-4 flex items-center gap-2">
              <UserCheck size={18} className="text-slate-400"/> Productividad Agentes
            </h3>
            <div className="space-y-3">
              {agents.length > 0 ? agents.map((agent: any, i: number) => (
                <div key={i} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100 hover:border-indigo-100 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center font-bold text-xs">
                      {agent.name ? agent.name.charAt(0).toUpperCase() : '?'}
                    </div>
                    <span className="font-bold text-sm text-slate-700">{agent.name || "Desconocido"}</span>
                  </div>
                  <div className="flex gap-4 text-right">
                    <div title="Mensajes Enviados">
                        <div className="text-[9px] text-slate-400 uppercase font-bold text-right">Msgs</div>
                        <span className="font-mono font-bold text-slate-600 text-sm block text-right">{agent.msgCount}</span>
                    </div>
                    <div title="Chats Únicos">
                        <div className="text-[9px] text-slate-400 uppercase font-bold text-right">Chats</div>
                        <span className="font-mono font-bold text-indigo-600 text-sm block text-right">{agent.chatCount}</span>
                    </div>
                  </div>
                </div>
              )) : <p className="text-sm text-slate-400 italic py-4 text-center">No hay datos de actividad reciente.</p>}
            </div>
          </div>

          {/* Distribución Estados */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm h-fit">
             <h3 className="font-bold text-slate-700 mb-4">Estado de los Chats</h3>
             <div className="space-y-4">
                {statuses.length > 0 ? statuses.map((st: any, i: number) => (
                  <div key={i}>
                    <div className="flex justify-between text-xs font-bold text-slate-500 mb-1.5">
                      <span>{st.name}</span>
                      <span className="bg-slate-100 px-2 py-0.5 rounded text-slate-600 font-mono">{st.count}</span>
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
  );
};

export default AnalyticsDashboard;