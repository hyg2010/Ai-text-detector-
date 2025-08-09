// --- utils you already have: splitSentences, tokens, uniq, ngrams, clamp01, scale ---

function features(text){
  const sents = splitSentences(text);
  const words = tokens(text);
  const sentLens = sents.map(s=>tokens(s).length).filter(n=>n>0);
  const avg = sentLens.length ? sentLens.reduce((a,b)=>a+b,0)/sentLens.length : 0;
  const std = sentLens.length>1 ? Math.sqrt(sentLens.map(x=> (x-avg)**2).reduce((a,b)=>a+b,0)/sentLens.length) : 0;
  const burstiness = avg>0 ? std/avg : 0;

  const ttr = words.length ? uniq(words).length/words.length : 0;

  // stopword ratio
  const stops = new Set('a about above after again against all am an and any are as at be because been before being below between both but by could did do does doing down during each few for from further had has have having he her here hers herself him himself his how i if in into is it its itself just me more most my myself no nor not of off on once only or other our ours ourselves out over own same she should so some such than that the their theirs them themselves then there these they this those through to too under until up very was we were what when where which while who whom why with you your yours yourself yourselves'.split(/\s+/));
  const stopRatio = words.length ? words.filter(w=>stops.has(w)).length/words.length : 0;

  // n-gram repetition (2–4 grams)
  const repScores = [2,3,4].map(n=>{
    const ng=ngrams(words,n); if(!ng.length) return 0;
    const m=new Map(); ng.forEach(x=>m.set(x,(m.get(x)||0)+1));
    const repeats=[...m.values()].filter(v=>v>1).reduce((a,b)=>a+b,0);
    return repeats/ng.length;
  });
  const repetition = repScores.reduce((a,b)=>a+b,0)/(repScores.length||1);

  // simple style signals
  const raw = text;
  const hasContractions = /(?:\b\w+'[a-z]+\b)/i.test(raw);      // we’ll, don’t, it’s
  const secondPerson    = /\byo
