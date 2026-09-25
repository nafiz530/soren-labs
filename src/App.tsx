import { useEffect, useRef, useState } from "react";

type Subject = "Physics" | "Chemistry" | "Biology";
type Lab = { id: string; subject: Subject; title: string; description: string; icon: string };

const labs: Lab[] = [
  { id:"projectile",subject:"Physics",title:"Projectile Motion",description:"Launch an object and test how speed, angle and gravity shape its trajectory.",icon:"↗" },
  { id:"newton",subject:"Physics",title:"Newton's Laws",description:"Change force, mass and friction and observe acceleration and motion.",icon:"→" },
  { id:"ohm",subject:"Physics",title:"Ohm's Law",description:"Build a simple circuit and explore voltage, current and resistance.",icon:"Ω" },
  { id:"optics",subject:"Physics",title:"Lens & Ray Optics",description:"Move an object around a converging lens and construct the image with rays.",icon:"◉" },
  { id:"waves",subject:"Physics",title:"Waves & Sound",description:"Change amplitude and frequency and see how a travelling wave changes.",icon:"∿" },
  { id:"atom",subject:"Chemistry",title:"Atomic Structure",description:"Change atomic number and isotope mass to explore protons, neutrons and shells.",icon:"⚛" },
  { id:"bonding",subject:"Chemistry",title:"Chemical Bonding",description:"Explore electron transfer and sharing in ionic and covalent bonding.",icon:"↔" },
  { id:"reaction",subject:"Chemistry",title:"Reaction Rate",description:"Test temperature, concentration and surface area with a collision model.",icon:"✦" },
  { id:"ph",subject:"Chemistry",title:"Acids & Bases",description:"Mix acid and base and watch concentration, pH and neutralisation change.",icon:"pH" },
  { id:"electrolysis",subject:"Chemistry",title:"Electrolysis",description:"Apply voltage and observe ions moving between electrodes in an electrolyte.",icon:"⚡" },
  { id:"cell",subject:"Biology",title:"Cell Explorer",description:"Inspect a cell and learn what its major organelles do.",icon:"◎" },
  { id:"heart",subject:"Biology",title:"Human Heart",description:"Follow oxygen-poor and oxygen-rich blood through the four chambers.",icon:"♥" },
  { id:"lungs",subject:"Biology",title:"Respiratory System",description:"Explore breathing, alveoli and gas exchange as the lungs inflate.",icon:"◌" },
  { id:"neuron",subject:"Biology",title:"Neuron & Reflex Arc",description:"Trace an electrical signal from stimulus to response.",icon:"⌁" },
  { id:"photosynthesis",subject:"Biology",title:"Photosynthesis",description:"Test light, carbon dioxide and water availability and observe the rate.",icon:"☀" }
];

const clamp=(n:number,a:number,b:number)=>Math.max(a,Math.min(b,n));

function useCanvas(draw:(ctx:CanvasRenderingContext2D,w:number,h:number,t:number)=>void,deps:unknown[]=[]){
  const ref=useRef<HTMLCanvasElement>(null);
  useEffect(()=>{
    const el=ref.current;if(!el)return;let raf=0;let t=0;
    const frame=()=>{t+=1/60;const d=Math.min(window.devicePixelRatio||1,2),w=el.clientWidth,h=el.clientHeight;
      if(el.width!==w*d||el.height!==h*d){el.width=w*d;el.height=h*d}
      const ctx=el.getContext("2d")!;ctx.setTransform(d,0,0,d,0,0);ctx.clearRect(0,0,w,h);draw(ctx,w,h,t);raf=requestAnimationFrame(frame)};
    frame();return()=>cancelAnimationFrame(raf);
  },deps);
  return ref;
}
function Grid({ctx,w,h}:{ctx:CanvasRenderingContext2D;w:number;h:number}){
  ctx.strokeStyle="#e8ebef";ctx.lineWidth=1;for(let x=0;x<w;x+=40){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,h);ctx.stroke()}for(let y=0;y<h;y+=40){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(w,y);ctx.stroke()}
}
function Range({label,value,min,max,step=1,onChange,unit=""}:{label:string;value:number;min:number;max:number;step?:number;onChange:(v:number)=>void;unit?:string}){
 return <label className="control"><span>{label}<b>{value}{unit}</b></span><input type="range" min={min} max={max} step={step} value={value} onChange={e=>onChange(+e.target.value)}/></label>
}
function Stage({children,controls}:{children:React.ReactNode;controls:React.ReactNode}){
 return <div className="lab-stage"><div className="visual">{children}</div><div className="controls">{controls}</div></div>
}

