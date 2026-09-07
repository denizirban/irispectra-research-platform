"use client"

import { useEffect, useRef, useState } from "react"

type Mode = "turing" | "mechanical" | "hybrid" | "vascular" | "divergence"
type Params = { feed: number; kill: number; heterogeneity: number; radial: number; coupling: number; crypts: number; persistence: number }
const N = 150

function rng(seed: number) { let t = seed >>> 0; return () => { t += 0x6D2B79F5; let z = t; z = Math.imul(z ^ z >>> 15, z | 1); z ^= z + Math.imul(z ^ z >>> 7, z | 61); return ((z ^ z >>> 14) >>> 0) / 4294967296 } }
function init(seed: number) {
  const random = rng(seed), u = new Float32Array(N*N).fill(1), v = new Float32Array(N*N)
  for (let i=0;i<N*N;i++) if (random() < .025) { v[i] = .72 + random()*.22; u[i] = .22 + random()*.2 }
  return { u, v }
}
function step(field: ReturnType<typeof init>, p: Params) {
  const nu = new Float32Array(field.u.length), nv = new Float32Array(field.v.length)
  for (let y=1;y<N-1;y++) for (let x=1;x<N-1;x++) {
    const i=y*N+x, dx=x-N/2, dy=y-N/2, rr=Math.hypot(dx,dy)/(N/2)
    if (rr < .2 || rr > .97) { nu[i]=1; nv[i]=0; continue }
    const u=field.u[i], v=field.v[i]
    const lu=field.u[i-1]+field.u[i+1]+field.u[i-N]+field.u[i+N]-4*u
    const lv=field.v[i-1]+field.v[i+1]+field.v[i-N]+field.v[i+N]-4*v
    const radialTerm = p.radial * .0015 * Math.sin(rr*46 + Math.atan2(dy,dx)*2)
    const reaction=u*v*v
    nu[i]=Math.max(0,Math.min(1,u + .16*lu - reaction + (p.feed+radialTerm)*(1-u)))
    nv[i]=Math.max(0,Math.min(1,v + .08*lv + reaction - (p.feed+p.kill)*v))
  }
  field.u=nu; field.v=nv
}
function overlayAnatomy(ctx: CanvasRenderingContext2D, seed: number, p: Params, mode: Mode) {
  const random=rng(seed*17+3), cx=N/2, cy=N/2
  ctx.save(); ctx.globalCompositeOperation="screen"
  if (mode!=="turing") {
    ctx.strokeStyle=`rgba(224,194,126,${.12+.32*p.coupling})`; ctx.lineWidth=.45
    const fibers=90+Math.round(p.radial*80)
    for(let j=0;j<fibers;j++){ const a=2*Math.PI*(j/fibers)+(random()-.5)*.035, bend=(random()-.5)*.28; ctx.beginPath();
      for(let k=0;k<12;k++){ const r=N*(.13+k*.031), aa=a+bend*(k/12-.5)**2; const x=cx+Math.cos(aa)*r, y=cy+Math.sin(aa)*r; k?ctx.lineTo(x,y):ctx.moveTo(x,y) } ctx.stroke() }
    ctx.strokeStyle="rgba(239,210,143,.26)"; ctx.lineWidth=.7
    for(let ring=0;ring<3;ring++){ctx.beginPath();for(let j=0;j<=120;j++){const a=j/120*Math.PI*2,r=N*(.27+ring*.10)+(Math.sin(a*(5+ring)+seed)*2.5*p.heterogeneity);const x=cx+Math.cos(a)*r,y=cy+Math.sin(a)*r;j?ctx.lineTo(x,y):ctx.moveTo(x,y)}ctx.stroke()}
  }
  if(mode==="vascular"||mode==="hybrid"){
    ctx.strokeStyle=`rgba(142,109,70,${.18+.42*p.persistence})`;ctx.lineWidth=.6
    for(let j=0;j<18;j++){let a=random()*Math.PI*2,r=N*.48;ctx.beginPath();ctx.moveTo(cx+Math.cos(a)*r,cy+Math.sin(a)*r);for(let k=0;k<7;k++){r-=N*.045;a+=(random()-.5)*.16;ctx.lineTo(cx+Math.cos(a)*r,cy+Math.sin(a)*r)}ctx.stroke()}
  }
  if(mode!=="turing") { ctx.globalCompositeOperation="multiply";ctx.fillStyle="rgba(0,0,0,.68)"
  for(let j=0;j<Math.round(3+p.crypts*18);j++){const a=random()*Math.PI*2,r=N*(.24+random()*.24),s=1.5+random()*4.2*p.heterogeneity;ctx.beginPath();ctx.ellipse(cx+Math.cos(a)*r,cy+Math.sin(a)*r,s,s*(.45+random()),a,0,Math.PI*2);ctx.fill()} }
  ctx.restore()
}
function render(canvas: HTMLCanvasElement, field: ReturnType<typeof init>, other: ReturnType<typeof init> | null, seed: number, p: Params, mode: Mode) {
  canvas.width=N;canvas.height=N;const ctx=canvas.getContext("2d")!,image=ctx.createImageData(N,N)
  for(let y=0;y<N;y++)for(let x=0;x<N;x++){const i=y*N+x,dx=x-N/2,dy=y-N/2,r=Math.hypot(dx,dy)/(N/2),q=i*4;if(r<.2||r>.97){image.data[q]=2;image.data[q+1]=3;image.data[q+2]=2;image.data[q+3]=255;continue}
    const mechanicalValue=.10+.06*Math.sin(Math.atan2(dy,dx)*36+Math.sin(r*21)*p.heterogeneity)+.05*Math.sin(r*58)
    const value=mode==="divergence"&&other?Math.min(1,Math.abs(field.v[i]-other.v[i])*4):mode==="mechanical"||mode==="vascular"?mechanicalValue:field.v[i]
    if(mode==="divergence"){image.data[q]=Math.round(205*value);image.data[q+1]=Math.round(255*value);image.data[q+2]=Math.round(49*value)}else{image.data[q]=Math.round(43+105*value);image.data[q+1]=Math.round(34+76*value);image.data[q+2]=Math.round(21+36*value)}image.data[q+3]=255}
  ctx.putImageData(image,0,0);if(mode!=="divergence")overlayAnatomy(ctx,seed,p,mode)
}

