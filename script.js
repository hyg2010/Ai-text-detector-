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
  const n = xs.len