function Projectile(){
 const [speed,setSpeed]=useState(24),[angle,setAngle]=useState(45),[g,setG]=useState(9.8);
 const ref=useCanvas((ctx,w,h)=>{
  Grid({ctx,w,h});const a=angle*Math.PI/180,range=speed*speed*Math.sin(2*a)/g,scale=Math.min((w-70)/Math.max(range,1),(h-70)/(speed*speed*Math.sin(a)**2/(2*g)||1))*0.75;
  ctx.strokeStyle="#5662d9";ctx.lineWidth=4;ctx.beginPath();for(let x=0;x<=range;x+=range/100){const y=x*Math.tan(a)-g*x*x/(2*speed*speed*Math.cos(a)**2),px=35+x*scale,py=h-30-y*scale;if(x===0)ctx.moveTo(px,py);else ctx.lineTo(px,py)}ctx.stroke();
  const x=(speed*speed*Math.sin(2*a)/g)*.5,y=x*Math.tan(a)-g*x*x/(2*speed*speed*Math.cos(a)**2);ctx.fillStyle="#111";ctx.beginPath();ctx.arc(35+x*scale,h-30-y*scale,7,0,7);ctx.fill();
 },[speed,angle,g]);
 return <Stage><canvas ref={ref}/><div className="readout"><b>Range</b> {((speed*speed*Math.sin(2*angle*Math.PI/180))/g).toFixed(1)} m · <b>Flight time</b> {(2*speed*Math.sin(angle*Math.PI/180)/g).toFixed(2)} s</div></StageWithControls>
 function StageWithControls(){return <Stage children={<canvas ref={ref}/>} controls={<><Range label="Initial speed" value={speed} min={5} max={40} onChange={setSpeed} unit=" m/s"/><Range label="Launch angle" value={angle} min={5} max={85} onChange={setAngle} unit="°"/><Range label="Gravity" value={g} min={1} max={20} step={.1} onChange={setG} unit=" m/s²"/></>}/>}
}

