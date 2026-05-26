/* eslint-disable */
// ── GERADOR PDF GERAL ─────────────────────────────────────────────────────────
async function gerarPDFGeral(registros){
  const{jsPDF}=await import("jspdf");
  const doc=new jsPDF({orientation:"portrait",unit:"mm",format:"a4"});
  const hoje=new Date().toLocaleDateString("pt-BR",{day:"2-digit",month:"2-digit",year:"numeric"});
  const horaStr=new Date().toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"});
  const W=210,M=14;

  const verde=[21,97,35];
  const cinzaEsc=[40,40,40],cinzaMed=[100,100,100],cinzaClr=[240,240,240];
  const vermelho=[229,57,53],laranja=[245,124,0],amarelo=[249,168,37],
        verde2=[46,125,50],azul=[21,101,192];

  const corStatus=(s)=>{
    if(s==="critico") return vermelho;
    if(s==="alta")    return laranja;
    if(s==="media")   return amarelo;
    if(s==="baixa")   return verde2;
    return azul;
  };
  const labelStatus=(s)=>{
    if(s==="critico") return "Critico";
    if(s==="alta")    return "Alta";
    if(s==="media")   return "Media";
    if(s==="baixa")   return "Curta";
    if(s==="cortada") return "Cortada";
    return s;
  };

  // ── CABEÇALHO ──
  doc.setFillColor(...verde);
  doc.rect(0,0,W,28,"F");
  doc.setTextColor(255,255,255);
  doc.setFontSize(20);doc.setFont("helvetica","bold");
  doc.text("GramaSP",M,13);
  doc.setFontSize(9);doc.setFont("helvetica","normal");
  doc.text("Sistema de Monitoramento de Areas Verdes",M,19);
  doc.text("Prefeitura Municipal de Santos - Jardins de Santos",M,24);
  doc.setFontSize(9);
  doc.text(`Gerado em ${hoje} as ${horaStr}`,W-M,13,{align:"right"});
  doc.text("Relatorio Geral de Vistorias",W-M,19,{align:"right"});

  // ── RESUMO KPI ──
  let y=36;
  doc.setTextColor(...cinzaEsc);
  doc.setFontSize(13);doc.setFont("helvetica","bold");
  doc.text("Resumo Geral",M,y);y+=7;

  // Mesma lógica do statusEfetivo do App.js
  const stEfetivo=(r)=>{
    if(r.status_calculado&&r.status_calculado!=="atrasada") return r.status_calculado;
    if(r.status==="cortada"){
      const d=Math.floor((new Date()-new Date(r.criado_em||r.data))/86400000);
      if(d>=2) return "baixa";
    }
    return r.status;
  };
  const regs=registros.map(r=>({...r,st:stEfetivo(r)}));

  const counts={
    total:regs.length,
    critico:regs.filter(r=>r.st==="critico").length,
    alta:regs.filter(r=>r.st==="alta").length,
    media:regs.filter(r=>r.st==="media").length,
    baixa:regs.filter(r=>r.st==="baixa").length,
    cortada:regs.filter(r=>r.st==="cortada").length,
  };

  const kpis=[
    {label:"Total",val:counts.total,cor:[60,120,80]},
    {label:"Critico",val:counts.critico,cor:vermelho},
    {label:"Alta",val:counts.alta,cor:laranja},
    {label:"Media",val:counts.media,cor:amarelo},
    {label:"Curta",val:counts.baixa,cor:verde2},
    {label:"Cortada",val:counts.cortada,cor:azul},
  ];
  const kw=28,kh=18,kg=3;
  kpis.forEach((k,i)=>{
    const x=M+i*(kw+kg);
    doc.setFillColor(...k.cor);
    doc.roundedRect(x,y,kw,kh,2,2,"F");
    doc.setTextColor(255,255,255);
    doc.setFontSize(16);doc.setFont("helvetica","bold");
    doc.text(String(k.val),x+kw/2,y+10,{align:"center"});
    doc.setFontSize(7);doc.setFont("helvetica","normal");
    doc.text(k.label,x+kw/2,y+15,{align:"center"});
  });
  y+=kh+8;

  // ── ALERTAS ──
  const urgentes=regs.filter(r=>r.st==="critico"||r.st==="alta");
  if(urgentes.length>0){
    doc.setFillColor(255,235,235);
    doc.roundedRect(M,y,W-2*M,8,1,1,"F");
    doc.setDrawColor(...vermelho);
    doc.roundedRect(M,y,W-2*M,8,1,1,"S");
    doc.setTextColor(...vermelho);
    doc.setFontSize(9);doc.setFont("helvetica","bold");
    doc.text(`${urgentes.length} local(is) precisam de atenção imediata!`,M+4,y+5);
    y+=13;
  }

  // ── TABELA ──
  doc.setTextColor(...cinzaEsc);
  doc.setFontSize(13);doc.setFont("helvetica","bold");
  doc.text("Todos os Locais",M,y);y+=5;

  // Colunas redesenhadas para caber sem cortar
  // Total útil: 210 - 28 = 182mm
  const cols=[
    {label:"Local / Endereco",   w:60, x:M},
    {label:"Bairro",             w:28, x:M+60},
    {label:"Metragem",           w:20, x:M+88},
    {label:"Data",               w:22, x:M+108},
    {label:"Status",             w:24, x:M+130},
    {label:"Proximo Corte",      w:34, x:M+154},
  ];

  // cabeçalho tabela
  doc.setFillColor(...verde);
  doc.rect(M,y,W-2*M,7,"F");
  doc.setTextColor(255,255,255);
  doc.setFontSize(7.5);doc.setFont("helvetica","bold");
  cols.forEach(c=>doc.text(c.label,c.x+1,y+5));
  y+=7;

  regs.forEach((r,i)=>{
    if(y>272){
      doc.addPage();
      y=15;
      doc.setFillColor(...verde);
      doc.rect(M,y,W-2*M,7,"F");
      doc.setTextColor(255,255,255);
      doc.setFontSize(7.5);doc.setFont("helvetica","bold");
      cols.forEach(c=>doc.text(c.label,c.x+1,y+5));
      y+=7;
    }

    const rowH=7;
    doc.setFillColor(i%2===0?248:255,i%2===0?248:255,i%2===0?248:255);
    doc.rect(M,y,W-2*M,rowH,"F");

    doc.setTextColor(...cinzaEsc);
    doc.setFontSize(7);doc.setFont("helvetica","normal");

    // truncar nomes para caber na coluna
    const local=(r.local||"").substring(0,28);
    const bairro=(r.bairro||"").substring(0,16);
    const met=r.metragem?`${r.metragem}m2`:"—";
    const dt=r.data?new Date(r.data+"T12:00:00").toLocaleDateString("pt-BR"):"—";

    const corte=new Date(r.data); corte.setDate(corte.getDate()+(r.dias_corte||0));
    const diff=Math.ceil((corte-new Date())/86400000);
    const proxCorte=diff<=0?"Atrasado!":diff<=3?`Em ${diff} dias!`:`Em ${diff} dias`;

    doc.text(local,cols[0].x+1,y+5);
    doc.text(bairro,cols[1].x+1,y+5);
    doc.text(met,cols[2].x+1,y+5);
    doc.text(dt,cols[3].x+1,y+5);

    // badge status
    const sc=corStatus(r.st);
    doc.setFillColor(...sc);
    doc.roundedRect(cols[4].x+1,y+1,21,5,1,1,"F");
    doc.setTextColor(255,255,255);
    doc.setFontSize(6);doc.setFont("helvetica","bold");
    doc.text(labelStatus(r.st),cols[4].x+11.5,y+5,{align:"center"});

    // próximo corte com cor
    const corCorte=diff<=0?vermelho:diff<=3?laranja:cinzaMed;
    doc.setTextColor(...corCorte);
    doc.setFontSize(7);doc.setFont("helvetica",diff<=3?"bold":"normal");
    doc.text(proxCorte,cols[5].x+1,y+5);

    doc.setDrawColor(220,220,220);
    doc.line(M,y+rowH,W-M,y+rowH);
    y+=rowH;
  });

  // ── RODAPÉ ──
  const pageCount=doc.internal.getNumberOfPages();
  for(let i=1;i<=pageCount;i++){
    doc.setPage(i);
    doc.setFillColor(...cinzaClr);
    doc.rect(0,285,W,12,"F");
    doc.setTextColor(...cinzaMed);
    doc.setFontSize(7);doc.setFont("helvetica","normal");
    doc.text("GramaSP - Sistema de Monitoramento de Areas Verdes - Prefeitura Municipal de Santos",W/2,291,{align:"center"});
    doc.text(`Pagina ${i} de ${pageCount}`,W-M,291,{align:"right"});
    doc.text(hoje,M,291);
  }

  doc.save(`GramaSP_Relatorio_${hoje.replace(/\//g,"-")}.pdf`);
}

