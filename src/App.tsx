import { useEffect, useRef, useState, type ReactNode } from "react";

type Subject = "Physics" | "Chemistry" | "Biology";
type Lab = { id:string; subject:Subject; title:string; description:string; icon:string };

const labs:Lab[]=[
{id:"projectile",subject:"Physics",title:"Projectile Motion",description:"Test how launch speed, angle and gravity shape a projectile's path.",icon:"↗"},
{id:"newton",subject:"Physics",title:"Newton's Laws",description:"Change force, mass and friction and observe acceleration.",icon:"→"},
{id:"ohm",subject:"Physics",title:"Ohm's Law",description:"Explore the relationship between voltage, current and resistance.",icon:"Ω"},
{id:"optics",subject:"Physics",title:"Lens & Ray Optics",description:"Move an object around a converging lens and construct its image.",icon:"◉"},
{id:"waves",subject:"Physics",title:"Waves & Sound",description:"Change amplitude and frequency and observe a travelling wave.",icon:"∿"},
{id:"atom",subject:"Chemistry",title:"Atomic Structure",description:"Explore protons, neutrons, electrons and atomic shells.",icon:"⚛"},
{id:"bonding",subject:"Chemistry",title:"Chemical Bonding",description:"Explore electron sharing and ionic or covalent bonding.",icon:"↔"},
{id:"reaction",subject:"Chemistry",title:"Reaction Rate",description:"Test temperature, concentration and surface area with collision theory.",icon:"✦"},
{id:"ph",subject:"Chemistry",title:"Acids & Bases",description:"Mix acid and base and observe pH and neutralisation.",icon:"pH"},
{id:"electrolysis",subject:"Chemistry",title:"Electrolysis",description:"Observe ion movement between electrodes as voltage changes.",icon:"⚡"},
{id:"cell",subject:"Biology",title:"Cell Explorer",description:"Explore a simplified cell and its major organelles.",icon:"◎"},
{id:"heart",subject:"Biology",title:"Human Heart",description:"Follow blood through the chambers and valves of the heart.",icon:"♥"},
{id:"lungs",subject:"Biology",title:"Respiratory System",description:"Explore breathing and gas exchange in the lungs.",icon:"◌"},
{id:"neuron",subject:"Biology",title:"Neuron & Reflex Arc",description:"Trace a signal from stimulus to response.",icon:"⌁"},
{id:"photosynthesis",subject:"Biology",title:"Photosynthesis",description:"Test light availability and observe a simple photosynthesis model.",icon:"☀"}
];

const clamp=(n:number,a:number,b:number)=>Math.max(a,Math.min(b,n));

function useCanvas(draw:(ctx:CanvasRenderingContext2D,w:number,h:number,t:number)=>void,deps:unknown[]){
 const ref=useRef<HTMLCanvasElement>(null);
 useEffect(()=>{const el=ref.current;if(!el)return;let raf=0,t=0;
  const frame=()=>{t+=1/60;const d=Math.min(devicePixelRatio||1,2),w=el.clientWidth,h=el.clientHeight;
   if(el.width!==w*d||el.height!==h*d){el.width=w*d;el.height=h*d}
   const ctx=el.getContext("2d");if(!ctx)return;ctx.setTransform(d,0,0,d,0,0);ctx.clearRect(0,0,w,h);draw(ctx,w,h,t);raf=requestAnimationFrame(frame)};
  frame();return()=>cancelAnimationFrame(raf)},deps);
 return ref;
}
function Grid({ctx,w,h}:{ctx:CanvasRenderingContext2D;w:number;h:number}){ctx.strokeStyle="#e8ebef";ctx.lineWidth=1;for(let x=0;x<w;x+=40){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,h);ctx.stroke()}for(let y=0;y<h;y+=40){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(w,y);ctx.stroke()}}
function Range({label,value,min,max,step=1,onChange,unit=""}:{label:string;value:number;min:number;max:number;step?:number;onChange:(v:number)=>void;unit?:string}){return <label className="control"><span>{label}<b>{value}{unit}</b></span><input type="range" min={min} max={max} step={step} value={value} onChange={e=>onChange(+e.target.value)}/></label>}
function Stage({children,controls,readout}:{children:ReactNode;controls?:ReactNode;readout?:ReactNode}){return <div className="lab-stage"><div className="visual">{children}</div>{readout&&<div className="readout">{readout}</div>}{controls&&<div className="controls">{controls}</div>}</div>}