function Newton(){
 const [force,setForce]=useState(30),[mass,setMass]=useState(5),[friction,setFriction]=useState(4);
 const ref=useCanvas((ctx,w,h,t)=>{Grid({ctx,w,h});const a=(force-friction)/mass,x=clamp(40+(a*t*t*18)% (w-120),40,w-80);ctx.fillStyle="#5662d9";ctx.fillRect(x,h/2-30,60,60);ctx.fillStyle="#111";ctx.font="14px system-ui";ctx.fillText("F = ma",x+10,h/2+5)},[force,mass,friction]);
 return <Stage><canvas ref={ref}/><div className="readout"><b>Net force</b> {Math.max(0,force-friction).toFixed(1)} N · <b>Acceleration</b> {Math.max(0,(force-friction)/mass).toFixed(2)} m/s²</div><div/></Stage>
}
function Ohm(){
 const [voltage,setV]=useState(6),[resistance,setR]=useState(10);
 const current=voltage/resistance;const ref=useCanvas((ctx,w,h)=>{ctx.strokeStyle="#111";ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(60,h/2);ctx.lineTo(w*.28,h/2);ctx.lineTo(w*.36,h/2-55);ctx.lineTo(w*.64,h/2-55);ctx.lineTo(w*.72,h/2);ctx.lineTo(w-60,h/2);ctx.lineTo(w-60,h/2+70);ctx.lineTo(60,h/2+70);ctx.closePath();ctx.stroke();ctx.strokeStyle="#e3a51a";ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(w*.36,h/2-55);ctx.lineTo(w*.64,h/2-55);ctx.stroke();ctx.fillStyle="#111";ctx.font="16px system-ui";ctx.fillText("R = "+resistance+" Ω",w*.44,h/2-68);ctx.fillText("V = "+voltage+" V",70,h/2+100)},[voltage,resistance]);
 return <Stage><canvas ref={ref}/><div className="readout"><b>Current</b> {current.toFixed(2)} A · <b>Power</b> {(voltage*current).toFixed(1)} W</div><div className="control-grid"><Range label="Voltage" value={voltage} min={1} max={12} onChange={setV} unit=" V"/><Range label="Resistance" value={resistance} min={1} max={30} onChange={setR} unit=" Ω"/></div></Stage>
}
function Optics(){
 const [object,setObject]=useState(70),[focal,setFocal]=useState(80);
 const ref=useCanvas((ctx,w,h)=>{Grid({ctx,w,h});const cx=w/2,cy=h/2,ox=cx-object;ctx.strokeStyle="#5662d9";ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(cx,30);ctx.quadraticCurveTo(cx-22,cy,cx,cy+180);ctx.quadraticCurveTo(cx+22,cy,cx,30);ctx.stroke();ctx.fillStyle="#111";ctx.fillRect(ox,cy-45,5,45);const fi=cx-focal;ctx.fillStyle="#737c88";ctx.beginPath();ctx.arc(fi,cy,5,0,7);ctx.fill();ctx.beginPath();ctx.arc(cx+focal,cy,5,0,7);ctx.fill();ctx.strokeStyle="#111";ctx.beginPath();ctx.moveTo(ox,cy-45);ctx.lineTo(cx,cy-45);ctx.lineTo(cx+focal,cy);ctx.stroke();ctx.beginPath();ctx.moveTo(ox,cy-45);ctx.lineTo(cx,cy);ctx.lineTo(cx+focal,cy+45);ctx.stroke()},[object,focal]);
 const u=object,v=1/(1/focal-1/object);return <Stage><canvas ref={ref}/><div className="readout"><b>Object distance</b> {object} px · <b>Image distance</b> {Number.isFinite(v)?Math.abs(v).toFixed(0):"∞"} px</div><div className="control-grid"><Range label="Object position" value={object} min={30} max={180} onChange={setObject}/><Range label="Focal length" value={focal} min={40} max={140} onChange={setFocal}/></div></Stage>
}
function Waves(){
 const [amp,setAmp]=useState(35),[freq,setFreq]=useState(2);
 const ref=useCanvas((ctx,w,h,t)=>{Grid({ctx,w,h});ctx.strokeStyle="#5662d9";ctx.lineWidth=4;ctx.beginPath();for(let x=0;x<w;x+=2){const y=h/2+amp*Math.sin(x*.012*freq-t*3);if(!x)ctx.moveTo(x,y);else ctx.lineTo(x,y)}ctx.stroke()},[amp,freq]);
 return <Stage><canvas ref={ref}/><div className="readout"><b>Amplitude</b> {amp} · <b>Frequency</b> {freq.toFixed(1)} Hz · <b>Period</b> {(1/freq).toFixed(2)} s</div><div className="control-grid"><Range label="Amplitude" value={amp} min={5} max={70} onChange={setAmp}/><Range label="Frequency" value={freq} min={.5} max={5} step={.1} onChange={setFreq}/></div></Stage>
}

