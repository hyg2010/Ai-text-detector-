/* ---------------------------------------------------------
   GPTZero-ish local heuristic scorer (no upload, no models)
   Emphasizes cues GPTZero tends to reward/punish:
   - “Newsy” facts, sources, dates, money → Human
   - Listicles / steps / formulaic advice → AI
   - Uniform sentence lengths, low contractions → AI
   - Proper nouns, quotes, numerals → Human
--------------------------------------------------------- */

const stop = new Set(("a,an,the,and,or,of,to,in,for,on,at,as,by,from,with,that,which,who,whom,whose,be,is,am,are,was,were,been,being,do,does,did,has,have,had,but,if,so,than,then,when,where,why,how,into,about,over,under,more,most,less,least,can,could,may,might,should,would,will,just,also,very,up,down,out,off,not,no,nor,own,same,too,again,once,each,few,other,some,such,only,both,between").split(","));

const transitionWords = new Set([
  "however","moreover","furthermore","additionally","in addition","in conclusion",
  "overall","meanwhile","therefore","thus","nonetheless","nevertheless",
  "first","firstly","second","secondly","finally","lastly","next","then"
]);

const listiclePhrases = [
  /step\s*\d+/i, /pro\s*tip/i, /\d+\s*(tips|ways|steps|strategies|reasons)/i,
  /\bhere (are|is)\b/i, /\bin this article\b/i, /\btry this\b/i
];

const citationPhrases = [
  /according to/i, /reported/i, /told/i, /data/i, /analysis/i, /study/i,
  /survey/i, /research/i, /the firm/i, /as of/i, /in \d{4}/i,
  /reuters/i, /bloomberg/i, /financial times/i, /techcrunch/i, /appfigures/i
];

const newsishNames = [
  "OpenAI","Google","Anthropic","DeepMind","xAI","Microsoft","Apple","Meta",
  "Reuters","Bloomberg","TechCrunch","Financial Times","Appfigures","Sam","Altman",
  "Musk","Neuralink","Character.ai","Noam","Shazeer","Grok","Claude","FedRAMP"
];