export function MorphogenesisLab(){
  const [mode,setMode]=useState<Mode>("turing"),[seed,setSeed]=useState(48217),[running,setRunning]=useState(true),[generation,setGeneration]=useState(0)
  const [p,setP]=useState<Params>({feed:.0367,kill:.0649,heterogeneity:.72,radial:.58,coupling:.55,crypts:.55,persistence:.48})
  const a=useRef<HTMLCanvasElement>(null),b=useRef<HTMLCanvasElement>(null),fa=useRef(init(seed)),fb=useRef(init(seed+1))
  function reset(next=seed){fa.current=init(next);fb.current=init(next+1);setGeneration(0)}
  useEffect(()=>{reset(seed)},[seed])
  useEffect(()=>{let frame=0,id=0;const loop=()=>{if(frame%2===0){if(running){for(let i=0;i<4;i++){step(fa.current,p);step(fb.current,p)}setGeneration(g=>g+4)}if(a.current&&b.current){render(a.current,fa.current,null,seed,p,mode==="divergence"?"hybrid":mode);render(b.current,fb.current,mode==="divergence"?fa.current:null,seed+1,p,mode)}}frame++;id=requestAnimationFrame(loop)};id=requestAnimationFrame(loop);return()=>cancelAnimationFrame(id)},[running,p,mode,seed])
  function slider(key:keyof Params,label:string,min:number,max:number,stepValue:number){return <label className="lab-control"><span>{label}<output>{p[key].toFixed(key==="feed"||key==="kill"?4:2)}</output></span><input type="range" min={min} max={max} step={stepValue} value={p[key]} onChange={e=>setP({...p,[key]:Number(e.target.value)})}/></label>}
  return <section className="simulator"><aside className="sim-controls"><p className="eyebrow">CONTROLLED MODEL COMPARISON</p><div className="lab-tabs">{(["turing","mechanical","hybrid","vascular","divergence"] as Mode[]).map(m=><button key={m} className={mode===m?"active":""} onClick={()=>setMode(m)}>{m==="divergence"?"Divergence map":`${m} twins`}</button>)}</div>
    {slider("feed","Activator feed",.025,.055,.0001)}{slider("kill","Inhibitor loss",.050,.072,.0001)}{slider("heterogeneity","Developmental heterogeneity",0,1,.01)}{slider("radial","Radial anisotropy",0,1,.01)}{slider("coupling","Chemo-mechanical coupling",0,1,.01)}{slider("crypts","Crypt-event density",0,1,.01)}{slider("persistence","Vascular persistence",0,1,.01)}
    <div className="button-row"><button className="btn primary" onClick={()=>setRunning(!running)}>{running?"Pause evolution":"Resume evolution"}</button><button className="btn" onClick={()=>{const next=Math.floor(Math.random()*999999);setSeed(next);reset(next)}}>New micro-history</button></div>
    <p className="fine-print">Seed {seed} · generation {generation}. “Twins” share parameters but differ by one microscopic seed. Parameters are abstract model controls, not named human morphogens.</p>
  </aside><div className="sim-output"><div className="canvas-card"><span>{mode==="divergence"?`REFERENCE A · SEED ${seed}`:`MODEL A · SEED ${seed}`}</span><canvas ref={a}/></div><div className="canvas-card"><span>{mode==="divergence"?"A↔B ABSOLUTE DIFFERENCE":`MODEL B · SEED ${seed+1}`}</span><canvas ref={b}/></div><div className="model-note"><span className="tag hypothesis">hypothesis</span><p>{mode==="turing"?"Reaction–diffusion asks whether local activation and longer-range inhibition can amplify microscopic perturbations in an annular domain.":mode==="mechanical"?"The mechanical surrogate asks whether radial stress, growth and folding can generate fibres and annular furrows without a chemical pre-pattern.":mode==="vascular"?"The vascular surrogate asks whether a transient branching scaffold and incomplete regression can leave persistent topological imprints.":mode==="hybrid"?"The hybrid couples chemical texture to radial mechanics, crypt-like loss events and a transient network—the most expressive model, but also the easiest to overfit.":"The divergence map shows where two micro-histories separate under identical parameters. Difference is sensitivity, not evidence of a particular biological cause."}</p></div></div></section>
}
