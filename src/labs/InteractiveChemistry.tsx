import { useEffect, useState } from "react";
type Props={id:string};
export default function InteractiveChemistry({id}:Props){
 const [a,setA]=useState(id==="electrolysis"?6:id==="bonding"?1:50);
 const [b,setB]=useState(50);
 const [mode,setMode]=useState<"ionic"|"covalent">("covalent");
 return <div className="chem-lab">
  {id==="bonding"&&<Bonding mode={mode} order={a}/>}
  {id==="electrolysis"&&<Electrolysis voltage={a}/>}
  {id==="reaction"&&<Reaction temp={a} concentration={b}/>}
  {id==="ph"&&<AcidBase acid={a} base={b}/>}
  {id==="atom"&&<Atom number={a}/>}
  {id==="bonding"&&<div className="mode-switch"><button className={mode==="covalent"?"selected":""} onClick={()=>setMode("covalent")}>Covalent sharing</button><button className={mode==="ionic"?"selected":""} onClick={()=>setMode("ionic")}>Ionic transfer</button><label className="control"><span>Bond order<b>{a}</b></span><input type="range" min="1" max="3" value={a} onChange={e=>setA(+e.target.value)}/></label></div>}
  {id==="electrolysis"&&<div className="controls"><label className="control"><span>Voltage<b>{a} V</b></span><input type="range" min="1" max="12" value={a} onChange={e=>setA(+e.target.value)}/></label></div>}
  {id==="reaction"&&<div className="controls"><label className="control"><span>Temperature<b>{a}°C</b></span><input type="range" min="10" max="90" value={a} onChange={e=>setA(+e.target.value)}/></label><label className="control"><span>Concentration<b>{b}%</b></span><input type="range" min="10" max="100" value={b} onChange={e=>setB(+e.target.value)}/></label></div>}
  {id==="ph"&&<div className="controls"><label className="control"><span>Acid volume<b>{a}%</b></span><input type="range" min="0" max="100" value={a} onChange={e=>setA(+e.target.value)}/></label><label className="control"><span>Base volume<b>{b}%</b></span><input type="range" min="0" max="100" value={b} onChange={e=>setB(+e.target.value)}/></label></div>}
  {id==="atom"&&<div className="controls"><label className="control"><span>Atomic number<b>{a}</b></span><input type="range" min="1" max="20" value={a} onChange={e=>setA(+e.target.value)}/></label></div>}
 </div>
}
function Atom({number}:{number:number}){
 const electrons=number;
 return <div className="atom-wrap"><svg className="science-svg" viewBox="0 0 800 430"><text x="28" y="34" className="diagram-title">ATOMIC STRUCTURE · ELECTRON SHELLS</text>{[1,2,3].map(s=><circle key={s} cx="400" cy="225" r={45+s*58} className="shell"/>)}<circle cx="400" cy="225" r="45" className="nucleus"/><text x="380" y="230">p+ n⁰</text>{Array.from({length:electrons},(_,i)=>{const shell=i<2?1:i<10?2:3,n=shell===1?2:shell===2?8:Math.max(1,electrons-10),j=shell===1?i:shell===2?i-2:i-10,ang=j/n*Math.PI*2;const r=45+shell*58;return <circle key={i} cx={400+Math.cos(ang)*r} cy={225+Math.sin(ang)*r} r="7" className="electron"/>})}<text x="30" y="395">Electrons: {electrons} · Neutral atom model</text></svg></div>
}
function Bonding({mode,order}:{mode:"ionic"|"covalent";order:number}){
 return <div className="bonding-exp"><svg className="science-svg" viewBox="0 0 800 430"><text x="28" y="34" className="diagram-title">CHEMICAL BONDING · VALENCE ELECTRONS</text><circle cx="300" cy="215" r="88" className="atom-a"/><circle cx="500" cy="215" r="88" className="atom-b"/>{Array.from({length:8},(_,i)=>{const ang=i*Math.PI/4;return <circle key={i} cx={300+Math.cos(ang)*72} cy={215+Math.sin(ang)*72} r="6" className={mode==="ionic"&&i===0?"transfer electron":"valence"}/>})}{Array.from({length:8},(_,i)=>{const ang=i*Math.PI/4;return <circle key={i} cx={500+Math.cos(ang)*72} cy={215+Math.sin(ang)*72} r="6" className="valence"/>})}{mode==="covalent"?Array.from({length:order},(_,i)=><line key={i} x1="390" y1={205+(i-(order-1)/2)*14} x2="410" y2={205+(i-(order-1)/2)*14} className="bond"/>):<line x1="365" y1="215" x2="435" y2="215" className="transfer"/>}<text x="250" y="345">{mode==="covalent"?order+" shared electron pair"+(order>1?"s":""):"Electron transfer → ions"}</text><text x="245" y="385">Change the model, then observe the valence electrons.</text></svg></div>
}
function Electrolysis({voltage}:{voltage:number}){
 const [tick,setTick]=useState(0);useEffect(()=>{const id=setInterval(()=>setTick(v=>v+1),50);return()=>clearInterval(id)},[]);
 return <div className="electrolysis-exp"><svg className="science-svg" viewBox="0 0 800 470"><defs><marker id="ionArrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto"><path d="M0,0 L0,6 L7,3 z" fill="#5662d9"/></marker></defs><text x="28" y="34" className="diagram-title">ELECTROLYSIS · IONS → ELECTRODES</text><path d="M190 110 L190 365 Q400 405 610 365 L610 110" className="beaker"/><line x1="285" y1="85" x2="285" y2="315" className="electrode"/><line x1="515" y1="85" x2="515" y2="315" className="electrode"/><text x="265" y="70">− CATHODE</text><text x="495" y="70">+ ANODE</text>{Array.from({length:18},(_,i)=>{const cath=i%2===0;const p=(tick*(.6+voltage/8)+i*31)%170;const x=cath?500-p:300+p;const y=145+(i*37)%180;return <circle key={i} cx={x} cy={y} r="6" className={cath?"cation":"anion"} style={{animationDelay:(i*30)+"ms"}}/>})}{Array.from({length:Math.round(voltage/2)},(_,i)=><circle key={"b"+i} cx="285" cy={295-i*15} r="9" className="bubble"/>) }{Array.from({length:Math.round(voltage/2)},(_,i)=><circle key={"c"+i} cx="515" cy={295-i*15} r="7" className="bubble"/>) }<text x="30" y="430">Voltage: {voltage} V · Higher voltage increases ion drift and electrode activity.</text></svg></div>
}
function Reaction({temp,concentration}:{temp:number;concentration:number}){
 const rate=Math.max(.1,(temp/20)*(concentration/50));
 return <div><svg className="science-svg" viewBox="0 0 800 360"><text x="28" y="34" className="diagram-title">REACTION RATE · COLLISION THEORY</text><rect x="110" y="80" width="580" height="220" rx="28" className="reaction-box"/>{Array.from({length:24},(_,i)=>{const x=(i*83+temp*3)%540+130,y=(i*47+concentration*2)%190+95;return <circle key={i} cx={x} cy={y} r={i%3?7:10} className={i%3?"reactant":"collision"} />})}<text x="30" y="340">Relative rate: {rate.toFixed(2)}× · More frequent/energetic collisions increase reaction rate.</text></svg></div>
}
function AcidBase({acid,base}:{acid:number;base:number}){const ph=Math.max(0,Math.min(14,7+(base-acid)/8));return <div><svg className="science-svg" viewBox="0 0 800 360"><text x="28" y="34" className="diagram-title">ACIDS + BASES · NEUTRALISATION</text><rect x="110" y="100" width="580" height="90" rx="14" className="phbar"/><line x1={110+ph/14*580} y1="85" x2={110+ph/14*580} y2="205" className="phmarker"/><text x="110" y="240">0</text><text x="390" y="240">7 neutral</text><text x="675" y="240">14</text><text x="30" y="310">pH {ph.toFixed(1)} · Acid {acid}% + Base {base}%</text></svg></div>}
