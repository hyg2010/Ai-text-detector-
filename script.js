/* -----------------------------------------------------------
   Lightweight GPTZero-style heuristic scanner (client-side)
   Model tag shown in UI: "Model 3.7b (heuristic)"
   ----------------------------------------------------------- */

const MODEL_TAG = "Model 3.7b";

/* ============ Utilities ============ */

function splitSentences(text){
  // Split by lines first, keep bullets/steps intact
  const lines = text.replace(/\r/g, "").split(/\n+/).map(s => s.trim()).filter(Boolean);
  const out = [];

  for (const line of lines){
    // keep list items intact (numbers, bullets, “step N” headings)
    if (/^(\d+[\.\)])|^[\-*•]|^step\s*\d+/i.test(line)) {
      out.push(line);
      continue;
    }

    // Insert a separator *after* . ? ! when followed by an uppercase/open quote/paren
    const marked = line.replace(/([.?!])\s+(?=[A-Z“"(])/g, "$1|");
    out.push(...marked.split("|").map(s => s.trim()).filter(Boolean));
  }

  return out.filter(s => /\w/.test(s));
}

function tokens(s){
  return s.toLowerCase().match(/[a-z0-9’']+/g) || [];
}

function wordsAll(text){
  return tokens(text);
}

function uniqCount(arr){
