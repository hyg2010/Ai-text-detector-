// simple version marker so you can see it in the browser console
console.log("detector build v2");

/* ------------------ helpers ------------------ */
function splitSentences(text){
  return text.split(/(?<=[.!?])\s+/).map(s=>s.trim()).filter(Boolean);
}
function tokens(text){
  return (text.toLowerCase().match(/[a-zA-Z']+/g)||[]);
}
function uniq(arr){ return Array.from(new Set(arr)); }
function ngrams(tk,n){ const out=[]; for(let i=0;i<=tk.length-n;i++) out.push(tk.slice(i,i+n).join(' ')); return out; }
function clamp01(x){ return Math.max(0, Math.min(1, x)); }
function scale(x,lo,hi){ return clamp01((x-lo)/(hi-lo)); }

/* ------------------ feature extraction ------------------ */
function features(text){
  const sents = splitSentences(text);
  const words = tokens(text);

  const sentLens = sents.map(s=>tokens(s).length).filter(n=>n>0);
  const avg = sentLens.length ? sentLens.reduce((a,b)=>a+b,0)/sentLens.length : 0;
  const std = sentLens.length>1 ? Math.sqrt(sentLens.map(x=>(x-avg)**2).reduce((a,b)=>a+b,0)/sentLens.length) : 0;
  const burstiness = avg>0 ? std/avg : 0;

  const ttr = words.length ? uniq(words).length/words.length : 0;

  const stops = new Set('a about above after again against all am an and any are as at be because been before being below between both but by could did do does doing down during each few for from further had has have having he her here hers herself him himself his how i if in into is it its itself just me more most my myself no nor not of off on once only or other our ours ourselves out over own same she should so some such than that the their theirs them themselves then there these they this those through to too under until up very was we were what when where which while who whom why with you your yours yourself yourselves'.split(/\s+/));
  const stopRatio = words.length ? words.filter(w=>stops.has(w)).length/words.length : 0;

  const repScores = [2,3,4].map(n=>{
    const ng = ngrams(words,n); if(!ng.length) return 0;
    const m=new Map(); ng.forEach(x=>m.set(x,(m.get(x)||0)+1));
    const repeats=[...m.values()].filter(v=>v>1).reduce((a,b)=>a+b,0);
    return repeats/ng.length;
  });
  const repetition = repScores.reduce((a,b)=>a+b,0)/(repScores.length||1);

  const puncts = (text.match(/[^\w\s]/g)||[]);
  const punctDiv = puncts.length ? new Set(puncts).size/puncts.length : 0;

  return { sents, words, sentLens, avg, std, burstiness, ttr, stopRatio, repetition, punctDiv };
}

/* ------------------ explanations & flags ------------------ */
function flagSentences(F){
  const out=[]; const avg = F.avg||0; const lens=F.sentLens;
  F.sents.forEach((s,i)=>{
    const len = lens[i]||0; const toks = tokens(s);
    const formPhrases = /(in conclusion|in this article|this guide|the following steps|it is important to note|studies have shown|research suggests)/i;
    let score=0; let tags=[];
    if(Math.abs(len-avg)<=3){ score+=0.6; tags.push('Formulaic Flow'); }
    if(formPhrases.test(s)) { score+=0.6; tags.push('Rigid Guidance'); }
    if(/^[A-Z][a-z]+\s[a-z]+\s(is|are|was|were)\s/.test(s)) { score+=0.4; tags.push('Robotic Formality'); }
    if(toks.filter(w=>w.length<=3).length/toks.length>0.65){ score+=0.3; tags.push('Lacks Creative Grammar'); }
    if(score>0){ out.push({s,score,tags:[...new Set(tags)].slice(0,2)}); }
  });
  return out.sort((a,b)=>b.score-a.score).slice(0,8);
}

function explanations(F){
  const xs=[]; const hs=[];
  if (F.burstiness<0.35) xs.push(['Robotic Formality','Low burstiness and neat structure feel template-like.']);
  if (F.repetition>0.05) xs.push(['Formulaic Flow','Repeated n-grams/phrases suggest templated wording.']);
  if (F.punctDiv<0.35) xs.push(['Lacks Creative Grammar','Limited punctuation variety; few rhetorical moves.']);

  if (F.burstiness>=0.35) hs.push(['Varied Rhythm','Sentence-length variance suggests human cadence.']);
  if (F.ttr>=0.45)       hs.push(['Informative Analysis','Lexical variety implies authorial choice.']);
  if (F.punctDiv>=0.35)  hs.push(['Conversational Tone','Punctuation variety supports natural flow.']);

  return {ai:xs,human:hs,burst:F.burstiness.toFixed(2),ttr:F.ttr.toFixed(2)};
}

/* ------------------ calibrated scoring (closer to GPTZero feel) ------------------ */
function score(text){
  const F = features(text);
  const { burstiness, ttr, repetition, punctDiv, avg } = F;

  // AI-like signals
  const ai_burst = 1 - scale(burstiness, 0.20, 0.75);
  const ai_ttr   = 1 - scale(ttr,        0.33, 0.62);
  const ai_rep   = scale(repetition,     0.02, 0.16);
  const ai_pdiv  = 1 - scale(punctDiv,   0.22, 0.70);
  let   ai_avg   = 1 - scale(Math.abs(avg-20), 0, 18);

  const AIstrength =
      0.26*ai_burst +
      0.20*ai_ttr   +
      0.20*ai_rep   +
      0.14*ai_pdiv  +
      0.10*ai_avg;

  // Human-like signals
  const humanBurst = scale(burstiness, 0.20, 0.75);
  const humanTTR   = scale(ttr,        0.33, 0.62);
  const humanPunc  = scale(punctDiv,   0.22, 0.70);
  const humanAvg   = 1 - Math.abs((avg-22))/22;

  const Humanstrength =
      0.38*humanBurst +
      0.28*humanTTR   +
      0.18*humanPunc  +
      0.10*humanAvg   +
      0.06*(1-AIstrength);

  let AIpct    = Math.round(100*(AIstrength/(AIstrength+Humanstrength)));
  let Humanpct = Math.round(100*(Humanstrength/(AIstrength+Humanstrength)));
  let Mixpct   = Math.max(0, 100 - (AIpct + Humanpct));

  let label='Unclear', cls='b-unclear';
  if (AIpct >= 60)      { label='Likely AI';    cls='b-ai'; }
  else if (AIpct < 40 ) { label='Likely Human'; cls='b-human'; }

  const flags   = flagSentences(F);
  const explain = explanations(F);
  return { AIpct, Humanpct, Mixpct, label, cls, flags, explain };
}

/* ------------------ UI wiring ------------------ */
const $ = sel => document.querySelector(sel);

window.addEventListener('DOMContentLoaded', ()=>{
  const btn = $('#scan');
  btn.addEventListener('click', ()=>{
    const text = $('#input').value.trim();
    if(!text){ alert('Paste some text first.'); return; }

    const res = score(text);

    const label = $('#label'); label.textContent = res.label; label.className = 'badge '+res.cls;
    $('#pAI').textContent  = res.AIpct+'%';   $('#barAI').value  = res.AIpct;
    $('#pMix').textContent = res.Mixpct+'%';  $('#barMix').value = res.Mixpct;
    $('#pHum').textContent = res.Humanpct+'%';$('#barHum').value = res.Humanpct;

    const list = $('#sentences'); list.innerHTML='';
    if(res.flags.length===0){ list.innerHTML = '<li class="muted">No standout AI-like sentences flagged.</li>'; }
    res.flags.forEach(f=>{
      const li=document.createElement('li');
      li.innerHTML = `<div>“${f.s.replace(/</g,'&lt;').replace(/>/g,'&gt;')}”</div><div style="margin:6px 0">`+
                     f.tags.map(t=>`<span class="tag">${t}</span>`).join('')+`</div>`;
      list.appendChild(li);
    });

    const ex = $('#explain');
    const ai = res.explain.ai.map(([k,v])=>`<div><strong>${k}</strong> — ${v}</div>`).join('');
    const hu = res.explain.human.map(([k,v])=>`<div><strong>${k}</strong> — ${v}</div>`).join('');
    ex.innerHTML = `<div style="margin-bottom:8px"><strong>AI text similarities</strong></div>${ai||'<div class="muted">None.</div>'}
                    <div style="margin:10px 0 8px"><strong>Human text similarities</strong></div>${hu||'<div class="muted">None.</div>'}
                    <div style="margin-top:10px" class="muted">Burstiness: <span class="mono">${res.explain.burst}</span>, TTR: <span class="mono">${res.explain.ttr}</span></div>`;
  });
});
