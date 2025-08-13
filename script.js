// script.js — v6

document.addEventListener('DOMContentLoaded', () => {
  const ta = document.querySelector('textarea');
  const scanBtn = document.querySelector('button#scan');
  const aiBar = document.querySelector('#aiBar');
  const mixedBar = document.querySelector('#mixedBar');
  const humanBar = document.querySelector('#humanBar');
  const aiList = document.querySelector('#aiList');
  const humanList = document.querySelector('#humanList');

  // --- helpers --------------------------------------------------------------

  function splitSentences(text) {
    // keep bullet/step lines intact; otherwise split on newlines
    const lines = text.replace(/\r/g, '').split(/\n+/).map(s => s.trim()).filter(Boolean);
    const out = [];
    for (const line of lines) {
      // numbered / bulleted / step headings -> keep
      if (/^(\d+[\.\)]|[-–•\*]|step\s*\d+)/i.test(line)) { out.push(line); continue; }
      // otherwise insert a break after .?! when followed by space+Upper/open paren/quote
      const marked = line.replace(/([.?!])\s+(?=[A-Z“"(])/g, '$1|');
      out.push(...marked.split('|').map(s => s.trim()).filter(Boolean));
    }
    // drop lines that have no letters (e.g., pure punctuation)
    return out.filter(s => /[A-Za-z]/.test(s));
  }

  function tokens(s) {
    return s.toLowerCase().match(/[a-z0-9’']+/g) || [];
  }

  function uniqCount(arr) {
    return new Set(arr).size;
  }

  function clamp01(x) {
    if (x < 0) return 0;
    if (x > 1) return 1;
    return x;
  }

  // --- very simple heuristic scorer ----------------------------------------

  function score(text) {
    const sents = splitSentences(text);
    if (!sents.length) return { ai: 0, human: 0, mixed: 0, aiReasons: [], humanReasons: [] };

    const wordsAll = tokens(text);
    const ttr = wordsAll.length ? uniqCount(wordsAll) / wordsAll.length : 0;

    // avg sentence length and burstiness
    const sentLens = sents.map(s => tokens(s).length).filter(n => n > 0);
    const avg = sentLens.length ? sentLens.reduce((a,b)=>a+b,0)/sentLens.length : 0;
    const variance = sentLens.length ? sentLens.reduce((a,b)=>a+(b-avg)*(b-avg),0)/sentLens.length : 0;
    const burst = avg ? Math.sqrt(variance)/avg : 0;

    // simple signals
    const rigidGuidance = /(?:in this article|this guide|step\s*\d|pro tip|final verdict|with that in mind)/i.test(text);
    const mechanicalTone = /(?:therefore|moreover|however|in addition|furthermore)/i.test(text);
    const conversational = /(?:you|your|let's|we|i\b)/i.test(text);

    // crude probabilities (heuristic weights)
    let aiProb =
      0.35 * clamp01((avg - 18) / 14) +       // very long sentences
      0.25 * clamp01((0.45 - burst) / 0.45) + // too-uniform sentence length
      0.15 * (rigidGuidance ? 1 : 0) +
      0.15 * (mechanicalTone ? 1 : 0) +
      0.10 * clamp01((0.48 - ttr) / 0.48);    // low type-token ratio

    let humanProb =
      0.45 * clamp01((burst - 0.25) / 0.6) +
      0.25 * clamp01((ttr - 0.35) / 0.4) +
      0.20 * (conversational ? 1 : 0) +
      0.10 * clamp01((14 - Math.abs(avg - 18)) / 14);

    aiProb = clamp01(aiProb);
    humanProb = clamp01(humanProb);

    // normalize with some “mixed” space
    let mixedProb = clamp01(1 - Math.max(aiProb, humanProb));
    const total = aiProb + humanProb + mixedProb || 1;
    aiProb /= total; humanProb /= total; mixedProb /= total;

    // reasons (toy examples)
    const aiReasons = [];
    if (avg > 24) aiReasons.push('Long sentences increase AI probability.');
    if (burst < 0.18) aiReasons.push('Low burstiness (uniform sentence length).');
    if (rigidGuidance) aiReasons.push('Rigid/guide-like phrasing detected.');
    if (mechanicalTone) aiReasons.push('Formal connectors found (however, moreover, furthermore).');

    const humanReasons = [];
    if (conversational) humanReasons.push('Conversational tone (you, we, let’s).');
    if (burst > 0.35) humanReasons.push('Varied sentence lengths (higher burstiness).');
    if (ttr > 0.45) humanReasons.push('High lexical variety.');

    return { ai: aiProb, human: humanProb, mixed: mixedProb, aiReasons, humanReasons };
  }

  // --- UI -------------------------------------------------------------------

  function setBar(el, pct) {
    const p = Math.round(pct * 100);
    el.style.width = p + '%';
    el.dataset.pct = p;
  }

  function renderReasons(listEl, items) {
    listEl.innerHTML = '';
    for (const t of items) {
      const li = document.createElement('li');
      li.textContent = t;
      listEl.appendChild(li);
    }
  }

  scanBtn.addEventListener('click', () => {
    const text = ta.value || '';
    const res = score(text);

    setBar(aiBar, res.ai);
    setBar(mixedBar, res.mixed);
    setBar(humanBar, res.human);

    renderReasons(aiList, res.aiReasons);
    renderReasons(humanList, res.humanReasons);
  });
});  // <— end DOMContentLoaded