function ProjectileLab(){const[speed,setSpeed]=useState(24),[angle,setAngle]=useState(45),[g,setG]=useState(9.8);const range=speed*speed*Math.sin(2*angle*Math.PI/180)/g;
 const ref=useCanvas((ctx,w,h)=>{Grid({ctx,w,h});const a=angle*Math.PI/180,maxY=speed*speed*Math.sin(a)**2/(2*g),scale=Math.min((w-70)/Math.max(range,1),(h-70)/Math.max(maxY,1))*.8;ctx.strokeStyle="#5662d9";ctx.lineWidth=4;ctx.beginPath();for(let x=0;x<=range;x+=Math.max(range/100,.01)){const y=x*Math.tan(a)-g*x*x/(2*speed*speed*Math.cos(a)**2),px=35+x*scale,py=h-30-y*scale;x?ctx.lineTo(px,py):ctx.moveTo(px,py)}ctx.stroke()},[speed,angle,g]);
 return <Stage><canvas ref={ref}/></Stage>}
function PhysicsLab({id}:{id:string}){const[a,setA]=useState(id==="waves"?35:30),[b,setB]=useState(id==="ohm"?10:2),[c,setC]=useState(5);
 const ref=useCanvas((ctx,w,h,t)=>{Grid({ctx,w,h});ctx.strokeStyle="#5662d9";ctx.lineWidth=4;
  if(id==="newton"){const acc=Math.max(0,(a-c)/Math.max(b,1));const x=30+(acc*t*t*18)%(w-100);ctx.fillStyle="#5662d9";ctx.fillRect(x,h/2-28,56,56);ctx.fillStyle="#111";ctx.font="15px system-ui";ctx.fillText("F = ma",x+9,h/2+5)}
  else if(id==="ohm"){const current=a/Math.max(b,.1);ctx.strokeStyle="#111";ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(60,h/2);ctx.lineTo(w*.35,h/2);ctx.lineTo(w*.4,h/2-45);ctx.lineTo(w*.6,h/2-45);ctx.lineTo(w*.65,h/2);ctx.lineTo(w-60,h/2);ctx.lineTo(w-60,h/2+60);ctx.lineTo(60,h/2+60);ctx.closePath();ctx.stroke();ctx.fillStyle="#111";ctx.font="16px system-ui";ctx.fillText("I = "+current.toFixed(2)+" A",70,h/2+95)}
  else if(id==="optics"){const cx=w/2,cy=h/2;ctx.strokeStyle="#5662d9";ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(cx,35);ctx.lineTo(cx,cy-85);ctx.moveTo(cx,cy+85);ctx.lineTo(cx,h-35);ctx.stroke();ctx.strokeStyle="#111";ctx.beginPath();ctx.moveTo(80,cy-55);ctx.lineTo(cx,cy-55);ctx.lineTo(w-80,cy);ctx.moveTo(80,cy-55);ctx.lineTo(cx,cy);ctx.lineTo(w-80,cy+55);ctx.stroke();ctx.fillRect(76,cy-55,7,55)}
  else {for(let x=0;x<w;x+=2){const y=h/2+a*Math.sin(x*.012*b-t*3);x?ctx.lineTo(x,y):ctx.moveTo(x,y)}ctx.stroke()}
 },[id,a,b,c]);
 const labels=id==="newton"?["Force","Mass","Friction"]:id==="ohm"?["Voltage","Resistance","Extra"]:id==="optics"?["Object distance","Focal length","Ray height"]:["Amplitude","Frequency","Wave speed"];
 return <Stage readout={id==="newton"?<>Acceleration <b>{Math.max(0,(a-c)/Math.max(b,1)).toFixed(2)} m/s²</b></>:id==="ohm"?<>Current <b>{(a/Math.max(b,.1)).toFixed(2)} A</b> · Power <b>{(a*a/Math.max(b,.1)).toFixed(1)} W</b></>:<>Adjust the variables and observe the model.</>} controls={<><Range label={labels[0]} value={a} min={1} max={id==="newton"?60:id==="ohm"?12:100} onChange={setA}/><Range label={labels[1]} value={b} min={1} max={id==="newton"?20:id==="ohm"?30:100} onChange={setB}/><Range label={labels[2]} value={c} min={0} max={100} onChange={setC}/></>}><canvas ref={ref}/></Stage>
}
function ChemistryLab({id}:{id:string}){const[a,setA]=useState(8),[b,setB]=useState(16),[c,setC]=useState(50);
 const ref=useCanvas((ctx,w,h,t)=>{Grid({ctx,w,h});const cx=w/2,cy=h/2;ctx.strokeStyle="#dfe3e8";ctx.lineWidth=2;
  if(id==="atom"){for(let s=1;s<=3;s++){ctx.beginPath();ctx.arc(cx,cy,45+s*42,0,7);ctx.stroke()}ctx.fillStyle="#5662d9";ctx.beginPath();ctx.arc(cx,cy,27,0,7);ctx.fill();for(let i=0;i<a;i++){const shell=i<2?1:i<8?2:3,n=shell===1?2:shell===2?6:Math.max(1,a-8),idx=shell===1?i:shell===2?i-2:i-8,ang=idx/n*7+t*(shell===1?.6:.25),r=45+shell*42;ctx.fillStyle="#111";ctx.beginPath();ctx.arc(cx+Math.cos(ang)*r,cy+Math.sin(ang)*r,5,0,7);ctx.fill()}}
  else if(id==="bonding"){ctx.fillStyle="#5662d9";ctx.beginPath();ctx.arc(cx-90,cy,45,0,7);ctx.arc(cx+90,cy,45,0,7);ctx.fill();ctx.strokeStyle="#111";ctx.lineWidth=6;for(let i=0;i<a;i++){ctx.beginPath();ctx.moveTo(cx-45,cy+(i-(a-1)/2)*14);ctx.lineTo(cx+45,cy+(i-(a-1)/2)*14);ctx.stroke()}}
  else if(id==="ph"){const grad=ctx.createLinearGradient(40,0,w-40,0);grad.addColorStop(0,"#d33");grad.addColorStop(.5,"#fff");grad.addColorStop(1,"#5662d9");ctx.fillStyle=grad;ctx.fillRect(40,cy-25,w-80,50);const ph=clamp(7+(b-a)/15,0,14);ctx.fillStyle="#111";ctx.beginPath();ctx.arc(40+ph/14*(w-80),cy,10,0,7);ctx.fill()}
  else {for(let i=0;i<Math.round(10+c/5);i++){const x=(i*73+t*(20+c/4))%w,y=(i*47+t*15)%h;ctx.fillStyle=i%2?"#5662d9":"#111";ctx.beginPath();ctx.arc(x,y,5,0,7);ctx.fill()}}
 },[id,a,b,c]);
 return <Stage readout={id==="atom"?<>Protons <b>{a}</b> · Neutrons <b>{Math.max(0,b-a)}</b> · Electrons <b>{a}</b></>:id==="ph"?<>pH <b>{clamp(7+(b-a)/15,0,14).toFixed(1)}</b></>:<>Interactive model · change the conditions and observe.</>} controls={<><Range label="Primary variable" value={a} min={1} max={id==="atom"?20:100} onChange={setA}/><Range label="Secondary variable" value={b} min={1} max={id==="atom"?40:100} onChange={setB}/><Range label="Condition" value={c} min={0} max={100} onChange={setC}/></>}><canvas ref={ref}/></Stage>
}
function BiologyLab({id}:{id:string}){const[level,setLevel]=useState(60);const ref=useCanvas((ctx,w,h,t)=>{const cx=w/2,cy=h/2;ctx.lineWidth=4;ctx.strokeStyle="#5662d9";ctx.fillStyle="#eef0ff";
 if(id==="cell"){ctx.beginPath();ctx.ellipse(cx,cy,w*.28,h*.32,0,0,7);ctx.fill();ctx.stroke();ctx.fillStyle="#5662d9";ctx.beginPath();ctx.arc(cx,cy,40,0,7);ctx.fill();for(let i=0;i<8;i++){ctx.fillStyle="#111";ctx.beginPath();ctx.ellipse(cx+Math.cos(i*2.7+t*.1)*w*.17,cy+Math.sin(i*2.7+t*.1)*h*.2,12,7,i,0,7);ctx.fill()}}
 else if(id==="heart"){ctx.fillStyle="#f3dfe1";ctx.beginPath();ctx.moveTo(cx,cy-65);ctx.bezierCurveTo(cx-110,cy-145,cx-145,cy+25,cx,cy+120);ctx.bezierCurveTo(cx+145,cy+25,cx+110,cy-145,cx,cy-65);ctx.fill();ctx.stroke();ctx.strokeStyle="#5662d9";ctx.lineWidth=10;ctx.beginPath();ctx.arc(cx,cy,60,-1.2,1.2);ctx.stroke()}
 else if(id==="lungs"){ctx.beginPath();ctx.ellipse(cx-75,cy,68,112,0,0,7);ctx.ellipse(cx+75,cy,68,112,0,0,7);ctx.fill();ctx.stroke();ctx.strokeStyle="#5662d9";ctx.lineWidth=7;ctx.beginPath();ctx.moveTo(cx,cy-145);ctx.lineTo(cx,cy-55);ctx.lineTo(cx-55,cy-10);ctx.moveTo(cx,cy-55);ctx.lineTo(cx+55,cy-10);ctx.stroke()}
 else if(id==="neuron"){ctx.strokeStyle="#5662d9";ctx.lineWidth=5;ctx.beginPath();ctx.moveTo(70,cy);ctx.lineTo(cx-30,cy);ctx.lineTo(cx+45,cy-20);ctx.lineTo(w-70,cy-20);ctx.stroke();ctx.fillStyle="#111";ctx.beginPath();ctx.arc(cx,cy,28,0,7);ctx.fill();for(let i=0;i<8;i++){ctx.fillStyle=i<level/13?"#5662d9":"#ccd1d8";ctx.beginPath();ctx.arc(80+i*(w-160)/7,cy,7,0,7);ctx.fill()}}
 else {ctx.strokeStyle="#5662d9";ctx.lineWidth=6;ctx.beginPath();ctx.moveTo(cx,cy+120);ctx.lineTo(cx,cy-100);ctx.stroke();for(let i=0;i<6;i++){ctx.fillStyle="#dfe6cf";ctx.beginPath();ctx.ellipse(cx+(i%2?1:-1)*(35+i*14),cy-35-i*20,44,17,i%2?.5:-.5,0,7);ctx.fill();ctx.stroke()}}
 },[id,level]);return <Stage readout={<>Condition level <b>{level}%</b> · Observe how the biological system responds.</>} controls={<Range label={id==="heart"?"Heart rate":id==="lungs"?"Breathing depth":id==="neuron"?"Stimulus strength":"Activity / light"} value={level} min={0} max={100} onChange={setLevel} unit="%" />}><canvas ref={ref}/></Stage>}

