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
  if (F.ttr>=0.45)       hs.push(['Informative Analysis','Lexical variety implies au]()