function Atom(){
 const [z,setZ]=useState(8),[mass,setMass]=useState(16);const electrons=z;
 const ref=useCanvas((ctx,w,h,t)=>{const cx=w/2,cy=h/2;ctx.strokeStyle="#dfe3e8";ctx.lineWidth=2;for(let s=1;s<=4;s++){ctx.beginPath();ctx.arc(cx,cy,35+s*32,0,7);ctx.stroke()}ctx.fillStyle="#5662d9";ctx.beginPath();ctx.arc(cx,cy,24,0,7);ctx.fill();ctx.fillStyle="#fff";ctx.font="bold 14px system-ui";ctx.textAlign="center";ctx.fillText("+"+z,cx,cy+5);for(let i=0;i<electrons;i++){const shell=i<2?1:i<8?2:3, count=shell===1?Math.min(electrons,2):shell===2?Math.min(Math.max(electrons-2,0),8):Math.max(electrons-10,0);const idx=shell===1?i:shell===2?i-2:i-10;const a=idx/count*7+t*(shell===1?.7:.3);const r=35+shell*32;ctx.fillStyle="#111";ctx.beginPath();ctx.arc(cx+Math.cos(a)*r,cy+Math.sin(a)*r,5,0,7);ctx.fill()}},[z,mass]);
 return <Stage><canvas ref={ref}/><div className="readout"><b>Protons</b> {z} · <b>Neutrons</b> {Math.max(0,mass-z)} · <b>Electrons</b> {electrons}</div><div className="control-grid"><Range label="Atomic number" value={z} min={1} max={20} onChange={setZ}/><Range label="Mass number" value={mass} min={z} max={40} onChange={setMass}/></div></Stage>
}
function Bonding(){
 const [shared,setShared]=useState(1);const ref=useCanvas((ctx,w,h,t)=>{const y=h/2;ctx.fillStyle="#5662d9";ctx.beginPath();ctx.arc(w/2-90,y,45,0,7);ctx.fill();ctx.beginPath();ctx.arc(w/2+90,y,45,0,7);ctx.fill();ctx.fillStyle="#fff";ctx.font="bold 20px system-ui";ctx.textAlign="center";ctx.fillText("A",w/2-90,y+7);ctx.fillText("B",w/2+90,y+7);ctx.strokeStyle="#111";ctx.lineWidth=6;for(let i=0;i<shared;i++){ctx.beginPath();ctx.moveTo(w/2-45,y+(i-(shared-1)/2)*14);ctx.lineTo(w/2+45,y+(i-(shared-1)/2)*14);ctx.stroke()}},[shared]);
 return <Stage><canvas ref={ref}/><div className="readout"><b>{shared===1?"Single":"Double"} covalent bond</b> · {shared*2} shared electrons</div><Range label="Shared electron pairs" value={shared} min={1} max={3} onChange={setShared}/></Stage>
}
function Reaction(){
 const [temp,setTemp]=useState(25),[conc,setConc]=useState(50),[area,setArea]=useState(50);const rate=(temp/25)*(.3+conc/100)*(.4+area/100);
 const ref=useCanvas((ctx,w,h,t)=>{const n=Math.round(12+rate*18);for(let i=0;i<n;i++){const x=(i*97+t*40*(i%3+1))%w,y=(i*53+t*28*(i%2+1))%h;ctx.fillStyle=i%3?"#5662d9":"#111";ctx.beginPath();ctx.arc(x,y,5,0,7);ctx.fill()}},[rate]);
 return <Stage><canvas ref={ref}/><div className="readout"><b>Relative reaction rate</b> {rate.toFixed(2)}×</div><div className="control-grid"><Range label="Temperature" value={temp} min={5} max={80} onChange={setTemp} unit=" °C"/><Range label="Concentration" value={conc} min={10} max={100} onChange={setConc} unit="%"/><Range label="Surface area" value={area} min={10} max={100} onChange={setArea} unit="%"/></div></Stage>
}
function PH(){
 const [acid,setAcid]=useState(50),[base,setBase]=useState(20);const net=acid-base;const ph=net===0?7:clamp(7-net/12,0,14);
 const ref=useCanvas((ctx,w,h)=>{const grad=ctx.createLinearGradient(0,0,w,0);grad.addColorStop(0,"#d33");grad.addColorStop(.5,"#fff");grad.addColorStop(1,"#5b6bdc");ctx.fillStyle=grad;ctx.fillRect(40,h/2-25,w-80,50);ctx.fillStyle="#111";ctx.font="bold 16px system-ui";ctx.textAlign="center";ctx.fillText("0",40,h/2+55);ctx.fillText("7",w/2,h/2+55);ctx.fillText("14",w-40,h/2+55);ctx.beginPath();ctx.arc(40+(ph/14)*(w-80),h/2,10,0,7);ctx.fill()},[ph]);
 return <Stage><canvas ref={ref}/><div className="readout"><b>pH</b> {ph.toFixed(1)} · {ph<7?"Acidic":ph>7?"Basic":"Neutral"}</div><div className="control-grid"><Range label="Acid added" value={acid} min={0} max={100} onChange={setAcid}/><Range label="Base added" value={base} min={0} max={100} onChange={setBase}/></div></Stage>
}
function Electrolysis(){
 const [voltage,setVoltage]=useState(6);const ref=useCanvas((ctx,w,h,t)=>{const left=w*.28,right=w*.72;ctx.fillStyle="#dce9f4";ctx.fillRect(left,40,right-left,h-80);ctx.strokeStyle="#111";ctx.lineWidth=7;ctx.beginPath();ctx.moveTo(left,55);ctx.lineTo(left,h-55);ctx.moveTo(right,55);ctx.lineTo(right,h-55);ctx.stroke();ctx.fillStyle="#5662d9";for(let i=0;i<16;i++){const x=left+30+((i*71+t*voltage*10)%Math.max(1,right-left-60));const y=65+((i*43+t*30)%Math.max(1,h-130));ctx.beginPath();ctx.arc(x,y,4,0,7);ctx.fill()}},[voltage]);
 return <Stage><canvas ref={ref}/><div className="readout"><b>Applied voltage</b> {voltage} V · Ion movement increases with field strength</div><Range label="Voltage" value={voltage} min={0} max={12} onChange={setVoltage} unit=" V"/></Stage>
}

