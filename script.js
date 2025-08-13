'use strict';

/* =========================================================
   Helpers
   ========================================================= */

const $ = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));
const clamp01 = (x) => Math.max(0, Math.min(1, x));
const scalePct = (x) => Math.round(clamp01(x) * 100);

/* Small stopword set for quick heuristics */
const STOPWORDS = new Set((
  'a,an,the,of,in,on,for,to,and,or,as,at,by,from,is,are,was,were,be,been,being,' +
  'that,which,who,whom,with,without,about,over,under,into,onto,if,then,else,so,' +
  'this,these,those,it,its,they,them,he,she,his,her,we,us,you,your,i,me,my,our'
).split(','));

/* =========================================================
   Boot: bind Scan button after DOM is ready
   ========================================================= */

window.addEventListener('DOMContentLoaded', () => {
  console.log('[ai-detector] script loaded');

  // Find a "Scan" button resiliently
  let btn =
    $('#scanBtn') ||
    $('#scan') ||
    $$('button').find(b => (b.textContent || '').trim().toLowerCase() === 'scan');

  if (!btn) {
    console.warn('[ai-detector] Scan button not found. Add id="scanBtn" or a button with text "Scan".');
    return;
  }

  btn.addEventListener('click', () => {
    try {
      runScan();
    } catch (e) {
      console.error(e);
      alert('Scan crashed: ' + e.message);
    }
  });
});

/* =========================================================
   Text processing
   ========================================================= */

function splitSentences(text) {
  // Normalize CRLF and trim outer whitespace
  const lines = text.replace(/\r/g, '').split(/\n+/).map(s => s.trim()).filter(Boolean);
  const out = [];

  for (const line of lines) {
    // Keep bullets / steps intact (1., 1), -, •, Step 2:)
    if (/^(\d+[\.\)]|[-–•*]|step\s*\d+:?)/i.test(line)) {
      out.push(line);
      continue;
    }
    // Insert split marker after .?! when followed by uppercase/quote/( or [
    const marked = line.replace(/([.?!])\s+(?=[A-Z"(\[])/g, '$1|');
    out.push(...marked.split('|').map(s => s.trim()).filter(Boolean));
  }
  // keep only lines that have word characters
  return out.filter(s => /\w/.test(s));
}

function tokens(text) {
  return (text.toLowerCase().match(/[a-z0-9’']+/g) || []);
}

function wordsAll(text) { return tokens(text); }

function uniqCount(arr) { return new Set(arr).size; }

function ngrams(words, n) {
  const out = [];
  for (let i = 0; i <= words.length - n; i++) {
    out.push(words.slice(i, i + n).join(' '));
  }
  return out;
}

/* =========================================================
   Feature extraction
   ========================================================= */

function features(text) {
  const sents = splitSentences(text);
  const words = wordsAll(text);
  const sentLens = sents.map(s => tokens(s).length).filter(n => n > 0);

  const avg = sentLens.length ? (sentLens.reduce((a,b)=>a+b,0) / sentLens.length) : 0;
  const variance = sentLens.length ? sentLens.reduce((a, n) => a + Math.pow(n - avg, 2), 0) / sentLens.length : 0;
  const std = Math.sqrt(variance || 0);
  const burstiness = avg ? std / avg : 0;

  // stopword ratio
  const stopHits = words.filter(w => STOPWORDS.has(w)).length;
  const stopRatio = words.length ? stopHits / words.length : 0;

  // n-gram repetition (2–4)
  const repScores = [2,3,4].map(n => {
    const ng = ngrams(words, n);
    const m = new Map();
    for (const g of ng) m.set(g, (m.g
