import { useEffect, useRef, useState, type ReactNode } from "react";

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
function Stage({children,controls}:{children:ReactNode;controls:ReactNode}){
 return <div className="lab-stage"><div className="visual">{children}</div><div className="controls">{controls}</div></div>
}

function Projectile(){
 const [speed,setSpeed]=useState(24),[angle,setAngle]=useState(45),[g,setG]=useState(9.8);
 const ref=useCanvas((ctx,w,h)=>{
  Grid({ctx,w,h});const a=angle*Math.PI/180,range=speed*speed*Math.sin(2*a)/g,maxY=speed*speed*Math.sin(a)**2/(2*g),scale=Math.min((w-70)/Math.max(range,1),(h-70)/Math.max(maxY,1))*0.78;
  ctx.strokeStyle="#5662d9";ctx.lineWidth=4;ctx.beginPath();for(let x=0;x<=range;x+=Math.max(range/100,.01)){const y=x*Math.tan(a)-g*x*x/(2*speed*speed*Math.cos(a)**2),px=35+x*scale,py=h-30-y*scale;if(x===0)ctx.moveTo(px,py);else ctx.lineTo(px,py)}ctx.stroke();
 },[speed,angle,g]);
 return <Stage><canvas ref={ref}/><div className="readout"><b>Range</b> {((speed*speed*Math.sin(2*angle*Math.PI/180))/g).toFixed(1)} m · <b>Flight time</b> {(2*speed*Math.sin(angle*Math.PI/180)/g).toFixed(2)} s</div><div className="controls"><Range label="Initial speed" value={speed} min={5} max={40} onChange={setSpeed} unit=" m/s"/><Range label="Launch angle" value={angle} min={5} max={85} onChange={setAngle} unit="°"/><Range label="Gravity" value={g} min={1} max={20} step={.1} onChange={setG} unit=" m/s²"/></div></Stage>
}