// ── GERADOR PDF INDIVIDUAL ────────────────────────────────────────────────────
async function gerarPDFIndividual(registro){
  const{jsPDF}=await import("jspdf");
  const doc=new jsPDF({orientation:"portrait",unit:"mm",format:"a4"});
  const hoje=new Date().toLocaleDateString("pt-BR",{day:"2-digit",month:"2-digit",year:"numeric"});
  const W=210,M=15;

  const verde=[21,97,35],verdeClaro=[220,242,224];
  const cinzaEsc=[40,40,40],cinzaMed=[120,120,120],cinzaClr=[245,245,245];
  const vermelho=[229,57,53],laranja=[245,124,0],amarelo=[249,168,37],
        verde2=[46,125,50],azul=[21,101,192];

  let st=registro.status_calculado&&registro.status_calculado!=="atrasada"
    ?registro.status_calculado:registro.status;
  if(registro.status==="cortada"){
    const d=Math.floor((new Date()-new Date(registro.criado_em||registro.data))/86400000);
    if(d>=2) st="baixa";
  }
  const corSt=st==="critico"?vermelho:st==="alta"?laranja:st==="media"?amarelo:st==="baixa"?verde2:azul;
  const labelSt=st==="critico"?"Critico":st==="alta"?"Alta":st==="media"?"Media":st==="baixa"?"Curta":"Cortada";

  // CABEÇALHO
  doc.setFillColor(...verde);
  doc.rect(0,0,W,28,"F");
  doc.setTextColor(255,255,255);
  doc.setFontSize(20);doc.setFont("helvetica","bold");
  doc.text("GramaSP",M,13);
  doc.setFontSize(9);doc.setFont("helvetica","normal");
  doc.text("Relatorio Individual de Vistoria",M,19);
  doc.text("Prefeitura Municipal de Santos - Jardins de Santos",M,24);
  doc.text(`Emitido em ${hoje}`,W-M,19,{align:"right"});

  // TÍTULO LOCAL
  let y=36;
  doc.setFillColor(...cinzaClr);
  doc.roundedRect(M,y,W-2*M,14,2,2,"F");
  doc.setTextColor(...cinzaEsc);
  doc.setFontSize(13);doc.setFont("helvetica","bold");
  const localTxt=(registro.local||"Local nao informado").substring(0,50);
  doc.text(localTxt,M+4,y+6);
  doc.setFontSize(9);doc.setFont("helvetica","normal");
  doc.setTextColor(...cinzaMed);
  doc.text(`${registro.bairro||""}${registro.metragem?` · ${registro.metragem}m2`:""}`,M+4,y+11);
  doc.setFillColor(...corSt);
  doc.roundedRect(W-M-30,y+2,30,10,2,2,"F");
  doc.setTextColor(255,255,255);
  doc.setFontSize(9);doc.setFont("helvetica","bold");
  doc.text(labelSt,W-M-15,y+9,{align:"center"});
  y+=20;

  // FOTO
  if(registro.foto&&registro.foto.startsWith("data:image")){
    try{
      // Calcular proporção real da imagem para não distorcer
      const imgEl=new Image();
      imgEl.src=registro.foto;
      await new Promise(res=>{imgEl.onload=res;imgEl.onerror=res;});
      const imgW=imgEl.naturalWidth||1;
      const imgH_nat=imgEl.naturalHeight||1;
      const maxW=W-2*M;
      const maxH=70;
      const ratio=Math.min(maxW/imgW,maxH/imgH_nat);
      const drawW=imgW*ratio;
      const drawH=imgH_nat*ratio;
      const xCenter=M+(maxW-drawW)/2;
      doc.setFillColor(245,245,245);
      doc.roundedRect(M,y,maxW,drawH+4,2,2,"F");
      doc.addImage(registro.foto,"JPEG",xCenter,y+2,drawW,drawH);
      doc.setDrawColor(220,220,220);
      doc.roundedRect(M,y,maxW,drawH+4,2,2,"S");
      y+=drawH+10;
    }catch(e){y+=2;}
  }

  // DADOS
  doc.setTextColor(...cinzaEsc);
  doc.setFontSize(11);doc.setFont("helvetica","bold");
  doc.text("Dados da Vistoria",M,y);y+=4;
  doc.setFillColor(...verde);
  doc.rect(M,y,W-2*M,0.5,"F");
  y+=5;

  const corte=new Date(registro.data||new Date());
  corte.setDate(corte.getDate()+(registro.dias_corte||0));
  const diff=Math.ceil((corte-new Date())/86400000);
  const diasDesde=Math.ceil((new Date()-new Date((registro.data||"")+"T12:00:00"))/86400000);
  const cresc=registro.crescimento_estimado_cm!=null
    ?Number(registro.crescimento_estimado_cm).toFixed(1)
    :(diasDesde/7*(st==="critico"?.5:st==="alta"?.4:st==="media"?.3:st==="baixa"?.25:.2)*10).toFixed(1);
  const proxCorte=diff<=0?"Atrasado!":diff<=3?`Em ${diff} dias (urgente)`:`Em ${diff} dias`;

  const campos=[
    ["Data da vistoria", registro.data?new Date(registro.data+"T12:00:00").toLocaleDateString("pt-BR"):"—"],
    ["Bairro", registro.bairro||"—"],
    ["Metragem", registro.metragem?`${registro.metragem}m2`:"—"],
    ["Altura registrada", registro.altura||"Nao informada"],
    ["Dias desde a vistoria", `${diasDesde} dias`],
    ["Crescimento estimado", `${cresc} cm`],
    ["Proximo corte", proxCorte],
    ["Dias para o corte", registro.dias_corte?`${registro.dias_corte} dias`:"—"],
  ];

  const cw=(W-2*M-4)/2;
  campos.forEach((c,i)=>{
    const col=i%2;
    const row=Math.floor(i/2);
    const cx=M+col*(cw+4);
    const cy=y+row*12;
    doc.setFillColor(col===0?248:252,col===0?252:248,248);
    doc.roundedRect(cx,cy,cw,10,1,1,"F");
    doc.setDrawColor(225,225,225);
    doc.roundedRect(cx,cy,cw,10,1,1,"S");
    doc.setTextColor(...cinzaMed);
    doc.setFontSize(7);doc.setFont("helvetica","normal");
    doc.text(c[0],cx+3,cy+4);
    const isUrg=c[0]==="Proximo corte"&&diff<=3;
    doc.setTextColor(...(isUrg?vermelho:cinzaEsc));
    doc.setFontSize(9);doc.setFont("helvetica","bold");
    doc.text(String(c[1]).substring(0,28),cx+3,cy+9);
  });
  y+=Math.ceil(campos.length/2)*12+6;

  // BARRA CRESCIMENTO
  doc.setFillColor(...verdeClaro);
  doc.roundedRect(M,y,W-2*M,16,2,2,"F");
  doc.setTextColor(...cinzaEsc);
  doc.setFontSize(9);doc.setFont("helvetica","bold");
  doc.text("Estimativa de Crescimento",M+4,y+6);
  const pct=Math.min(100,diasDesde/30*100);
  doc.setFillColor(220,220,220);
  doc.roundedRect(M+4,y+8,W-2*M-8,4,1,1,"F");
  doc.setFillColor(...corSt);
  doc.roundedRect(M+4,y+8,(W-2*M-8)*pct/100,4,1,1,"F");
  doc.setTextColor(...cinzaMed);
  doc.setFontSize(7);doc.setFont("helvetica","normal");
  doc.text(`${pct.toFixed(0)}% do ciclo - estimativa: ${cresc}cm`,W-M-4,y+13,{align:"right"});
  y+=22;

  // OBSERVAÇÕES
  if(registro.obs){
    doc.setTextColor(...cinzaEsc);
    doc.setFontSize(11);doc.setFont("helvetica","bold");
    doc.text("Observacoes",M,y);y+=4;
    doc.setFillColor(255,255,255);
    doc.setDrawColor(220,220,220);
    const obsLines=doc.splitTextToSize(registro.obs,W-2*M-6);
    const obsH=obsLines.length*5+6;
    doc.roundedRect(M,y,W-2*M,obsH,1,1,"FD");
    doc.setTextColor(...cinzaMed);
    doc.setFontSize(9);doc.setFont("helvetica","normal");
    doc.text(obsLines,M+3,y+5);
    y+=obsH+6;
  }

  // RODAPÉ
  doc.setFillColor(...cinzaClr);
  doc.rect(0,285,W,12,"F");
  doc.setTextColor(...cinzaMed);
  doc.setFontSize(7);doc.setFont("helvetica","normal");
  doc.text("GramaSP - Sistema de Monitoramento de Areas Verdes - Prefeitura Municipal de Santos",W/2,291,{align:"center"});
  doc.text(hoje,M,291);
  doc.text("Pagina 1 de 1",W-M,291,{align:"right"});

  const nomeArq=(registro.local||"local").replace(/[^a-z0-9]/gi,"_").substring(0,30);
  doc.save(`GramaSP_Vistoria_${nomeArq}_${hoje.replace(/\//g,"-")}.pdf`);
}

export {gerarPDFGeral, gerarPDFIndividual};