import { useEffect, useState } from "react";

type Props={id:string};

export default function InteractiveBiology({id}:Props){
 const[level,setLevel]=useState(60);
 const [selected,setSelected]=useState("Nucleus");
 const control=id==="heart"?"Heart rate":id==="lungs"?"Breathing depth":id==="neuron"?"Stimulus strength":"Activity / light";
 return <div className="bio-lab">
   <div className="bio-visual">
    {id==="heart"&&<Heart rate={level}/>}
    {id==="lungs"&&<Lungs depth={level}/>}
    {id==="neuron"&&<Neuron strength={level}/>}
    {id==="cell"&&<Cell selected={selected} setSelected={setSelected} plant={level>50}/>}
    {id==="photosynthesis"&&<Plant light={level}/>}
   </div>
   <div className="readout"><b>{control}: {level}%</b> · {id==="heart"?"Blood is pumped through four chambers and valves.":id==="lungs"?"Air moves through the trachea, bronchi and alveoli; gas exchange occurs at the alveoli.":id==="neuron"?"A stimulus produces an electrical impulse that travels along the axon to the synapse.":id==="cell"?"Select an organelle to inspect its role.":"Light, carbon dioxide and water drive glucose and oxygen production."}</div>
   <div className="controls"><label className="control"><span>{control}<b>{level}%</b></span><input type="range" min="0" max="100" value={level} onChange={e=>setLevel(+e.target.value)}/></label></div>
 </div>
}

function Heart({rate}:{rate:number}){
 const dur=Math.max(.45,1.5-rate/100);
 return <svg className="science-svg" viewBox="0 0 800 470" aria-label="Four chamber human heart with animated blood flow">
  <defs><marker id="arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto"><path d="M0,0 L0,6 L7,3 z" fill="#5662d9"/></marker></defs>
  <text x="28" y="34" className="diagram-title">HUMAN HEART · DOUBLE CIRCULATION</text>
  <path className="vessel" d="M400 95 C400 45 350 45 320 75 M400 95 C400 45 450 45 480 75" />
  <path className="vessel" d="M320 75 L260 35 M480 75 L540 35" />
  <g className="heart-body">
   <path d="M400 105 C330 45 220 100 250 205 L400 385 L550 205 C580 100 470 45 400 105Z" className="organ"/>
   <path d="M400 112 L400 335" className="septum"/>
   <path d="M265 185 Q325 145 400 190 Q475 145 535 185 L505 300 Q455 350 400 385 Q345 350 295 300Z" className="chamber-zone"/>
   <path d="M305 145 Q340 125 375 150 L375 280 Q330 295 290 255Z" className="chamber-left"/>
   <path d="M495 145 Q460 125 425 150 L425 280 Q470 295 510 255Z" className="chamber-right"/>
   <circle cx="375" cy="145" r="8" className="valve"/><circle cx="425" cy="145" r="8" className="valve"/>
   <circle cx="375" cy="282" r="8" className="valve"/><circle cx="425" cy="282" r="8" className="valve"/>
  </g>
  <path d="M320 75 C290 120 305 155 330 180 C345 200 340 235 330 265" fill="none" stroke="#5662d9" strokeWidth="7" markerEnd="url(#arrow)" style={{animation:"flow "+dur+"s linear infinite"}}/>
  <path d="M470 75 C510 120 495 155 470 180 C455 200 460 235 470 265" fill="none" stroke="#111" strokeWidth="7" markerEnd="url(#arrow)" style={{animation:"flow "+dur+"s linear infinite reverse"}}/>
  <g className="labels"><text x="285" y="220">Right atrium</text><text x="285" y="265">Right ventricle</text><text x="440" y="220">Left atrium</text><text x="440" y="265">Left ventricle</text><text x="22" y="440">Valves keep blood moving in one direction.</text></g>
 </svg>
}

function Lungs({depth}:{depth:number}){
 const scale=.88+depth/100*.2;
 return <svg className="science-svg" viewBox="0 0 800 470">
  <defs><marker id="airArrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto"><path d="M0,0 L0,6 L7,3 z" fill="#5662d9"/></marker></defs>
  <text x="28" y="34" className="diagram-title">RESPIRATORY SYSTEM · VENTILATION + GAS EXCHANGE</text>
  <g transform={"translate(400 265) scale("+scale+") translate(-400 -265)"}>
   <path d="M400 65 L400 145 M400 145 L315 190 M400 145 L485 190" className="airway"/>
   <path d="M315 190 C255 155 180 190 185 290 C190 370 280 400 350 325 L390 215Z" className="lung"/>
   <path d="M485 190 C545 155 620 190 615 290 C610 370 520 400 450 325 L410 215Z" className="lung"/>
   <path d="M300 205 Q240 230 230 300 M330 220 Q280 250 275 325 M500 205 Q560 230 570 300 M470 220 Q520 250 525 325" className="bronchi"/>
   {Array.from({length:12},(_,i)=><circle key={i} cx={225+(i%6)*27} cy={285+Math.floor(i/6)*42} r="12" className="alveoli"/>)}
   {Array.from({length:12},(_,i)=><circle key={"r"+i} cx={440+(i%6)*27} cy={285+Math.floor(i/6)*42} r="12" className="alveoli"/>)}
  </g>
  <path d="M400 70 L400 145" stroke="#5662d9" strokeWidth="10" markerEnd="url(#airArrow)"/>
  <text x="30" y="425">Alveoli: thin surfaces allow O₂ to enter blood and CO₂ to leave it.</text>
  <text x="610" y="425">Breath: {depth}%</text>
 </svg>
}

