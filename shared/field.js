/* ================================================================
   1-BIT FIELD SYSTEM — shared runtime.

   One global `Field`. Call Field.create(opts) once from an element;
   it owns the indexed palette, the pixel-perfect low-res canvas, the
   Bayer dither, the FX (visuals) console, persistence, and hotkeys.
   The element then draws its simulation with Field.ctx / Field.W /
   Field.H / Field.PIX / Field.COL / Field.bayer(), etc.

   Requires field.css and, in the page:
     <canvas id="board"></canvas>
     <button id="fxToggle" title="Visual console (H)">FX</button>
     <div id="fx"></div>

   opts (all optional except `prefix`):
     prefix       storage namespace, e.g. "poi"  (localStorage: <prefix>:visuals)
     visDefaults  extra persisted settings merged onto the base defaults
     controls     [{key,label,min,max,step,fmt(v),live}] extra FX sliders (RENDER group)
     hint         foot hint text (default "H HIDE · F FULL")
     onResize()   called after every canvas rebuild (recompute geometry here)
     onControl(key,value)  called when any FX slider/toggle/palette changes
     keys         { " ": fn, "r": fn }  extra hotkeys (lowercased single chars)
   ================================================================ */
(function(){
  const PALETTES = [
    { name:"EMBER",    bg:"#140d00", blob:"#c05a00", dot:"#ffd27a", dim:"#6e4300" },
    { name:"PHOSPHOR", bg:"#06120a", blob:"#1f7a3d", dot:"#b6ff7a", dim:"#0d3d1f" },
    { name:"MONO",     bg:"#000000", blob:"#6e6e6e", dot:"#ffffff", dim:"#3a3a3a" },
    { name:"DMG",      bg:"#0f380f", blob:"#306230", dot:"#9bbc0f", dim:"#1e4a1e" },
    { name:"ICE",      bg:"#00121a", blob:"#1c6f8c", dot:"#7fdfff", dim:"#0a3646" },
    { name:"MAGMA",    bg:"#180008", blob:"#a01f3c", dot:"#ff8fae", dim:"#50101e" },
    { name:"PAPER",    bg:"#e8e4d8", blob:"#b7ac90", dot:"#151008", dim:"#a89d80" },
  ];
  const MONO = 'ui-monospace,"Cascadia Mono",Menlo,Consolas,monospace';
  // content accent colors (balls / slices / markers) — in-family across palettes
  const PALETTE = ["#ffd27a","#b6ff7a","#7fdfff","#ff8fae","#9bbc0f","#ffffff","#c05a00"];
  const BM = [0,8,2,10,12,4,14,6,3,11,1,9,15,7,13,5];

  const F = {
    ctx:null, canvas:null, W:0, H:0, PIX:1, ALPHA:false,
    COL:{ bg:"#140d00", blob:"#c05a00", dot:"#ffd27a", dim:"#6e4300" },
    MONO, PALETTE, PALETTES, vis:null,
    colorFor(name){ let h=0; for(let i=0;i<name.length;i++) h=(h*31+name.charCodeAt(i))>>>0; return PALETTE[h%PALETTE.length]; },
    fmt(n){ return n.toLocaleString("en-US"); },
    bayer(cx,cy,v){ return v > (BM[(cy&3)*4+(cx&3)]+0.5)/16; },
    dithRect(x,y,w,h,v,color){
      if(v<=0.01) return;
      const ctx=F.ctx, PIX=F.PIX; ctx.fillStyle=color;
      const cx0=Math.max(0,Math.floor(x/PIX)), cy0=Math.max(0,Math.floor(y/PIX));
      const cx1=Math.floor((x+w)/PIX), cy1=Math.floor((y+h)/PIX);
      for(let cy=cy0;cy<cy1;cy++) for(let cx=cx0;cx<cx1;cx++) if(F.bayer(cx,cy,v)) ctx.fillRect(cx*PIX,cy*PIX,PIX,PIX);
    },
    clear(){
      F.ctx.clearRect(0,0,F.W+F.PIX,F.H+F.PIX);
      if(!F.ALPHA){ F.ctx.fillStyle=F.COL.bg; F.ctx.fillRect(0,0,F.W+F.PIX,F.H+F.PIX); }
    },
    create,
    toggleFx,
  };

  let opts, fxEl, fxToggle, params;
  const VKEY = () => opts.prefix + ":visuals";

  function loadVis(){ try { return { ...F._defaults, ...(JSON.parse(localStorage.getItem(VKEY()))||{}) }; } catch { return { ...F._defaults }; } }
  function saveVis(){ try { localStorage.setItem(VKEY(), JSON.stringify(F.vis)); } catch {} }
  F.saveVis = saveVis;

  function applyPalette(){
    const p = PALETTES[F.vis.palette] || PALETTES[0];
    F.COL = { bg:p.bg, blob:p.blob, dot:p.dot, dim:p.dim };
    const r = document.documentElement.style;
    r.setProperty("--bg",p.bg); r.setProperty("--blob",p.blob); r.setProperty("--dot",p.dot); r.setProperty("--dim",p.dim);
    document.documentElement.style.background = F.vis.alpha ? "transparent" : p.bg;
  }
  F.applyPalette = applyPalette;

  function rebuild(){
    const iw = window.innerWidth, ih = window.innerHeight, PIX = F.PIX;
    if (F.vis.perfect){
      const cols = Math.max(1, Math.floor(iw/PIX)), rows = Math.max(1, Math.floor(ih/PIX));
      F.W = cols*PIX; F.H = rows*PIX;
      F.canvas.width = cols; F.canvas.height = rows;
      F.canvas.style.width = F.W+"px"; F.canvas.style.height = F.H+"px";
      F.canvas.style.left = Math.floor((iw-F.W)/2)+"px";
      F.canvas.style.top  = Math.floor((ih-F.H)/2)+"px";
    } else {
      F.W = iw; F.H = ih;
      F.canvas.width = Math.ceil(iw/PIX); F.canvas.height = Math.ceil(ih/PIX);
      F.canvas.style.width = "100%"; F.canvas.style.height = "100%";
      F.canvas.style.left = "0"; F.canvas.style.top = "0";
    }
    F.ctx.setTransform(1/PIX,0,0,1/PIX,0,0);
    F.ctx.imageSmoothingEnabled = false;
    if (opts.onResize) opts.onResize();
  }
  F.rebuild = rebuild;

  function toggleFx(force){
    const show = force===undefined ? !fxEl.classList.contains("show") : force;
    fxEl.classList.toggle("show", show);
    fxToggle.style.display = show ? "none" : "";
    F.vis.fxOpen = show; saveVis();
  }

  function buildFx(){
    const controls = opts.controls || [];
    let ctlHtml = '<div class="ctl" data-c="pix"><div class="lr"><span>PIXEL SIZE</span><span class="val"></span></div><input type="range" min="1" max="12" step="1"></div>';
    for (const c of controls){
      ctlHtml += '<div class="ctl" data-c="'+c.key+'"><div class="lr"><span>'+c.label+'</span><span class="val"></span></div>'+
        '<input type="range" min="'+c.min+'" max="'+c.max+'" step="'+c.step+'"></div>';
    }
    fxEl.innerHTML =
      '<div class="strip"><span class="sq"></span>VISUALS<button class="x" title="Hide (H)">×</button></div>' +
      '<div class="grp">RENDER</div>' + ctlHtml +
      '<div class="togglerow">' +
        '<button class="btn" data-t="perfect">PIXEL-PERFECT</button>' +
        '<button class="btn" data-t="alpha">ALPHA BG</button>' +
      '</div>' +
      '<div class="grp">PALETTE</div><div class="pals"></div>' +
      '<div class="foot"><span class="hint">'+(opts.hint||"H HIDE · F FULL")+'</span><button class="btn" data-reset>RESET</button></div>';

    const fmtPix = v => String(v);
    fxEl.querySelectorAll(".ctl").forEach(row => {
      const key = row.dataset.c, rng = row.querySelector("input"), val = row.querySelector(".val");
      const spec = key === "pix" ? { fmt: fmtPix } : controls.find(c => c.key === key);
      rng.value = F.vis[key]; val.textContent = spec.fmt(F.vis[key]);
      rng.oninput = () => {
        F.vis[key] = parseFloat(rng.value); val.textContent = spec.fmt(F.vis[key]); saveVis();
        if (key === "pix"){ F.PIX = F.vis.pix; rebuild(); }
        if (opts.onControl) opts.onControl(key, F.vis[key]);
      };
    });

    fxEl.querySelectorAll(".togglerow .btn").forEach(btn => {
      const key = btn.dataset.t;
      btn.classList.toggle("on", !!F.vis[key]);
      btn.onclick = () => {
        F.vis[key] = !F.vis[key]; btn.classList.toggle("on", F.vis[key]); saveVis();
        if (key === "alpha"){ F.ALPHA = F.vis.alpha; applyPalette(); }
        if (key === "perfect") rebuild();
        if (opts.onControl) opts.onControl(key, F.vis[key]);
      };
    });

    const pals = fxEl.querySelector(".pals");
    PALETTES.forEach((p,i) => {
      const cell = document.createElement("div");
      cell.className = "palc" + (i===F.vis.palette ? " sel" : "");
      cell.title = p.name;
      cell.innerHTML = '<span style="background:'+p.bg+'"></span><span style="background:'+p.blob+'"></span><span style="background:'+p.dot+'"></span>';
      cell.onclick = () => { F.vis.palette=i; saveVis(); applyPalette(); pals.querySelectorAll(".palc").forEach((e,j)=>e.classList.toggle("sel",j===i)); if(opts.onControl) opts.onControl("palette",i); };
      pals.appendChild(cell);
    });

    fxEl.querySelector(".x").onclick = () => toggleFx(false);
    fxEl.querySelector("[data-reset]").onclick = () => {
      const keep = {};
      // preserve element-owned (non-visual) keys the element added beyond visuals? keep fxOpen only.
      const wasOpen = F.vis.fxOpen;
      F.vis = { ...F._defaults, fxOpen: wasOpen }; saveVis();
      F.PIX = F.vis.pix; F.ALPHA = F.vis.alpha;
      applyPalette(); buildFx(); rebuild();
      if (opts.onControl) opts.onControl("reset", null);
    };
    fxToggle.onclick = () => toggleFx(true);
    toggleFx(F.vis.fxOpen !== false);
  }
  F.buildFx = buildFx;

  function installHotkeys(){
    window.addEventListener("keydown", (e) => {
      const tag = e.target && e.target.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      const k = e.key.toLowerCase();
      if (k === "h"){ toggleFx(); e.preventDefault(); return; }
      if (k === "f"){
        if (!document.fullscreenElement) document.documentElement.requestFullscreen && document.documentElement.requestFullscreen();
        else document.exitFullscreen && document.exitFullscreen();
        return;
      }
      if (opts.keys && opts.keys[k]){ opts.keys[k](e); e.preventDefault(); }
    });
  }

  function create(o){
    opts = o || {};
    params = new URLSearchParams(location.search);
    F._defaults = { pix:1, perfect:true, alpha:false, palette:0, fxOpen:true, ...(opts.visDefaults||{}) };
    F.vis = loadVis();
    if (params.get("px"))            F.vis.pix = Math.max(1, Math.min(12, parseInt(params.get("px")) || F.vis.pix));
    if (params.get("alpha") === "1") F.vis.alpha = true;
    F.PIX = F.vis.pix; F.ALPHA = F.vis.alpha;

    F.canvas = document.getElementById("board");
    F.ctx = F.canvas.getContext("2d");
    fxEl = document.getElementById("fx");
    fxToggle = document.getElementById("fxToggle");

    applyPalette();
    buildFx();
    installHotkeys();
    rebuild();
    window.addEventListener("resize", rebuild);
    return F;
  }

  window.Field = F;
})();
