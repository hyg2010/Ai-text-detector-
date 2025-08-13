// --- Ai-text-detector (client-only) ---
// No uploads. Runs entirely in the browser.

(function () {
  "use strict";

  // -----------------------------
  // Safe Scan button hookup
  // -----------------------------
  function bindScan() {
    const btn =
      document.getElementById("scanBtn") ||
      document.querySelector('button[data-action="scan"]') ||
      Array.from(document.querySelectorAll("button"))
        .find(b => /scan/i.test(b.textContent || ""));
    if (btn && !btn.__bound) {
      btn.addEventListener("click", classify);
      btn.__bound = true;
    }
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bindScan);
  } else {
    bindScan();
  }

  // Rebind in case the site does client-side nav
  window.addEventListener("pageshow", bindScan);

  // -----------------------------
  // Utilities
  // -----------------------------
  const STOPWORDS = new Set((
    "a,an,the,and,or,but,if,then,else,when,while,for,to,of,in,on,at,by,with,as,that,than,so," +
    "into,about,over,from,up,down,out,off,without,within,between,across,through,during," +
    "is,am,are,was,were,be,been,being,do,does,did,doing,have,has,had,having," +
    "this,that,these,those,there,here,where,who,whom,whose,which,what,why,how," +
    "it,its,it's,i,you,we,they,he,she,them,us,me,him,her,your,our,their"
  ).split(","));

  const TRANSITION_STARTERS = [
    "in conclusion","conclusion","to sum up","in summary","overall","with that in mind",
    "additionally","moreover","furthermore","however","nevertheless","nonetheless",
    "first","second","third","finally","lastly","on the other hand","meanwhile",
    "luckily","importantly","for example","for instance","as a result","therefore","thus"
  ];

  const IMPERATIVE_STARTERS = [
    "start","begin","use","apply","avoid","stick","keep","make","try","find","focus",
    "breathe","practice","consider","follow","do","don’t","don't","wear","set","take"
  ];

  const JOURNALISTIC_CUES = [
    "according to","as of","reported","reports","reporting","said","says","told",
    "data","survey","study","studies","per","as per","figures","appfigures","bloomberg",
    "reuters","techcrunch","financial times","as a percentage","million","billion","percent","%"
  ];

  const KNOWN_ENTITIES = [
    "OpenAI","Google","Anthropic","DeepMind","xAI","Microsoft","Apple","Meta",
    "Reuters","Bloomberg","TechCrunch","Financial Times","Appfigures","Sam","Altman",
    "Musk","Neuralink","Character.ai","Noam","Shazeer","Grok","Claude","FedRAMP"
  ];

  // try to find input text area
  function getInputText() {
    const el =
      document.getElementById("input") ||
      document.querySelector("textarea") ||
      document.querySelector('[contenteditable="true"]');
    return (el && (el.value ?? el.textContent) || "").trim();
  }

  function clamp01(x) {
    return Math.max(0, Math.min(1, x));
  }

  function uniqCount(arr) {
    return new Set(arr).size;
  }

  function tokens(s) {
    return (s.toLowerCase().match(/[a-z0-9’']+/g) || []);
  }

  function wordsAll(text) {
    return tokens(text);
  }

  // Keep numbered/bulleted/steps intact when splitting
  function splitSentences(text) {
    const lines = text.replace(/\r/g, "").split(/\n+/).map(s => s.trim()).filter(Boolean);
    const out = [];
    for (const line of lines) {
      // bullets/steps: "1.", "1)", "-", "*", "•", "✓", "❌", or "step 1"
      if (/^(\d+[\.\)]|[-*•✓❌]|step\s*\d+)/i.test(line)) {
        out.push(line);
        continue;
      }
      // Insert separators after . ? ! if followed by uppercase/open quote/paren
      const marked = line.replace(/([.?!])\s+(?=[A-Z“"('\[])/g, "$1|");
      out.push(...marked.split("|").map(s => s.trim()).filter(Boolean));
    }
    return out.filter(s => /\w/.test(s));
  }

  // -----------------------------
  // Feature extraction
  // -----------------------------
  function features(text) {
    const sents = splitSentences(text);
    const words = wordsAll(text);
    const sentLens = sents.map(s => tokens(s).length).filter(n => n > 0);
    const avg = sentLens.length ? (sentLens.reduce((a,b)=>a+b,0)/sentLens.length) : 0;
    const variance = sentLens.length ? sentLens.reduce((a,n)=>a+Math.pow(n-avg,2),0)/sentLens.length : 0;
    const std = Math.sqrt(variance);
    const burstiness = avg ? std/avg : 0;

    // stopword ratio
    const sw = words.filter(w => STOPWORDS.has(w)).length;
    const stopRatio = words.length ? sw/words.length : 0;

    // type-token ratio (vocab richness)
    const ttr = words.length ? uniqCount(words)/words.length : 0;

    // n-gram repetition (2–4 grams)
    const repScores = [2,3,4].map(n => {
      const ng = ngrams(words, n);
      if (!ng.length) return 0;
      const m = new Map();
      for (const g of ng) m.set(g, (m.get(g)||0)+1);
      const repeats = [...m.values()].filter(v=>v>1).reduce((a,b)=>a+b,0);
      return repeats/ng.length;
    });
    const repetition = repScores.reduce((a,b)=>a+b,0)/(repScores.length||1);

    // list share
    const listShare = sents.length ? sents.filter(s=>/^(\d+[\.\)]|[-*••✓❌]|step\s*\d+)/i.test(s)).length/sents.length : 0;

    // transitions at sentence start
    const transShare = sents.length ? sents.filter(s => startsWithAny(s, TRANSITION_STARTERS)).length/sents.length : 0;

    // imperative share
    const impShare = sents.length ? sents.filter(s => startsWithAny(s, IMPERATIVE_STARTERS)).length/sents.length : 0;

    // numbers/citations
    const digits = (text.match(/\d/g)||[]).length;
    const links = (text.match(/https?:\/\/|www\./gi)||[]).length;
    const parens = (text.match(/[()]/g)||[]).length;
    const quotes = (text.match(/["“”']/g)||[]).length;

    // contractions / conversational cue
    const contractions = (text.match(/\b\w+['’]\w+\b/g)||[]).length;
    const secondPerson = /\byou\b/i.test(text);

    // proper-noun/entity pings
    const entities = KNOWN_ENTITIES.filter(n => new RegExp("\\b"+escapeRegex(n)+"\\b","i").test(text)).length;

    return {
      sents, words, sentLens, avg, std, burstiness, stopRatio, ttr,
      repetition, listShare, transShare, impShare,
      digits, links, parens, quotes, contractions, secondPerson, entities
    };
  }

  function ngrams(arr, n) {
    const out = [];
    for (let i=0; i<=arr.length-n; i++) out.push(arr.slice(i,i+n).join(" "));
    return out;
  }

  function startsWithAny(s, list) {
    const lower = s.toLowerCase();
    return list.some(p => lower.startsWith(p));
  }

  function escapeRegex(s){ return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

  // -----------------------------
  // Sentence tagging (explanations)
  // -----------------------------
  const AI_TAGS = [
    {name:"Rigid Guidance", test: s => startsWithAny(s, IMPERATIVE_STARTERS) || /\b(here (are|is))\b/i.test(s)},
    {name:"Mechanical Precision", test: s => /\d/.test(s) && /[%)]|\bminutes?\b|\bhours?\b|\bweeks?\b|\byears?\b/i.test(s)},
    {name:"Predictable Syntax", test: s => startsWithAny(s, ["first","second","third","finally","lastly","next","then"])},
    {name:"Robotic Formality", test: s => !/\b\w+['’]\w+\b/.test(s) && !/\byou\b/i.test(s) && s.split(",").length<=1 && tokens(s).length>=8},
    {name:"Lacks Creativity", test: s => tokens(s).filter(w=>w.length>=7).length<=2 && tokens(s).length<=18},
    {name:"Mechanical Transitions", test: s => /\b(which|that|in order to)\b/i.test(s) && /,/.test(s)},
    {name:"Formulaic Flow", test: s => startsWithAny(s, TRANSITION_STARTERS)}
  ];

  const HUMAN_TAGS = [
    {name:"Journalistic Style", test: s => JOURNALISTIC_CUES.some(c => s.toLowerCase().includes(c))},
    {name:"Factual Clarity", test: s => tokens(s).length<=28 && s.split(",").length<=2 && /\b(is|are|was|were|will|has|have|had|says|said|reported)\b/i.test(s)},
    {name:"Technical-Broad Balance", test: s => /[,()]/.test(s) && /\b(e.g.|for example|which|that)\b/i.test(s)},
    {name:"Common Vocabulary", test: s => uniqCount(tokens(s)) / (tokens(s).length||1) > 0.6},
    {name:"Simple Direct Sentences", test: s => tokens(s).length<=18 && s.indexOf(",")===-1},
    {name:"Conversational Tone", test: s => /\byou\b/i.test(s) || /\bwe\b/i.test(s) || /\b\w+['’]\w+\b/.test(s)}
  ];

  function sentenceSignals(s) {
    const ai = AI_TAGS.filter(t => t.test(s)).map(t => t.name);
    const human = HUMAN_TAGS.filter(t => t.test(s)).map(t => t.name);
    return {ai, human};
  }

  // -----------------------------
  // Scoring
  // -----------------------------
  function score(doc) {
    // AI-ish signals (higher -> more AI)
    let ai = 0;
    ai += 1.2 * doc.listShare;           // lots of lists/steps
    ai += 0.9 * doc.transShare;          // many "However/Additionally" openers
    ai += 0.8 * clamp01(doc.repetition*2);
    ai += 0.7 * clamp01((0.4 - doc.ttr) * 2);   // very low TTR = repetitive
    ai += 0.7 * clamp01((0.35 - doc.burstiness) * 2); // very uniform sentence lengths
    ai += 0.6 * doc.impShare;            // imperative / rigid advice vibe

    // Human-ish signals
    let human = 0;
    human += 0.9 * clamp01(doc.burstiness);      // natural unevenness
    human += 0.9 * clamp01(doc.ttr);             // varied vocab
    human += 0.8 * clamp01((doc.digits>0) + (doc.entities>0) + (doc.parens>0)); // reporting flavor
    human += 0.6 * clamp01((doc.contractions>0) + (doc.secondPerson?1:0)); // conversational
    human += 0.5 * clamp01(doc.entities/5);      // named orgs/people

    // Normalize and derive percentages
    const base = ai + human + 1e-6;
    let aiPct = clamp01(ai / base);
    let humanPct = clamp01(human / base);
    // a small mixed zone when both are middling
    const mixedPct = clamp01(1 - Math.max(aiPct, humanPct)) * 0.6;

    // re-normalize to sum ≈ 1
    const sum = aiPct + humanPct + mixedPct + 1e-6;
    aiPct /= sum; humanPct /= sum; const mixPct = mixedPct / sum;

    return { aiPct, humanPct, mixPct };
  }

  // -----------------------------
  // Render helpers
  // -----------------------------
  function setPct(kind, frac) {
    const pctText = Math.round(frac * 100) + "%";
    const textEl =
      document.querySelector(`[data-pct="${kind}"]`) ||
      document.getElementById(kind + "Pct");
    if (textEl) textEl.textContent = pctText;

    const barEl =
      document.querySelector(`[data-bar="${kind}"]`) ||
      document.getElementById(kind + "Bar");
    if (barEl) barEl.style.width = pctText;
  }

  function renderLines(listIdCandidates, items) {
    const listEl = listIdCandidates
      .map(sel => document.querySelector(sel))
      .find(Boolean);
    if (!listEl) return;
    listEl.innerHTML = "";

    for (const it of items.slice(0, 8)) {
      const li = document.createElement("div");
      li.className = "lineItem";
      li.innerHTML = `
        <div class="lineText">“${escapeHTML(it.text)}”</div>
        <div class="chips">${it.tags.map(tag => `<span class="chip">${escapeHTML(tag)}</span>`).join(" ")}</div>
      `;
      listEl.appendChild(li);
    }
  }

  function escapeHTML(s){
    return s.replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  }

  // -----------------------------
  // Classify action
  // -----------------------------
  function classify() {
    const text = getInputText();
    if (!text) return;

    const f = features(text);
    const pct = score(f);

    // Bars/percentages
    setPct("ai", pct.aiPct);
    setPct("mixed", pct.mixPct);
    setPct("human", pct.humanPct);

    // Sentence scanning
    const sentObjects = f.sents.map(s => {
      const sig = sentenceSignals(s);
      const aiWeight = sig.ai.length + (startsWithAny(s, TRANSITION_STARTERS) ? 1 : 0) + (/\d/.test(s) && /%/.test(s) ? 0.5 : 0);
      const humanWeight = sig.human.length + (/\b(according to|reported|says|said)\b/i.test(s) ? 1 : 0);
      return { text: s, aiTags: sig.ai, humanTags: sig.human, aiWeight, humanWeight };
    });

    const aiTop = sentObjects
      .filter(o => o.aiTags.length)
      .sort((a,b) => b.aiWeight - a.aiWeight)
      .map(o => ({ text: o.text, tags: o.aiTags }));

    const humanTop = sentObjects
      .filter(o => o.humanTags.length)
      .sort((a,b) => b.humanWeight - a.humanWeight)
      .map(o => ({ text: o.text, tags: o.humanTags }));

    // Try multiple containers for compatibility
    renderLines(["#aiLines", "#aiList", '[data-list="ai"]'], aiTop);
    renderLines(["#humanLines", "#humanList", '[data-list="human"]'], humanTop);
  }

})();
