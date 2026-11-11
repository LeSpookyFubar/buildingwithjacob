(()=>{const c=document.getElementById('pulseCanvas');if(!c)return;const x=c.getContext('2d'),sc=document.getElementById('signalCount'),ac=document.getElementById('activeCount'),qp=document.getElementById('quietPercent'),feed=document.getElementById('pulseFeed'),pause=document.getElementById('pausePulse'),speedBtns=[...document.querySelectorAll('[data-speed]')];const pal={DNS:'#77e3b4',WEB:'#8fb9ff',AUTH:'#d0b4ff',VULN:'#e7d58a',ALERT:'#ef9b8f'};const p=[['Los Angeles',.14,.47],['Seattle',.12,.28],['New York',.25,.38],['Mexico City',.20,.61],['São Paulo',.36,.77],['London',.49,.31],['Madrid',.46,.43],['Lagos',.50,.63],['Cairo',.58,.51],['Johannesburg',.57,.82],['Mumbai',.70,.56],['Singapore',.79,.67],['Tokyo',.88,.39],['Sydney',.88,.79],['Seoul',.84,.38],['Dubai',.64,.52]];const motion=matchMedia('(prefers-reduced-motion: reduce)');
  let e=[],total=0,paused=motion.matches,manuallyPaused=false,speed=1,last=0,frameId=null,frozenAt=null;
  function resize(){const d=Math.min(devicePixelRatio||1,2),r=c.getBoundingClientRect();c.width=Math.round(r.width*d);c.height=Math.round(r.height*d);x.setTransform(d,0,0,d,0,0)}
  function feedAdd(v){const i=document.createElement('div');i.className='feed-item';i.innerHTML=`<span>${new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit',second:'2-digit'})}</span><b>${v.place}</b><em>${v.type}</em>`;feed.prepend(i);while(feed.children.length>6)feed.lastElementChild.remove()}
  function spawn(){const [place,px,py]=p[Math.floor(Math.random()*p.length)],r=Math.random(),type=r<.34?'DNS':r<.62?'WEB':r<.79?'AUTH':r<.94?'VULN':'ALERT',t=p[Math.floor(Math.random()*p.length)];const v={place,type,x:px,y:py,tx:t[1],ty:t[2],born:performance.now(),life:2600+Math.random()*1800};e.push(v);total++;feedAdd(v)}
  function grid(w,h){x.save();x.strokeStyle='rgba(143,185,255,.09)';const cx=w/2,cy=h/2,rx=w*.43,ry=h*.39;x.beginPath();x.ellipse(cx,cy,rx,ry,0,0,Math.PI*2);x.stroke();for(let i=1;i<6;i++){const yy=cy-ry+2*ry*i/6,half=rx*Math.sqrt(Math.max(0,1-Math.pow((yy-cy)/ry,2)));x.beginPath();x.moveTo(cx-half,yy);x.lineTo(cx+half,yy);x.stroke()}x.restore()}
  function draw(now){const w=c.clientWidth,h=c.clientHeight;x.clearRect(0,0,w,h);grid(w,h);e=e.filter(v=>now-v.born<v.life);for(const v of e){const a=Math.sin(Math.min(1,(now-v.born)/v.life)*Math.PI),sx=v.x*w,sy=v.y*h,tx=v.tx*w,ty=v.ty*h;x.save();x.globalAlpha=.18*a;x.strokeStyle=pal[v.type];x.beginPath();x.moveTo(sx,sy);x.quadraticCurveTo((sx+tx)/2,Math.min(sy,ty)-45,tx,ty);x.stroke();x.globalAlpha=.9*a;x.fillStyle=pal[v.type];x.shadowColor=pal[v.type];x.shadowBlur=14;x.beginPath();x.arc(sx,sy,v.type==='ALERT'?5:3.5,0,Math.PI*2);x.fill();x.restore()}sc.textContent=total.toLocaleString();ac.textContent=e.length;qp.textContent=`${Math.max(72,96-Math.min(24,e.length*2))}%`;}
  // One scheduler owns drawing and event creation. Pause/hidden views do no work.
  function frame(now){
    frameId=null;
    if(paused||document.hidden)return;
    if(now-last>1450/speed){spawn();last=now;}
    draw(now);
    frameId=requestAnimationFrame(frame);
  }
  function sync(){
    if(paused||document.hidden){
      if(frameId!==null){cancelAnimationFrame(frameId);frameId=null;}
      if(frozenAt===null)frozenAt=performance.now();
      return;
    }
    if(frozenAt!==null){
      const elapsed=performance.now()-frozenAt;
      e.forEach(v=>v.born+=elapsed);last+=elapsed;frozenAt=null;
    }
    if(frameId===null)frameId=requestAnimationFrame(frame);
  }
  function updatePause(){
    pause.textContent=paused?'RESUME':'PAUSE';
    pause.classList.toggle('active',paused);
    pause.setAttribute('aria-pressed',String(paused));
  }
  speedBtns.forEach(b=>b.addEventListener('click',()=>{
    speed=Number(b.dataset.speed)||1;
    speedBtns.forEach(z=>{z.classList.toggle('active',z===b);z.setAttribute('aria-pressed',String(z===b));});
  }));
  pause.addEventListener('click',()=>{paused=!paused;manuallyPaused=paused;updatePause();sync();});
  motion.addEventListener('change',event=>{paused=manuallyPaused||event.matches;updatePause();sync();});
  document.addEventListener('visibilitychange',sync);
  addEventListener('resize',()=>{resize();draw(frozenAt===null?performance.now():frozenAt);});
  resize();for(let i=0;i<5;i++)spawn();draw(performance.now());updatePause();sync();
})();
