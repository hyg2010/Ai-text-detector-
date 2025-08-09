// --- Calibration knobs to mimic GPTZero vibe ---
const CAL = {
  SHIFT: -0.08,     // negative -> more "human" overall
  SLOPE: 0.18,      // larger -> softer curve; smaller -> steeper
  HUMAN_BONUS: 0.12, // extra human weight from burstiness/TTR
  MIX_CAP: 15       // Mixed% won't exceed this
};

function logistic(x){ return 1/(1+Math.exp(-x)); }

// Map our raw AI strength to a calibrated AI probability (0..1)
function mapToGPTZero(rawAI, burst, ttr){
  // Center & scale the curve
  let a = logistic((rawAI + CAL.SHIFT) / CAL.SLOPE);

  // Human bonus when burstiness/TTR are healthy
  // (thresholds roughly where human text starts to look varied)
  const burstBonus = Math.max(0, burst - 0.32) / 0.50; // 0..~1
  const ttrBonus   = Math.max(0, ttr   - 0.42) / 0.35; // 0..~1
  const bonus = Math.max(0, (burstBonus + ttrBonus) / 2);

  a = Math.max(0, a - CAL.HUMAN_BONUS * bonus);
  return Math.min(1, Math.max(0, a));
}

// Replace your score() with this calibrated version
function score(text){
  const F = features(text);
  const { burstiness, ttr, repetition, punctDiv, avg } = F;

  // Same raw AI strength recipe you had (tweakable weights)
  const ai_burst = 1 - scale(burstiness, 0.25, 0.80); // lower burst → more AI
  const ai_ttr   = 1 - scale(ttr,        0.35, 0.65); // lower TTR   → more AI
  const ai_rep   =      scale(repetition, 0.02, 0.15); // more repeats→ more AI
  const ai_pdiv  = 1 - scale(punctDiv,   0.20, 0.75); // low punct div→ more AI
  let   ai_avg   = 1 - (2 * ((avg - 18) / 15) ** 2);  // very even avg length → more AI
  ai_avg = clamp01(ai_avg);

  const rawAI = 0.30*ai_burst + 0.24*ai_ttr + 0.20*ai_rep + 0.14*ai_pdiv + 0.12*ai_avg;

  // Calibrated AI probability (0..1), shaped to feel like GPTZero
  const aiProb = mapToGPTZero(rawAI, burstiness, ttr);

  // Convert to percentages and keep a small Mixed bucket
  let AIpct    = Math.round(100 * aiProb);
  let Humanpct = Math.max(0, 100 - AIpct);
  let Mixpct   = Math.min(CAL.MIX_CAP, Math.max(0, 100 - (AIpct + Humanpct)));

  // Re-normalize so AI% + Human% + Mixed% = 100
  const total = AIpct + Humanpct + Mixpct;
  if (total !== 100){
    const diff = 100 - total;
    // Nudge the largest bucket by the diff to sum cleanly
    if (AIpct >= Humanpct && AIpct >= Mixpct) AIpct += diff;
    else if (Humanpct >= AIpct && Humanpct >= Mixpct) Humanpct += diff;
    else Mixpct += diff;
  }

  // Labels like GPTZero
  let label='Unclear', cls='b-unclear';
  if (AIpct >= 60){ label='Likely AI';    cls='b-ai'; }
  else if (AIpct < 40){ label='Likely Human'; cls='b-human'; }

  const flags   = flagSentences(F);   // your existing flagger