function Biology({id}:{id:string}){
 const [level,setLevel]=useState(60);
 const ref=useCanvas((ctx,w,h,t)=>{const cx=w/2,cy=h/2;
  ctx.lineWidth=3;ctx.strokeStyle="#5662d9";ctx.fillStyle="#eef0ff";
  if(id==="cell"){ctx.beginPath();ctx.ellipse(cx,cy,w*.28,h*.32,0,0,7);ctx.fill();ctx.stroke();ctx.fillStyle="#5662d9";ctx.beginPath();ctx.arc(cx,cy,42,0,7);ctx.fill();for(let i=0;i<9;i++){const x=cx+Math.cos(i*2.4+t*.1)*w*.18,y=cy+Math.sin(i*2.4+t*.1)*h*.22;ctx.fillStyle="#111";ctx.beginPath();ctx.ellipse(x,y,13,7,i,0,7);ctx.fill()}}
  if(id==="heart"){ctx.fillStyle="#f3dfe1";ctx.beginPath();ctx.moveTo(cx,cy-70);ctx.bezierCurveTo(cx-110,cy-150,cx-150,cy+30,cx,cy+120);ctx.bezierCurveTo(cx+150,cy+30,cx+110,cy-150,cx,cy-70);ctx.fill();ctx.stroke();ctx.strokeStyle="#5662d9";ctx.lineWidth=10;ctx.beginPath();ctx.arc(cx,cy,65,-1.2,1.2);ctx.stroke();ctx.fillStyle="#111";ctx.font="bold 16px system-ui";ctx.textAlign="center";ctx.fillText("blood flow",cx,cy+160)}
  if(id==="lungs"){ctx.fillStyle="#eef0ff";ctx.beginPath();ctx.ellipse(cx-75,cy,70,115,0,0,7);ctx.ellipse(cx+75,cy,70,115,0,0,7);ctx.fill();ctx.stroke();ctx.strokeStyle="#5662d9";ctx.lineWidth=7;ctx.beginPath();ctx.moveTo(cx,cy-150);ctx.lineTo(cx,cy-65);ctx.lineTo(cx-55,cy-20);ctx.moveTo(cx,cy-65);ctx.lineTo(cx+55,cy-20);ctx.stroke();ctx.fillStyle="#111";ctx.font="15px system-ui";ctx.textAlign="center";ctx.fillText("inhalation",cx,cy+155)}
  if(id==="neuron"){ctx.strokeStyle="#5662d9";ctx.lineWidth=5;ctx.beginPath();ctx.moveTo(80,cy);ctx.lineTo(cx-30,cy);ctx.lineTo(cx+50,cy-20);ctx.lineTo(w-70,cy-20);ctx.stroke();ctx.fillStyle="#111";ctx.beginPath();ctx.arc(cx,cy,28,0,7);ctx.fill();for(let i=0;i<8;i++){const x=80+i*(w-150)/7;ctx.beginPath();ctx.arc(x,cy,7,0,7);ctx.fillStyle=i<Math.floor(level/13)?"#5662d9":"#cfd3da";ctx.fill()}}
  if(id==="photosynthesis"){ctx.strokeStyle="#5662d9";ctx.lineWidth=6;ctx.beginPath();ctx.moveTo(cx,cy+120);ctx.lineTo(cx,cy-90);ctx.stroke();for(let i=0;i<6;i++){ctx.fillStyle="#dfe6cf";ctx.beginPath();ctx.ellipse(cx+(i%2?1:-1)*(30+i*15),cy-40-i*20,45,18,(i%2?.5:-.5),0,7);ctx.fill();ctx.stroke()}ctx.fillStyle="#111";ctx.font="15px system-ui";ctx.textAlign="center";ctx.fillText("glucose + oxygen",cx,cy+155)}
 },[id,level]);
 const label=id==="cell"?"Cell activity":id==="heart"?"Heart rate":id==="lungs"?"Breathing depth":id==="neuron"?"Stimulus strength":"Light intensity";
 return <Stage><canvas ref={ref}/><div className="readout"><b>{label}</b> {level}% · Observe how changing the condition affects the model.</div><Range label={label} value={level} min={0} max={100} onChange={setLevel} unit="%"/></Stage>
}

