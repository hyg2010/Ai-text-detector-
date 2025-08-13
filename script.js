// === scoring (REPLACE THIS BLOCK) ==================================
let ai = 0, human = 0;

// Heavily weight list/step/bullet structure (GPTZero: Rigid Guidance, Task-Oriented)
ai += clamp01(f.bulletFrac * 2.8);              // was ~2.2
ai += f.hasColonLists ? 0.35 : 0;               // “Key: Value”, “Step X: …”

// Transitional openers & formulaic flow (GPTZero: Predictable Syntax / Formulaic Flow)
ai += clamp01(f.transStartRatio * 2.0);         // was ~1.6

// Citation-ish endings like “8.” “11.” (Mechanical Precision vibe)
ai += clamp01(f.endCiteFrac * 3.6);             // was ~3.0

// Low lexical variety (TTR) → more AI
ai += clamp01((0.42 - Math.min(0.42, f.ttr)) * 2.6);  // slightly harsher

// N-gram repetition / phrasing reuse
ai += clamp01(f.ngramRepScore * 1.8);           // gentle push

// “Middle” sentence length band (very common in templated advice)
if (f.avgSentLen >= 18 && f.avgSentLen <= 28) ai += 0.25;

// --- Human signals (tone down a bit) ---

// Numbers & quotes still help Human, but slightly less so
human += clamp01(f.numberRatio * 0.55);         // was ~0.7
human += clamp01(f.quoteFrac * 1.2);            // keep quotes helpful
human += clamp01(f.properNounFrac * 0.9);       // proper nouns (names/places)
// Contractions are a good human cue, keep it
human += clamp01(f.sentContrRatio * 0.15);

// Headlines/lede that look journalistic (dates, sources) — leave as-is if you had it

// Normalize
ai = clamp01(ai);
human = clamp01(human);

// Final blend → more decisive leaning
const mixed = clamp01(1 - Math.abs(ai - human));
return { ai, human, mixed };
// === end scoring ====================================================
