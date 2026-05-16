import { useState, useEffect } from "react";
import { supabase } from "./supabase";
import "./App.css";
import * as tmImage from '@teachablemachine/image';

const BAIRROS = [
  "Aparecida","Boqueirão","Campo Grande","Caneleira","Centro",
  "Chico de Paula","Encruzilhada","Estuário","Gonzaga","José Menino",
  "Macuco","Marapé","Morro de Nova Cintra","Paquetá","Pompéia",
  "Ponta da Praia","Rádio Clube","Saboó","Santa Maria","Santana",
  "Santo Antônio","São Jorge","Valongo","Vila Belmiro","Vila Mathias"
];
const STATUS = {
  critico: { label: "Crítico 🔴", cor: "#C0392B", bg: "#FDEDEC", texto: "#922B21", dias: 0 },
  alta:    { label: "Alta 🚨",    cor: "#E24B4A", bg: "#FCEBEB", texto: "#A32D2D", dias: 3 },
  media:   { label: "Média ⚠️",   cor: "#EF9F27", bg: "#FAEEDA", texto: "#854F0B", dias: 10 },
  baixa:   { label: "Baixa ✅",   cor: "#639922", bg: "#EAF3DE", texto: "#3B6D11", dias: 21 },
};

export default function App() {
  const [tela, setTela] = useState("dashboard");
  const [registros, setRegistros] = useState([]);
  const [carregando, setCarregando] = useState(true);

  const buscarRegistros = async () => {
    setCarregando(true);
    const { data, error } = await supabase
      .from("vistorias")
      .select("*")
      .order("criado_em", { ascending: false });
    if (!error && data) setRegistros(data);
    setCarregando(false);
  };

  useEffect(() => { buscarRegistros(); }, []);

  const salvar = async (form) => {
    const { error } = await supabase.from("vistorias").insert([{
      local:      form.local,
      bairro:     form.bairro,
      metragem:   form.metragem ? Number(form.metragem) : null,
      data:       form.data,
      status:     form.status,
      altura:     form.altura,
      dias_corte: form.diasCorte ? Number(form.diasCorte) : null,
      obs:        form.obs,
      foto:       form.foto || null,
    }]);
    if (!error) await buscarRegistros();
    return !error;
  };

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="sb-logo">
          <span>🌿</span>
          <div>
            <h2>GramaSP</h2>
            <p>Jardins de Santos</p>
          </div>
        </div>
        <nav>
          {[
            { id: "dashboard", icon: "📊", label: "Dashboard" },
            { id: "vistoria",  icon: "📷", label: "Nova Vistoria" },
            { id: "historico", icon: "📋", label: "Histórico" },
            { id: "bairros",   icon: "🗺️", label: "Por Bairro" },
          ].map(item => (
            <button key={item.id}
              className={`nav-item ${tela === item.id ? "active" : ""}`}
              onClick={() => setTela(item.id)}>
              <span>{item.icon}</span>{item.label}
            </button>
          ))}
        </nav>
        <div className="sb-footer">
          <div className="sb-versao">v1.0 — Santos SP</div>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <h1>
            {tela === "dashboard" && "📊 Dashboard Geral"}
            {tela === "vistoria"  && "📷 Nova Vistoria"}
            {tela === "historico" && "📋 Histórico"}
            {tela === "bairros"   && "🗺️ Situação por Bairro"}
          </h1>
          <div style={{display:"flex",alignItems:"center",gap:12}}>
            {carregando && <span style={{fontSize:12,color:"#888"}}>🔄 Sincronizando...</span>}
            {tela !== "vistoria" && (
              <button className="btn-new" onClick={() => setTela("vistoria")}>
                + Nova Vistoria
              </button>
            )}
          </div>
        </header>
        <div className="content">
          {tela === "dashboard" && <Dashboard registros={registros} irPara={setTela} />}
          {tela === "vistoria"  && <Vistoria salvar={salvar} voltar={() => setTela("dashboard")} />}
          {tela === "historico" && <Historico registros={registros} />}
          {tela === "bairros"   && <PorBairro registros={registros} />}
        </div>
      </main>
    </div>
  );
}

