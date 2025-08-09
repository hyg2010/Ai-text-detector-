function checkText() {
  const text = document.getElementById("inputText").value.trim();
  if (!text) {
    document.getElementById("result").innerHTML = "Paste some text first.";
    return;
  }

  // Simple heuristic AI-likeness score
  const lowers = text.toLowerCase();

  // signals
  const boilerplate = /(in conclusion|in summary|moreover|therefore|it is important to note|the following steps)/g;
  const listicle = /\b(\d+)\s+(ways|tips|reasons)\b/gi;

  // sentence stats
  const sentences = lowers.split(/(?<=[.!?])\s+/).filter(Boolean);
  const lens = sentences.map(s => (s.match(/[a-zA-Z']+/g) || []).length);
  const avg = lens.reduce((a,b)=>a+b,0) / Math.max(1,lens.length);
  const std = Math.sqrt(lens.map(x => (x-avg)**2).reduce((a,b)=>a+b,0) / Math.max(1,lens.length));
  const burstiness = avg ? std/avg : 0;

  // lexical variety (type-token ratio)
  const words = (lowers.match(/[a-zA-Z']+/g) || []);
  const uniq = new Set(words).size;
  const ttr = words.length ? (uniq/words.length) : 0;

  // naive scoring
  let ai = 0;
  if (burstiness < 0.35) ai += 25;          // uniform sentence lengths
  if (ttr < 0.45) ai += 20;                 // limited vocabulary variety
  if ((words.length > 0) && (words.length / Math.max(1, sentences.length) > 20)) ai += 10; // long even sentences
  if (boilerplate.test(lowers)) ai += 20;
  if (listicle.test(lowers)) ai += 10;

  // clamp and derive percentages
  ai = Math.max(0, Math.min(90, ai));
  const human = 100 - ai;
  const mixed = 0;

  // label
  let label = "Unclear";
  if (ai >= 60) label = "Likely AI";
  else if (ai < 40) label = "Likely Human";

  document.getElementById("result").innerHTML =
    `<strong>AI-generated:</strong> ${ai}%<br>` +
    `<strong>Mixed:</strong> ${mixed}%<br>` +
    `<strong>Human:</strong> ${human}%<br>` +
    `<em>Label:</em> ${label}`;
}
