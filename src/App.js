import { useState, useEffect } from "react";
import { supabase } from "./supabase";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, AreaChart, Area
} from "recharts";
import { MapContainer, TileLayer, CircleMarker, Popup, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "./App.css";

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

const BAIRROS = [
  "Aparecida","Boqueirão","Campo Grande","Caneleira","Centro",
  "Chico de Paula","Encruzilhada","Estuário","Gonzaga","José Menino",
  "Macuco","Marapé","Morro de Nova Cintra","Paquetá","Pompéia",
  "Ponta da Praia","Rádio Clube","Saboó","Santa Maria","Santana",
  "Santo Antônio","São Jorge","Valongo","Vila Belmiro","Vila Mathias"
];

const STATUS = {
  critico:{label:"Crítico",   emoji:"🔴",cor:"#C0392B",bg:"#FDEDEC",texto:"#922B21",dias:0, cresc:0.5},
  alta:   {label:"Alta",      emoji:"🟠",cor:"#E67E22",bg:"#FEF0E3",texto:"#A04000",dias:3, cresc:0.4},
  media:  {label:"Média",     emoji:"🟡",cor:"#D4AC0D",bg:"#FEF9E7",texto:"#7D6608",dias:10,cresc:0.3},
  baixa:  {label:"Curta",     emoji:"🟢",cor:"#27AE60",bg:"#E9F7EF",texto:"#1E8449",dias:21,cresc:0.25},
  cortada:{label:"Recém cortada",emoji:"✂️",cor:"#2471A3",bg:"#EAF2FB",texto:"#1A5276",dias:30,cresc:0.2},
};

async function geocodificar(endereco, bairro) {
  try {
    const query = encodeURIComponent(`${endereco}, ${bairro}, Santos, SP, Brasil`);
    const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${query}&limit=1`);
    const data = await res.json();
    if (data && data.length > 0) return [parseFloat(data[0].lat), parseFloat(data[0].lon)];
  } catch(e) { console.error("Geocoding error:", e); }
  return null;
}

function statusEfetivo(r) {
  if (r.status === "cortada") {
    const dias = Math.floor((new Date() - new Date(r.criado_em || r.data)) / 86400000);
    if (dias >= 2) return "baixa";
  }
  return r.status;
}

function calcNotif(registros) {
  const hoje = new Date();
  return registros.map(r => {
    const status = statusEfetivo(r);
    const corte = new Date(r.data); corte.setDate(corte.getDate() + (r.dias_corte || 0));
    const diff = Math.ceil((corte - hoje) / 86400000);
    const diasCad = Math.ceil((hoje - new Date(r.criado_em || r.data)) / 86400000);
    let tipo="ok", titulo="🌿 Tranquila", prio=6;
    if (status === "critico")             { tipo="critico";  titulo="🔴 Crítico!";      prio=1; }
    else if (diff<=0 && status==="alta")  { tipo="atrasado"; titulo="🟠 Atrasado!";     prio=2; }
    else if (diff<=3 && status==="alta")  { tipo="urgente";  titulo="⚠️ Urgente";       prio=3; }
    else if (diff<=5 && status==="media") { tipo="atencao";  titulo="📋 Atenção";       prio=4; }
    else if (diasCad<=2)                  { tipo="novo";     titulo="✅ Novo registro"; prio=5; }
    return {tipo,titulo,msg:`${r.local} (${r.bairro})`,registro:r,prioridade:prio,diff};
  }).sort((a,b) => a.prioridade - b.prioridade);
}

function Toast({ msg, tipo, onClose }) {
  useEffect(() => { const t = setTimeout(onClose, 3500); return () => clearTimeout(t); }, [onClose]);
  const icones = {sucesso:"✅", erro:"❌", info:"ℹ️", aviso:"⚠️"};
  return (
    <div className={`toast toast-${tipo}`}>
      <span style={{fontSize:20}}>{icones[tipo] || "ℹ️"}</span>
      <p>{msg}</p>
      <button className="toast-close" onClick={onClose}>×</button>
    </div>
  );
}

function MapClicker({ onMark }) {
  useMapEvents({ click(e) { onMark(e.latlng.lat, e.latlng.lng); } });
  return null;
}

export default function App() {
  const [tela, setTela] = useState("dashboard");
  const [registros, setRegistros] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [tema, setTema] = useState("claro");
  const [menuPerfil, setMenuPerfil] = useState(false);
  const [notifAberta, setNotifAberta] = useState(false);
  const [filtroGramas, setFiltroGramas] = useState({});
  const [localFoco, setLocalFoco] = useState(null);
  const [toast, setToast] = useState(null);

  const showToast = (msg, tipo="sucesso") => setToast({msg, tipo});

  const buscar = async () => {
    setCarregando(true);
    const { data, error } = await supabase.from("vistorias").select("*").order("criado_em", {ascending:false});
    if (!error && data) setRegistros(data);
    setCarregando(false);
  };

  useEffect(() => { buscar(); }, []);
  useEffect(() => { document.body.className = tema==="escuro" ? "tema-escuro" : ""; }, [tema]);

  const salvar = async (form) => {
    let lat = form.latitude || null;
    let lng = form.longitude || null;
    if (!lat && form.local && form.bairro) {
      const coords = await geocodificar(form.local, form.bairro);
      if (coords) { lat = coords[0]; lng = coords[1]; }
    }
    const { error } = await supabase.from("vistorias").insert([{
      local: form.local, bairro: form.bairro,
      metragem: form.metragem ? Number(form.metragem) : null,
      data: form.data, status: form.status, altura: form.altura,
      dias_corte: form.diasCorte ? Number(form.diasCorte) : null,
      obs: form.obs, foto: form.foto || null,
      latitude: lat, longitude: lng,
    }]);
    if (!error) { await buscar(); showToast("Vistoria registrada com sucesso!"); }
    else showToast("Erro ao salvar vistoria", "erro");
    return !error;
  };

  const registrarCorte = async (registro) => {
    const { error } = await supabase.from("vistorias").insert([{
      local: registro.local, bairro: registro.bairro, metragem: registro.metragem,
      data: new Date().toISOString().split("T")[0],
      status: "cortada", altura: "0 cm", dias_corte: 21,
      obs: `Corte registrado. Estado anterior: ${STATUS[registro.status]?.label}`,
      foto: null, latitude: registro.latitude, longitude: registro.longitude,
    }]);
    if (!error) { await buscar(); showToast("Corte registrado! Em 2 dias mudará para 'Grama curta'"); }
    return !error;
  };

  const irParaLocal = (registro) => { setLocalFoco(registro); setTela("gramas"); };
  const notificacoes = calcNotif(registros);
  const naoLidas = notificacoes.filter(n => ["critico","atrasado","urgente"].includes(n.tipo)).length;
  const irGramas = (f={}) => { setFiltroGramas(f); setLocalFoco(null); setTela("gramas"); };

  return (
    <div className={`app ${tema}`}>
      {toast && <Toast msg={toast.msg} tipo={toast.tipo} onClose={()=>setToast(null)} />}

      <aside className="sidebar">
        <div className="sb-logo" onClick={()=>setTela("dashboard")}>
          <div className="sb-logo-icon">🌿</div>
          <div><h2>GramaSP</h2><p>Jardins de Santos</p></div>
        </div>
        <nav>
          {[
            {id:"dashboard",icon:"📊",label:"Dashboard"},
            {id:"mapa",icon:"🗺️",label:"Mapa"},
            {id:"gramas",icon:"🌱",label:"Gramas"},
            {id:"vistoria",icon:"📷",label:"Nova Vistoria"},
            {id:"historico",icon:"📋",label:"Histórico"},
            {id:"notificacoes",icon:"🔔",label:"Notificações",badge:naoLidas},
          ].map(item => (
            <button key={item.id}
              className={`nav-item ${tela===item.id?"active":""}`}
              onClick={()=>{setTela(item.id);setNotifAberta(false);setMenuPerfil(false);}}>
              <span className="nav-icon">{item.icon}</span>
              <span>{item.label}</span>
              {item.badge>0 && <span className="nav-badge">{item.badge}</span>}
            </button>
          ))}
        </nav>
        <div className="sb-perfil-wrap">
          {menuPerfil && (
            <div className="sb-perfil-menu">
              <button className="sb-perfil-item" onClick={()=>{setTela("configuracoes");setMenuPerfil(false);}}>⚙️ Configurações</button>
              <button className="sb-perfil-item" onClick={()=>{setTema(tema==="claro"?"escuro":"claro");setMenuPerfil(false);}}>
                {tema==="claro"?"🌙 Tema escuro":"☀️ Tema claro"}
              </button>
              <div className="sb-perfil-divider"/>
              <button className="sb-perfil-item perigo">🚪 Sair</button>
            </div>
          )}
          <button className="sb-perfil-btn" onClick={()=>{setMenuPerfil(!menuPerfil);setNotifAberta(false);}}>
            <div className="sb-perfil-avatar">V</div>
            <div className="sb-perfil-info">
              <span className="sb-perfil-nome">Victor</span>
              <span className="sb-perfil-cargo">Agente de campo</span>
            </div>
            <span className="sb-perfil-arrow">⋯</span>
          </button>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div className="topbar-left">
            <h1 className="topbar-title">
              {tela==="dashboard"&&"Dashboard Geral"}
              {tela==="mapa"&&"Mapa de Santos"}
              {tela==="gramas"&&"Gramas"}
              {tela==="vistoria"&&"Nova Vistoria"}
              {tela==="historico"&&"Histórico"}
              {tela==="notificacoes"&&"Notificações"}
              {tela==="configuracoes"&&"Configurações"}
            </h1>
            {tela==="dashboard"&&<span className="topbar-sub">Acompanhe a saúde dos gramados por bairro</span>}
          </div>
          <div className="topbar-right">
            {carregando && <span className="sync-badge">🔄 Sincronizando...</span>}
            <button className="notif-sino" onClick={()=>{setNotifAberta(!notifAberta);setMenuPerfil(false);}}>
              🔔{naoLidas>0 && <span className="notif-badge">{naoLidas}</span>}
            </button>
            {notifAberta && (
              <div className="notif-dropdown">
                <div className="notif-dropdown-header"><strong>Notificações</strong><span>{notificacoes.length}</span></div>
                {notificacoes.slice(0,5).map((n,i)=>(
                  <div key={i} className={`notif-item notif-${n.tipo} clicavel`}
                    onClick={()=>{irParaLocal(n.registro);setNotifAberta(false);}}>
                    <p className="notif-titulo">{n.titulo}</p>
                    <p className="notif-msg">{n.msg}</p>
                  </div>
                ))}
                <button className="notif-ver-todas" onClick={()=>{setTela("notificacoes");setNotifAberta(false);}}>Ver todas →</button>
              </div>
            )}
            {tela!=="vistoria" && <button className="btn-new" onClick={()=>setTela("vistoria")}>+ Nova Vistoria</button>}
          </div>
        </header>

        <div className="content">
          {tela==="dashboard"     && <Dashboard registros={registros} irGramas={irGramas} notificacoes={notificacoes} tema={tema} irParaLocal={irParaLocal}/>}
          {tela==="mapa"          && <Mapa registros={registros} irParaLocal={irParaLocal}/>}
          {tela==="gramas"        && <Gramas registros={registros} filtroInicial={filtroGramas} localFoco={localFoco} setLocalFoco={setLocalFoco} registrarCorte={registrarCorte}/>}
          {tela==="vistoria"      && <Vistoria salvar={salvar} voltar={()=>setTela("dashboard")} showToast={showToast}/>}
          {tela==="historico"     && <Historico registros={registros} irParaLocal={irParaLocal}/>}
          {tela==="notificacoes"  && <Notificacoes notificacoes={notificacoes} irParaLocal={irParaLocal}/>}
          {tela==="configuracoes" && <Configuracoes tema={tema} setTema={setTema}/>}
        </div>
      </main>
    </div>
  );
}

// ========================================================================
// DASHBOARD
// ========================================================================
function Dashboard({ registros, irGramas, notificacoes, tema, irParaLocal }) {
  const [filtroBairro, setFiltroBairro] = useState("");
  const [verMais, setVerMais] = useState(false);

  const regs = registros.map(r => ({...r, statusReal: statusEfetivo(r)}));
  const counts = {
    total:   regs.length,
    critico: regs.filter(r=>r.statusReal==="critico").length,
    alta:    regs.filter(r=>r.statusReal==="alta").length,
    media:   regs.filter(r=>r.statusReal==="media").length,
    baixa:   regs.filter(r=>r.statusReal==="baixa").length,
    cortada: regs.filter(r=>r.statusReal==="cortada").length,
  };
  const urgentes = notificacoes.filter(n=>["critico","atrasado"].includes(n.tipo));

  const bairrosMap = {};
  regs.forEach(r => {
    if (!bairrosMap[r.bairro]) bairrosMap[r.bairro] = {bairro:r.bairro,critico:0,alta:0,media:0,baixa:0,cortada:0};
    bairrosMap[r.bairro][r.statusReal] = (bairrosMap[r.bairro][r.statusReal]||0)+1;
  });
  const barData = Object.values(bairrosMap)
    .filter(d => !filtroBairro || d.bairro===filtroBairro)
    .sort((a,b) => (b.critico+b.alta)-(a.critico+a.alta));

  const roscaData = Object.entries(
    regs.reduce((acc,r) => { acc[r.statusReal]=(acc[r.statusReal]||0)+1; return acc; }, {})
  ).map(([k,v]) => ({name:STATUS[k]?.label||k, value:v, cor:STATUS[k]?.cor||"#999"}));

  const hoje = new Date();
  const areaData = Array.from({length:30},(_,i)=>{
    const d = new Date(hoje); d.setDate(d.getDate()-(29-i));
    const key = d.toISOString().split("T")[0];
    const dRegs = regs.filter(r=>(r.criado_em||r.data||"").startsWith(key));
    return {
      dia: d.toLocaleDateString("pt-BR",{day:"2-digit",month:"2-digit"}),
      vistorias: dRegs.length,
      cortes: dRegs.filter(r=>r.status==="cortada").length,
    };
  });

  const listaLocais = regs.filter(r=>!filtroBairro||r.bairro===filtroBairro).slice(0,verMais?999:6);
  const isDark = tema==="escuro";
  const cardBg = isDark?"#242424":"#fff";
  const txt    = isDark?"#f0f0f0":"#1a1a1a";
  const grid   = isDark?"#3a3a3a":"#f0f0f0";
  const tip    = {background:cardBg,border:`1px solid ${grid}`,borderRadius:10,color:txt,fontSize:12,boxShadow:"0 4px 12px rgba(0,0,0,0.12)"};

  return (
    <div className="dashboard">
      {urgentes.length>0 && (
        <div className="alerta-banner">
          🚨 <strong>{urgentes.length} local(is) urgente(s)</strong> — {urgentes.slice(0,2).map(n=>n.msg).join(", ")}
          {urgentes.length>2 && ` e mais ${urgentes.length-2}`}
        </div>
      )}

      <div className="dash-periodo">
        <span>📊 Resumo operacional</span>
        <span style={{color:"#888"}}>· {new Date().toLocaleDateString("pt-BR",{month:"long",year:"numeric"})}</span>
      </div>

      <div className="stats-grid">
        {[
          {key:"total",  label:"Total de Locais",  num:counts.total,   icone:"🗂️",cor:"#27500A",filtro:{}},
          {key:"critico",label:"Urgentes",          num:counts.critico, icone:"🔴",cor:"#C0392B",filtro:{status:"critico"}},
          {key:"alta",   label:"Grama Alta",        num:counts.alta,    icone:"🟠",cor:"#E67E22",filtro:{status:"alta"}},
          {key:"media",  label:"Grama Média",       num:counts.media,   icone:"🟡",cor:"#D4AC0D",filtro:{status:"media"}},
          {key:"baixa",  label:"Grama Curta",       num:counts.baixa,   icone:"🟢",cor:"#27AE60",filtro:{status:"baixa"}},
          {key:"cortada",label:"Recém Cortadas",    num:counts.cortada, icone:"✂️",cor:"#2471A3",filtro:{status:"cortada"}},
        ].map(c => (
          <div key={c.key} className="stat-card" style={{borderTop:`3px solid ${c.cor}`}} onClick={()=>irGramas(c.filtro)}>
            <div className="stat-header">
              <span className="stat-label">{c.label}</span>
              <div className="stat-icone" style={{background:`${c.cor}20`,color:c.cor}}>{c.icone}</div>
            </div>
            <span className="stat-num" style={{color:c.cor}}>{c.num}</span>
            <span className="stat-link">Ver detalhes →</span>
          </div>
        ))}
      </div>

      <div className="dash-filtro">
        <span>🔍 Filtrar por bairro:</span>
        <select value={filtroBairro} onChange={e=>setFiltroBairro(e.target.value)}>
          <option value="">Todos os bairros</option>
          {[...new Set(regs.map(r=>r.bairro))].map(b=><option key={b}>{b}</option>)}
        </select>
      </div>

      {regs.length>0 && (
        <>
          {/* Barras — largura inteira */}
          <div className="card chart-card">
            <div className="chart-header">
              <h3 className="card-title" style={{marginBottom:0}}>Situação por bairro</h3>
              <span className="chart-subtitle">Distribuição de status por local cadastrado</span>
            </div>
            <ResponsiveContainer width="100%" height={340}>
              <BarChart data={barData} margin={{top:5,right:10,left:-15,bottom:60}}>
                <CartesianGrid strokeDasharray="3 3" stroke={grid} vertical={false}/>
                <XAxis dataKey="bairro" tick={{fontSize:10,fill:isDark?"#aaa":"#555"}} angle={-40} textAnchor="end"/>
                <YAxis tick={{fontSize:11,fill:isDark?"#aaa":"#555"}} allowDecimals={false}/>
                <Tooltip contentStyle={tip} cursor={{fill:"rgba(0,0,0,0.04)"}}/>
                <Bar dataKey="critico" name="Crítico" stackId="a" fill="#C0392B"/>
                <Bar dataKey="alta"    name="Alta"    stackId="a" fill="#E67E22"/>
                <Bar dataKey="media"   name="Média"   stackId="a" fill="#D4AC0D"/>
                <Bar dataKey="baixa"   name="Curta"   stackId="a" fill="#27AE60"/>
                <Bar dataKey="cortada" name="Cortada" stackId="a" fill="#2471A3" radius={[6,6,0,0]}/>
              </BarChart>
            </ResponsiveContainer>
            <div className="chart-legenda">
              {[["#C0392B","Crítico"],["#E67E22","Alta"],["#D4AC0D","Média"],["#27AE60","Curta"],["#2471A3","Cortada"]].map(([c,l])=>(
                <div key={l} className="legenda-item"><div className="legenda-bola" style={{background:c}}/><span>{l}</span></div>
              ))}
            </div>
          </div>

          {/* Grid 2: Rosca + Área */}
          <div className="grid2">
            <div className="card chart-card">
              <div className="chart-header">
                <h3 className="card-title" style={{marginBottom:0}}>Distribuição geral</h3>
                <span className="chart-subtitle">Por status atual</span>
              </div>
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie data={roscaData} cx="50%" cy="50%" innerRadius={68} outerRadius={108}
                    dataKey="value" nameKey="name" paddingAngle={3} labelLine={false}>
                    {roscaData.map((e,i)=><Cell key={i} fill={e.cor} stroke={cardBg} strokeWidth={2}/>)}
                  </Pie>
                  <Tooltip contentStyle={tip}/>
                </PieChart>
              </ResponsiveContainer>
              <div className="chart-legenda">
                {roscaData.map((d,i)=>(
                  <div key={i} className="legenda-item"><div className="legenda-bola" style={{background:d.cor}}/><span>{d.name} ({d.value})</span></div>
                ))}
              </div>
            </div>

            <div className="card chart-card">
              <div className="chart-header">
                <h3 className="card-title" style={{marginBottom:0}}>Evolução de vistorias</h3>
                <span className="chart-subtitle">Últimos 30 dias</span>
              </div>
              <ResponsiveContainer width="100%" height={260}>
                <AreaChart data={areaData} margin={{top:5,right:10,left:-15,bottom:0}}>
                  <defs>
                    <linearGradient id="gradVist" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#27500A" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#27500A" stopOpacity={0.02}/>
                    </linearGradient>
                    <linearGradient id="gradCort" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#2471A3" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#2471A3" stopOpacity={0.02}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={grid} vertical={false}/>
                  <XAxis dataKey="dia" tick={{fontSize:10,fill:isDark?"#aaa":"#555"}} interval={6}/>
                  <YAxis tick={{fontSize:11,fill:isDark?"#aaa":"#555"}} allowDecimals={false}/>
                  <Tooltip contentStyle={tip}/>
                  <Area type="monotone" dataKey="vistorias" name="Vistorias" stroke="#27500A" strokeWidth={2} fill="url(#gradVist)" dot={false} activeDot={{r:4}}/>
                  <Area type="monotone" dataKey="cortes"    name="Cortes"    stroke="#2471A3" strokeWidth={2} fill="url(#gradCort)" dot={false} activeDot={{r:4}}/>
                </AreaChart>
              </ResponsiveContainer>
              <div className="chart-legenda">
                {[["#27500A","Vistorias"],["#2471A3","Cortes"]].map(([c,l])=>(
                  <div key={l} className="legenda-item"><div className="legenda-bola" style={{background:c}}/><span>{l}</span></div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}

      <div className="card">
        <div className="card-header">
          <h3 className="card-title">Locais cadastrados</h3>
          <span style={{fontSize:12,color:"#888"}}>{listaLocais.length} de {regs.length}</span>
        </div>
        {regs.length===0 ? <p className="vazio">Nenhuma vistoria ainda.</p> : <>
          <ListaVistorias registros={listaLocais} onClick={r=>irParaLocal(r)}/>
          {regs.length>6 && (
            <button className="btn-ver-mais" onClick={()=>setVerMais(!verMais)}>
              {verMais?"Ver menos ▲":`Ver mais (${regs.length-6} restantes) ▼`}
            </button>
          )}
        </>}
      </div>
    </div>
  );
}

// ========================================================================
// MAPA
// ========================================================================
function Mapa({ registros, irParaLocal }) {
  const [tipo, setTipo] = useState("locais");

  const COORDS_BAIRROS = {
    "Aparecida":[-23.9612,-46.3267],"Boqueirão":[-23.9498,-46.3198],
    "Campo Grande":[-23.9834,-46.3201],"Caneleira":[-23.9701,-46.3401],
    "Centro":[-23.9337,-46.3239],"Encruzilhada":[-23.9423,-46.3312],
    "Estuário":[-23.9601,-46.3089],"Gonzaga":[-23.9790,-46.3312],
    "José Menino":[-23.9901,-46.3289],"Macuco":[-23.9489,-46.3123],
    "Marapé":[-23.9678,-46.3234],"Paquetá":[-23.9756,-46.3089],
    "Pompéia":[-23.9623,-46.3389],"Ponta da Praia":[-23.9934,-46.2967],
    "Vila Belmiro":[-23.9734,-46.3267],"Vila Mathias":[-23.9423,-46.3201],
    "Saboó":[-23.9512,-46.3178],"Valongo":[-23.9301,-46.3178],
    "Santa Maria":[-23.9389,-46.3289],"Santana":[-23.9545,-46.3234],
    "Santo Antônio":[-23.9478,-46.3301],"São Jorge":[-23.9667,-46.3156],
    "Chico de Paula":[-23.9550,-46.3050],"Rádio Clube":[-23.9467,-46.3045],
    "Morro de Nova Cintra":[-23.9345,-46.3156],
  };

  const porBairro = {};
  registros.forEach(r => {
    const status = statusEfetivo(r);
    if (!porBairro[r.bairro]) porBairro[r.bairro]={critico:0,alta:0,media:0,baixa:0,cortada:0,total:0};
    porBairro[r.bairro][status]=(porBairro[r.bairro][status]||0)+1;
    porBairro[r.bairro].total++;
  });

  const corBairro = v => {
    if (v.critico>0) return "#C0392B";
    if (v.alta>0)    return "#E67E22";
    if (v.media>0)   return "#D4AC0D";
    if (v.baixa>0)   return "#27AE60";
    return "#2471A3";
  };

  const registrosNoMapa = registros.filter(r=>r.latitude&&r.longitude);

  return (
    <div className="mapa-container">
      <div className="card mapa-controles">
        <div className="mapa-tabs">
          <button className={`mapa-tab ${tipo==="locais"?"ativo":""}`} onClick={()=>setTipo("locais")}>
            📍 Por local ({registrosNoMapa.length})
          </button>
          <button className={`mapa-tab ${tipo==="bairros"?"ativo":""}`} onClick={()=>setTipo("bairros")}>
            🗺️ Por bairro ({Object.keys(porBairro).length})
          </button>
        </div>
        <div className="mapa-legenda">
          {[["#C0392B","Crítico"],["#E67E22","Alta"],["#D4AC0D","Média"],["#27AE60","Curta"],["#2471A3","Cortada"]].map(([c,l])=>(
            <div key={l} className="legenda-item"><div className="legenda-bola" style={{background:c}}/><span>{l}</span></div>
          ))}
        </div>
      </div>

      <div className="mapa-wrapper">
        <MapContainer center={[-23.9608,-46.3336]} zoom={13} style={{height:"100%",width:"100%"}}>
          <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution='&copy; OpenStreetMap'/>
          {tipo==="bairros" && Object.entries(porBairro).map(([bairro,v])=>{
            const coords=COORDS_BAIRROS[bairro]; if(!coords) return null;
            const cor=corBairro(v); const raio=Math.max(12,Math.min(36,v.total*8));
            return (
              <CircleMarker key={bairro} center={coords} radius={raio}
                pathOptions={{color:cor,fillColor:cor,fillOpacity:0.7,weight:2}}>
                <Popup>
                  <div style={{minWidth:160}}>
                    <p style={{fontWeight:700,fontSize:14,marginBottom:6}}>{bairro}</p>
                    {v.critico>0&&<p style={{color:"#C0392B",fontSize:12,margin:"2px 0"}}>🔴 Crítico: {v.critico}</p>}
                    {v.alta>0&&<p style={{color:"#E67E22",fontSize:12,margin:"2px 0"}}>🟠 Alta: {v.alta}</p>}
                    {v.media>0&&<p style={{color:"#D4AC0D",fontSize:12,margin:"2px 0"}}>🟡 Média: {v.media}</p>}
                    {v.baixa>0&&<p style={{color:"#27AE60",fontSize:12,margin:"2px 0"}}>🟢 Curta: {v.baixa}</p>}
                    {v.cortada>0&&<p style={{color:"#2471A3",fontSize:12,margin:"2px 0"}}>✂️ Cortada: {v.cortada}</p>}
                  </div>
                </Popup>
              </CircleMarker>
            );
          })}
          {tipo==="locais" && registrosNoMapa.map(r=>{
            const status=statusEfetivo(r); const cfg=STATUS[status]||STATUS.baixa;
            return (
              <CircleMarker key={r.id} center={[r.latitude,r.longitude]} radius={10}
                pathOptions={{color:cfg.cor,fillColor:cfg.cor,fillOpacity:0.85,weight:2}}>
                <Popup>
                  <div style={{minWidth:180}}>
                    <p style={{fontWeight:700,fontSize:14,marginBottom:4}}>{r.local}</p>
                    <p style={{fontSize:12,color:"#666",marginBottom:6}}>📍 {r.bairro}</p>
                    <p style={{fontSize:12,marginBottom:4}}>{cfg.emoji} {cfg.label}</p>
                    {r.metragem&&<p style={{fontSize:12,color:"#666"}}>📐 {r.metragem}m²</p>}
                    <button onClick={()=>irParaLocal(r)}
                      style={{marginTop:8,width:"100%",padding:"6px 10px",background:"#27500A",color:"#fff",border:"none",borderRadius:6,cursor:"pointer",fontSize:12,fontWeight:600}}>
                      Ver detalhes →
                    </button>
                  </div>
                </Popup>
              </CircleMarker>
            );
          })}
        </MapContainer>
      </div>
      {registrosNoMapa.length===0&&tipo==="locais"&&(
        <div className="card" style={{textAlign:"center",padding:24}}>
          <p style={{color:"#888"}}>📌 Nenhum local com coordenadas ainda.</p>
          <p style={{fontSize:12,color:"#aaa",marginTop:6}}>Crie novas vistorias para aparecerem aqui automaticamente.</p>
        </div>
      )}
    </div>
  );
}

// ========================================================================
// GRAMAS
// ========================================================================
function Gramas({ registros, filtroInicial, localFoco, setLocalFoco, registrarCorte }) {
  const [filtro, setFiltro] = useState(filtroInicial?.status||"");
  const [filtroB, setFiltroB] = useState(filtroInicial?.bairro||"");
  const [sel, setSel] = useState(localFoco);

  useEffect(()=>{setFiltro(filtroInicial?.status||"");setFiltroB(filtroInicial?.bairro||"");},[filtroInicial]);
  useEffect(()=>{ if(localFoco){setSel(localFoco);setLocalFoco(null);} },[localFoco]);

  if (sel) return <Detalhe registro={sel} voltar={()=>setSel(null)} registrarCorte={registrarCorte}/>;

  const lista = registros
    .filter(r=>!filtro||statusEfetivo(r)===filtro)
    .filter(r=>!filtroB||r.bairro===filtroB);

  return (
    <div>
      <div className="card" style={{marginBottom:16}}>
        <div style={{display:"flex",gap:10,flexWrap:"wrap",alignItems:"center"}}>
          <span style={{fontSize:13,fontWeight:600}}>🔍 Filtrar:</span>
          <select value={filtro} onChange={e=>setFiltro(e.target.value)} style={{padding:"7px 12px",borderRadius:8,border:"1px solid #ddd",fontSize:13}}>
            <option value="">Todos os status</option>
            {Object.entries(STATUS).map(([k,v])=><option key={k} value={k}>{v.emoji} {v.label}</option>)}
          </select>
          <select value={filtroB} onChange={e=>setFiltroB(e.target.value)} style={{padding:"7px 12px",borderRadius:8,border:"1px solid #ddd",fontSize:13}}>
            <option value="">Todos os bairros</option>
            {BAIRROS.map(b=><option key={b}>{b}</option>)}
          </select>
          <span style={{fontSize:12,color:"#888",marginLeft:"auto"}}>{lista.length} local(is)</span>
        </div>
      </div>
      {lista.length===0 ? <div className="card"><p className="vazio">Nenhum local encontrado.</p></div> :
        <div className="gramas-grid">
          {lista.map(r=>{
            const status=statusEfetivo(r); const cfg=STATUS[status]||STATUS.baixa;
            const corte=new Date(r.data); corte.setDate(corte.getDate()+(r.dias_corte||0));
            const diff=Math.ceil((corte-new Date())/86400000);
            return (
              <div key={r.id} className="grama-card" onClick={()=>setSel(r)}>
                <div className="grama-foto">
                  {r.foto?<img src={r.foto} alt={r.local}/>:<div className="grama-foto-vazia">🌿</div>}
                  <span className="grama-badge" style={{background:cfg.bg,color:cfg.texto}}>{cfg.emoji} {cfg.label}</span>
                </div>
                <div className="grama-info">
                  <h4>{r.local}</h4>
                  <p className="grama-bairro">📍 {r.bairro}</p>
                  {r.metragem&&<p className="grama-meta">📐 {r.metragem}m²</p>}
                  <p className="grama-meta">📅 {new Date(r.data+"T12:00:00").toLocaleDateString("pt-BR")}</p>
                  <p className="grama-corte" style={{color:diff<=0?"#C0392B":diff<=3?"#E67E22":"#666"}}>
                    ✂️ {diff<=0?"Atrasado!":diff<=3?`Em ${diff}d!`:`Em ${diff}d`}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      }
    </div>
  );
}

function Detalhe({ registro:r, voltar, registrarCorte }) {
  const status=statusEfetivo(r); const cfg=STATUS[status]||STATUS.baixa;
  const corte=new Date(r.data); corte.setDate(corte.getDate()+(r.dias_corte||0));
  const diff=Math.ceil((corte-new Date())/86400000);
  const diasDesde=Math.ceil((new Date()-new Date(r.data+"T12:00:00"))/86400000);
  const cresc=(diasDesde/7*cfg.cresc*10).toFixed(1);
  const pct=Math.min(100,diasDesde/30*100);
  const [registrando,setRegistrando]=useState(false);

  const handleCorte=async()=>{setRegistrando(true);await registrarCorte(r);setRegistrando(false);voltar();};

  return (
    <div>
      <button className="btn-voltar-detalhe" onClick={voltar}>← Voltar</button>
      <div className="card" style={{marginTop:12}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:16,flexWrap:"wrap",gap:12}}>
          <div>
            <h2 style={{fontSize:22,fontWeight:700,marginBottom:4}}>{r.local}</h2>
            <p style={{fontSize:14,color:"#666"}}>📍 {r.bairro}{r.metragem?` · ${r.metragem}m²`:""}</p>
          </div>
          <span className="badge" style={{background:cfg.bg,color:cfg.texto,fontSize:14,padding:"8px 18px"}}>{cfg.emoji} {cfg.label}</span>
        </div>
        {r.foto&&<img src={r.foto} alt={r.local} style={{width:"100%",maxHeight:360,objectFit:"cover",borderRadius:12,marginBottom:16,border:"1px solid #eee"}}/>}
        <div className="detalhe-grid">
          <div className="detalhe-item"><span className="detalhe-label">📅 Data da vistoria</span><span className="detalhe-val">{new Date(r.data+"T12:00:00").toLocaleDateString("pt-BR")}</span></div>
          <div className="detalhe-item"><span className="detalhe-label">⏱️ Dias desde vistoria</span><span className="detalhe-val">{diasDesde} dias</span></div>
          <div className="detalhe-item"><span className="detalhe-label">📏 Altura registrada</span><span className="detalhe-val">{r.altura||"Não informada"}</span></div>
          <div className="detalhe-item"><span className="detalhe-label">✂️ Próximo corte</span>
            <span className="detalhe-val" style={{color:diff<=0?"#C0392B":diff<=3?"#E67E22":"inherit"}}>
              {diff<=0?"⚠️ Atrasado!":diff<=3?`🚨 Em ${diff} dias`:`✅ Em ${diff} dias`}
            </span>
          </div>
          {r.obs&&<div className="detalhe-item full"><span className="detalhe-label">📝 Observações</span><span className="detalhe-val">{r.obs}</span></div>}
        </div>
        <div className="crescimento-box">
          <h4>🌱 Estimativa de crescimento</h4>
          <p>Em <strong>{diasDesde} dias</strong>, a grama cresceu aproximadamente <strong>{cresc}cm</strong> (taxa: {(cfg.cresc*10).toFixed(1)}cm/semana).</p>
          <div style={{marginTop:10}}>
            <div style={{display:"flex",justifyContent:"space-between",fontSize:12,color:"#666",marginBottom:4}}>
              <span>Crescimento estimado</span><span>{pct.toFixed(0)}% do ciclo</span>
            </div>
            <div style={{height:10,background:"#e0e0e0",borderRadius:99,overflow:"hidden"}}>
              <div style={{height:"100%",width:`${pct}%`,background:cfg.cor,borderRadius:99,transition:"width 0.6s"}}/>
            </div>
          </div>
        </div>
        {status!=="cortada"&&<button className="btn-renovar" onClick={handleCorte} disabled={registrando}>{registrando?"Registrando...":"✂️ Registrar corte"}</button>}
        {status==="cortada"&&<div className="info-cortada">✅ Esta área foi cortada recentemente. Em breve passará para "Grama curta".</div>}
      </div>
    </div>
  );
}

// ========================================================================
// VISTORIA
// ========================================================================
function Vistoria({ salvar, voltar }) {
  const [form, setForm] = useState({
    local:"", bairro:"", metragem:"",
    data: new Date().toISOString().split("T")[0],
    status:"", altura:"", diasCorte:"", obs:"", foto:null,
    latitude:null, longitude:null,
  });
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [analisando, setAnalisando] = useState(false);
  const [resIA, setResIA] = useState(null);
  const [mapaAberto, setMapaAberto] = useState(false);

  const set = (k,v) => setForm(f=>({...f,[k]:v}));

  const handleFoto = async (e) => {
    const file=e.target.files[0]; if(!file) return;
    const reader=new FileReader();
    reader.onload=ev=>set("foto",ev.target.result);
    reader.readAsDataURL(file);
    setAnalisando(true); setResIA(null);
    try {
      const tmImage=await import('@teachablemachine/image');
      const URL_M="https://teachablemachine.withgoogle.com/models/OqjPHgl8hh/";
      const model=await tmImage.load(URL_M+"model.json",URL_M+"metadata.json");
      const img=document.createElement("img");
      img.crossOrigin="anonymous"; img.src=URL.createObjectURL(file);
      await new Promise((r,j)=>{img.onload=r;img.onerror=j;});
      const preds=await model.predict(img);
      const m=preds.reduce((a,b)=>a.probability>b.probability?a:b);
      const mapa={"Grama Alta":"alta","Grama Media":"media","Grama Média":"media","Grama Baixa":"baixa"};
      const st=mapa[m.className]||"media";
      setResIA({classe:m.className,conf:Math.round(m.probability*100),status:st,todas:preds});
      set("status",st); set("diasCorte",STATUS[st]?.dias||10);
    } catch(err) { setResIA({erro:"Não foi possível analisar."}); }
    setAnalisando(false);
  };

  const handleSubmit=async()=>{
    if(!form.local){setErro("Informe o local.");return;}
    if(!form.bairro){setErro("Selecione o bairro.");return;}
    if(!form.status){setErro("Selecione a classificação.");return;}
    setErro(""); setSalvando(true);
    const ok=await salvar(form);
    setSalvando(false);
    if(ok) setTimeout(()=>voltar(),500);
    else setErro("Erro ao salvar.");
  };

  return (
    <div className="vistoria-completa">
      <div className="card vistoria-header">
        <div>
          <h2 style={{fontSize:18,fontWeight:700,marginBottom:4}}>Registrar nova vistoria</h2>
          <p style={{fontSize:13,color:"#666"}}>Preencha os dados do local e envie uma foto para classificação automática por IA</p>
        </div>
      </div>

      {erro&&<div className="msg-erro">{erro}</div>}

      {/* LOCALIZAÇÃO */}
      <div className="card vistoria-secao">
        <h3 className="secao-titulo">📍 Localização</h3>
        <div className="form-grid-3">
          <div className="form-group">
            <label>Endereço / Praça / Recanto*</label>
            <input placeholder="Ex: Av. Ana Costa, 100" value={form.local} onChange={e=>set("local",e.target.value)}/>
            <span className="form-hint">Endereço completo para localizar no mapa</span>
          </div>
          <div className="form-group">
            <label>Bairro *</label>
            <select value={form.bairro} onChange={e=>set("bairro",e.target.value)}>
              <option value="">Selecione...</option>
              {BAIRROS.map(b=><option key={b}>{b}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>Metragem (m²)</label>
            <input type="number" placeholder="Ex: 150" value={form.metragem} onChange={e=>set("metragem",e.target.value)}/>
          </div>
        </div>

        {/* MAPA INTERATIVO */}
        <div className="mapa-marcar-wrapper">
          {form.latitude&&form.longitude&&(
            <div className="coord-info">
              <span>✅ Localização marcada: {Number(form.latitude).toFixed(5)}, {Number(form.longitude).toFixed(5)}</span>
              <button className="btn-limpar-coord" onClick={()=>{set("latitude",null);set("longitude",null);}}>Remover</button>
            </div>
          )}
          <button className="btn-toggle-mapa" onClick={()=>setMapaAberto(!mapaAberto)}>
            {mapaAberto?"Fechar mapa":"📍 Abrir mapa"}
          </button>
          {mapaAberto&&(
            <>
              <div className="mapa-marcar" style={{marginTop:10}}>
                <MapContainer center={[-23.9608,-46.3336]} zoom={14} style={{height:"100%",width:"100%"}}>
                  <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution='&copy; OpenStreetMap'/>
                  <MapClicker onMark={(lat,lng)=>{set("latitude",lat);set("longitude",lng);}}/>
                  {form.latitude&&form.longitude&&(
                    <CircleMarker center={[form.latitude,form.longitude]} radius={10}
                      pathOptions={{color:"#27500A",fillColor:"#27500A",fillOpacity:0.85,weight:2}}/>
                  )}
                </MapContainer>
              </div>
              <p className="mapa-instrucao">Clique no mapa para marcar a localização exata</p>
            </>
          )}
        </div>
      </div>

      {/* FOTO + IA */}
      <div className="card vistoria-secao">
        <h3 className="secao-titulo">📷 Foto + Análise por IA</h3>
        <div className="upload-area">
          <label className="upload-label">
            <input type="file" accept="image/*" onChange={handleFoto} style={{display:"none"}}/>
            {!form.foto?(
              <div className="upload-placeholder">
                <div className="upload-icon">📸</div>
                <p style={{fontSize:15,fontWeight:600,marginBottom:4}}>Clique para enviar foto</p>
                <p style={{fontSize:12,color:"#888"}}>ou arraste aqui · JPG, PNG até 10MB</p>
              </div>
            ):(
              <div className="upload-preview">
                <img src={form.foto} alt="preview"/>
                <div className="upload-trocar">🔄 Clique para trocar a foto</div>
              </div>
            )}
          </label>
        </div>
        {analisando&&<div className="ia-loading"><span className="ia-spinner">🔄</span> Analisando imagem com IA...</div>}
        {resIA&&!resIA.erro&&(
          <div className="ia-resultado">
            <div className="ia-resultado-header">
              <span style={{fontSize:18}}>🤖</span>
              <div>
                <p style={{fontWeight:700,color:"#27500A",fontSize:14}}>{resIA.classe}</p>
                <p style={{fontSize:11,color:"#666"}}>{resIA.conf}% de confiança</p>
              </div>
            </div>
            <div className="ia-barras">
              {resIA.todas.map(p=>(
                <div key={p.className} style={{marginBottom:6}}>
                  <div style={{display:"flex",justifyContent:"space-between",fontSize:11,marginBottom:2}}>
                    <span>{p.className}</span><span style={{fontWeight:600}}>{Math.round(p.probability*100)}%</span>
                  </div>
                  <div style={{height:5,background:"#e0e0e0",borderRadius:99,overflow:"hidden"}}>
                    <div style={{height:"100%",width:`${Math.round(p.probability*100)}%`,background:"#27500A",borderRadius:99}}/>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        {resIA?.erro&&<div className="ia-erro">⚠️ {resIA.erro}</div>}
      </div>

      {/* CLASSIFICAÇÃO */}
      <div className="card vistoria-secao">
        <h3 className="secao-titulo">🌿 Classificação da Grama</h3>
        <div className="status-btns">
          {Object.entries(STATUS).map(([key,cfg])=>(
            <button key={key} type="button"
              className={`status-btn ${form.status===key?"selecionado":""}`}
              style={form.status===key?{background:cfg.bg,borderColor:cfg.cor,color:cfg.texto}:{}}
              onClick={()=>{set("status",key);set("diasCorte",cfg.dias);}}>
              <span style={{fontSize:24,marginBottom:4,display:"block"}}>{cfg.emoji}</span>
              <strong>{cfg.label}</strong>
              <span style={{display:"block",fontSize:11,opacity:0.7,marginTop:2}}>{cfg.dias} dias p/ corte</span>
            </button>
          ))}
        </div>
      </div>

      {/* DETALHES ADICIONAIS */}
      <div className="card vistoria-secao">
        <h3 className="secao-titulo">📝 Detalhes adicionais</h3>
        <div className="form-grid-3">
          <div className="form-group">
            <label>Data da vistoria</label>
            <input type="date" value={form.data} onChange={e=>set("data",e.target.value)}/>
          </div>
          <div className="form-group">
            <label>Altura estimada</label>
            <input placeholder="Ex: 25 cm" value={form.altura} onChange={e=>set("altura",e.target.value)}/>
          </div>
          <div className="form-group">
            <label>Dias até o próximo corte</label>
            <input type="number" placeholder="Ex: 7" value={form.diasCorte} onChange={e=>set("diasCorte",e.target.value)}/>
          </div>
          <div className="form-group full">
            <label>Observações</label>
            <textarea placeholder="Anote qualquer observação relevante..." value={form.obs} onChange={e=>set("obs",e.target.value)}/>
          </div>
        </div>
      </div>

      <div className="vistoria-acoes">
        <button className="btn-voltar" onClick={voltar}>Cancelar</button>
        <button className="btn-salvar" onClick={handleSubmit} disabled={salvando}>
          {salvando?"Salvando...":"Salvar vistoria"}
        </button>
      </div>
    </div>
  );
}

// ========================================================================
// HISTÓRICO
// ========================================================================
function Historico({ registros, irParaLocal }) {
  const [filtro,setFiltro]=useState(""); const [filtroB,setFiltroB]=useState("");
  const lista=registros.filter(r=>!filtro||statusEfetivo(r)===filtro).filter(r=>!filtroB||r.bairro===filtroB);
  return (
    <div className="card">
      <div className="card-header" style={{marginBottom:16}}>
        <h3 className="card-title">Todas as vistorias ({lista.length})</h3>
        <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
          <select value={filtro} onChange={e=>setFiltro(e.target.value)} style={{padding:"6px 10px",borderRadius:8,border:"1px solid #ddd",fontSize:13}}>
            <option value="">Todos os status</option>
            {Object.entries(STATUS).map(([k,v])=><option key={k} value={k}>{v.emoji} {v.label}</option>)}
          </select>
          <select value={filtroB} onChange={e=>setFiltroB(e.target.value)} style={{padding:"6px 10px",borderRadius:8,border:"1px solid #ddd",fontSize:13}}>
            <option value="">Todos os bairros</option>
            {BAIRROS.map(b=><option key={b}>{b}</option>)}
          </select>
        </div>
      </div>
      {lista.length===0?<p className="vazio">Nenhuma vistoria.</p>:<ListaVistorias registros={lista} onClick={r=>irParaLocal(r)}/>}
    </div>
  );
}

// ========================================================================
// NOTIFICAÇÕES
// ========================================================================
function Notificacoes({ notificacoes, irParaLocal }) {
  if(!notificacoes.length) return <div className="card"><p className="vazio">🎉 Tudo em dia!</p></div>;
  const cores={
    critico:{bg:"#FDEDEC",borda:"#C0392B",texto:"#922B21"},
    atrasado:{bg:"#FEF0E3",borda:"#E67E22",texto:"#A04000"},
    urgente:{bg:"#FEF9E7",borda:"#D4AC0D",texto:"#7D6608"},
    atencao:{bg:"#FEF9E7",borda:"#D4AC0D",texto:"#7D6608"},
    novo:{bg:"#E9F7EF",borda:"#27AE60",texto:"#1E8449"},
    ok:{bg:"#E9F7EF",borda:"#27AE60",texto:"#1E8449"},
  };
  const grupos={
    "🔴 Ação imediata":notificacoes.filter(n=>["critico","atrasado"].includes(n.tipo)),
    "⚠️ Atenção":notificacoes.filter(n=>["urgente","atencao"].includes(n.tipo)),
    "✅ Recentes":notificacoes.filter(n=>n.tipo==="novo"),
    "🌿 Tranquila":notificacoes.filter(n=>n.tipo==="ok"),
  };
  return (
    <div style={{display:"flex",flexDirection:"column",gap:16}}>
      {Object.entries(grupos).map(([t,l])=>l.length===0?null:(
        <div key={t} className="card">
          <h3 className="card-title">{t} ({l.length})</h3>
          <div style={{display:"flex",flexDirection:"column",gap:10}}>
            {l.map((n,i)=>{
              const c=cores[n.tipo]||cores.ok; const cfg=STATUS[statusEfetivo(n.registro)];
              return (
                <div key={i} className="notif-card clicavel"
                  style={{padding:"14px 16px",borderRadius:10,background:c.bg,border:`1px solid ${c.borda}`,borderLeft:`4px solid ${c.borda}`,cursor:"pointer"}}
                  onClick={()=>irParaLocal(n.registro)}>
                  <div style={{display:"flex",justifyContent:"space-between",gap:12,alignItems:"flex-start"}}>
                    <div style={{flex:1}}>
                      <p style={{fontWeight:700,fontSize:14,color:c.texto,marginBottom:4}}>{n.titulo}</p>
                      <p style={{fontSize:13,color:"#555",marginBottom:8}}>{n.msg}</p>
                      <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                        {[`📍 ${n.registro.local}`,`🗺️ ${n.registro.bairro}`,n.registro.metragem?`📐 ${n.registro.metragem}m²`:null].filter(Boolean).map((tag,j)=>(
                          <span key={j} style={{fontSize:11,background:"#fff",padding:"2px 8px",borderRadius:99,border:`1px solid ${c.borda}`,color:c.texto}}>{tag}</span>
                        ))}
                      </div>
                    </div>
                    <span className="badge" style={{background:cfg?.bg,color:cfg?.texto,flexShrink:0}}>{cfg?.emoji} {cfg?.label}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

// ========================================================================
// CONFIGURAÇÕES
// ========================================================================
function Configuracoes({ tema, setTema }) {
  return (
    <div style={{display:"flex",flexDirection:"column",gap:16,maxWidth:560}}>
      <div className="card">
        <h3 className="card-title">👤 Perfil</h3>
        <div style={{display:"flex",alignItems:"center",gap:16,marginBottom:20,padding:"14px 16px",background:"#F8FAF6",borderRadius:10}}>
          <div style={{width:56,height:56,borderRadius:"50%",background:"#27500A",color:"#fff",display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,fontWeight:700}}>V</div>
          <div><p style={{fontWeight:700,fontSize:16}}>Victor</p><p style={{fontSize:13,color:"#888"}}>Agente de campo · Santos SP</p></div>
        </div>
        <div className="form-grid">
          <div className="form-group"><label>Nome</label><input defaultValue="Victor"/></div>
          <div className="form-group"><label>Cargo</label><input defaultValue="Agente de campo"/></div>
          <div className="form-group full"><label>Email</label><input placeholder="seu@email.com"/></div>
        </div>
        <button className="btn-salvar" style={{marginTop:12}}>Salvar alterações</button>
      </div>
      <div className="card">
        <h3 className="card-title">🎨 Aparência</h3>
        <div style={{display:"flex",gap:12}}>
          {["claro","escuro"].map(t=>(
            <button key={t} onClick={()=>setTema(t)}
              style={{flex:1,padding:"14px",borderRadius:10,border:`2px solid ${tema===t?"#27500A":"#ddd"}`,background:tema===t?"#EAF3DE":"#fff",cursor:"pointer",fontSize:14,fontWeight:tema===t?700:400,color:tema===t?"#27500A":"#666"}}>
              {t==="claro"?"☀️ Tema claro":"🌙 Tema escuro"}
            </button>
          ))}
        </div>
      </div>
      <button style={{padding:"13px",background:"#FDEDEC",color:"#C0392B",border:"1px solid #F5A8A8",borderRadius:10,fontSize:14,fontWeight:600,cursor:"pointer"}}>
        🚪 Sair da conta
      </button>
    </div>
  );
}

// ========================================================================
// LISTA COMPARTILHADA
// ========================================================================
function ListaVistorias({ registros, onClick }) {
  return (
    <div className="lista-recentes">
      {registros.map(r=>{
        const status=statusEfetivo(r); const cfg=STATUS[status]||STATUS.baixa;
        const corte=new Date(r.data); corte.setDate(corte.getDate()+(r.dias_corte||0));
        const diff=Math.ceil((corte-new Date())/86400000);
        return (
          <div key={r.id} className={`recente-item ${onClick?"clicavel":""}`} onClick={()=>onClick&&onClick(r)}>
            <div className="recente-thumb">{r.foto?<img src={r.foto} alt="grama"/>:<span>🌿</span>}</div>
            <div className="recente-info">
              <strong>{r.local}</strong>
              <span>{r.bairro}{r.metragem?` · ${r.metragem}m²`:""}</span>
              <span>{new Date(r.data+"T12:00:00").toLocaleDateString("pt-BR")}</span>
            </div>
            <div className="recente-direita">
              <span className="badge" style={{background:cfg.bg,color:cfg.texto}}>{cfg.emoji} {cfg.label}</span>
              <span className="dias" style={{color:diff<=0?"#C0392B":"#888"}}>{diff<=0?"⚠️ Atrasado!":`Em ${diff}d`}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
