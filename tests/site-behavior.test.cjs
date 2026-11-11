'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'..');
function pulseFixture({reduced=false}={}){
  let now=0,id=0,draws=0;
  const pending=new Map(),events=new Map(),windowEvents=new Map();
  function element(){const handlers=new Map();return {textContent:'',dataset:{},children:[],attrs:{},handlers,classList:{add(){},remove(){},toggle(){}},addEventListener(n,fn){handlers.set(n,fn)},setAttribute(n,v){this.attrs[n]=v},getAttribute(n){return this.attrs[n]},prepend(v){this.children.unshift(v);v.remove=()=>this.children.splice(this.children.indexOf(v),1)},get lastElementChild(){return this.children.at(-1)}};}
  const elements=Object.fromEntries(['pulseCanvas','signalCount','activeCount','quietPercent','pulseFeed','pausePulse'].map(n=>[n,element()]));
  const canvas=elements.pulseCanvas;canvas.clientWidth=800;canvas.clientHeight=500;canvas.getBoundingClientRect=()=>({width:800,height:500});
  canvas.getContext=()=>new Proxy({}, {get:(o,k)=>k==='clearRect'?()=>draws++:()=>{},set:(o,k,v)=>(o[k]=v,true)});
  const speedButtons=[1,2].map(n=>Object.assign(element(),{dataset:{speed:String(n)}}));
  const media={matches:reduced,handlers:new Set(),addEventListener(n,fn){this.handlers.add(fn)}};
  const document={hidden:false,visibilityState:'visible',getElementById:n=>elements[n],querySelectorAll:()=>speedButtons,createElement:element,addEventListener:(n,fn)=>events.set(n,fn)};
  const html=fs.readFileSync(path.join(root,'cyber-pulse.html'),'utf8');
  const jsFile=path.join(root,'js/cyber-pulse.js');
  const source=fs.existsSync(jsFile)?fs.readFileSync(jsFile,'utf8'):[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(x=>x[1]).find(x=>x.includes('pulseCanvas'));
  vm.runInNewContext(source,{document,matchMedia:()=>media,devicePixelRatio:1,performance:{now:()=>now},Date,Math,requestAnimationFrame:fn=>{pending.set(++id,fn);return id},cancelAnimationFrame:n=>pending.delete(n),addEventListener:(n,fn)=>windowEvents.set(n,fn)});
  return {elements,pending,media,speedButtons,get draws(){return draws},advance(ms){now=ms},resize(){windowEvents.get('resize')?.()},clickPause(){elements.pausePulse.handlers.get('click')()},frame(ms){now=ms;const callbacks=[...pending.values()];pending.clear();callbacks.forEach(fn=>fn(ms))},setHidden(value){document.hidden=value;document.visibilityState=value?'hidden':'visible';events.get('visibilitychange')?.()},reduce(value){media.matches=value;media.handlers.forEach(fn=>fn({matches:value}))}};
}
test('Pause stops scheduled drawing and Resume starts one loop',()=>{const f=pulseFixture();f.frame(100);f.clickPause();assert.equal(f.pending.size,0,'paused view must not leave animation callbacks queued');const draws=f.draws;f.frame(1000);assert.equal(f.draws,draws);f.clickPause();assert.equal(f.pending.size,1);f.frame(2000);assert.equal(f.pending.size,1);});
test('Hidden tabs stop scheduling and visible tabs restart once',()=>{const f=pulseFixture();f.setHidden(true);assert.equal(f.pending.size,0);f.setHidden(false);assert.equal(f.pending.size,1);f.setHidden(false);assert.equal(f.pending.size,1);});
test('Reduced motion shows a static view without auto animation',()=>{const f=pulseFixture({reduced:true});assert.equal(f.pending.size,0);assert.ok(f.draws>0);f.clickPause();assert.equal(f.pending.size,1);});
test('Reduced-motion changes stop active animation without repeated queues',()=>{const f=pulseFixture();f.reduce(true);assert.equal(f.pending.size,0);f.reduce(false);assert.equal(f.pending.size,1);});

test('A manually paused view stays paused after tab visibility changes',()=>{const f=pulseFixture();f.clickPause();f.setHidden(true);f.setHidden(false);assert.equal(f.pending.size,0);assert.equal(f.elements.pausePulse.attrs['aria-pressed'],'true');});

test('Reduced-motion preference changes preserve manual Pause',()=>{const f=pulseFixture();f.clickPause();f.reduce(true);f.reduce(false);assert.equal(f.pending.size,0);assert.equal(f.elements.pausePulse.attrs['aria-pressed'],'true');});
test('Resizing a paused view preserves frozen signals',()=>{const f=pulseFixture();f.clickPause();const active=f.elements.activeCount.textContent;f.advance(9000);f.resize();assert.equal(f.elements.activeCount.textContent,active);assert.equal(f.pending.size,0);f.clickPause();f.frame(9100);assert.equal(f.elements.activeCount.textContent,active);});