function LabSimulation({lab}:{lab:Lab}){
 if(lab.id==="projectile")return <Projectile/>;if(lab.id==="newton")return <Newton/>;if(lab.id==="ohm")return <Ohm/>;if(lab.id==="optics")return <Optics/>;if(lab.id==="waves")return <Waves/>;if(lab.id==="atom")return <Atom/>;if(lab.id==="bonding")return <Bonding/>;if(lab.id==="reaction")return <Reaction/>;if(lab.id==="ph")return <PH/>;if(lab.id==="electrolysis")return <Electrolysis/>;return <Biology id={lab.id}/>;
}

export default function App(){
 const [subject,setSubject]=useState<Subject|"All">("All");const [active,setActive]=useState<Lab|null>(null);
 const visible=labs.filter(l=>subject==="All"||l.subject===subject);
 const filters=(["All","Physics","Chemistry","Biology"] as const);
 return <main><header><button className="brand" onClick={()=>setActive(null)}><span className="mark">S</span><span><strong>Soren Labs</strong><small>Interactive science for students</small></span></button><nav>{filters.map(x=><button className={subject===x?"active":""} onClick={()=>setSubject(x)} key={x}>{x}</button>)}</nav></header>
 {active?<section className="lab-page"><button className="back" onClick={()=>setActive(null)}>← All Labs</button><div className="lab-head"><span className="pill">{active.subject}</span><h1>{active.title}</h1><p>{active.description}</p></div><LabSimulation lab={active}/><div className="learn"><h2>Explore → Observe → Understand</h2><p>Change one variable at a time. Watch the model respond, then connect what you see to the scientific idea behind it. These simulations run locally in your browser.</p></div></section>:<><section className="hero"><span className="eyebrow">SOREN LABS · 15 INTERACTIVE EXPERIMENTS</span><h1>Learn science by <em>testing it.</em></h1><p>Interactive Physics, Chemistry and Biology experiments designed to make concepts tangible—not just readable.</p></section><div className="filters">{filters.map(x=><button className={subject===x?"active":""} onClick={()=>setSubject(x)} key={x}>{x}</button>)}</div><section className="grid">{visible.map(l=><article className="card" key={l.id} onClick={()=>setActive(l)}><div className="icon">{l.icon}</div><span>{l.subject}</span><h2>{l.title}</h2><p>{l.description}</p><button>Open Lab →</button></article>)}</section></>}</main>
}
