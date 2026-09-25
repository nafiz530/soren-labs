import {useEffect,useRef,useState} from 'react';

type Lab={id:string;subject:'Physics'|'Chemistry'|'Biology';title:string;description:string;icon:string};
const labs:Lab[]=[
{id:'projectile',subject:'Physics',title:'Projectile Motion',description:'Launch an object and explore how velocity, angle and gravity shape its path.',icon:'↗'},
{id:'newton',subject:'Physics',title:"Newton's Laws",description:'Change force, mass and friction and watch acceleration respond.',icon:'→'},
{id:'ohm',subject:'Physics',title:"Ohm's Law",description:'Build a simple circuit and explore the relationship between voltage, current and resistance.',icon:'Ω'},
{id:'optics',subject:'Physics',title:'Lens & Ray Optics',description:'Move an object around a lens and observe real-time ray construction.',icon:'◉'},
{id:'waves',subject:'Physics',title:'Waves & Sound',description:'Shape a wave by changing frequency and amplitude.',icon:'∿'},
{id:'atom',subject:'Chemistry',title:'Atomic Structure',description:'Explore protons, neutrons and electron shells.',icon:'⚛'},
{id:'bonding',subject:'Chemistry',title:'Chemical Bonding',description:'See how atoms share or transfer electrons to form bonds.',icon:'↔'},
{id:'reaction',subject:'Chemistry',title:'Reaction Rate',description:'Experiment with temperature and concentration using collision theory.',icon:'✦'},
{id:'ph',subject:'Chemistry',title:'Acids & Bases',description:'Mix solutions and watch pH and neutralization change.',icon:'pH'},
{id:'electrolysis',subject:'Chemistry',title:'Electrolysis',description:'Observe ions moving through an electrolyte under an electric field.',icon:'⚡'},
{id:'cell',subject:'Biology',title:'Cell Explorer',description:'Explore organelles inside an interactive cell.',icon:'◎'},
{id:'heart',subject:'Biology',title:'Human Heart',description:'Follow blood through the chambers and valves of the heart.',icon:'♥'},
{id:'lungs',subject:'Biology',title:'Respiratory System',description:'Explore breathing and gas exchange from lungs to alveoli.',icon:'◌'},
{id:'neuron',subject:'Biology',title:'Neuron & Reflex Arc',description:'Trace a signal from stimulus to response.',icon:'⌁'},
{id:'photosynthesis',subject:'Biology',title:'Photosynthesis',description:'Change light, CO₂ and water and observe photosynthetic activity.',icon:'☀'}
];

function Simulation({lab}:{lab:Lab}) {
 const canvas=useRef<HTMLCanvasElement>(null); const [a,setA]=useState(45); const [b,setB]=useState(20); const [c,setC]=useState(9.8);
 useEffect(()=>{const el=canvas.current;if(!el)return;const ctx=el.getContext('2d')!;let raf=0;let t=0;
 const draw=()=>{t+=.016;const dpr=Math.min(devicePixelRatio||1,2),w=el.clientWidth,h=el.clientHeight;el.width=w*dpr;el.height=h*dpr;ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);
 ctx.lineWidth=2;ctx.strokeStyle='rgba(20,30,45,.18)';for(let x=0;x<w;x+=40){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,h);ctx.stroke()}for(let y=0;y<h;y+=40){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(w,y);ctx.stroke()}
 ctx.strokeStyle='currentColor';ctx.lineWidth=3;ctx.beginPath();
 if(lab.id==='projectile'){const v=b,ang=a*Math.PI/180,g=c,scale=Math.min(w/55,h/25);for(let x=0;x<45;x+=.25){const y=(x*Math.tan(ang)-g*x*x/(2*v*v*Math.cos(ang)**2));const px=35+x*scale,py=h-30-y*scale;if(x===0)ctx.moveTo(px,py);else ctx.lineTo(px,py)}}
 else if(lab.id==='waves'){for(let x=0;x<w;x+=3){const y=h/2+Math.sin(x*.035*b+t*2)*a; if(x===0)ctx.moveTo(x,y);else ctx.lineTo(x,y)}}
 else {for(let x=0;x<w;x+=3){const y=h/2+Math.sin(x*.025*b+t)*Math.min(55,a);if(x===0)ctx.moveTo(x,y);else ctx.lineTo(x,y)}}
 ctx.stroke();raf=requestAnimationFrame(draw)};draw();return()=>cancelAnimationFrame(raf)},[lab,a,b,c]);
 return <div className="lab-stage"><canvas ref={canvas}/><div className="controls">
 <label>Parameter A <input type="range" min="1" max="90" value={a} onChange={e=>setA(+e.target.value)}/><b>{a}</b></label>
 <label>Parameter B <input type="range" min="1" max="40" value={b} onChange={e=>setB(+e.target.value)}/><b>{b}</b></label>
 <label>Parameter C <input type="range" min="1" max="20" step=".1" value={c} onChange={e=>setC(+e.target.value)}/><b>{c}</b></label>
 </div></div>
}

export default function App(){const [subject,setSubject]=useState<'All'|'Physics'|'Chemistry'|'Biology'>('All');const [active,setActive]=useState<Lab|null>(null);const visible=labs.filter(x=>subject==='All'||x.subject===subject);
 return <main><header><div className="brand"><span className="mark">S</span><div><strong>Soren Labs</strong><small>Interactive science for students</small></div></div><nav>{(['All','Physics','Chemistry','Biology'] as const).map(x=><button className={subject===x?'active':''} onClick={()=>setSubject(x)} key={x}>{x}</button>)}</nav></header>
 {active?<section className="lab-page"><button className="back" onClick={()=>setActive(null)}>← All Labs</button><div className="lab-head"><div><span className="pill">{active.subject}</span><h1>{active.title}</h1><p>{active.description}</p></div></div><Simulation lab={active}/><div className="learn"><h2>Explore it yourself</h2><p>Change the controls and observe what happens. The simulation runs locally in your browser, so interaction stays fast and works without a server round-trip.</p></div></section>:<><section className="hero"><span className="eyebrow">SOREN LABS · V1</span><h1>Learn science by <em>testing it.</em></h1><p>Interactive Physics, Chemistry and Biology experiments designed to make concepts feel tangible.</p></section><div className="filters">{(['All','Physics','Chemistry','Biology'] as const).map(x=><button className={subject===x?'active':''} onClick={()=>setSubject(x)} key={x}>{x}</button>)}</div><section className="grid">{visible.map(l=><article className="card" key={l.id} onClick={()=>setActive(l)}><div className="icon">{l.icon}</div><span>{l.subject}</span><h2>{l.title}</h2><p>{l.description}</p><button>Open Lab →</button></article>)}</section></>}</main>}