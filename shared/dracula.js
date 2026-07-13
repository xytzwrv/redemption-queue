/* ================================================================
   DRACULA MODERN — shared runtime for the Dracula-themed forks.

   A drop-in sibling of field.js exposing the SAME `Field` API, but:
     • smooth, high-DPI canvas (no pixelation)
     • Dracula "pattern" palettes selected by the same theme picker
     • glow via translucency / radial gradients instead of Bayer dither
   Elements written against Field.* work unchanged; Field.dithRect() and
   Field.glow() render smoothly here.

   Pair with dracula.css. Page needs:
     <canvas id="board"></canvas>
     <button id="fxToggle">FX</button>  <div id="fx"></div>
   ================================================================ */
(function(){
  // Dracula "patterns" — same base palette, different accent character.
  const PALETTES = [
    { name:"PURPLE",  bg:"#282a36", dot:"#bd93f9", blob:"#ff79c6", dim:"#6272a4", fg:"#f8f8f2", line:"#44475a" },
    { name:"PINK",    bg:"#282a36", dot:"#ff79c6", blob:"#bd93f9", dim:"#6272a4", fg:"#f8f8f2", line:"#44475a" },
    { name:"CYAN",    bg:"#282a36", dot:"#8be9fd", blob:"#bd93f9", dim:"#6272a4", fg:"#f8f8f2", line:"#44475a" },
    { name:"GREEN",   bg:"#282a36", dot:"#50fa7b", blob:"#8be9fd", dim:"#6272a4", fg:"#f8f8f2", line:"#44475a" },
    { name:"ORANGE",  bg:"#282a36", dot:"#ffb86c", blob:"#ff79c6", dim:"#6272a4", fg:"#f8f8f2", line:"#44475a" },
    { name:"RED",     bg:"#282a36", dot:"#ff5555", blob:"#ffb86c", dim:"#6272a4", fg:"#f8f8f2", line:"#44475a" },
    { name:"NIGHT",   bg:"#1a1b26", dot:"#bd93f9", blob:"#7aa2f7", dim:"#565f89", fg:"#c0caf5", line:"#2b2f44" },
    { name:"ALUCARD", bg:"#f4f2ec", dot:"#7c3aed", blob:"#cf396a", dim:"#9c98a8", fg:"#22212c", line:"#dcd8e2" },
  ];
  const SANS = "'Inter','Segoe UI',system-ui,-apple-system,sans-serif";
  const MONO = 'ui-monospace,"Cascadia Mono",Menlo,Consolas,monospace';
  // Dracula content accents (balls / slices / markers)
  const PALETTE = ["#bd93f9","#ff79c6","#8be9fd","#50fa7b","#ffb86c","#ff5555","#f1fa8c"];

  function toRGBA(hex, a){
    hex = hex.replace("#","");
    if(hex.length===3) hex = hex.split("").map(c=>c+c).join("");
    const n = parseInt(hex,16);
    return "rgba("+((n>>16)&255)+","+((n>>8)&255)+","+(n&255)+","+a+")";
  }

  const F = {
    ctx:null, canvas:null, W:0, H:0, PIX:1, ALPHA:false, DPR:1,
    COL:{ bg:"#282a36", blob:"#ff79c6", dot:"#bd93f9", dim:"#6272a4", fg:"#f8f8f2", line:"#44475a" },
    MONO, SANS, FONT:SANS, PALETTE, PALETTES, vis:null,
    colorFor(name){ let h=0; for(let i=0;i<name.length;i++) h=(h*31+name.charCodeAt(i))>>>0; return PALETTE[h%PALETTE.length]; },
    fmt(n){ return n.toLocaleString("en-US"); },
    toRGBA,
    bayer(cx,cy,v){ return v > 0.5; },                 // API compat only (smooth build)
    // smooth translucent fill (drop-in for the dithered version)
    dithRect(x,y,w,h,v,color){
      if(v<=0.01) return;
      const ctx=F.ctx; ctx.save(); ctx.globalAlpha=Math.min(1,v); ctx.fillStyle=color; ctx.fillRect(x,y,w,h); ctx.restore();
    },
    // soft radial bloom
    glow(x,y,r,v,color){
      if(v<=0.01||r<=0) return;
      const ctx=F.ctx, g=ctx.createRadialGradient(x,y,0,x,y,r);
      g.addColorStop(0, toRGBA(color, Math.min(1,v))); g.addColorStop(1, toRGBA(color,0));
      ctx.save(); ctx.fillStyle=g; ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2); ctx.fill(); ctx.restore();
    },
    clear(){
      F.ctx.clearRect(0,0,F.W,F.H);
      if(!F.ALPHA){ F.ctx.fillStyle=F.COL.bg; F.ctx.fillRect(0,0,F.W,F.H); }
    },
    create, toggleFx,
  };

  let opts, fxEl, fxToggle, params;
  const VKEY = () => opts.prefix + ":visuals";
  function loadVis(){ try { return { ...F._defaults, ...(JSON.parse(localStorage.getItem(VKEY()))||{}) }; } catch { return { ...F._defaults }; } }
  function saveVis(){ try { localStorage.setItem(VKEY(), JSON.stringify(F.vis)); } catch {} }
  F.saveVis = saveVis;

  function applyPalette(){
    const p = PALETTES[F.vis.palette] || PALETTES[0];
    F.COL = { bg:p.bg, blob:p.blob, dot:p.dot, dim:p.dim, fg:p.fg, line:p.line };
    const r = document.documentElement.style;
    r.setProperty("--bg",p.bg); r.setProperty("--blob",p.blob); r.setProperty("--dot",p.dot);
    r.setProperty("--dim",p.dim); r.setProperty("--fg",p.fg); r.setProperty("--line",p.line);
    r.setProperty("--card", toRGBA(p.bg, .90));
    document.documentElement.style.background = F.vis.alpha ? "transparent" : p.bg;
  }
  F.applyPalette = applyPalette;

  function rebuild(){
    const iw = window.innerWidth, ih = window.innerHeight;
    const dpr = F.DPR = Math.min(window.devicePixelRatio || 1, 2);
    F.W = iw; F.H = ih; F.PIX = 1;
    F.canvas.width = Math.round(iw*dpr); F.canvas.height = Math.round(ih*dpr);
    F.canvas.style.width = "100%"; F.canvas.style.height = "100%";
    F.canvas.style.left = "0"; F.canvas.style.top = "0";
    F.ctx.setTransform(dpr,0,0,dpr,0,0);
    F.ctx.imageSmoothingEnabled = true;
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
    let ctlHtml = "";
    for (const c of controls){
      ctlHtml += '<div class="ctl" data-c="'+c.key+'"><div class="lr"><span>'+c.label+'</span><span class="val"></span></div>'+
        '<input type="range" min="'+c.min+'" max="'+c.max+'" step="'+c.step+'"></div>';
    }
    fxEl.innerHTML =
      '<div class="strip"><span class="sq"></span>VISUALS<button class="x" title="Hide (H)">×</button></div>' +
      (controls.length ? '<div class="grp">Render</div>' + ctlHtml : "") +
      '<div class="togglerow"><button class="btn" data-t="alpha">TRANSPARENT BG</button></div>' +
      '<div class="grp">Theme</div><div class="pals"></div>' +
      '<div class="foot"><span class="hint">'+(opts.hint||"H hide · F fullscreen")+'</span><button class="btn" data-reset>Reset</button></div>';

    fxEl.querySelectorAll(".ctl").forEach(row => {
      const key = row.dataset.c, rng = row.querySelector("input"), val = row.querySelector(".val");
      const spec = controls.find(c => c.key === key);
      rng.value = F.vis[key]; val.textContent = spec.fmt(F.vis[key]);
      rng.oninput = () => { F.vis[key] = parseFloat(rng.value); val.textContent = spec.fmt(F.vis[key]); saveVis(); if (opts.onControl) opts.onControl(key, F.vis[key]); };
    });

    fxEl.querySelectorAll(".togglerow .btn").forEach(btn => {
      const key = btn.dataset.t;
      btn.classList.toggle("on", !!F.vis[key]);
      btn.onclick = () => {
        F.vis[key] = !F.vis[key]; btn.classList.toggle("on", F.vis[key]); saveVis();
        if (key === "alpha"){ F.ALPHA = F.vis.alpha; applyPalette(); }
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
      const keep = {}; for(const k of (opts.keepOnReset||[])) if(k in F.vis) keep[k]=F.vis[k];
      const wasOpen = F.vis.fxOpen;
      F.vis = { ...F._defaults, ...keep, fxOpen: wasOpen }; saveVis();
      F.ALPHA = F.vis.alpha; applyPalette(); buildFx(); rebuild();
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
      if (k === "f"){ if (!document.fullscreenElement) document.documentElement.requestFullscreen&&document.documentElement.requestFullscreen(); else document.exitFullscreen&&document.exitFullscreen(); return; }
      if (opts.keys && opts.keys[k]){ opts.keys[k](e); e.preventDefault(); }
    });
  }

  function create(o){
    opts = o || {};
    params = new URLSearchParams(location.search);
    F._defaults = { alpha:false, palette:0, fxOpen:true, ...(opts.visDefaults||{}) };
    F.vis = loadVis();
    if (params.get("alpha") === "1") F.vis.alpha = true;
    if (params.get("theme")){ const i = parseInt(params.get("theme")); if(i>=0 && i<PALETTES.length) F.vis.palette = i; }
    F.ALPHA = F.vis.alpha;
    F.canvas = document.getElementById("board"); F.ctx = F.canvas.getContext("2d");
    fxEl = document.getElementById("fx"); fxToggle = document.getElementById("fxToggle");
    applyPalette(); buildFx(); installHotkeys(); rebuild();
    window.addEventListener("resize", rebuild);
    return F;
  }

  window.Field = F;
})();
