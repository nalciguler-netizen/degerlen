export const CONFIG = {
  phqLock: 20,
  gadLock: 15,
  lockDays: 14,
  crisisLockHours: 24,
  dailyChatMinutes: 60,
};

export const SAFETY_IDS = ['risk_recent', 'risk_plan', 'psychosis', 'mania'];

const sum = (a) => a.reduce((x, y) => x + (Number(y) || 0), 0);

export function phqLevel(s) {
  if (s < 5) return 'minimal';
  if (s < 10) return 'mild';
  if (s < 15) return 'moderate';
  if (s < 20) return 'moderately_severe';
  return 'severe';
}

export function gadLevel(s) {
  if (s < 5) return 'minimal';
  if (s < 10) return 'mild';
  if (s < 15) return 'moderate';
  return 'severe';
}

export function triage({ phq, gad, safety }, now = Date.now()) {
  const phqScore = sum(phq);
  const gadScore = sum(gad);
  const item9 = Number(phq[8]) || 0;
  const crisis = !!(safety.risk_recent || safety.risk_plan || item9 >= 1);
  const psych = !!(safety.psychosis || safety.mania || phqScore >= CONFIG.phqLock || gadScore >= CONFIG.gadLock);
  let outcome = 'ok';
  let lockUntil = null;
  if (crisis) {
    outcome = 'crisis';
    lockUntil = now + CONFIG.crisisLockHours * 3600 * 1000;
  } else if (psych) {
    outcome = 'psychiatry';
    lockUntil = now + CONFIG.lockDays * 24 * 3600 * 1000;
  }
  const pl = phqLevel(phqScore);
  const gl = gadLevel(gadScore);
  let band = null;
  if (outcome === 'ok') {
    if (pl === 'moderately_severe') band = 'high';
    else if (pl === 'moderate' || gl === 'moderate') band = 'moderate';
    else if (pl === 'mild' || gl === 'mild') band = 'mild';
    else band = 'minimal';
  }
  return { phqScore, gadScore, phqLevel: pl, gadLevel: gl, outcome, lockUntil, band };
}

export function isLocked(lock, now = Date.now()) {
  return !!(lock && lock.until && lock.until > now);
}

const norm = (s) => String(s)
  .toLocaleLowerCase('tr-TR')
  .replace(/ı/g, 'i').replace(/ş/g, 's').replace(/ğ/g, 'g')
  .replace(/ü/g, 'u').replace(/ö/g, 'o').replace(/ç/g, 'c').replace(/â/g, 'a')
  .replace(/[’‘`]/g, "'");

const RISK = [
  /\bintihar/,
  /olmek\s+istiyorum/,
  /(kendimi|kendime)\s+(oldur|zarar|kes|as|yak|vur)/,
  /yasamak\s+istemiyorum/,
  /yasamaktan\s+(vazgec|bik|yoruldum)/,
  /hayatima\s+son/,
  /canima\s+kiy/,
  /bilegimi\s+kes/,
  /(olsem|olursam)\s+(daha\s+iyi|rahat)/,
  /keske\s+(olsem|hic\s+uyanmasam|hic\s+dogmasam)/,
  /yok\s+olmak\s+istiyorum/,
  /hayatima\s+son\s+ver/,
  /\bsuicid/,
  /kill\s+my\s*self/,
  /end\s+(it\s+all|my\s+life|my\s+own\s+life)/,
  /want\s+to\s+die/,
  /(don'?t|do\s+not)\s+want\s+to\s+(live|be\s+alive|be\s+here)/,
  /better\s+off\s+(dead|without\s+me)/,
  /(hurt|harm|cut)\s+my\s*self/,
  /take\s+my\s+own\s+life/,
  /no\s+reason\s+to\s+live/,
  /wish\s+i\s+(was|were)\s+dead/,
  /wish\s+i\s+(would\s*n'?t|would\s+not|never)\s+(wake|woke)/,
];

export function detectRisk(text) {
  const t = norm(text || '');
  return RISK.some((r) => r.test(t));
}

export const TRAUMA_FLAG = 3;
export function traumaScreen(answers) {
  const score = (answers || []).reduce((n, v) => n + (v ? 1 : 0), 0);
  return { score, flag: score >= TRAUMA_FLAG };
}