function splitSentences(text){
  // keep bullets / steps intact
  const hard = text
    .replace(/\r/g,"")
    .split(/\n+/)
    .map(line=>line.trim())
    .filter(Boolean);

  const sents = [];
  for (const line of hard){
    if (/^(\d+[\.\)]|[-*•✓❌]|step\s*\d+)/i.test(line)) { sents.push(line); continue; }
    const parts = line.split(/(?<=[\.\?!])\s+(?=[A-Z“"('\[])/).filter(Boolean);
    if (parts.length) sents.push(...parts);
    else sents.push(line);
  }
  return sents.filter(s => /\w/.test(s));
}

function tokens(s){ return s.toLowerCase().match(/[a-z0-9’']+/g) || []; }
function wordsAll(text){ return tokens(text); }

function uniqCount(arr){ return new Set(arr).size; }

function stddev(xs){
  const n = xs.length; if (!n) return 0;
  const m = xs.reduce((a,b)=>a+b,0)/n;
  const v = xs.reduce((a,b)=>a+(b-m)*(b-m),0)/n;
  return Math.sqrt(v);
}

function ratio(a,b){ return b ? a/b : 0; }

function countMatches(text, rex){ 
  if (rex instanceof RegExp) return (text.match(rex)||[]).length;
  return rex.reduce((acc,r)=>acc + (text.match(r)||[]).length,0);
}

function isPassive(sent){
  // crude: be-aux within 3 tokens of a word ending -ed
  return /\b(am|is|are|was|were|been|be|being)\b(?:\W+\w+){0,3}\W+\w+ed\b/i.test(sent);
}

function imperativeStart(line){
  return /^([A-Z][a-z]+)\b(?!\s+(Inc|LLC|Corp|AI|Labs))/.test(line) &&
         !/^(The|This|That|These|Those|When|While|With|Where|Why|How|If|In)\b/.test(line) &&
         !/[\.!?]$/.test(line) && line.split(/\s+/).length <= 8;
}

function properNounCount(text){
  // naive: capitalized word not at sentence start, or known org list
  const words = text.match(/\b[A-Z][a-zA-Z]+\b/g) || [];
  let count = 0;
  for (const w of words){
    if (newsishNames.includes(w)) { count++; continue; }
    if (!/^(I|A|The|This|That|In|On|At|For|Of|And|But|Or)$/.test(w)) count++;
  }
  return count;
}

function featureExtract(text){
  const sents = splitSentences(text);
  const all = wordsAll(text);
  const totalWords = all.length;
  const sentLens = sents.map(s => tokens(s).length).filter(n => n>0);

  const burstiness = ratio(stddev(sentLens), (sentLens.reduce((a,b)=>a+b,0)/Math.max(1,sentLens.length)));

  const stopwords = all.filter(w => stop.has(w)).length;
  const uniqRatio = ratio(uniqCount(all), totalWords);

  const contractions = (text.match(/\b\w+'(t|re|ve|ll|d|m|s)\b/gi)||[]).length;
  const contractionsRatio = ratio(contractions, totalWords);

  const numerals = (text.match(/[$€£]\s?\d|(?:\b\d{1,3}(?:,\d{3})+|\b\d+)(?:\.\d+)?\s?(%|million|billion|k|m|bn|mm)?/gi)||[]).length;
  const yearHits = (text.match(/\b(19|20)\d{2}\b/g)||[]).length;

  const bullets = (text.match(/^(?:\s*[-*•✓❌]|\s*\d+[\.\)]\s)/gmi)||[]).length;
  const steps = countMatches(text, listiclePhrases);

  const transitions = countMatches(text, Array.from(transitionWords).map(w=>new RegExp("\\b"+w+"\\b","gi")));

  const hedges = (text.match(/\b(might|may|could|can help|tends? to|seems?|likely)\b/gi)||[]).length;

  const cites = countMatches(text, citationPhrases);

  const pnouns = properNounCount(text);

  const quotes = (text.match(/["“”']/g)||[]).length/2;

  const passive = sents.filter(isPassive).length;

  const secondPerson = (text.match(/\byou|your|you'll|you’re|you've\b/gi)||[]).length;
  const secondPersonRatio = ratio(secondPerson, totalWords);

  const imperativeLines = text.split(/\n+/).filter(l=>imperativeStart(l.trim())).length;

  const headingColons = (text.match(/^[A-Z][^\n:]{2,40}:\s/mg)||[]).length;

  // n-gram repetition 2–4 grams
  const words = tokens(text);
  const ngramCounts = (n)=>{
    const m = new Map();
    for (let i=0;i<=words.length-n;i++){
      const g = words.slice(i,i+n).join(" ");
      m.set(g,(m.get(g)||0)+1);
    }
    let repeats = 0;
    for (const v of m.values()) if (v>1) repeats += v-1;
    return repeats;
  };
  const repeats = ngramCounts(2)+ngramCounts(3);

  return {
    sents, totalWords, burstiness, uniqRatio,
    stopwordRatio: ratio(stopwords,totalWords),
    contractionsRatio,
    numerals: numerals+yearHits,
    bullets, steps, transitions, hedges, cites, pnouns, quotes,
    passive, secondPersonRatio, imperativeLines, headingColons, repeats
  };
}

function score(text){
  const f = featureExtract(text);

  // Scores start at 0; positive favors each side
  let human = 0, ai = 0;

  // --- Human-leaning signals (news/reporting)
  human += f.numerals * 3.5;         // money, %s, dates
  human += f.cites * 8;              // “according to…”, “reported…”
  human += Math.min(30, f.pnouns * 1.2);
  human += f.quotes * 2;
  human += (f.burstiness > 0.55 ? 8 : 0);  // varied sentence lengths
  human += (f.contractionsRatio > 0.01 ? 3 : 0);

  // --- AI-leaning signals (listicles / tidy guides)
  ai += f.bullets * 10;
  ai += f.steps * 12;
  ai += f.imperativeLines * 8;
  ai += f.headingColons * 5;
  ai += f.transitions * 1.5;
  ai += f.hedges * 1.2;
  ai += (f.burstiness < 0.45 ? 12 : 0);
  ai += (f.contractionsRatio < 0.004 ? 6 : 0);
  ai += (f.secondPersonRatio > 0.02 ? 6 : 0);
  ai += Math.min(12, f.repeats * 0.5);
  ai += f.passive * 0.8;

  // Small nudge: very high uniqRatio often = “crafted” → Human
  if (f.uniqRatio > 0.5) human += 2;

  // Convert to soft probabilities
  const raw = ai - human;
  const pAI = 1/(1+Math.exp(-raw/18)); // temperature
  const pHuman = 1 - pAI;
  const pMixed = 1 - Math.abs(pAI - pHuman); // peak in the middle

  // classification badge
  let badge = "Unclear";
  if (pAI >= 0.65) badge = "Likely AI";
  else if (pHuman >= 0.65) badge = "Likely Human";

  return { f, pAI, pHuman, pMixed: Math.max(0, Math.min(1,pMixed*0.7)), badge };
}

// ---- UI ----
const $ = sel => document.querySelector(sel);

function setBar(elPct, elBar, v){
  const pct = Math.round(v*100);
  elPct.textContent = pct + "%";
  elBar.style.width = pct + "%";
}

function tagsForAIReason(sent){
  const tags = [];
  if (/^(\d+[\.\)]|[-*•✓❌]|step\s*\d+)/i.test(sent)) tags.push("List/Bullet");
  if (listiclePhrases.some(r=>r.test(sent))) tags.push("Rigid Guidance");
  if (/\b(try|start|avoid|apply|breathe|use|don’t|do|stick|give|wear)\b/i.test(sent)) tags.push("Imperative");
  if (transitionWords.has(sent.toLowerCase().split(/\W+/)[0])) tags.push("Formulaic Transition");
  if (isPassive(sent)) tags.push("Passive Voice");
  if (/\b(might|may|could|likely|tend|seems?)\b/i.test(sent)) tags.push("Hedging");
  if (/:/.test(sent)) tags.push("Mechanical Punctuation");
  return tags.length?tags:["Formulaic Flow"];
}

function tagsForHumanReason(sent){
  const tags = [];
  if (citationPhrases.some(r=>r.test(sent))) tags.push("Cites Source");
  if (/\b(19|20)\d{2}\b/.test(sent) || /[$€£]|%/.test(sent)) tags.push("Specific Numbers");
  if (properNounCount(sent)>0) tags.push("Named Entities");
  if (/["“”]/.test(sent)) tags.push("Quotation");
  return tags.length?tags:["Factual Clarity"];
}

function topK(arr, k){ return arr.slice(0,k); }

function renderLists(text, f){
  const aiScored = f.sents.map(s => {
    let score = 0;
    if (/^(\d+[\.\)]|[-*••✓❌]|step\s*\d+)/i.test(s)) score += 3;
    if (listiclePhrases.some(r=>r.test(s))) score += 3;
    if (imperativeStart(s.trim())) score += 2;
    if (isPassive(s)) score += 1;
    if (/\b(might|may|could|likely|tend|seems?)\b/i.test(s)) score += 1;
    if (s.split(/\s+/).length < 10) score += 0.5;
    return {s,score};
  }).sort((a,b)=>b.score-a.score);

  const humanScored = f.sents.map(s=>{
    let score=0;
    if (citationPhrases.some(r=>r.test(s))) score += 3;
    if (/\b(19|20)\d{2}\b/.test(s) || /[$€£]|%/.test(s)) score += 2.5;
    if (properNounCount(s)>0) score += 1.2;
    if (/["“”]/.test(s)) score += 1;
    return {s,score};
  }).sort((a,b)=>b.score-a.score);

  const aiBox = $("#aiList"); aiBox.innerHTML = "";
  const humanBox = $("#humanList"); humanBox.innerHTML = "";

  for (const {s} of topK(aiScored, 6)){
    const li = document.createElement("li"); li.className="s-line";
    li.innerHTML = `<div class="quote">${s}</div>
      <div class="tags">${tagsForAIReason(s).map(t=>`<span class="tag">${t}</span>`).join("")}</div>`;
    aiBox.appendChild(li);
  }
  for (const {s} of topK(humanScored, 6)){
    const li = document.createElement("li"); li.className="s-line";
    li.innerHTML = `<div class="quote">${s}</div>
      <div class="tags">${tagsForHumanReason(s).map(t=>`<span class="tag">${t}</span>`).join("")}</div>`;
    humanBox.appendChild(li);
  }
}

function classify(){
  const text = $("#input").value.trim();
  if (!text){ alert("Paste some text first."); return; }

  const res = score(text);
  setBar($("#aiPct"), $("#aiBar"), res.pAI);
  setBar($("#humPct"), $("#humBar"), res.pHuman);
  setBar($("#mixPct"), $("#mixBar"), res.pMixed);
  $("#overallBadge").textContent = res.badge;

  renderLists(text, res.f);
}

$("#scanBtn").addEventListener("click", classify);

// Quick demo text on first load (optional – comment if you don’t want)
if (!localStorage.getItem("demo-dismissed")){
  $("#input").value = "In July 2025, Appfigures reported that 337 revenue-generating AI companion apps had produced $82 million in H1, and are on pace to exceed $120 million by year-end, according to TechCrunch.";
}
