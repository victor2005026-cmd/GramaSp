import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "./supabase";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, AreaChart, Area
} from "recharts";
import {
  MapContainer, TileLayer, CircleMarker, Polygon, Polyline, Popup, useMapEvents, useMap
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "./App.css";

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl:"https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl:"https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl:"https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

const BAIRROS=[
  "Aparecida","Boqueirão","Campo Grande","Caneleira","Centro",
  "Chico de Paula","Encruzilhada","Estuário","Gonzaga","José Menino",
  "Macuco","Marapé","Morro de Nova Cintra","Paquetá","Pompéia",
  "Ponta da Praia","Rádio Clube","Saboó","Santa Maria","Santana",
  "Santo Antônio","São Jorge","Valongo","Vila Belmiro","Vila Mathias"
];

const COORDS_BAIRROS={
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

const STATUS={
  critico:{label:"Crítico",      emoji:"🔴",cor:"#B91C1C",bg:"#FEE2E2",texto:"#7F1D1D",dias:0, cresc:0.5},
  alta:   {label:"Alta",        emoji:"🟠",cor:"#C2410C",bg:"#FFEDD5",texto:"#7C2D12",dias:3, cresc:0.4},
  media:  {label:"Média",       emoji:"🟡",cor:"#A16207",bg:"#FEF3C7",texto:"#713F12",dias:10,cresc:0.3},
  baixa:  {label:"Curta",       emoji:"🟢",cor:"#15803D",bg:"#DCFCE7",texto:"#14532D",dias:21,cresc:0.25},
  cortada:{label:"Recém cortada",emoji:"✂️",cor:"#1D4ED8",bg:"#DBEAFE",texto:"#1E3A8A",dias:30,cresc:0.2},
};

const KPI_CORES={
  total:  {fundo:"linear-gradient(135deg,#275214,#1E3A0E)",sombra:"rgba(39,82,20,.35)"},
  critico:{fundo:"linear-gradient(135deg,#B91C1C,#7F1D1D)",sombra:"rgba(185,28,28,.35)"},
  alta:   {fundo:"linear-gradient(135deg,#C2410C,#7C2D12)",sombra:"rgba(194,65,12,.35)"},
  media:  {fundo:"linear-gradient(135deg,#A16207,#713F12)",sombra:"rgba(161,98,7,.35)"},
  baixa:  {fundo:"linear-gradient(135deg,#15803D,#14532D)",sombra:"rgba(21,128,61,.35)"},
  cortada:{fundo:"linear-gradient(135deg,#1D4ED8,#1E3A8A)",sombra:"rgba(29,78,216,.35)"},
};

function statusEfetivo(r){
  if(r.status_calculado&&r.status_calculado!=="atrasada") return r.status_calculado;
  if(r.status==="cortada"){
    const dias=Math.floor((new Date()-new Date(r.criado_em||r.data))/86400000);
    if(dias>=2) return "baixa";
  }
  return r.status;
}

function calcNotif(registros){
  const hoje=new Date();
  return registros.map(r=>{
    const status=statusEfetivo(r);
    const corte=new Date(r.data); corte.setDate(corte.getDate()+(r.dias_corte||0));
    const diff=Number.isFinite(Number(r.dias_para_corte))?Number(r.dias_para_corte):Math.ceil((corte-hoje)/86400000);
    const diasCad=Number.isFinite(Number(r.dias_desde_vistoria))?Number(r.dias_desde_vistoria):Math.ceil((hoje-new Date(r.criado_em||r.data))/86400000);
    let tipo="ok",titulo="🌿 Tranquila",prio=6;
    if(status==="critico")            {tipo="critico"; titulo="🔴 Crítico!";      prio=1;}
    else if(diff<=0&&status==="alta") {tipo="atrasado";titulo="🟠 Atrasado!";     prio=2;}
    else if(diff<=3&&status==="alta") {tipo="urgente"; titulo="⚠️ Urgente";       prio=3;}
    else if(diff<=5&&status==="media"){tipo="atencao"; titulo="📋 Atenção";       prio=4;}
    else if(diasCad<=2)               {tipo="novo";    titulo="✅ Novo registro"; prio=5;}
    return{tipo,titulo,msg:`${r.local} (${r.bairro})`,registro:r,prioridade:prio,diff};
  }).sort((a,b)=>a.prioridade-b.prioridade);
}

function Toast({msg,tipo,onClose}){
  useEffect(()=>{const t=setTimeout(onClose,3500);return()=>clearTimeout(t);},[onClose]);
  const ic={sucesso:"✅",erro:"❌",info:"ℹ️",aviso:"⚠️"};
  return(
    <div className={`toast toast-${tipo}`}>
      <span style={{fontSize:20}}>{ic[tipo]||"ℹ️"}</span>
      <p>{msg}</p>
      <button className="toast-close" onClick={onClose}>×</button>
    </div>
  );
}

// ── BUSCA DE ENDEREÇO (Nominatim) ─────────────────────────────────────────────
function BuscaEndereco({value,onChange,onSelect,placeholder="Digite o endereço, praça ou rua..."}){
  const [sugestoes,setSugestoes]=useState([]);
  const [buscando,setBuscando]=useState(false);
  const [aberto,setAberto]=useState(false);
  const ref=useRef(null);
  const timerRef=useRef(null);

  useEffect(()=>{
    const handler=(e)=>{if(ref.current&&!ref.current.contains(e.target)) setAberto(false);};
    document.addEventListener("mousedown",handler);
    return()=>document.removeEventListener("mousedown",handler);
  },[]);

  const buscar=useCallback(async(texto)=>{
    if(texto.length<2){setSugestoes([]);setAberto(false);return;}
    setBuscando(true);
    try{
      const q=encodeURIComponent(`${texto}, Santos, São Paulo, Brasil`);
      const url=`https://nominatim.openstreetmap.org/search?format=json&q=${q}&limit=8&addressdetails=1&countrycodes=br&viewbox=-46.4,-24.1,-46.2,-23.8&bounded=1`;
      const res=await fetch(url,{headers:{"Accept-Language":"pt-BR,pt"}});
      const data=await res.json();
      if(data.length>0){
        setSugestoes(data);
        setAberto(true);
      } else {
        // segunda tentativa sem bounded
        const q2=encodeURIComponent(`${texto} Santos SP`);
        const res2=await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${q2}&limit=8&addressdetails=1&countrycodes=br`,{headers:{"Accept-Language":"pt-BR,pt"}});
        const data2=await res2.json();
        setSugestoes(data2);
        setAberto(data2.length>0);
      }
    }catch(e){setSugestoes([]);}
    setBuscando(false);
  },[]);

  const handleChange=(e)=>{
    const v=e.target.value;
    onChange(v);
    clearTimeout(timerRef.current);
    timerRef.current=setTimeout(()=>buscar(v),300);
  };

  const handleSelect=(s)=>{
    onChange(s.display_name.split(",")[0]);
    setAberto(false);
    setSugestoes([]);
    onSelect({
      lat:parseFloat(s.lat),
      lng:parseFloat(s.lon),
      nome:s.display_name.split(",")[0],
      enderecoCompleto:s.display_name,
      bairro:s.address?.suburb||s.address?.neighbourhood||s.address?.city_district||"",
    });
  };

  const formatarSugestao=(s)=>{
    const partes=s.display_name.split(",");
    const principal=partes[0].trim();
    const secundario=partes.slice(1,3).join(",").trim();
    return{principal,secundario};
  };

  return(
    <div className="busca-endereco-wrap" ref={ref}>
      <div className="busca-endereco-input-wrap">
        <span className="busca-endereco-icon">📍</span>
        <input
          className="busca-endereco-input"
          value={value}
          onChange={handleChange}
          placeholder={placeholder}
          onFocus={()=>sugestoes.length>0&&setAberto(true)}
          autoComplete="off"
        />
        {buscando&&<span className="busca-endereco-loading">🔄</span>}
      </div>
      {aberto&&sugestoes.length>0&&(
        <div className="busca-endereco-dropdown">
          {sugestoes.map((s,i)=>{
            const{principal,secundario}=formatarSugestao(s);
            return(
              <div key={i} className="busca-endereco-option" onClick={()=>handleSelect(s)}>
                <span className="busca-endereco-option-icon">📍</span>
                <div>
                  <p className="busca-endereco-principal">{principal}</p>
                  <p className="busca-endereco-secundario">{secundario}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── BUSCA DE BAIRRO com digitação ─────────────────────────────────────────────
function BairroBusca({value,onChange,placeholder="Digite o bairro..."}){
  const [aberto,setAberto]=useState(false);
  const ref=useRef(null);

  useEffect(()=>{
    const handler=(e)=>{if(ref.current&&!ref.current.contains(e.target)) setAberto(false);};
    document.addEventListener("mousedown",handler);
    return()=>document.removeEventListener("mousedown",handler);
  },[]);

  const filtrados=BAIRROS.filter(b=>b.toLowerCase().includes(value.toLowerCase())).slice(0,6);

  return(
    <div className="busca-endereco-wrap" ref={ref}>
      <div className="busca-endereco-input-wrap">
        <span className="busca-endereco-icon">🗺️</span>
        <input
          className="busca-endereco-input"
          value={value}
          onChange={e=>{onChange(e.target.value);setAberto(true);}}
          placeholder={placeholder}
          onFocus={()=>setAberto(true)}
          autoComplete="off"
        />
      </div>
      {aberto&&filtrados.length>0&&(
        <div className="busca-endereco-dropdown">
          {filtrados.map((b,i)=>(
            <div key={i} className="busca-endereco-option" onClick={()=>{onChange(b);setAberto(false);}}>
              <span className="busca-endereco-option-icon">🗺️</span>
              <div>
                <p className="busca-endereco-principal">{b}</p>
                <p className="busca-endereco-secundario">Santos, SP</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── MÚLTIPLOS BAIRROS com digitação ───────────────────────────────────────────
function BairrosSelect({value,onChange,placeholder="Digite para buscar bairros..."}){
  const [texto,setTexto]=useState("");
  const [aberto,setAberto]=useState(false);
  const ref=useRef(null);

  useEffect(()=>{
    const handler=(e)=>{if(ref.current&&!ref.current.contains(e.target)) setAberto(false);};
    document.addEventListener("mousedown",handler);
    return()=>document.removeEventListener("mousedown",handler);
  },[]);

  const filtrados=BAIRROS.filter(b=>
    b.toLowerCase().includes(texto.toLowerCase())&&!value.includes(b)
  ).slice(0,25);

  const toggle=(b)=>{
    if(value.includes(b)) onChange(value.filter(x=>x!==b));
    else onChange([...value,b]);
  };

  return(
    <div className="bairros-select-wrap" ref={ref}>
      <div className="bairros-tags" onClick={()=>setAberto(true)}>
        {value.map(b=>(
          <span key={b} className="bairro-tag">
            {b}
            <button onClick={e=>{e.stopPropagation();toggle(b);}}>×</button>
          </span>
        ))}
        <input
          className="bairros-tags-input"
          value={texto}
          onChange={e=>{setTexto(e.target.value);setAberto(true);}}
          onFocus={()=>setAberto(true)}
          placeholder={value.length===0?placeholder:"Adicionar bairro..."}
        />
      </div>
      {aberto&&(
        <div className="busca-endereco-dropdown">
          {filtrados.map((b,i)=>(
            <div key={i} className="busca-endereco-option" onClick={()=>{toggle(b);setTexto("");setAberto(false);}}>
              <span className="busca-endereco-option-icon"></span>
              <div>
                <p className="busca-endereco-principal">{b}</p>
                <p className="busca-endereco-secundario">Santos, SP</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Centraliza mapa quando coordenadas mudam
function MapaFlyTo({coords}){
  const map=useMap();
  useEffect(()=>{
    if(coords) map.flyTo(coords,17,{animate:true,duration:1});
  },[coords,map]);
  return null;
}

function MapClicker({onMark}){
  useMapEvents({click(e){onMark(e.latlng.lat,e.latlng.lng);}});
  return null;
}
function PolyDrawer({modo,onAddPonto}){
  useMapEvents({click(e){if(modo==="poligono"||modo==="linha") onAddPonto([e.latlng.lat,e.latlng.lng]);}});
  return null;
}
function Modal({titulo,children,onClose}){
  return(
    <div className="modal-overlay" onClick={e=>{if(e.target===e.currentTarget)onClose();}}>
      <div className="modal-box">
        <h3 className="modal-titulo">{titulo}</h3>
        {children}
      </div>
    </div>
  );
}

export default function App(){
  const [tela,setTela]              =useState("inicio");
  const [registros,setRegistros]    =useState([]);
  const [carregando,setCarregando]  =useState(true);
  const [tema,setTema]              =useState("claro");
  const [menuPerfil,setMenuPerfil]  =useState(false);
  const [notifAberta,setNotifAberta]=useState(false);
  const [filtroGramas,setFiltroGramas]=useState({});
  const [localFoco,setLocalFoco]    =useState(null);
  const [toast,setToast]            =useState(null);
  const [session,setSession]        =useState(null);
  const [authLoading,setAuthLoading]=useState(true);

  const showToast=(msg,tipo="sucesso")=>setToast({msg,tipo});

  const buscar=async()=>{
    setCarregando(true);
    const{data,error}=await supabase.from("vistorias_calculadas").select("*").order("criado_em",{ascending:false});
    if(!error&&data) setRegistros(data);
    setCarregando(false);
  };

  useEffect(()=>{
    supabase.auth.getSession().then(({data})=>{setSession(data.session);setAuthLoading(false);});
    const{data:{subscription}}=supabase.auth.onAuthStateChange((_,s)=>setSession(s));
    return()=>subscription.unsubscribe();
  },[]);

  useEffect(()=>{buscar();},[]);
  useEffect(()=>{document.body.className=tema==="escuro"?"tema-escuro":"";},[tema]);

  const salvar=async(form)=>{
    const bairroFinal=Array.isArray(form.bairros)&&form.bairros.length>0
      ?form.bairros.join(" / "):form.bairro||"";
    const{error}=await supabase.from("vistorias").insert([{
      local:form.local,bairro:bairroFinal,
      metragem:form.metragem?Number(form.metragem):null,
      data:form.data,status:form.status,altura:form.altura,
      dias_corte:form.diasCorte?Number(form.diasCorte):null,
      obs:form.obs,foto:form.foto||null,
      latitude:form.latitude||null,longitude:form.longitude||null,
      geometria:form.geometria?JSON.stringify(form.geometria):null,
    }]);
    if(!error){await buscar();showToast("Vistoria registrada com sucesso!");}
    else showToast("Erro ao salvar vistoria","erro");
    return !error;
  };

  const atualizar=async(id,form)=>{
    const bairroFinal=Array.isArray(form.bairros)&&form.bairros.length>0
      ?form.bairros.join(" / "):form.bairro||"";
    const{error}=await supabase.from("vistorias").update({
      local:form.local,bairro:bairroFinal,
      metragem:form.metragem?Number(form.metragem):null,
      data:form.data,status:form.status,altura:form.altura,
      dias_corte:form.diasCorte?Number(form.diasCorte):null,
      obs:form.obs,
    }).eq("id",id);
    if(!error){await buscar();showToast("Vistoria atualizada!");}
    else showToast("Erro ao atualizar","erro");
    return !error;
  };

  const deletar=async(id)=>{
    const{error}=await supabase.from("vistorias").delete().eq("id",id);
    if(!error){await buscar();showToast("Vistoria removida","info");}
    else showToast("Erro ao remover","erro");
    return !error;
  };

  const registrarCorte=async(registro)=>{
    const{error}=await supabase.from("vistorias").insert([{
      local:registro.local,bairro:registro.bairro,metragem:registro.metragem,
      data:new Date().toISOString().split("T")[0],
      status:"cortada",altura:"0 cm",dias_corte:21,
      obs:`Corte registrado. Anterior: ${STATUS[registro.status]?.label}`,
      foto:null,latitude:registro.latitude,longitude:registro.longitude,
      geometria:registro.geometria||null,
    }]);
    if(!error){await buscar();showToast("Corte registrado! Em 2 dias vira 'Grama curta'");}
    return !error;
  };

  const sair=async()=>{
    await supabase.auth.signOut();setSession(null);
    showToast("Você saiu da conta","info");
  };

  const irParaLocal=(r)=>{setLocalFoco(r);setTela("gramas");};
  const notificacoes=calcNotif(registros);
  const naoLidas=notificacoes.filter(n=>["critico","atrasado","urgente"].includes(n.tipo)).length;
  const irGramas=(f={})=>{setFiltroGramas(f);setLocalFoco(null);setTela("gramas");};

  if(authLoading) return(
    <div className="login-page">
      <div className="login-card" style={{alignItems:"center",gap:12}}>
        <span style={{fontSize:36}}>🌿</span>
        <p style={{color:"#888",fontWeight:500}}>Carregando...</p>
      </div>
    </div>
  );
  if(!session) return <Login onLogin={()=>showToast("Bem-vindo ao GramaSP!")}/>;

  return(
    <div className={`app ${tema}`}>
      {toast&&<Toast msg={toast.msg} tipo={toast.tipo} onClose={()=>setToast(null)}/>}

      <aside className="sidebar">
        <div className="sb-logo" onClick={()=>setTela("inicio")}>
          <div className="sb-logo-icon">🌿</div>
          <div><h2>GramaSP</h2><p>Jardins de Santos</p></div>
        </div>
        <nav>
          {[
            {id:"inicio",      icon:"🏠",label:"Início"},
            {id:"mapa",        icon:"🗺️",label:"Mapa"},
            {id:"gramas",      icon:"🌱",label:"Gramas"},
            {id:"vistoria",    icon:"📷",label:"Registrar Vistoria"},
            {id:"historico",   icon:"📋",label:"Histórico"},
            {id:"notificacoes",icon:"🔔",label:"Notificações",badge:naoLidas},
          ].map(item=>(
            <button key={item.id}
              className={`nav-item ${tela===item.id?"active":""}`}
              onClick={()=>{setTela(item.id);setNotifAberta(false);setMenuPerfil(false);}}>
              <span className="nav-icon">{item.icon}</span>
              <span>{item.label}</span>
              {item.badge>0&&<span className="nav-badge">{item.badge}</span>}
            </button>
          ))}
        </nav>
        <div className="sb-perfil-wrap">
          {menuPerfil&&(
            <div className="sb-perfil-menu">
              <button className="sb-perfil-item" onClick={()=>{setTela("configuracoes");setMenuPerfil(false);}}>⚙️ Configurações</button>
              <button className="sb-perfil-item" onClick={()=>{setTema(tema==="claro"?"escuro":"claro");setMenuPerfil(false);}}>
                {tema==="claro"?"🌙 Tema escuro":"☀️ Tema claro"}
              </button>
              <div className="sb-perfil-divider"/>
              <button className="sb-perfil-item perigo" onClick={sair}>🚪 Sair</button>
            </div>
          )}
          <button className="sb-perfil-btn" onClick={()=>{setMenuPerfil(!menuPerfil);setNotifAberta(false);}}>
            <div className="sb-perfil-avatar">V</div>
            <div className="sb-perfil-info">
              <span className="sb-perfil-nome">{session?.user?.email?.split("@")[0]||"Victor"}</span>
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
              {tela==="inicio"&&"Situação Geral"}
              {tela==="mapa"&&"Mapa de Santos"}
              {tela==="gramas"&&"Gramas"}
              {tela==="vistoria"&&"Nova Vistoria"}
              {tela==="historico"&&"Histórico"}
              {tela==="notificacoes"&&"Notificações"}
              {tela==="configuracoes"&&"Configurações"}
            </h1>
            {tela==="inicio"&&<span className="topbar-sub">Acompanhe a saúde dos gramados por bairro — Santos SP</span>}
          </div>
          <div className="topbar-right">
            {carregando&&<span className="sync-badge">🔄 Sincronizando</span>}
            <button className="notif-sino" onClick={()=>{setNotifAberta(!notifAberta);setMenuPerfil(false);}}>
              🔔{naoLidas>0&&<span className="notif-badge">{naoLidas}</span>}
            </button>
            {notifAberta&&(
              <div className="notif-dropdown">
                <div className="notif-dropdown-header"><strong>Notificações</strong><span style={{fontSize:12,color:"var(--text-3)",fontWeight:500}}>{notificacoes.length}</span></div>
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
            {tela!=="vistoria"&&<button className="btn-new" onClick={()=>setTela("vistoria")}>+ Nova Vistoria</button>}
          </div>
        </header>

        <div className="content">
          {tela==="inicio"       &&<Inicio registros={registros} irGramas={irGramas} notificacoes={notificacoes} tema={tema} irParaLocal={irParaLocal}/>}
          {tela==="mapa"         &&<Mapa registros={registros} irParaLocal={irParaLocal}/>}
          {tela==="gramas"       &&<Gramas registros={registros} filtroInicial={filtroGramas} localFoco={localFoco} setLocalFoco={setLocalFoco} registrarCorte={registrarCorte} atualizar={atualizar} deletar={deletar} showToast={showToast}/>}
          {tela==="vistoria"     &&<Vistoria salvar={salvar} voltar={()=>setTela("inicio")}/>}
          {tela==="historico"    &&<Historico registros={registros} irParaLocal={irParaLocal}/>}
          {tela==="notificacoes" &&<Notificacoes notificacoes={notificacoes} irParaLocal={irParaLocal}/>}
          {tela==="configuracoes"&&<Configuracoes tema={tema} setTema={setTema} sair={sair}/>}
        </div>
      </main>
    </div>
  );
}

// ── LOGIN ─────────────────────────────────────────────────────────────────────
function Login({onLogin}){
  const [email,setEmail]=useState("");
  const [senha,setSenha]=useState("");
  const [erro,setErro]=useState("");
  const [loading,setLoading]=useState(false);
  const entrar=async(e)=>{
    e.preventDefault();setErro("");setLoading(true);
    const{error}=await supabase.auth.signInWithPassword({email,password:senha});
    setLoading(false);
    if(error){setErro("Email ou senha inválidos.");return;}
    onLogin();
  };
  return(
    <div className="login-page">
      <form className="login-card" onSubmit={entrar}>
        <div className="login-brand">
          <div className="login-logo">🌿</div>
          <div><h1>GramaSP</h1><p>Prefeitura de Santos · Jardins de Santos</p></div>
        </div>
        <div className="form-group">
          <label>Email</label>
          <input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="seu@email.com" required/>
        </div>
        <div className="form-group">
          <label>Senha</label>
          <input type="password" value={senha} onChange={e=>setSenha(e.target.value)} placeholder="••••••••" required/>
        </div>
        {erro&&<div className="msg-erro">{erro}</div>}
        <button className="btn-salvar" type="submit" disabled={loading} style={{marginTop:4}}>
          {loading?"Entrando...":"Entrar no sistema"}
        </button>
        <p style={{fontSize:11,color:"#8B9985",textAlign:"center",lineHeight:1.5}}>
          Sistema de monitoramento de áreas verdes<br/>Prefeitura Municipal de Santos
        </p>
      </form>
    </div>
  );
}

// ── INÍCIO ────────────────────────────────────────────────────────────────────
function Inicio({registros,irGramas,notificacoes,tema,irParaLocal}){
  const [filtroB,setFiltroB]=useState("");
const [filtroBairro,setFiltroBairro]=useState("");
  const [verMais,setVerMais]=useState(false);

  const regs=registros.map(r=>({...r,statusReal:statusEfetivo(r)}));
  const counts={
    total:regs.length,
    critico:regs.filter(r=>r.statusReal==="critico").length,
    alta:regs.filter(r=>r.statusReal==="alta").length,
    media:regs.filter(r=>r.statusReal==="media").length,
    baixa:regs.filter(r=>r.statusReal==="baixa").length,
    cortada:regs.filter(r=>r.statusReal==="cortada").length,
  };
  const urgentes=notificacoes.filter(n=>n.tipo==="critico");

  const bairrosMap={};
  regs.forEach(r=>{
    if(!bairrosMap[r.bairro]) bairrosMap[r.bairro]={bairro:r.bairro,critico:0,alta:0,media:0,baixa:0,cortada:0};
    bairrosMap[r.bairro][r.statusReal]=(bairrosMap[r.bairro][r.statusReal]||0)+1;
  });
  const barData=Object.values(bairrosMap)
    .filter(d=>!filtroBairro||d.bairro.toLowerCase().includes(filtroBairro.toLowerCase()))
    .sort((a,b)=>(b.critico+b.alta)-(a.critico+a.alta));

  const roscaData=Object.entries(
    regs.reduce((acc,r)=>{acc[r.statusReal]=(acc[r.statusReal]||0)+1;return acc;},{})
  ).map(([k,v])=>({name:STATUS[k]?.label||k,value:v,cor:STATUS[k]?.cor||"#999"}));

  const hoje=new Date();
  const areaData=Array.from({length:30},(_,i)=>{
    const d=new Date(hoje); d.setDate(d.getDate()-(29-i));
    const key=d.toISOString().split("T")[0];
    const dRegs=regs.filter(r=>(r.criado_em||r.data||"").startsWith(key));
    return{
      dia:d.toLocaleDateString("pt-BR",{day:"2-digit",month:"2-digit"}),
      vistorias:dRegs.length,
      cortes:dRegs.filter(r=>r.status==="cortada").length,
    };
  });

  const listaLocais=regs.filter(r=>!filtroBairro||r.bairro.toLowerCase().includes(filtroBairro.toLowerCase())).slice(0,verMais?999:6);
  const isDark=tema==="escuro";
  const cardBg=isDark?"#111A0C":"#fff";
  const txt=isDark?"#ECF5E4":"#0D1A08";
  const gridC=isDark?"#233018":"#E2EAD8";
  const tip={background:cardBg,border:`1px solid ${gridC}`,borderRadius:12,color:txt,fontSize:12,boxShadow:"0 10px 24px rgba(0,0,0,.15)",padding:"10px 14px"};

  return(
    <div className="dashboard">
      {urgentes.length>0&&(
        <div className="alerta-banner">
          ⚠️ <strong>{urgentes.length} local(is) urgente(s)</strong> — {urgentes.slice(0,2).map(n=>n.msg).join(", ")}
          {urgentes.length>2&&` e mais ${urgentes.length-2}`}
        </div>
      )}

      <div className="kpi-grid">
        {[
          {key:"total",  label:"Total de Locais",num:counts.total,   icon:"🗂️"},
          {key:"critico",label:"Urgentes",        num:counts.critico, icon:"🔴"},
          {key:"alta",   label:"Grama Alta",      num:counts.alta,    icon:"🟠"},
          {key:"media",  label:"Grama Média",     num:counts.media,   icon:"🟡"},
          {key:"baixa",  label:"Grama Curta",     num:counts.baixa,   icon:"🟢"},
          {key:"cortada",label:"Recém Cortadas",  num:counts.cortada, icon:"✂️"},
        ].map(c=>{
          const k=KPI_CORES[c.key];
          return(
            <div key={c.key} className="kpi-card"
              style={{background:k.fundo,boxShadow:`0 4px 14px ${k.sombra}`}}
              onClick={()=>irGramas({status:c.key==="total"?undefined:c.key})}>
              <div className="kpi-top">
                <span className="kpi-label">{c.label}</span>
                <div className="kpi-icon-box">{c.icon}</div>
              </div>
              <div className="kpi-num">{c.num}</div>
              <div className="kpi-footer">Ver detalhes →</div>
            </div>
          );
        })}
      </div>

     

      {regs.length>0&&(
        <>
          <div className="grid2">
            <div className="chart-card">
              <div className="chart-head">
                <div>
                  <div className="chart-title">Distribuição geral</div>
                  <div className="chart-sub">Proporção por status atual</div>
                </div>
                <div className="chart-badge">{regs.length} total</div>
              </div>
              <div style={{position:"relative"}}>
                <ResponsiveContainer width="100%" height={270}>
                  <PieChart>
                    <Pie data={roscaData} cx="50%" cy="50%" innerRadius={72} outerRadius={112}
                      dataKey="value" nameKey="name" paddingAngle={3} labelLine={false}>
                      {roscaData.map((e,i)=><Cell key={i} fill={e.cor} stroke={cardBg} strokeWidth={3}/>)}
                    </Pie>
                    <Tooltip contentStyle={tip}/>
                  </PieChart>
                </ResponsiveContainer>
                <div style={{position:"absolute",top:"50%",left:"50%",transform:"translate(-50%,-50%)",textAlign:"center",pointerEvents:"none",lineHeight:1}}>
                  <div style={{fontSize:30,fontWeight:900,color:txt,letterSpacing:"-.04em"}}>{regs.length}</div>
                  <div style={{fontSize:11,fontWeight:700,color:isDark?"#5E7252":"#7A8F70",marginTop:4,textTransform:"uppercase",letterSpacing:".06em"}}>locais</div>
                </div>
              </div>
              <div className="chart-leg">
                {roscaData.map((d,i)=>(
                  <div key={i} className="leg-item"><div className="leg-dot" style={{background:d.cor}}/><span>{d.name} <strong>({d.value})</strong></span></div>
                ))}
              </div>
            </div>

            <div className="chart-card">
              <div className="chart-head">
                <div>
                  <div className="chart-title">Evolução — 30 dias</div>
                  <div className="chart-sub">Vistorias realizadas e cortes registrados</div>
                </div>
                <div className="chart-badge" style={{background:isDark?"rgba(21,128,61,.2)":"#DCFCE7",color:"#15803D",border:"1px solid #86EFAC"}}>
                  {areaData.reduce((a,b)=>a+b.vistorias,0)} vistorias
                </div>
              </div>
              <ResponsiveContainer width="100%" height={270}>
                <AreaChart data={areaData} margin={{top:8,right:10,left:-15,bottom:0}}>
                  <defs>
                    <linearGradient id="gV" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#15803D" stopOpacity={.5}/>
                      <stop offset="95%" stopColor="#15803D" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="gC" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#1D4ED8" stopOpacity={.45}/>
                      <stop offset="95%" stopColor="#1D4ED8" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={gridC} vertical={false}/>
                  <XAxis dataKey="dia" tick={{fontSize:10,fill:isDark?"#9AB088":"#4A5E40"}} interval={6} axisLine={false} tickLine={false}/>
                  <YAxis tick={{fontSize:11,fill:isDark?"#9AB088":"#4A5E40"}} allowDecimals={false} axisLine={false} tickLine={false} width={28}/>
                  <Tooltip contentStyle={tip}/>
                  <Area type="monotone" dataKey="vistorias" name="Vistorias" stroke="#15803D" strokeWidth={2.5} fill="url(#gV)" dot={false} activeDot={{r:5,fill:"#15803D",strokeWidth:0}}/>
                  <Area type="monotone" dataKey="cortes"    name="Cortes"    stroke="#1D4ED8" strokeWidth={2}   fill="url(#gC)" dot={false} activeDot={{r:5,fill:"#1D4ED8",strokeWidth:0}}/>
                </AreaChart>
              </ResponsiveContainer>
              <div className="chart-leg">
                {[["#15803D","Vistorias"],["#1D4ED8","Cortes"]].map(([c,l])=>(
                  <div key={l} className="leg-item"><div className="leg-dot" style={{background:c}}/><span>{l}</span></div>
                ))}
              </div>
            </div>
          </div>

          <div className="chart-card">
            <div className="chart-head">
              <div>
                <div className="chart-title">Situação por bairro</div>
                <div className="chart-sub">Ordenado por criticidade — maior urgência no topo</div>
              </div>
              <div className="chart-badge">{barData.length} bairro(s)</div>
            </div>
            <div className="bar-chart-scroll">
              <ResponsiveContainer width="100%" height={Math.min(500,Math.max(240,barData.length*28+48))}>
                <BarChart data={barData} layout="vertical" barSize={14} margin={{top:4,right:24,left:0,bottom:4}}>
                  <CartesianGrid strokeDasharray="3 3" stroke={gridC} horizontal={false}/>
                  <XAxis type="number" tick={{fontSize:10,fill:isDark?"#9AB088":"#4A5E40"}} allowDecimals={false} axisLine={false} tickLine={false}/>
                  <YAxis type="category" dataKey="bairro" width={148} tick={{fontSize:11,fill:isDark?"#9AB088":"#4A5E40",fontWeight:600}} axisLine={false} tickLine={false}/>
                  <Tooltip contentStyle={tip} cursor={{fill:isDark?"rgba(255,255,255,.04)":"rgba(13,26,8,.04)"}} formatter={(v,n)=>[v,n]}/>
                  <Bar dataKey="critico" name="Crítico" stackId="a" fill="#B91C1C"/>
                  <Bar dataKey="alta"    name="Alta"    stackId="a" fill="#C2410C"/>
                  <Bar dataKey="media"   name="Média"   stackId="a" fill="#A16207"/>
                  <Bar dataKey="baixa"   name="Curta"   stackId="a" fill="#15803D"/>
                  <Bar dataKey="cortada" name="Cortada" stackId="a" fill="#1D4ED8" radius={[0,6,6,0]}/>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="chart-leg">
              {[["#B91C1C","Crítico"],["#C2410C","Alta"],["#A16207","Média"],["#15803D","Curta"],["#1D4ED8","Cortada"]].map(([c,l])=>(
                <div key={l} className="leg-item"><div className="leg-dot" style={{background:c}}/><span>{l}</span></div>
              ))}
            </div>
          </div>
        </>
      )}

      <div className="card">
        <div className="card-header">
          <h3 className="card-title">Locais cadastrados</h3>
          <span style={{fontSize:12,color:"var(--text-3)",fontWeight:600}}>{listaLocais.length} de {regs.length}</span>
        </div>
        {regs.length===0?<p className="vazio">Nenhuma vistoria ainda.</p>:<>
          <ListaVistorias registros={listaLocais} onClick={r=>irParaLocal(r)}/>
          {regs.length>6&&(
            <button className="btn-ver-mais" onClick={()=>setVerMais(!verMais)}>
              {verMais?"Ver menos ▲":`Ver mais (${regs.length-6} restantes) ▼`}
            </button>
          )}
        </>}
      </div>
    </div>
  );
}

// ── MAPA ─────────────────────────────────────────────────────────────────────
function Mapa({registros,irParaLocal}){
  const [tipo,setTipo]=useState("locais");
  const porBairro={};
  registros.forEach(r=>{
    const status=statusEfetivo(r);
    if(!porBairro[r.bairro]) porBairro[r.bairro]={critico:0,alta:0,media:0,baixa:0,cortada:0,total:0};
    porBairro[r.bairro][status]=(porBairro[r.bairro][status]||0)+1;
    porBairro[r.bairro].total++;
  });
  const corBairro=v=>{
    if(v.critico>0) return "#B91C1C";
    if(v.alta>0)    return "#C2410C";
    if(v.media>0)   return "#A16207";
    if(v.baixa>0)   return "#15803D";
    return "#1D4ED8";
  };
  const registrosNoMapa=registros.filter(r=>r.latitude&&r.longitude);
  const renderGeo=(r)=>{
    const status=statusEfetivo(r);const cfg=STATUS[status]||STATUS.baixa;
    let geo=null;
    try{geo=r.geometria?JSON.parse(r.geometria):null;}catch(e){}
    if(!geo) return null;
    const opts={color:cfg.cor,fillColor:cfg.cor,fillOpacity:.3,weight:3};
    const popup=(
      <Popup>
        <div style={{minWidth:180}}>
          <p style={{fontWeight:700,fontSize:14,marginBottom:4}}>{r.local}</p>
          <p style={{fontSize:12,color:"#666",marginBottom:6}}>📍 {r.bairro}</p>
          <p style={{fontSize:12}}>{cfg.emoji} {cfg.label}</p>
          <button onClick={()=>irParaLocal(r)} style={{marginTop:8,width:"100%",padding:"6px 10px",background:"#275214",color:"#fff",border:"none",borderRadius:6,cursor:"pointer",fontSize:12,fontWeight:700}}>Ver detalhes →</button>
        </div>
      </Popup>
    );
    if(geo.tipo==="poligono") return <Polygon key={r.id} positions={geo.pontos} pathOptions={opts}>{popup}</Polygon>;
    if(geo.tipo==="linha")    return <Polyline key={r.id} positions={geo.pontos} pathOptions={{...opts,fillOpacity:0}}>{popup}</Polyline>;
    return null;
  };
  return(
    <div className="mapa-container">
      <div className="card mapa-controles">
        <div className="mapa-tabs">
          <button className={`mapa-tab ${tipo==="locais"?"ativo":""}`} onClick={()=>setTipo("locais")}>📍 Por local ({registrosNoMapa.length})</button>
          <button className={`mapa-tab ${tipo==="bairros"?"ativo":""}`} onClick={()=>setTipo("bairros")}>🗺️ Por bairro ({Object.keys(porBairro).length})</button>
        </div>
        <div style={{display:"flex",gap:12,flexWrap:"wrap"}}>
          {[["#B91C1C","Crítico"],["#C2410C","Alta"],["#A16207","Média"],["#15803D","Curta"],["#1D4ED8","Cortada"]].map(([c,l])=>(
            <div key={l} className="leg-item"><div className="leg-dot" style={{background:c}}/><span>{l}</span></div>
          ))}
        </div>
      </div>
      <div className="mapa-wrapper">
        <MapContainer center={[-23.9608,-46.3336]} zoom={13} style={{height:"100%",width:"100%"}}>
          <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution='&copy; OpenStreetMap'/>
          {tipo==="bairros"&&Object.entries(porBairro).map(([bairro,v])=>{
            const coords=COORDS_BAIRROS[bairro]; if(!coords) return null;
            const cor=corBairro(v); const raio=Math.max(12,Math.min(36,v.total*8));
            return(
              <CircleMarker key={bairro} center={coords} radius={raio} pathOptions={{color:cor,fillColor:cor,fillOpacity:.7,weight:2}}>
                <Popup>
                  <div style={{minWidth:160}}>
                    <p style={{fontWeight:700,fontSize:14,marginBottom:6}}>{bairro}</p>
                    {v.critico>0&&<p style={{color:"#B91C1C",fontSize:12}}>🔴 Crítico: {v.critico}</p>}
                    {v.alta>0&&<p style={{color:"#C2410C",fontSize:12}}>🟠 Alta: {v.alta}</p>}
                    {v.media>0&&<p style={{color:"#A16207",fontSize:12}}>🟡 Média: {v.media}</p>}
                    {v.baixa>0&&<p style={{color:"#15803D",fontSize:12}}>🟢 Curta: {v.baixa}</p>}
                    {v.cortada>0&&<p style={{color:"#1D4ED8",fontSize:12}}>✂️ Cortada: {v.cortada}</p>}
                  </div>
                </Popup>
              </CircleMarker>
            );
          })}
          {tipo==="locais"&&registros.map(r=>{
            if(r.geometria) return renderGeo(r);
            if(!r.latitude||!r.longitude) return null;
            const status=statusEfetivo(r);const cfg=STATUS[status]||STATUS.baixa;
            return(
              <CircleMarker key={r.id} center={[r.latitude,r.longitude]} radius={10}
                pathOptions={{color:cfg.cor,fillColor:cfg.cor,fillOpacity:.85,weight:2}}>
                <Popup>
                  <div style={{minWidth:180}}>
                    <p style={{fontWeight:700,fontSize:14,marginBottom:4}}>{r.local}</p>
                    <p style={{fontSize:12,color:"#666",marginBottom:6}}>📍 {r.bairro}</p>
                    <p style={{fontSize:12,marginBottom:4}}>{cfg.emoji} {cfg.label}</p>
                    {r.metragem&&<p style={{fontSize:12,color:"#666"}}>📐 {r.metragem}m²</p>}
                    <button onClick={()=>irParaLocal(r)} style={{marginTop:8,width:"100%",padding:"6px 10px",background:"#275214",color:"#fff",border:"none",borderRadius:6,cursor:"pointer",fontSize:12,fontWeight:700}}>Ver detalhes →</button>
                  </div>
                </Popup>
              </CircleMarker>
            );
          })}
        </MapContainer>
      </div>
    </div>
  );
}

// ── GRAMAS ────────────────────────────────────────────────────────────────────
function Gramas({registros,filtroInicial,localFoco,setLocalFoco,registrarCorte,atualizar,deletar,showToast}){
  const [filtro,setFiltro]=useState(filtroInicial?.status||"");
  const [filtroB,setFiltroB]=useState(filtroInicial?.bairro||"");
  const [sel,setSel]=useState(null);
  const [editando,setEditando]=useState(null);
  const [excluindo,setExcluindo]=useState(null);

  useEffect(()=>{setFiltro(filtroInicial?.status||"");setFiltroB(filtroInicial?.bairro||"");},[filtroInicial]);
  useEffect(()=>{if(localFoco){setSel(localFoco);setLocalFoco(null);}},[localFoco,setLocalFoco]);

  if(sel&&!editando&&!excluindo) return <Detalhe registro={sel} voltar={()=>setSel(null)} registrarCorte={registrarCorte}/>;

  const lista=registros
    .filter(r=>!filtro||statusEfetivo(r)===filtro)
    .filter(r=>!filtroB||r.bairro.toLowerCase().includes(filtroB.toLowerCase()));

  return(
    <div>
      <div className="card" style={{marginBottom:16}}>
        <div style={{display:"flex",gap:10,flexWrap:"wrap",alignItems:"center"}}>
          <span style={{fontSize:13,fontWeight:700}}>Filtrar:</span>
          <select value={filtro} onChange={e=>setFiltro(e.target.value)} style={{padding:"7px 12px",borderRadius:8,border:"1px solid var(--border-med)",fontSize:13}}>
            <option value="">Todos os status</option>
            {Object.entries(STATUS).map(([k,v])=><option key={k} value={k}>{v.emoji} {v.label}</option>)}
          </select>
          {/* Bairro com digitação */}
          <div style={{flex:1,minWidth:180,maxWidth:300}}>
            <BairroBusca value={filtroB} onChange={setFiltroB} placeholder="Buscar bairro..."/>
          </div>
          {filtroB&&<button onClick={()=>setFiltroB("")} style={{background:"transparent",border:"none",cursor:"pointer",fontSize:13,color:"var(--text-3)",fontWeight:600}}>✕</button>}
          <span style={{fontSize:12,color:"var(--text-3)",marginLeft:"auto",fontWeight:600}}>{lista.length} local(is)</span>
        </div>
      </div>

      {lista.length===0?<div className="card"><p className="vazio">Nenhum local encontrado.</p></div>:
        <div className="gramas-grid">
          {lista.map(r=>{
            const status=statusEfetivo(r);const cfg=STATUS[status]||STATUS.baixa;
            const corte=new Date(r.data);corte.setDate(corte.getDate()+(r.dias_corte||0));
            const diff=Math.ceil((corte-new Date())/86400000);
            return(
              <div key={r.id} className="grama-card">
                <div className="grama-foto" onClick={()=>setSel(r)}>
                  {r.foto?<img src={r.foto} alt={r.local}/>:<div className="grama-foto-vazia">🌿</div>}
                  <span className="grama-badge" style={{background:cfg.bg,color:cfg.texto}}>{cfg.emoji} {cfg.label}</span>
                </div>
                <div className="grama-info" onClick={()=>setSel(r)}>
                  <h4>{r.local}</h4>
                  <p className="grama-bairro">📍 {r.bairro}</p>
                  {r.metragem&&<p className="grama-meta">📐 {r.metragem}m²</p>}
                  <p className="grama-meta">📅 {new Date(r.data+"T12:00:00").toLocaleDateString("pt-BR")}</p>
                  <p className="grama-corte" style={{color:diff<=0?"#B91C1C":diff<=3?"#C2410C":"var(--text-3)"}}>
                    ✂️ {diff<=0?"Atrasado!":diff<=3?`Em ${diff}d!`:`Em ${diff}d`}
                  </p>
                </div>
                <div className="grama-acoes">
                  <button className="btn-editar" onClick={()=>setEditando(r)}>✏️ Editar</button>
                  <button className="btn-deletar" onClick={()=>setExcluindo(r)}>🗑️</button>
                </div>
              </div>
            );
          })}
        </div>
      }

      {editando&&(
        <Modal titulo="✏️ Editar vistoria" onClose={()=>setEditando(null)}>
          <FormEditar
            registro={editando}
            onSalvar={async(form)=>{const ok=await atualizar(editando.id,form);if(ok)setEditando(null);}}
            onCancelar={()=>setEditando(null)}
          />
        </Modal>
      )}

      {excluindo&&(
        <Modal titulo="🗑️ Remover vistoria" onClose={()=>setExcluindo(null)}>
          <p style={{fontSize:14,color:"var(--text-2)",lineHeight:1.7,marginBottom:8}}>
            Tem certeza que quer remover <strong>{excluindo.local}</strong>?<br/>Esta ação não pode ser desfeita.
          </p>
          <div className="modal-acoes">
            <button className="btn-cancelar" onClick={()=>setExcluindo(null)}>Cancelar</button>
            <button className="btn-confirm-del" onClick={async()=>{await deletar(excluindo.id);setExcluindo(null);}}>Sim, remover</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function FormEditar({registro,onSalvar,onCancelar}){
  const bairrosIniciais=registro.bairro.split("/").map(b=>b.trim()).filter(b=>BAIRROS.includes(b));
  const [form,setForm]=useState({
    local:registro.local||"",
    bairros:bairrosIniciais.length>0?bairrosIniciais:[registro.bairro].filter(Boolean),
    metragem:registro.metragem||"",
    data:registro.data||"",
    status:registro.status||"",
    altura:registro.altura||"",
    diasCorte:registro.dias_corte||"",
    obs:registro.obs||"",
  });
  const [salvando,setSalvando]=useState(false);
  const set=(k,v)=>setForm(f=>({...f,[k]:v}));
  const handleSubmit=async()=>{
    if(!form.local||form.bairros.length===0||!form.status) return;
    setSalvando(true);
    await onSalvar({...form,bairro:form.bairros.join(" / ")});
    setSalvando(false);
  };
  return(
    <div style={{display:"flex",flexDirection:"column",gap:14}}>
      <div className="form-grid">
        <div className="form-group"><label>Local / Endereço</label><input value={form.local} onChange={e=>set("local",e.target.value)}/></div>
        <div className="form-group"><label>Metragem (m²)</label><input type="number" value={form.metragem} onChange={e=>set("metragem",e.target.value)}/></div>
      </div>
      <div className="form-group">
        <label>Bairros ({form.bairros.length} selecionado{form.bairros.length!==1?"s":""})</label>
        <BairrosSelect value={form.bairros} onChange={v=>set("bairros",v)}/>
      </div>
      <div className="form-grid">
        <div className="form-group"><label>Data</label><input type="date" value={form.data} onChange={e=>set("data",e.target.value)}/></div>
        <div className="form-group">
          <label>Classificação</label>
          <select value={form.status} onChange={e=>set("status",e.target.value)}>
            <option value="">Selecione...</option>
            {Object.entries(STATUS).map(([k,v])=><option key={k} value={k}>{v.emoji} {v.label}</option>)}
          </select>
        </div>
        <div className="form-group"><label>Dias p/ corte</label><input type="number" value={form.diasCorte} onChange={e=>set("diasCorte",e.target.value)}/></div>
      </div>
      <div className="form-group"><label>Observações</label><textarea value={form.obs} onChange={e=>set("obs",e.target.value)}/></div>
      <div className="modal-acoes">
        <button className="btn-cancelar" onClick={onCancelar}>Cancelar</button>
        <button className="btn-salvar" onClick={handleSubmit} disabled={salvando} style={{minWidth:140}}>{salvando?"Salvando...":"Salvar alterações"}</button>
      </div>
    </div>
  );
}

function Detalhe({registro:r,voltar,registrarCorte}){
  const status=statusEfetivo(r);const cfg=STATUS[status]||STATUS.baixa;
  const corte=new Date(r.data);corte.setDate(corte.getDate()+(r.dias_corte||0));
  const diff=Math.ceil((corte-new Date())/86400000);
  const diasDesde=Math.ceil((new Date()-new Date(r.data+"T12:00:00"))/86400000);
  const cresc=r.crescimento_estimado_cm!=null?Number(r.crescimento_estimado_cm).toFixed(1):(diasDesde/7*cfg.cresc*10).toFixed(1);
  const pct=Math.min(100,diasDesde/30*100);
  const [registrando,setRegistrando]=useState(false);
  const handleCorte=async()=>{setRegistrando(true);await registrarCorte(r);setRegistrando(false);voltar();};
  return(
    <div>
      <button className="btn-voltar-detalhe" onClick={voltar}>← Voltar</button>
      <div className="card" style={{marginTop:12}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:16,flexWrap:"wrap",gap:12}}>
          <div>
            <h2 style={{fontSize:22,fontWeight:800,marginBottom:4,color:"var(--text)"}}>{r.local}</h2>
            <p style={{fontSize:14,color:"var(--text-2)"}}>📍 {r.bairro}{r.metragem?` · ${r.metragem}m²`:""}</p>
          </div>
          <span className="badge" style={{background:cfg.bg,color:cfg.texto,fontSize:14,padding:"8px 18px"}}>{cfg.emoji} {cfg.label}</span>
        </div>
        {r.foto&&(
          <div style={{background:"var(--bg-soft)",borderRadius:12,border:"1px solid var(--border)",marginBottom:16,overflow:"hidden"}}>
            <img src={r.foto} alt={r.local} style={{width:"100%",maxHeight:320,objectFit:"contain",display:"block",padding:8}}/>
          </div>
        )}
        <div className="detalhe-grid">
          <div className="detalhe-item"><span className="detalhe-label">📅 Data da vistoria</span><span className="detalhe-val">{new Date(r.data+"T12:00:00").toLocaleDateString("pt-BR")}</span></div>
          <div className="detalhe-item"><span className="detalhe-label">⏱️ Dias desde vistoria</span><span className="detalhe-val">{diasDesde} dias</span></div>
          <div className="detalhe-item"><span className="detalhe-label">📏 Altura registrada</span><span className="detalhe-val">{r.altura||"Não informada"}</span></div>
          <div className="detalhe-item"><span className="detalhe-label">✂️ Próximo corte</span>
            <span className="detalhe-val" style={{color:diff<=0?"#B91C1C":diff<=3?"#C2410C":"inherit"}}>
              {diff<=0?"⚠️ Atrasado!":diff<=3?`🚨 Em ${diff} dias`:`✅ Em ${diff} dias`}
            </span>
          </div>
          {r.obs&&<div className="detalhe-item full"><span className="detalhe-label">📝 Observações</span><span className="detalhe-val">{r.obs}</span></div>}
        </div>
        <div className="crescimento-box">
          <h4>🌱 Estimativa de crescimento</h4>
          <p>Em <strong>{diasDesde} dias</strong>, a grama cresceu aproximadamente <strong>{cresc}cm</strong>.</p>
          <div style={{marginTop:10}}>
            <div style={{display:"flex",justifyContent:"space-between",fontSize:12,color:"var(--text-3)",marginBottom:4,fontWeight:600}}>
              <span>Crescimento estimado</span><span>{pct.toFixed(0)}% do ciclo</span>
            </div>
            <div style={{height:10,background:"var(--border)",borderRadius:99,overflow:"hidden"}}>
              <div style={{height:"100%",width:`${pct}%`,background:cfg.cor,borderRadius:99,transition:"width .6s"}}/>
            </div>
          </div>
        </div>
        {status!=="cortada"&&<button className="btn-renovar" onClick={handleCorte} disabled={registrando}>{registrando?"Registrando...":"✂️ Registrar corte"}</button>}
        {status==="cortada"&&<div className="info-cortada">✅ Área cortada recentemente. Em breve passará para "Grama curta".</div>}
      </div>
    </div>
  );
}

// ── VISTORIA com busca de endereço estilo Google Maps ─────────────────────────
function Vistoria({salvar,voltar}){
  const [form,setForm]=useState({
    local:"",bairros:[],metragem:"",
    data:new Date().toISOString().split("T")[0],
    status:"",altura:"",diasCorte:"",obs:"",foto:null,
    latitude:null,longitude:null,geometria:null,
  });
  const [erro,setErro]=useState("");
  const [salvando,setSalvando]=useState(false);
  const [analisando,setAnalisando]=useState(false);
  const [resIA,setResIA]=useState(null);
  const [mapaAberto,setMapaAberto]=useState(false);
  const [modoDesenho,setModoDesenho]=useState("ponto");
  const [pontosDesenho,setPontosDesenho]=useState([]);
  const [coordsMapa,setCoordsMapa]=useState(null);

  const set=(k,v)=>setForm(f=>({...f,[k]:v}));

  const handleSelectEndereco=(info)=>{
    set("latitude",info.lat);
    set("longitude",info.lng);
    setCoordsMapa([info.lat,info.lng]);
    setMapaAberto(true);
    // preenche bairro automaticamente se encontrou
    if(info.bairro&&form.bairros.length===0){
      const bairroEncontrado=BAIRROS.find(b=>b.toLowerCase()===info.bairro.toLowerCase());
      if(bairroEncontrado) set("bairros",[bairroEncontrado]);
    }
    setPontosDesenho([]);
    set("geometria",null);
  };

  const handleFoto=async(e)=>{
    const file=e.target.files[0];if(!file) return;
    const reader=new FileReader();
    reader.onload=ev=>set("foto",ev.target.result);
    reader.readAsDataURL(file);
    setAnalisando(true);setResIA(null);
    try{
      const tmImage=await import('@teachablemachine/image');
      const URL_M="https://teachablemachine.withgoogle.com/models/OqjPHgl8hh/";
      const model=await tmImage.load(URL_M+"model.json",URL_M+"metadata.json");
      const img=document.createElement("img");
      img.crossOrigin="anonymous";img.src=URL.createObjectURL(file);
      await new Promise((r,j)=>{img.onload=r;img.onerror=j;});
      const preds=await model.predict(img);
      const m=preds.reduce((a,b)=>a.probability>b.probability?a:b);
      const mapa={"Grama Alta":"alta","Grama Media":"media","Grama Média":"media","Grama Baixa":"baixa"};
      const st=mapa[m.className]||"media";
      setResIA({classe:m.className,conf:Math.round(m.probability*100),status:st,todas:preds});
      set("status",st);set("diasCorte",STATUS[st]?.dias||10);
    }catch(err){setResIA({erro:"Não foi possível analisar."});}
    setAnalisando(false);
  };

  const handleMapClick=(lat,lng)=>{
    if(modoDesenho==="ponto"){set("latitude",lat);set("longitude",lng);setCoordsMapa([lat,lng]);set("geometria",null);setPontosDesenho([]);}
  };
  const handlePolyClick=(ponto)=>{
    const novos=[...pontosDesenho,ponto];
    setPontosDesenho(novos);
    set("geometria",{tipo:modoDesenho,pontos:novos});
    set("latitude",novos[0][0]);set("longitude",novos[0][1]);
  };
  const limparDesenho=()=>{setPontosDesenho([]);set("geometria",null);set("latitude",null);set("longitude",null);setCoordsMapa(null);};

  const handleSubmit=async()=>{
    if(!form.local){setErro("Informe o local.");return;}
    if(form.bairros.length===0){setErro("Selecione ao menos um bairro.");return;}
    if(!form.status){setErro("Selecione a classificação.");return;}
    setErro("");setSalvando(true);
    const ok=await salvar(form);setSalvando(false);
    if(ok) setTimeout(()=>voltar(),500);
    else setErro("Erro ao salvar.");
  };

  const temLoc=form.latitude||form.geometria;

  return(
    <div className="vistoria-completa">
      <div className="card vistoria-header">
        <h2 style={{fontSize:18,fontWeight:800,marginBottom:4,color:"var(--text)"}}>Registrar nova vistoria</h2>
        <p style={{fontSize:13,color:"var(--text-2)"}}>Preencha os dados e envie uma foto para classificação automática por IA</p>
      </div>
      {erro&&<div className="msg-erro">{erro}</div>}

      <div className="card vistoria-secao">
        <h3 className="secao-titulo">📍 Localização</h3>

        {/* BUSCA ESTILO GOOGLE MAPS */}
        <div className="form-group" style={{marginBottom:14}}>
          <label>Endereço / Local *</label>
          <BuscaEndereco
            value={form.local}
            onChange={v=>set("local",v)}
            onSelect={handleSelectEndereco}
            placeholder="Digite o endereço ou nome do local"
          />
          <span className="form-hint">Sugestões aparecem automaticamente enquanto você digita</span>
        </div>

        <div className="form-grid-3" style={{marginBottom:14}}>
          <div className="form-group">
            <label>Metragem (m²)</label>
            <input type="number" placeholder="Ex: 150" value={form.metragem} onChange={e=>set("metragem",e.target.value)}/>
          </div>
          <div className="form-group">
            <label>Data da vistoria</label>
            <input type="date" value={form.data} onChange={e=>set("data",e.target.value)}/>
          </div>
          <div className="form-group">
            <label>Altura estimada</label>
            <input placeholder="Ex: 25 cm" value={form.altura} onChange={e=>set("altura",e.target.value)}/>
          </div>
        </div>

        <div className="form-group" style={{marginBottom:14}}>
          <label>Bairros * ({form.bairros.length} selecionado{form.bairros.length!==1?"s":""})</label>
          <BairrosSelect value={form.bairros} onChange={v=>set("bairros",v)} placeholder="Digite para buscar bairros..."/>
          <span className="form-hint">Pode selecionar mais de um caso o local cubra bairros diferentes</span>
        </div>

        {/* MAPA INTERATIVO */}
        <div className="mapa-marcar-wrapper">
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10,flexWrap:"wrap",gap:8}}>
            <div>
              <p style={{fontSize:13,fontWeight:700,color:"var(--text)",marginBottom:2}}>
                📌 Localização no mapa <span style={{fontSize:11,fontWeight:500,color:"var(--text-3)"}}>(opcional)</span>
              </p>
              <p style={{fontSize:11,color:"var(--text-3)"}}>
                {temLoc?"Local marcado — ajuste clicando no mapa se necessário":"Ao buscar o endereço acima o mapa marca automaticamente. Ou clique para marcar manualmente."}
              </p>
            </div>
            <button className="btn-toggle-mapa" onClick={()=>setMapaAberto(!mapaAberto)}>
              {mapaAberto?"Fechar mapa ▲":"Abrir mapa ▼"}
            </button>
          </div>

          {temLoc&&(
            <div className="coord-info">
              <span>
                {form.geometria
                  ?`✅ ${form.geometria.tipo==="poligono"?"Polígono":"Linha"} com ${pontosDesenho.length} pontos`
                  :`✅ Ponto marcado: ${Number(form.latitude).toFixed(5)}, ${Number(form.longitude).toFixed(5)}`
                }
              </span>
              <button className="btn-limpar-coord" onClick={limparDesenho}>Remover</button>
            </div>
          )}

          {mapaAberto&&(
            <>
              <div className="draw-toolbar">
                <span style={{fontSize:10,fontWeight:800,color:"var(--text-3)",textTransform:"uppercase",letterSpacing:".06em"}}>Modo:</span>
                {[{id:"ponto",icon:"📍",label:"Ponto"},{id:"poligono",icon:"🔷",label:"Polígono"},{id:"linha",icon:"📏",label:"Linha"}].map(m=>(
                  <button key={m.id} className={`draw-btn ${modoDesenho===m.id?"ativo":""}`}
                    onClick={()=>{setModoDesenho(m.id);limparDesenho();}}>
                    {m.icon} {m.label}
                  </button>
                ))}
                {pontosDesenho.length>0&&<span style={{fontSize:11,color:"var(--text-3)",fontWeight:600,marginLeft:4}}>{pontosDesenho.length} ponto(s)</span>}
              </div>
              <div className="mapa-marcar">
                <MapContainer center={coordsMapa||[-23.9608,-46.3336]} zoom={coordsMapa?17:13} style={{height:"100%",width:"100%"}}>
                  <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution='&copy; OpenStreetMap'/>
                  {coordsMapa&&<MapaFlyTo coords={coordsMapa}/>}
                  {modoDesenho==="ponto"&&<MapClicker onMark={handleMapClick}/>}
                  {(modoDesenho==="poligono"||modoDesenho==="linha")&&<PolyDrawer modo={modoDesenho} onAddPonto={handlePolyClick}/>}
                  {modoDesenho==="ponto"&&form.latitude&&form.longitude&&(
                    <CircleMarker center={[form.latitude,form.longitude]} radius={12}
                      pathOptions={{color:"#275214",fillColor:"#15803D",fillOpacity:.85,weight:3}}/>
                  )}
                  {(modoDesenho==="poligono"||modoDesenho==="linha")&&pontosDesenho.length>0&&(
                    <>
                      {pontosDesenho.map((p,i)=><CircleMarker key={i} center={p} radius={6} pathOptions={{color:"#275214",fillColor:"#15803D",fillOpacity:1,weight:2}}/>)}
                      {pontosDesenho.length>1&&modoDesenho==="poligono"&&<Polygon positions={pontosDesenho} pathOptions={{color:"#275214",fillColor:"#15803D",fillOpacity:.2,weight:2,dashArray:"6"}}/>}
                      {pontosDesenho.length>1&&modoDesenho==="linha"&&<Polyline positions={pontosDesenho} pathOptions={{color:"#275214",weight:3,dashArray:"8"}}/>}
                    </>
                  )}
                </MapContainer>
              </div>
              <p className="mapa-instrucao">
                {modoDesenho==="ponto"&&"Clique no mapa para marcar o local exato"}
                {modoDesenho==="poligono"&&"Clique para adicionar vértices do polígono"}
                {modoDesenho==="linha"&&"Clique para traçar uma linha (calçada, beira de avenida)"}
              </p>
            </>
          )}
        </div>
      </div>

      <div className="card vistoria-secao">
        <h3 className="secao-titulo">📷 Foto + Análise por IA</h3>
        <div className="upload-area">
          <label className="upload-label">
            <input type="file" accept="image/*" onChange={handleFoto} style={{display:"none"}}/>
            {!form.foto?(
              <div className="upload-placeholder">
                <div className="upload-icon">📸</div>
                <p style={{fontSize:15,fontWeight:700,marginBottom:4,color:"var(--text)"}}>Clique para enviar foto</p>
                <p style={{fontSize:12,color:"var(--text-3)"}}>JPG, PNG até 10MB</p>
              </div>
            ):(
              <div className="upload-preview">
                <img src={form.foto} alt="preview"/>
                <div className="upload-trocar">🔄 Clique para trocar a foto</div>
              </div>
            )}
          </label>
        </div>
        {analisando&&<div className="ia-loading"><span className="ia-spinner">🔄</span> Analisando com IA...</div>}
        {resIA&&!resIA.erro&&(
          <div className="ia-resultado">
            <div className="ia-resultado-header">
              <span style={{fontSize:20}}>🤖</span>
              <div>
                <p style={{fontWeight:800,color:"var(--green-8)",fontSize:14}}>{resIA.classe}</p>
                <p style={{fontSize:11,color:"var(--text-3)"}}>{resIA.conf}% de confiança</p>
              </div>
            </div>
            {resIA.todas.map(p=>(
              <div key={p.className} style={{marginBottom:6}}>
                <div style={{display:"flex",justifyContent:"space-between",fontSize:11,marginBottom:2,fontWeight:600}}>
                  <span style={{color:"var(--text-2)"}}>{p.className}</span>
                  <span style={{color:"var(--text)"}}>{Math.round(p.probability*100)}%</span>
                </div>
                <div style={{height:5,background:"var(--border)",borderRadius:99,overflow:"hidden"}}>
                  <div style={{height:"100%",width:`${Math.round(p.probability*100)}%`,background:"var(--green-5)",borderRadius:99}}/>
                </div>
              </div>
            ))}
          </div>
        )}
        {resIA?.erro&&<div className="ia-erro">⚠️ {resIA.erro}</div>}
      </div>

      <div className="card vistoria-secao">
        <h3 className="secao-titulo">🌿 Classificação da Grama</h3>
        <div className="status-btns">
          {Object.entries(STATUS).map(([key,cfg])=>(
            <button key={key} type="button"
              className={`status-btn ${form.status===key?"selecionado":""}`}
              style={form.status===key?{background:cfg.bg,borderColor:cfg.cor,color:cfg.texto}:{}}
              onClick={()=>{set("status",key);set("diasCorte",cfg.dias);}}>
              <span style={{fontSize:26,marginBottom:6,display:"block"}}>{cfg.emoji}</span>
              <strong>{cfg.label}</strong>
              <span style={{display:"block",fontSize:11,opacity:.7,marginTop:3}}>{cfg.dias}d p/ corte</span>
            </button>
          ))}
        </div>
      </div>

      <div className="card vistoria-secao">
        <h3 className="secao-titulo">📝 Detalhes adicionais</h3>
        <div className="form-grid">
          <div className="form-group full"><label>Dias até o próximo corte</label><input type="number" placeholder="Ex: 7" value={form.diasCorte} onChange={e=>set("diasCorte",e.target.value)}/></div>
          <div className="form-group full"><label>Observações</label><textarea placeholder="Anote qualquer observação relevante..." value={form.obs} onChange={e=>set("obs",e.target.value)}/></div>
        </div>
      </div>

      <div className="vistoria-acoes">
        <button className="btn-voltar" onClick={voltar}>Cancelar</button>
        <button className="btn-salvar" onClick={handleSubmit} disabled={salvando}>{salvando?"Salvando...":"Salvar vistoria"}</button>
      </div>
    </div>
  );
}

// ── HISTÓRICO ─────────────────────────────────────────────────────────────────
function Historico({registros,irParaLocal}){
  const [filtro,setFiltro]=useState("");
  const [filtroB,setFiltroB]=useState("");
  const lista=registros
    .filter(r=>!filtro||statusEfetivo(r)===filtro)
    .filter(r=>!filtroB||r.bairro.toLowerCase().includes(filtroB.toLowerCase()));
  return(
    <div className="card">
      <div className="card-header" style={{marginBottom:16}}>
        <h3 className="card-title">Todas as vistorias ({lista.length})</h3>
        <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}>
          <select value={filtro} onChange={e=>setFiltro(e.target.value)} style={{padding:"6px 10px",borderRadius:8,border:"1px solid var(--border-med)",fontSize:13}}>
            <option value="">Todos os status</option>
            {Object.entries(STATUS).map(([k,v])=><option key={k} value={k}>{v.emoji} {v.label}</option>)}
          </select>
          <div style={{minWidth:180}}>
            <BairroBusca value={filtroB} onChange={setFiltroB} placeholder="Buscar bairro..."/>
          </div>
          {filtroB&&<button onClick={()=>setFiltroB("")} style={{background:"transparent",border:"none",cursor:"pointer",fontSize:13,color:"var(--text-3)",fontWeight:600}}>✕</button>}
        </div>
      </div>
      {lista.length===0?<p className="vazio">Nenhuma vistoria.</p>:<ListaVistorias registros={lista} onClick={r=>irParaLocal(r)}/>}
    </div>
  );
}

// ── NOTIFICAÇÕES ──────────────────────────────────────────────────────────────
function Notificacoes({notificacoes,irParaLocal}){
  if(!notificacoes.length) return <div className="card"><p className="vazio">🎉 Tudo em dia!</p></div>;
  const cores={
    critico:{bg:"#FEE2E2",borda:"#B91C1C",texto:"#7F1D1D"},
    atrasado:{bg:"#FFEDD5",borda:"#C2410C",texto:"#7C2D12"},
    urgente:{bg:"#FEF3C7",borda:"#A16207",texto:"#713F12"},
    atencao:{bg:"#FEF3C7",borda:"#A16207",texto:"#713F12"},
    novo:{bg:"#DCFCE7",borda:"#15803D",texto:"#14532D"},
    ok:{bg:"#DCFCE7",borda:"#15803D",texto:"#14532D"},
  };
  const grupos={
    "🔴 Ação imediata":notificacoes.filter(n=>["critico","atrasado"].includes(n.tipo)),
    "⚠️ Atenção":notificacoes.filter(n=>["urgente","atencao"].includes(n.tipo)),
    "✅ Recentes":notificacoes.filter(n=>n.tipo==="novo"),
    "🌿 Tranquila":notificacoes.filter(n=>n.tipo==="ok"),
  };
  return(
    <div style={{display:"flex",flexDirection:"column",gap:16}}>
      {Object.entries(grupos).map(([t,l])=>l.length===0?null:(
        <div key={t} className="card">
          <h3 className="card-title">{t} ({l.length})</h3>
          <div style={{display:"flex",flexDirection:"column",gap:10}}>
            {l.map((n,i)=>{
              const c=cores[n.tipo]||cores.ok;const cfg=STATUS[statusEfetivo(n.registro)];
              return(
                <div key={i} style={{padding:"14px 16px",borderRadius:10,background:c.bg,border:`1px solid ${c.borda}`,borderLeft:`4px solid ${c.borda}`,cursor:"pointer"}}
                  onClick={()=>irParaLocal(n.registro)}>
                  <div style={{display:"flex",justifyContent:"space-between",gap:12,alignItems:"flex-start"}}>
                    <div style={{flex:1}}>
                      <p style={{fontWeight:800,fontSize:14,color:c.texto,marginBottom:4}}>{n.titulo}</p>
                      <p style={{fontSize:13,color:"#555",marginBottom:8}}>{n.msg}</p>
                      <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                        {[`📍 ${n.registro.local}`,`🗺️ ${n.registro.bairro}`,n.registro.metragem?`📐 ${n.registro.metragem}m²`:null].filter(Boolean).map((tag,j)=>(
                          <span key={j} style={{fontSize:11,background:"#fff",padding:"2px 8px",borderRadius:99,border:`1px solid ${c.borda}`,color:c.texto,fontWeight:600}}>{tag}</span>
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

// ── CONFIGURAÇÕES ─────────────────────────────────────────────────────────────
function Configuracoes({tema,setTema,sair}){
  return(
    <div style={{display:"flex",flexDirection:"column",gap:16,maxWidth:560}}>
      <div className="card">
        <h3 className="card-title">👤 Perfil</h3>
        <div style={{display:"flex",alignItems:"center",gap:16,marginBottom:20,padding:"14px 16px",background:"var(--bg-soft)",borderRadius:10,border:"1px solid var(--border)"}}>
          <div style={{width:56,height:56,borderRadius:"50%",background:"linear-gradient(135deg,#275214,#1E3A0E)",color:"#fff",display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,fontWeight:800}}>V</div>
          <div>
            <p style={{fontWeight:800,fontSize:16,color:"var(--text)"}}>Victor</p>
            <p style={{fontSize:13,color:"var(--text-3)"}}>Agente de campo · Santos SP</p>
          </div>
        </div>
        <div className="form-grid">
          <div className="form-group"><label>Nome</label><input defaultValue="Victor"/></div>
          <div className="form-group"><label>Cargo</label><input defaultValue="Agente de campo"/></div>
          <div className="form-group full"><label>Email</label><input placeholder="seu@email.com"/></div>
        </div>
        <button className="btn-salvar" style={{marginTop:14}}>Salvar alterações</button>
      </div>
      <div className="card">
        <h3 className="card-title">🎨 Aparência</h3>
        <div style={{display:"flex",gap:12}}>
          {["claro","escuro"].map(t=>(
            <button key={t} onClick={()=>setTema(t)}
              style={{flex:1,padding:"14px",borderRadius:10,border:`2px solid ${tema===t?"var(--green-6)":"var(--border)"}`,background:tema===t?"var(--green-1)":"var(--bg-card)",cursor:"pointer",fontSize:14,fontWeight:tema===t?800:500,color:tema===t?"var(--green-8)":"var(--text-2)",transition:"all .15s"}}>
              {t==="claro"?"☀️ Tema claro":"🌙 Tema escuro"}
            </button>
          ))}
        </div>
      </div>
      <button onClick={sair} style={{padding:"13px",background:"var(--red-bg)",color:"var(--red)",border:"1px solid #FCA5A5",borderRadius:10,fontSize:14,fontWeight:700,cursor:"pointer"}}>
        🚪 Sair da conta
      </button>
    </div>
  );
}

// ── LISTA COMPARTILHADA ───────────────────────────────────────────────────────
function ListaVistorias({registros,onClick}){
  return(
    <div className="lista-recentes">
      {registros.map(r=>{
        const status=statusEfetivo(r);const cfg=STATUS[status]||STATUS.baixa;
        const corte=new Date(r.data);corte.setDate(corte.getDate()+(r.dias_corte||0));
        const diff=Math.ceil((corte-new Date())/86400000);
        return(
          <div key={r.id} className={`recente-item ${onClick?"clicavel":""}`} onClick={()=>onClick&&onClick(r)}>
            <div className="recente-thumb">{r.foto?<img src={r.foto} alt="grama"/>:<span>🌿</span>}</div>
            <div className="recente-info">
              <strong>{r.local}</strong>
              <span>{r.bairro}{r.metragem?` · ${r.metragem}m²`:""}</span>
              <span>{new Date(r.data+"T12:00:00").toLocaleDateString("pt-BR")}</span>
            </div>
            <div className="recente-direita">
              <span className="badge" style={{background:cfg.bg,color:cfg.texto}}>{cfg.emoji} {cfg.label}</span>
              <span className="dias" style={{color:diff<=0?"#B91C1C":"var(--text-3)"}}>{diff<=0?"⚠️ Atrasado!":`Em ${diff}d`}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}