function LabSimulation({lab}:{lab:Lab}){if(lab.id==="projectile")return <ProjectileLab/>;if(lab.subject==="Physics")return <PhysicsLab id={lab.id}/>;if(lab.subject==="Chemistry")return <ChemistryLab id={lab.id}/>;return <BiologyLab id={lab.id}/>}

export default function App(){const[subject,setSubject]=useState<Subject|"All">("All"),[active,setActive]=useState<Lab|null>(null);const filters=["All","Physics","Chemistry","Biology"] as const;const visible=labs.filter(l=>subject==="All"||l.subject===subject);
 return <main><header><button className="brand" onClick={()=>setActive(null)}><span className="mark">S</span><span><strong>Soren Labs</strong><small>Interactive science for students</small></span></button><nav>{filters.map(x=><button className={subject===x?"active":""} onClick={()=>setSubject(x)} key={x}>{x}</button>)}</nav></header>
 {active?<section className="lab-page"><button className="back" onClick={()=>setActive(null)}>← All Labs</button><div className="lab-head"><span className="pill">{active.subject}</span><h1>{active.title}</h1><p>{active.description}</p></div><LabSimulation lab={active}/><div className="learn"><h2>Explore → Observe → Understand</h2><p>Change one variable at a time, watch the model respond, and connect the observation to the scientific idea.</p></div></section>:<><section className="hero"><span className="eyebrow">SOREN LABS · 15 INTERACTIVE EXPERIMENTS</span><h1>Learn science by <em>testing it.</em></h1><p>Interactive Physics, Chemistry and Biology experiments designed to make concepts tangible—not just readable.</p></section><div className="filters">{filters.map(x=><button className={subject===x?"active":""} onClick={()=>setSubject(x)} key={x}>{x}</button>)}</div><section className="grid">{visible.map(l=><article className="card" key={l.id} onClick={()=>setActive(l)}><div className="icon">{l.icon}</div><span>{l.subject}</span><h2>{l.title}</h2><p>{l.description}</p><button>Open Lab →</button></article>)}</section></>}</main>
}