// ── DASHBOARD ─────────────────────────────────────────────────────────────────
function Dashboard({ registros, irPara }) {
  const total   = registros.length;
  const critico = registros.filter(r => r.status === "critico").length;
  const alta    = registros.filter(r => r.status === "alta").length;
  const media   = registros.filter(r => r.status === "media").length;
  const baixa   = registros.filter(r => r.status === "baixa").length;

  const urgentes = registros.filter(r => r.status === "critico" || r.status === "alta");

  const hoje = new Date();
  const vencidos = registros.filter(r => {
    const corte = new Date(r.data);
    corte.setDate(corte.getDate() + (r.dias_corte || 0));
    return corte < hoje;
  });

  return (
    <div>
      {urgentes.length > 0 && (
        <div className="alerta-banner">
          🚨 {urgentes.length} local(is) urgente(s): {urgentes.slice(0,3).map(r => `${r.local} (${r.bairro})`).join(", ")}
          {urgentes.length > 3 && ` e mais ${urgentes.length - 3}...`}
        </div>
      )}

      <div className="stats-grid">
        <div className="stat-card">
          <span className="stat-num">{total}</span>
          <span className="stat-label">Total de locais</span>
          <span className="stat-sub">cadastrados</span>
        </div>
        <div className="stat-card" style={{borderTop:"3px solid #C0392B"}}>
          <span className="stat-num" style={{color:"#C0392B"}}>{critico}</span>
          <span className="stat-label">Crítico 🔴</span>
          <span className="stat-sub">corte imediato</span>
        </div>
        <div className="stat-card" style={{borderTop:"3px solid #E24B4A"}}>
          <span className="stat-num" style={{color:"#E24B4A"}}>{alta}</span>
          <span className="stat-label">Alta 🚨</span>
          <span className="stat-sub">até 3 dias</span>
        </div>
        <div className="stat-card" style={{borderTop:"3px solid #EF9F27"}}>
          <span className="stat-num" style={{color:"#EF9F27"}}>{media}</span>
          <span className="stat-label">Média ⚠️</span>
          <span className="stat-sub">até 10 dias</span>
        </div>
        <div className="stat-card" style={{borderTop:"3px solid #639922"}}>
          <span className="stat-num" style={{color:"#639922"}}>{baixa}</span>
          <span className="stat-label">Baixa ✅</span>
          <span className="stat-sub">dentro do prazo</span>
        </div>
        <div className="stat-card" style={{borderTop:"3px solid #A32D2D"}}>
          <span className="stat-num" style={{color:"#A32D2D"}}>{vencidos.length}</span>
          <span className="stat-label">Cortes atrasados</span>
          <span className="stat-sub">precisam atenção</span>
        </div>
      </div>

      <div className="grid2">
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">Vistorias recentes</h3>
            <button className="card-link" onClick={() => irPara("historico")}>Ver todas →</button>
          </div>
          {registros.length === 0
            ? <p className="vazio">Nenhuma vistoria ainda.<br/>Clique em "Nova Vistoria" para começar.</p>
            : <ListaVistorias registros={registros.slice(0,5)} />
          }
        </div>
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">Próximos cortes</h3>
            <button className="card-link" onClick={() => irPara("bairros")}>Ver por bairro →</button>
          </div>
          {registros.length === 0
            ? <p className="vazio">Nenhum corte previsto ainda.</p>
            : <ProximosCortes registros={registros} />
          }
        </div>
      </div>

      <div className="card" style={{marginTop:16}}>
        <div className="card-header">
          <h3 className="card-title">Distribuição por bairro</h3>
        </div>
        <ResumoBairros registros={registros} />
      </div>
    </div>
  );
}

