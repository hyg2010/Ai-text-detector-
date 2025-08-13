// script.js v7 (ASCII only)

document.addEventListener('DOMContentLoaded', function () {
  var ta = document.querySelector('textarea');
  var scanBtn = document.querySelector('button#scan');
  var aiBar = document.querySelector('#aiBar');
  var mixedBar = document.querySelector('#mixedBar');
  var humanBar = document.querySelector('#humanBar');
  var aiList = document.querySelector('#aiList');
  var humanList = document.querySelector('#humanList');

  // -------- helpers --------
  function splitSentences(text) {
    var lines = text.replace(/\r/g, '').split(/\n+/).map(function (s) { return s.trim(); }).filter(Boolean);
    var out = [];
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      // keep list/steps intact
      if (/^(\d+[\.\)]|[-–•*]|step\s*\d+)/i.test(line)) { out.push(line); continue; }
      // mark sentence boundaries
      var marked = line.replace(/([.?!])\s+(?=[A-Z"(])/g, '$1|');
      marked.split('|').forEach(function (s) {
        s = s.trim();
        if (s) out.push(s);
      });
    }
    return out.filter(function (s) { return /[A-Za-z]/.test(s); });
  }

  function tokens(s) {
    var m = (s.toLowerCase().match(/[a-z0-9']+/g) || []);
    return m;
  }

  function uniqCount(arr) {
    var set = Object.create(null);
    for (var i = 0; i < arr.length; i++) set[arr[i]] = 1;
    return Object.keys(set).length;
  }

  function clamp01(x) {
    if (x < 0) return 0;
    if (x > 1) return 1;
    return x;
  }

  // -------- scoring (simple heuristic) --------
  function score(text) {
    var sents = splitSentences(text);
    if (!sents.length) return { ai: 0, mixed: 0, human: 0, aiReasons: [], humanReasons: [] };

    var allWords = tokens(text);
    var ttr = allWords.length ? (uniqCount(allWords) / allWords.length) : 0;

    var lens = sents.map(function (s) { return tokens(s).length; }).filter(function (n) { return n > 0; });
    var avg = 0, variance = 0, burst = 0;
    if (lens.length) {
      for (var i = 0; i < lens.length; i++) avg += lens[i];
      avg /= lens.length;
      for (var j = 0; j < lens.length; j++) { variance += Math.pow(lens[j] - avg, 2); }
      variance /= lens.length;
      burst = avg ? Math.sqrt(variance) / avg : 0;
    }

    var rigid = /(in this article|this guide|step\s*\d|pro tip|final verdict|with that in mind)/i.test(text);
    var mech = /(therefore|moreover|however|in addition|furthermore)/i.test(text);
    var convo = /\b(you|your|let's|we|i)\b/i.test(text);

    var aiProb =
      0.35 * clamp01((avg - 18) / 14) +
      0.25 * clamp01((0.45 - burst) / 0.45) +
      0.15 * (rigid ? 1 : 0) +
      0.15 * (mech ? 1 : 0) +
      0.10 * clamp01((0.48 - ttr) / 0.48);

    var humanProb =
      0.45 * clamp01((burst - 0.25) / 0.6) +
      0.25 * clamp01((ttr - 0.35) / 0.4) +
      0.20 * (convo ? 1 : 0) +
      0.10 * clamp01((14 - Math.abs(avg - 18)) / 14);

    aiProb = clamp01(aiProb);
    humanProb = clamp01(humanProb);

    var mixedProb = clamp01(1 - Math.max(aiProb, humanProb));
    var total = aiProb + humanProb + mixedProb || 1;
    aiProb /= total; humanProb /= total; mixedProb /= total;

    var aiReasons = [];
    if (avg > 24) aiReasons.push('Long sentences increase AI probability.');
    if (burst < 0.18) aiReasons.push('Low burstiness (uniform sentence length).');
    if (rigid) aiReasons.push('Guide-like phrasing detected.');
    if (mech) aiReasons.push('Formal connectors found (however, moreover, furthermore).');

    var humanReasons = [];
    if (convo) humanReasons.push('Conversational tone (you, we, let\\'s).');
    if (burst > 0.35) humanReasons.push('Varied sentence lengths (higher burstiness).');
    if (ttr > 0.45) humanReasons.push('High lexical variety.');

    return { ai: aiProb, mixed: mixedProb, human: humanProb, aiReasons: aiReasons, humanReasons: humanReasons };
  }

  // -------- UI --------
  function setBar(el, pct) {
    var p = Math.round(pct * 100);
    el.style.width = p + '%';
    el.dataset.pct = String(p);
  }

  function renderReasons(ul, items) {
    ul.innerHTML = '';
    for (var i = 0; i < items.length; i++) {
      var li = document.createElement('li');
      li.textContent = items[i];
      ul.appendChild(li);
    }
  }

  scanBtn.addEventListener('click', function () {
    var text = ta.value || '';
    var res = score(text);
    setBar(aiBar, res.ai);
    setBar(mixedBar, res.mixed);
    setBar(humanBar, res.human);
    renderReasons(aiList, res.aiReasons);
    renderReasons(humanList, res.humanReasons);
  });
}); // end DOMContentLoaded