function Neuron({strength}:{strength:number}){
 const [tick,setTick]=useState(0);
 useEffect(()=>{const x=setInterval(()=>setTick(v=>v+1),80);return()=>clearInterval(x)},[]);
 const pos=(tick*(1+strength/70))%100;
 return <svg className="science-svg" viewBox="0 0 800 470">
  <text x="28" y="34" className="diagram-title">NEURON · ACTION POTENTIAL → SYNAPSE</text>
  <g className="neuron">
   <circle cx="315" cy="235" r="55" className="soma"/><circle cx="315" cy="235" r="19" className="nucleus"/>
   <path d="M265 210 C205 165 160 130 105 145 M265 230 C190 210 140 200 80 215 M265 255 C195 285 145 330 90 340 M265 275 C210 330 190 370 150 395" className="dendrite"/>
   <path d="M370 235 C450 235 515 235 625 235" className="axon"/>
   <path d="M410 235 L450 235 M470 235 L510 235 M530 235 L570 235 M590 235 L625 235" className="myelin"/>
   <path d="M625 235 C665 205 690 190 725 205 M625 235 C665 235 700 235 735 255 M625 235 C665 270 690 285 720 300" className="terminal"/>
   <circle cx={370+pos/100*250} cy="235" r="10" className="impulse"/>
  </g>
  <text x="35" y="430">Dendrites</text><text x="285" y="430">Cell body</text><text x="470" y="430">Myelinated axon</text><text x="665" y="430">Synapse</text>
 </svg>
}

function Cell({selected,setSelected,plant}:{selected:string;setSelected:(s:string)=>void;plant:boolean}){
 const items=plant?["Nucleus","Mitochondria","Chloroplast","Vacuole","Cell membrane"]:["Nucleus","Mitochondria","Ribosomes","Cell membrane"];
 return <div className="cell-explorer">
  <svg className="science-svg" viewBox="0 0 800 470">
   <text x="28" y="34" className="diagram-title">{plant?"PLANT CELL":"ANIMAL CELL"} · ORGANELLE EXPLORER</text>
   <path d={plant?"M175 100 Q400 50 625 100 L650 350 Q400 415 150 350Z":"M180 105 Q400 55 620 120 Q650 250 600 350 Q400 415 170 335 Q130 220 180 105Z"} className="cell-membrane"/>
   <ellipse cx="400" cy="235" rx="75" ry="58" className="nucleus"/><text x="370" y="240">Nucleus</text>
   {Array.from({length:6},(_,i)=><g key={i} onClick={()=>setSelected("Mitochondria")} className="clickable"><ellipse cx={230+i*68} cy={145+(i%2)*185} rx="30" ry="15" className="mito"/><circle cx={220+i*68} cy={145+(i%2)*185} r="5" className="org-dot"/></g>)}
   {plant&&Array.from({length:5},(_,i)=><ellipse key={"c"+i} cx={225+i*80} cy="315" rx="30" ry="13" className="chloroplast"/>)}
   {plant&&<rect x="540" y="145" width="55" height="75" rx="12" className="vacuole"/>}
  </svg>
  <div className="organelle-buttons">{items.map(x=><button className={selected===x?"selected":""} onClick={()=>setSelected(x)} key={x}>{x}</button>)}</div>
  <div className="organelle-info"><b>{selected}</b> — {selected==="Nucleus"?"contains genetic material and coordinates cell activities.":selected==="Mitochondria"?"release usable energy through cellular respiration.":selected==="Chloroplast"?"captures light energy for photosynthesis.":selected==="Vacuole"?"stores cell sap and helps maintain plant-cell pressure.":selected==="Ribosomes"?"build proteins from amino acids.":"controls what enters and leaves the cell."}</div>
 </div>
}

function Plant({light}:{light:number}){
 const [co2,setCo2]=useState(50),[water,setWater]=useState(70);
 const rate=Math.min(light,co2,water);
 return <div className="plant-experiment">
  <svg className="science-svg" viewBox="0 0 800 420">
   <defs><marker id="plantArrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto"><path d="M0,0 L0,6 L7,3 z" fill="#5662d9"/></marker></defs>
   <text x="28" y="34" className="diagram-title">PHOTOSYNTHESIS · INPUT → OUTPUT</text>
   <path d="M400 340 L400 130 M400 220 C340 160 280 175 245 215 M400 270 C460 205 520 220 560 265" className="stem"/>
   <ellipse cx="300" cy="190" rx="75" ry="34" transform="rotate(25 300 190)" className="leaf"/>
   <ellipse cx="500" cy="235" rx="75" ry="34" transform="rotate(-25 500 235)" className="leaf"/>
   <circle cx="170" cy="95" r="35" className="sun"/><text x="135" y="150">Light {light}%</text>
   <path d="M165 100 L290 175" className="input-arrow" markerEnd="url(#plantArrow)"/><text x="560" y="95">CO₂ {co2}%</text><path d="M560 110 L500 215" className="input-arrow" markerEnd="url(#plantArrow)"/>
   <text x="35" y="365">H₂O {water}%</text><path d="M120 350 L360 315" className="input-arrow" markerEnd="url(#plantArrow)"/>
   <text x="565" y="330">Glucose + O₂</text><path d="M470 300 L650 300" className="output-arrow" markerEnd="url(#plantArrow)"/>
   <text x="35" y="400">Relative photosynthesis rate: {rate}%</text>
  </svg>
  <div className="controls"><label className="control"><span>Carbon dioxide<b>{co2}%</b></span><input type="range" min="0" max="100" value={co2} onChange={e=>setCo2(+e.target.value)}/></label><label className="control"><span>Water<b>{water}%</b></span><input type="range" min="0" max="100" value={water} onChange={e=>setWater(+e.target.value)}/></label></div>
 </div>
}