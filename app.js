(() => {
  'use strict';
  const cards = Array.isArray(window.QIHUANG_CARDS) ? window.QIHUANG_CARDS : [];
  const RATES = [{ rarity:'SSR', weight:2 },{ rarity:'SR', weight:10 },{ rarity:'R', weight:38 },{ rarity:'N', weight:50 }];
  const STORAGE_KEY = 'qihuang_demo_v3';
  const LEGACY_KEY = 'qihuang_demo_v1';
  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];
  const state = { owned:{}, history:[], total:0, ssr:0, pity:0 };
  const CARD_IDS = new Set(cards.map(c => String(c.id)));
  const rarityLabels = {SSR:'传说 · 金', SR:'珍稀 · 紫', R:'雅品 · 蓝', N:'素品 · 白'};
  let drawing=false, animationTimer=null, filter='ALL', search='';
  // v1 存档中某些卡牌数量保存为布尔值。迁移时修复为正整数，
  // 同时利用仍保留的抽卡历史校正重复抽取次数。
  function load(){
    let raw=null,legacy=false;
    try{
      raw=localStorage.getItem(STORAGE_KEY);
      if(!raw){raw=localStorage.getItem(LEGACY_KEY);legacy=Boolean(raw);}
      const data=raw?JSON.parse(raw):null;
      if(!data || typeof data!=='object')return;
      const history=Array.isArray(data.history)?data.history.filter(x=>x&&Array.isArray(x.ids)).slice(0,60):[];
      state.history=history;
      if(data.owned && typeof data.owned==='object' && !Array.isArray(data.owned)){
        for(const [id,value] of Object.entries(data.owned)){
          if(!CARD_IDS.has(id))continue;
          const n=value===true?1:value===false?0:Number(value);
          if(Number.isSafeInteger(n)&&n>0)state.owned[id]=n;
        }
      }
      const fromHistory={};
      for(const record of history){for(const id of record.ids){
        const key=String(id);if(CARD_IDS.has(key))fromHistory[key]=(fromHistory[key]||0)+1;
      }}
      // 使用可见的历史计数作为下限，避免把原有的准确累计数覆盖掉。
      for(const [id,n] of Object.entries(fromHistory))state.owned[id]=Math.max(n,state.owned[id]||0);
      if(Number.isSafeInteger(data.total)&&data.total>=0)state.total=data.total;
      else state.total=Object.values(state.owned).reduce((a,b)=>a+b,0);
      state.total=Math.max(state.total,Object.values(state.owned).reduce((a,b)=>a+b,0));
      if(Number.isSafeInteger(data.ssr)&&data.ssr>=0)state.ssr=data.ssr;
      const historySsr=history.flatMap(h=>h.ids).filter(id=>cards.some(c=>String(c.id)===String(id)&&c.rarity==='SSR')).length;
      state.ssr=Math.max(state.ssr,historySsr);
      if(Number.isSafeInteger(data.pity)&&data.pity>=0&&data.pity<90)state.pity=data.pity;
      else if(legacy){
        // 老版本没有保底记录，只能从最近保留的历史推算，无法还原已截断的旧历史。
        let since=0;
        for(const record of [...history].reverse()){
          for(const id of record.ids){
            const card=cards.find(c=>String(c.id)===String(id));
            since=card?.rarity==='SSR'?0:Math.min(89,since+1);
          }
        }
        state.pity=since;
      }
      if(legacy)save();
    }catch(err){console.warn('本地存档读取失败',err);}
  }
  function save(){try{localStorage.setItem(STORAGE_KEY,JSON.stringify(state));}catch(err){console.warn('本地存档写入失败',err);}}
  const pool = rarity => cards.filter(c=>c.rarity===rarity);
  function pickRarity(){let n=Math.random()*100;for(const {rarity,weight} of RATES){n-=weight;if(n<0)return rarity;}return 'N';}
  function pickCard(rarity){const p=pool(rarity);return p[Math.floor(Math.random()*p.length)];}
  function pickResults(count){
    const list=[];
    let pity=state.pity;
    let hardPityTriggered=false;
    for(let i=0;i<count;i++){
      const forced=pity===89;
      const rarity=forced?'SSR':pickRarity();
      const card=pickCard(rarity);
      list.push(card);
      if(forced)hardPityTriggered=true;
      pity=rarity==='SSR'?0:pity+1;
    }
    // 维持原有“十连至少一张 SR 及以上”的承诺；改变的只有非 SSR 卡牌。
    if(count===10&&!list.some(c=>c.rarity==='SSR'||c.rarity==='SR')){
      const at=Math.floor(Math.random()*10);
      list[at]=pickCard('SR');
    }
    return {list,pityAfter:pity,hardPityTriggered};
  }
  function img(c){return `assets/cards/${Number(c.id)}.svg`;}
  function ownedCount(id){const raw=state.owned[String(id)];const n=raw===true?1:Number(raw||0);return Number.isSafeInteger(n)&&n>0?n:0;}
  function ownedTotal(){return cards.filter(c=>ownedCount(c.id)>0).length;}
  function updateStats(){const n=ownedTotal();$('#navOwned').textContent=n;$('#uniqueCount').textContent=n;$('#drawCount').textContent=state.total;$('#ssrCount').textContent=state.ssr;$('#collectCount').textContent=`已收录 ${n} / ${cards.length}`;const pct=cards.length?Math.round(n/cards.length*100):0;$('#collectPct').textContent=pct+'%';$('#progressBar').style.width=pct+'%';$('#pityCount').textContent=state.pity;$('#pityRemaining').textContent=90-state.pity;$('#pityBar').style.width=(state.pity/90*100)+'%';$('#ownedCopies').textContent=Object.values(state.owned).reduce((a,b)=>a+Number(b||0),0);}
  function switchTab(tab){
    $$('.view').forEach(el=>el.classList.toggle('active',el.id===`view-${tab}`));
    $$('.nav-item').forEach(el=>el.classList.toggle('active',el.dataset.tab===tab));
    $('#crumb').textContent=({draw:'丹炉寻珍',collection:'百草图鉴',history:'寻珍手记'})[tab];
    if(tab==='collection')renderCatalog();if(tab==='history')renderHistory();window.scrollTo({top:0,behavior:'smooth'});
  }
  const ritual=$('#ritual'), particles=$('#particles');
  function sparkle(count=35){particles.replaceChildren();for(let i=0;i<count;i++){
    const el=document.createElement('span');el.className='spark';el.style.left=(25+Math.random()*50)+'%';el.style.top=(32+Math.random()*43)+'%';el.style.setProperty('--dx',(Math.random()-.5)*470+'px');el.style.setProperty('--dy',(Math.random()-.5)*370+'px');el.style.setProperty('--dur',(1.1+Math.random()*1.2)+'s');el.style.animationDelay=(Math.random()*.55)+'s';particles.append(el);
  }}
  function delay(ms){return new Promise(resolve=>{animationTimer=setTimeout(resolve,ms);});}
  const rank={SSR:4,SR:3,R:2,N:1};
  function setStatus(title,sub){$('#ritualTitle').textContent=title;$('#ritualSub').textContent=sub;}
  // 单独的全屏演出层：动画阶段、跳过操作与测试结果分离，避免动画遮挡结果。
  const cinematic=$('#cinematic');
  let skipScene=false, finishSceneWait=null;
  function sceneWait(ms){
    if(skipScene)return Promise.resolve();
    return new Promise(resolve=>{
      const timer=setTimeout(()=>{finishSceneWait=null;resolve();},ms);
      finishSceneWait=()=>{clearTimeout(timer);finishSceneWait=null;resolve();};
    });
  }
  function setScene(phase,stage,title,description,progress,step){
    cinematic.dataset.phase=phase;
    $('#cinematicStage').textContent=stage;
    $('#cinematicTitle').textContent=title;
    $('#cinematicDescription').textContent=description;
    $('#cinematicProgress').style.width=progress+'%';
    $$('.cinematic-stage-indicators span').forEach((el,i)=>el.classList.toggle('active',i<=step));
  }
  function showCinematicEmbers(){
    const root=$('#cinematicEmbers');root.replaceChildren();
    for(let i=0;i<64;i++){
      const ember=document.createElement('i');
      ember.style.left=(10+Math.random()*80)+'%';
      ember.style.top=(40+Math.random()*60)+'%';
      ember.style.setProperty('--drift',((Math.random()-.5)*340)+'px');
      ember.style.setProperty('--speed',(1.1+Math.random()*2.6)+'s');
      ember.style.animationDelay=(-Math.random()*3)+'s';
      root.append(ember);
    }
  }
  async function playCinematic(count,highest){
    skipScene=false;
    const altar=$('#cinematicAltar');altar.replaceChildren();
    altar.append($('.elixir').cloneNode(true));
    cinematic.dataset.rarity=highest.toLowerCase();
    cinematic.hidden=false;showCinematicEmbers();
    $('#cinematicProgress').style.width='0%';
    setScene('offering','壹 · 投药',count===10?'十味灵药 · 共入丹炉':'一味灵药 · 入炉成丹','草木化为灵光，缓缓落入丹炉',12,0);
    await sceneWait(1100);
    if(!skipScene){setScene('ignition','贰 · 炼化','玄火骤起 · 炉身震鸣','青金烈焰迸发，药性于炉中交融',42,1);await sceneWait(1350);}
    if(!skipScene){setScene('gather','叁 · 凝丹','灵气汇聚 · 丹光将现','天地灵息聚于一炉，静候珍藏现世',73,2);await sceneWait(1250);}
    if(!skipScene){setScene('burst','肆 · 揭晓',highest==='SSR'?'金光冲霄 · 传说降临':highest==='SR'?'紫气东来 · 珍品现世':highest==='R'?'蓝焰流转 · 雅品现世':'素光轻启 · 草木现形',`${highest} · ${rarityLabels[highest]} · 开启药匣查看所得`,100,3);await sceneWait(1100);}
    cinematic.hidden=true;
    $('#cinematicEmbers').replaceChildren();
    altar.replaceChildren();
  }
  $('#skipCinematic').addEventListener('click',()=>{skipScene=true;if(finishSceneWait)finishSceneWait();});
  async function draw(count){
    if(drawing)return;
    drawing=true;
    $('#drawOne').disabled=true;$('#drawTen').disabled=true;
    const batch=pickResults(count);
    const results=batch.list;
    const highest=results.reduce((r,c)=>rank[c.rarity]>rank[r]?c.rarity:r,'N');
    try{
      // 连抽时先隐藏旧结果，再开始新的丹炉演出。
      $('#resultOverlay').hidden=true;
      document.body.style.overflow='';
      await playCinematic(count,highest);
      const marked=results.map(c=>{
        const isNew=!ownedCount(c.id);
        state.owned[String(c.id)]=ownedCount(c.id)+1;
        return {...c,isNew};
      });
      state.pity=batch.pityAfter;
      state.total+=results.length;
      state.ssr+=results.filter(c=>c.rarity==='SSR').length;
      state.history.unshift({timestamp:Date.now(),ids:results.map(c=>c.id),top:highest});
      state.history=state.history.slice(0,60);
      save();updateStats();
      showResults(marked,batch.hardPityTriggered);
    }finally{
      cinematic.hidden=true;ritual.className='ritual';particles.replaceChildren();
      setStatus('炉火初明 · 静候有缘人','点击下方按钮，以药香叩开典藏之门');
      drawing=false;$('#drawOne').disabled=false;$('#drawTen').disabled=false;
    }
  }
  function revealCardsGradually(){const items=$$('#resultList .reveal-card');items.forEach((el,index)=>setTimeout(()=>el.classList.add('flipped'),230+index*110));}
  function showResults(results,hardPityTriggered=false){const overlay=$('#resultOverlay');const container=$('#resultList');container.replaceChildren();container.classList.toggle('single',results.length===1);
    const newCount=results.filter(c=>c.isNew).length;const rarity=results.reduce((r,c)=>rank[c.rarity]>rank[r]?c.rarity:r,'N');
    overlay.dataset.rarity=rarity.toLowerCase();
    $('#resultHeading').textContent=`${rarityLabels[rarity]} · 灵珍现世`;
    $('#resultSummary').textContent=`本次获得 ${results.length} 张卡牌 · 新收录 ${newCount} 张 · 距 SSR 保底还有 ${90-state.pity} 抽${hardPityTriggered?' · 触发九十抽保底':''}`;
    results.forEach((c,i)=>{
      const btn=document.createElement('button');btn.type='button';btn.className=`reveal-card ${c.rarity.toLowerCase()}`;btn.style.setProperty('--delay',i*65+'ms');btn.setAttribute('aria-label',`查看${c.name}卡牌详情`);
      const stage=document.createElement('div');stage.className='card-stage';const back=document.createElement('div');back.className='card-back';back.textContent='岐';const face=document.createElement('div');face.className='card-face';const pic=document.createElement('img');pic.src=img(c);pic.alt=c.name;face.append(pic);stage.append(back,face);btn.append(stage);
      if(c.isNew){const newTag=document.createElement('span');newTag.className='new-tag';newTag.textContent='NEW';btn.append(newTag);}
      const name=document.createElement('div');name.className='result-card-name';name.textContent=c.name;const r=document.createElement('div');r.className='result-rarity';r.textContent=`${c.rarity} · ${c.type} · 持有 ${ownedCount(c.id)} 张`;btn.append(name,r);
      btn.addEventListener('click',()=>{if(!btn.classList.contains('flipped'))btn.classList.add('flipped');else openDetail(c.id);});container.append(btn);
    });
    overlay.hidden=false;document.body.style.overflow='hidden';revealCardsGradually();
  }
  function closeResults(toCollection=false){
    if($('#resultOverlay').hidden)return;
    $('#resultOverlay').hidden=true;
    document.body.style.overflow='';
    if(toCollection)switchTab('collection');
  }
  function drawAgain(count){
    if(drawing)return;
    closeResults(false);
    switchTab('draw');
    draw(count);
  }
  function renderCatalog(){const container=$('#catalog');container.replaceChildren();const shown=cards.filter(c=>(filter==='ALL'||c.rarity===filter)&&(!search||`${c.name} ${c.type} ${c.title}`.toLowerCase().includes(search.toLowerCase())));
    if(!shown.length){const empty=document.createElement('div');empty.className='empty';empty.textContent='未找到符合条件的卡牌';container.append(empty);return;}
    for(const c of shown){const owned=ownedCount(c.id)>0;const btn=document.createElement('button');btn.className='catalog-card'+(owned?'':' unowned');btn.setAttribute('aria-label',`查看${c.name}`);const picture=document.createElement('img');picture.src=img(c);picture.alt=c.name;picture.loading='lazy';const title=document.createElement('h3');title.textContent=owned?c.name:'未收录 · ???';const sub=document.createElement('small');sub.textContent=`${c.rarity} · ${c.type} · ${owned?'持有 '+owned+' 张':'待寻珍'}`;btn.append(picture,title,sub);if(!owned){const tag=document.createElement('span');tag.className='tag';tag.textContent='LOCKED';btn.append(tag);}btn.addEventListener('click',()=>openDetail(c.id));container.append(btn);}
  }
  function openDetail(id){
    const c=cards.find(c=>String(c.id)===String(id));if(!c)return;
    const owned=ownedCount(c.id)>0;
    const wrap=$('#detailBody');wrap.replaceChildren();
    const grid=document.createElement('div');grid.className='detail-main';
    const art=document.createElement('div');art.className=`detail-art ${c.rarity.toLowerCase()}`;
    const pic=document.createElement('img');pic.src=img(c);pic.alt=`${c.name} · ${c.title} 卡牌插画`;pic.loading='eager';
    art.append(pic);
    const text=document.createElement('div');text.className='detail-information';
    const badge=document.createElement('span');badge.className=`rarity ${c.rarity.toLowerCase()}`;badge.textContent=`${c.rarity} · ${rarityLabels[c.rarity]}`;
    const h=document.createElement('h2');h.id='detailName';h.textContent=owned?c.name:'尚未收录';
    const subtitle=document.createElement('div');subtitle.className='detail-subtitle';subtitle.textContent=owned?c.title:'未知藏品';
    const meta=document.createElement('div');meta.className='detail-meta';
    for(const [name,value] of [['藏品类别',c.type],['稀有度',c.rarity],['图鉴编号',`NO. ${String(c.id).padStart(3,'0')}`],['持有数量',`${ownedCount(c.id)} 张`]]){
      const item=document.createElement('div');const key=document.createElement('small');key.textContent=name;const val=document.createElement('strong');val.textContent=value;item.append(key,val);meta.append(item);
    }
    const quote=document.createElement('p');quote.className='detail-quote';quote.textContent=owned?(c.quote||'岐黄文化，薪火相传。'):'解锁后查看卡牌题记';
    const label=document.createElement('h3');label.className='detail-section-title';label.textContent='典藏志 · 文化介绍';
    const desc=document.createElement('p');desc.className='detail-description';desc.textContent=owned?c.description:'这张卡牌尚未收入图鉴，参与抽取后可查看其文化介绍。';
    text.append(badge,h,subtitle,meta,quote,label,desc);
    grid.append(art,text);wrap.append(grid);
    $('#detailOverlay').hidden=false;document.body.style.overflow='hidden';
  }
  function closeDetail(){$('#detailOverlay').hidden=true;document.body.style.overflow=$('#resultOverlay').hidden?'':'hidden';}
  function renderHistory(){const root=$('#historyList');root.replaceChildren();if(!state.history.length){const empty=document.createElement('div');empty.className='empty';empty.textContent='暂无寻珍记录 · 前往丹炉开启第一次抽取';root.append(empty);return;}
    for(const record of state.history){const entry=document.createElement('div');entry.className='history-entry';const date=document.createElement('div');date.className='history-date';const title=document.createElement('strong');title.textContent=record.ids.length===10?'十味连炼':'单次寻珍';const time=document.createElement('small');time.textContent=new Date(record.timestamp).toLocaleString('zh-CN',{hour12:false});date.append(title,time);const imgs=document.createElement('div');imgs.className='history-images';record.ids.slice(0,10).forEach(id=>{const c=cards.find(x=>x.id===id);if(!c)return;const pic=document.createElement('img');pic.src=img(c);pic.title=c.name;pic.alt=c.name;imgs.append(pic);});const r=document.createElement('div');r.className='history-count';r.textContent=`${record.ids.length} 张 · 最高 ${record.top||'N'}`;entry.append(date,imgs,r);root.append(entry);}
  }
  $$('.nav-item').forEach(b=>b.addEventListener('click',()=>switchTab(b.dataset.tab)));
  $('#drawOne').addEventListener('click',()=>draw(1));$('#drawTen').addEventListener('click',()=>draw(10));
  $('#closeResult').addEventListener('click',()=>closeResults());$('#closeResultBottom').addEventListener('click',()=>closeResults(true));
  $('#resultDrawOne').addEventListener('click',()=>drawAgain(1));$('#resultDrawTen').addEventListener('click',()=>drawAgain(10));
  $('#resultOverlay').addEventListener('click',e=>{if(e.target===e.currentTarget)closeResults();});
  $('#closeDetail').addEventListener('click',closeDetail);$('#detailOverlay').addEventListener('click',e=>{if(e.target===e.currentTarget)closeDetail();});
  $('#filters').addEventListener('click',e=>{const b=e.target.closest('button[data-rarity]');if(!b)return;filter=b.dataset.rarity;$$('.filter').forEach(x=>x.classList.toggle('active',x===b));renderCatalog();});
  $('#searchInput').addEventListener('input',e=>{search=e.target.value.trim();renderCatalog();});
  $('#resetBtn').addEventListener('click',()=>{if(confirm('确定清空当前浏览器中的全部抽卡记录和图鉴收集进度吗？此操作不可恢复。')){state.owned={};state.history=[];state.total=0;state.ssr=0;state.pity=0;save();updateStats();renderHistory();}});
  document.addEventListener('keydown',e=>{if(e.key==='Escape'){if(!$('#detailOverlay').hidden)closeDetail();else if(!$('#resultOverlay').hidden)closeResults();}});
  load();updateStats();renderCatalog();
})();