function ListaVistorias({ registros }) {
  return (
    <div className="lista-recentes">
      {registros.map(r => {
        const cfg = STATUS[r.status] || STATUS.baixa;
        const corte = new Date(r.data);
        corte.setDate(corte.getDate() + (r.dias_corte || 0));
        const diff = Math.ceil((corte - new Date()) / 86400000);
        return (
          <div className="recente-item" key={r.id}>
            <div className="recente-thumb">
              {r.foto ? <img src={r.foto} alt="grama" /> : <span>🌿</span>}
            </div>
            <div className="recente-info">
              <strong>{r.local}</strong>
              <span>{r.bairro}{r.metragem ? ` · ${r.metragem}m²` : ""}</span>
              <span>{new Date(r.data + "T12:00:00").toLocaleDateString("pt-BR")}</span>
            </div>
            <div className="recente-direita">
              <span className="badge" style={{background:cfg.bg, color:cfg.texto}}>{cfg.label}</span>
              <span className="dias" style={{color: diff<=0 ? "#C0392B" : "#888"}}>
                {diff<=0 ? "⚠️ Atrasado!" : `Corte em ${diff}d`}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ProximosCortes({ registros }) {
  const sorted = [...registros]
    .map(r => {
      const corte = new Date(r.data);
      corte.setDate(corte.getDate() + (r.dias_corte || 0));
      return { ...r, diff: Math.ceil((corte - new Date()) / 86400000) };
    })
    .sort((a,b) => a.diff - b.diff)
    .slice(0,6);

  return (
    <div style={{display:"flex",flexDirection:"column",gap:10}}>
      {sorted.map(r => {
        const cfg = STATUS[r.status] || STATUS.baixa;
        const pct = Math.max(0, Math.min(100, 100 - (r.diff / 30 * 100)));
        return (
          <div key={r.id}>
            <div style={{display:"flex",justifyContent:"space-between",fontSize:12,marginBottom:4}}>
              <span style={{fontWeight:500}}>{r.local} <span style={{color:"#888",fontWeight:400}}>— {r.bairro}</span></span>
              <span style={{color: r.diff<=0?"#C0392B":r.diff<=3?"#E24B4A":"#888",fontWeight:500}}>
                {r.diff<=0 ? "Atrasado!" : `${r.diff} dias`}
              </span>
            </div>
            <div style={{height:6,background:"#f0f0f0",borderRadius:99,overflow:"hidden"}}>
              <div style={{height:"100%",width:`${pct}%`,background:cfg.cor,borderRadius:99}} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ResumoBairros({ registros }) {
  if (!registros.length) return <p className="vazio">Faça vistorias para ver os dados por bairro.</p>;
  const porBairro = {};
  registros.forEach(r => {
    if (!porBairro[r.bairro]) porBairro[r.bairro] = {critico:0,alta:0,media:0,baixa:0,total:0,metragem:0};
    porBairro[r.bairro][r.status]++;
    porBairro[r.bairro].total++;
    porBairro[r.bairro].metragem += Number(r.metragem)||0;
  });
  return (
    <table className="tabela">
      <thead>
        <tr>
          <th>Bairro</th>
          <th style={{color:"#C0392B"}}>Crítico</th>
          <th style={{color:"#E24B4A"}}>Alta</th>
          <th style={{color:"#854F0B"}}>Média</th>
          <th style={{color:"#3B6D11"}}>Baixa</th>
          <th>Total</th>
          <th>Metragem</th>
        </tr>
      </thead>
      <tbody>
        {Object.entries(porBairro)
          .sort((a,b)=>(b[1].critico+b[1].alta)-(a[1].critico+a[1].alta))
          .map(([b,v]) => (
          <tr key={b}>
            <td style={{fontWeight:500}}>{b}</td>
            <td style={{textAlign:"center",color:"#C0392B",fontWeight:v.critico>0?"600":"400"}}>{v.critico||0}</td>
            <td style={{textAlign:"center",color:"#E24B4A"}}>{v.alta||0}</td>
            <td style={{textAlign:"center",color:"#854F0B"}}>{v.media||0}</td>
            <td style={{textAlign:"center",color:"#3B6D11"}}>{v.baixa||0}</td>
            <td style={{textAlign:"center",fontWeight:500}}>{v.total}</td>
            <td style={{textAlign:"center",color:"#666"}}>{v.metragem>0?`${v.metragem}m²`:"—"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ── NOVA VISTORIA ─────────────────────────────────────────────────────────────
// ── NOVA VISTORIA COM IA ──────────────────────────────────────────────────────
// ── NOVA VISTORIA COM IA ──────────────────────────────────────────────────────
function Vistoria({ salvar, voltar }) {
  const [form, setForm] = useState({
    local:"", bairro:"", metragem:"",
    data: new Date().toISOString().split("T")[0],
    status:"", altura:"", diasCorte:"", obs:"", foto:null
  });
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [salvo, setSalvo] = useState(false);
  const [analisando, setAnalisando] = useState(false);
  const [resultadoIA, setResultadoIA] = useState(null);

  const MODEL_URL = "https://teachablemachine.withgoogle.com/models/OqjPHgl8hh/";

  const set = (campo, valor) => setForm(f => ({...f, [campo]:valor}));

  const handleFoto = async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  // Mostra preview
  const reader = new FileReader();
  reader.onload = ev => set("foto", ev.target.result);
  reader.readAsDataURL(file);

  // Analisa com IA
  setAnalisando(true);
  setResultadoIA(null);

  try {
    const tmImage = await import('@teachablemachine/image');
    const MODEL_URL = "https://teachablemachine.withgoogle.com/models/OqjPHgl8hh/";
    const modelURL = MODEL_URL + "model.json";
    const metaURL  = MODEL_URL + "metadata.json";

    const model = await tmImage.load(modelURL, metaURL);

    const img = document.createElement("img");
    img.crossOrigin = "anonymous";
    img.src = URL.createObjectURL(file);
    await new Promise((res, rej) => {
      img.onload = res;
      img.onerror = rej;
    });

    const predictions = await model.predict(img);

    const melhor = predictions.reduce((a, b) =>
      a.probability > b.probability ? a : b
    );

    const mapa = {
      "Grama Alta":  "alta",
      "Grama Media": "media",
      "Grama Média": "media",
      "Grama Baixa": "baixa",
    };

    const statusDetectado = mapa[melhor.className] || "media";
    const confianca = Math.round(melhor.probability * 100);

    setResultadoIA({
      classe: melhor.className,
      confianca,
      status: statusDetectado,
      todas: predictions
    });

    set("status", statusDetectado);
    set("diasCorte", STATUS[statusDetectado]?.dias || 10);

  } catch (err) {
    console.error("Erro na IA:", err);
    setResultadoIA({ erro: "Não foi possível analisar a imagem." });
  }

  setAnalisando(false);
};

  const handleSubmit = async () => {
    if (!form.local)  { setErro("Informe o local."); return; }
    if (!form.bairro) { setErro("Selecione o bairro."); return; }
    if (!form.status) { setErro("Selecione a classificação da grama."); return; }
    setErro("");
    setSalvando(true);
    const ok = await salvar(form);
    setSalvando(false);
    if (ok) {
      setSalvo(true);
      setTimeout(() => { setSalvo(false); voltar(); }, 1500);
    } else {
      setErro("Erro ao salvar. Verifique a conexão com o banco de dados.");
    }
  };

  return (
    <div className="card" style={{maxWidth:640}}>
      <h3 className="card-title">Registrar nova vistoria</h3>
      {erro  && <div className="msg-erro">{erro}</div>}
      {salvo && <div className="msg-ok">✅ Vistoria salva com sucesso!</div>}

      <div className="form-grid">
        <div className="form-group">
          <label>Local / Praça / Rua</label>
          <input placeholder="Ex: Praça das Bandeiras" value={form.local}
            onChange={e=>set("local",e.target.value)} />
        </div>
        <div className="form-group">
          <label>Bairro</label>
          <select value={form.bairro} onChange={e=>set("bairro",e.target.value)}>
            <option value="">Selecione...</option>
            {BAIRROS.map(b=><option key={b}>{b}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label>Metragem (m²)</label>
          <input type="number" placeholder="Ex: 150" value={form.metragem}
            onChange={e=>set("metragem",e.target.value)} />
        </div>
        <div className="form-group">
          <label>Data da vistoria</label>
          <input type="date" value={form.data}
            onChange={e=>set("data",e.target.value)} />
        </div>
      </div>

      {/* FOTO + IA */}
      <div className="form-group full" style={{marginBottom:16}}>
        <label>📷 Foto da grama — IA analisa automaticamente</label>
        <input type="file" accept="image/*" onChange={handleFoto} />

        {analisando && (
          <div style={{marginTop:10,padding:"12px 16px",background:"#EAF3DE",borderRadius:8,
            border:"1px solid #C0DD97",fontSize:13,color:"#3B6D11",display:"flex",
            alignItems:"center",gap:8}}>
            <span style={{animation:"spin 1s linear infinite",display:"inline-block"}}>🔄</span>
            Analisando imagem com IA...
          </div>
        )}

        {resultadoIA && !resultadoIA.erro && (
          <div style={{marginTop:10,padding:"14px 16px",background:"#EAF3DE",borderRadius:8,
            border:"1px solid #C0DD97"}}>
            <p style={{fontSize:13,fontWeight:600,color:"#3B6D11",marginBottom:8}}>
              🤖 IA detectou: {resultadoIA.classe} ({resultadoIA.confianca}% de confiança)
            </p>
            <div style={{display:"flex",flexDirection:"column",gap:4}}>
              {resultadoIA.todas.map(p => (
                <div key={p.className} style={{display:"flex",alignItems:"center",gap:8,fontSize:12}}>
                  <span style={{width:90,color:"#555"}}>{p.className}</span>
                  <div style={{flex:1,height:6,background:"#f0f0f0",borderRadius:99,overflow:"hidden"}}>
                    <div style={{height:"100%",width:`${Math.round(p.probability*100)}%`,
                      background:"#639922",borderRadius:99}} />
                  </div>
                  <span style={{width:35,textAlign:"right",color:"#666"}}>
                    {Math.round(p.probability*100)}%
                  </span>
                </div>
              ))}
            </div>
            <p style={{fontSize:12,color:"#666",marginTop:8}}>
              ✅ Classificação aplicada automaticamente. Você pode alterar abaixo se necessário.
            </p>
          </div>
        )}

        {resultadoIA?.erro && (
          <div style={{marginTop:10,padding:"10px 14px",background:"#FAEEDA",borderRadius:8,
            border:"1px solid #FAC775",fontSize:13,color:"#854F0B"}}>
            ⚠️ {resultadoIA.erro} Selecione a classificação manualmente.
          </div>
        )}

        {form.foto && (
          <img src={form.foto} alt="preview" className="foto-preview" />
        )}
      </div>

      {/* CLASSIFICAÇÃO */}
      <div className="form-group" style={{marginBottom:18}}>
        <label>Classificação da grama</label>
        <div className="status-btns">
          {Object.entries(STATUS).map(([key,cfg]) => (
            <button key={key}
              className={`status-btn ${form.status===key?"selecionado":""}`}
              style={form.status===key?{background:cfg.bg,borderColor:cfg.cor,color:cfg.texto}:{}}
              onClick={() => { set("status",key); set("diasCorte",cfg.dias); }}>
              {cfg.label}
              <span style={{display:"block",fontSize:11,opacity:0.7,marginTop:2}}>
                {key==="critico"?"imediato":key==="alta"?"até 3 dias":
                 key==="media"?"até 10 dias":"até 21 dias"}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="form-grid">
        <div className="form-group">
          <label>Altura estimada</label>
          <input placeholder="Ex: 25 a 35 cm" value={form.altura}
            onChange={e=>set("altura",e.target.value)} />
        </div>
        <div className="form-group">
          <label>Dias para próximo corte</label>
          <input type="number" placeholder="Ex: 7" value={form.diasCorte}
            onChange={e=>set("diasCorte",e.target.value)} />
        </div>
        <div className="form-group full">
          <label>Observações</label>
          <textarea placeholder="Detalhes extras sobre o local..." value={form.obs}
            onChange={e=>set("obs",e.target.value)} />
        </div>
      </div>

      <div style={{display:"flex",gap:10,marginTop:8}}>
        <button className="btn-voltar" onClick={voltar}>Cancelar</button>
        <button className="btn-salvar" onClick={handleSubmit} disabled={salvando}>
          {salvando ? "Salvando..." : "Salvar vistoria"}
        </button>
      </div>
    </div>
  );
}
function Historico() {     
  function Historico({ registros }) {
  const [filtro, setFiltro] = useState("");
  const [filtroBairro, setFiltroBairro] = useState("");
 
  const lista = registros
    .filter(r => !filtro || r.status === filtro)
    .filter(r => !filtroBairro || r.bairro === filtroBairro);
 
  return (
    <div className="card">
      <div className="card-header" style={{marginBottom:16}}>
        <h3 className="card-title">Todas as vistorias ({lista.length})</h3>
        <div style={{display:"flex",gap:8}}>
          <select value={filtro} onChange={e=>setFiltro(e.target.value)}
            style={{padding:"6px 10px",borderRadius:8,border:"1px solid #ddd",fontSize:13}}>
            <option value="">Todos os status</option>
            {Object.entries(STATUS).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
          </select>
          <select value={filtroBairro} onChange={e=>setFiltroBairro(e.target.value)}
            style={{padding:"6px 10px",borderRadius:8,border:"1px solid #ddd",fontSize:13}}>
            <option value="">Todos os bairros</option>
            {BAIRROS.map(b=><option key={b}>{b}</option>)}
          </select>
        </div>
      </div>
      {lista.length===0
        ? <p className="vazio">Nenhuma vistoria encontrada.</p>
        : <ListaVistorias registros={lista} />
      }
    </div>
  );
}
}
// ── POR BAIRRO ────────────────────────────────────────────────────────────────
function PorBairro({ registros }) {
  const [bairroSel, setBairroSel] = useState("");
  const bairrosComDados = [...new Set(registros.map(r => r.bairro))];
  const filtrados = bairroSel ? registros.filter(r=>r.bairro===bairroSel) : registros;

  return (
    <div>
      <div className="card" style={{marginBottom:16}}>
        <div style={{display:"flex",alignItems:"center",gap:12}}>
          <label style={{fontSize:13,fontWeight:600,color:"#444",textTransform:"none",letterSpacing:0}}>Filtrar bairro:</label>
          <select value={bairroSel} onChange={e=>setBairroSel(e.target.value)} style={{padding:"8px 12px",borderRadius:8,border:"1px solid #ddd",fontSize:14,minWidth:200}}>
            <option value="">Todos os bairros</option>
            {bairrosComDados.map(b=><option key={b}>{b}</option>)}
          </select>
        </div>
      </div>
      <div className="card">
        <h3 className="card-title">
          {bairroSel?`${bairroSel} — ${filtrados.length} local(is)`:`Todos os bairros — ${filtrados.length} local(is)`}
        </h3>
        {filtrados.length===0
          ? <p className="vazio">Nenhuma vistoria para este bairro.</p>
          : <>
              <ResumoBairros registros={filtrados} />
              <div style={{marginTop:16}}>
                <h4 style={{fontSize:14,fontWeight:600,marginBottom:12}}>Locais</h4>
                <ListaVistorias registros={filtrados} />
              </div>
            </>
        }
      </div>
    </div>
  );
}