// AI가 쓴 화면 문장을 앱 말투(짧은 해요체, 느낌표·권유형 질문 없음)로 다듬는다.
// 지시문에 규칙을 적어도 가벼운 모델(flash-lite)은 "도착했습니다" 같은 합쇼체를 섞어 써서, 마지막에 한 번 더 걸러 낸다.

// 어려운 길 안내 말을 쉬운 말로 (디지털 정부 UX 라이팅 가이드: 쉬운 말로 쓰기)
const WORDS: [RegExp, string][] = [
  [/직진하세요/g, "곧장 가세요"],
  [/좌회전하세요/g, "왼쪽으로 가세요"],
  [/우회전하세요/g, "오른쪽으로 가세요"],
  [/랜드마크/g, "길잡이"],
];

const RULES: [RegExp, string][] = [
  [/주시기 바랍니다\.?$/, "주세요"],
  [/하시기 바랍니다\.?$/, "해 주세요"],
  [/할 것\.?$/, "하세요"],
  [/갈 것\.?$/, "가세요"],
  [/건널 것\.?$/, "건너세요"],
  [/도착했습니다\.?$/, "도착해요"],
  [/도착입니다\.?$/, "도착이에요"],
  [/하십시오\.?$/, "하세요"],
  [/가십시오\.?$/, "가세요"],
  [/주십시오\.?$/, "주세요"],
  [/했습니다\.?$/, "했어요"],
  [/합니다\.?$/, "해요"],
  [/됩니다\.?$/, "돼요"],
  [/있습니다\.?$/, "있어요"],
  [/없습니다\.?$/, "없어요"],
  [/갑니다\.?$/, "가요"],
  [/보입니다\.?$/, "보여요"],
  [/볼까요\?$/, "보세요"],
  [/할까요\?$/, "하세요"],
];

function hasFinal(ch: string) {
  const code = ch.charCodeAt(0) - 0xac00;
  return code >= 0 && code <= 11171 && code % 28 !== 0;
}

export function tidy(s: string): string;
export function tidy(s: string | null): string | null;
export function tidy(s: string | null): string | null {
  if (s === null) return null;
  let out = s
    .trim()
    .replace(/!+/g, "")
    .replace(/\s{2,}/g, " ");
  for (const [re, to] of WORDS) out = out.replace(re, to);
  // 문장마다 끝을 고친다
  out = out
    .split(/(?<=[.?])\s+/)
    .map((sentence) => {
      const dot = sentence.endsWith(".") ? "." : "";
      const fixed = fixEnding(dot ? sentence.slice(0, -1) : sentence);
      return fixed + dot;
    })
    .join(" ");
  return out;
}

function fixEnding(sentence: string): string {
  let t = sentence;
  for (const [re, to] of RULES) if (re.test(t)) return t.replace(re, to);
  // "생겼습니다", "바꿨습니다"처럼 ㅆ 받침 + 습니다 → 어요
  const ss = t.match(/(.)습니다\.?$/);
  if (ss && (ss[1].charCodeAt(0) - 0xac00) % 28 === 20)
    return t.replace(/습니다\.?$/, "어요");
  // "○○입니다" → "○○이에요/예요"
  const m = t.match(/(.)입니다\.?$/);
  if (m) t = t.replace(/입니다\.?$/, hasFinal(m[1]) ? "이에요" : "예요");
  return t;
}

// 말로 받은 안내 문장(카드 고치기)을 카드 문장 모양으로: 말투를 고치고 끝의 마침표를 뺀다
export function tidySpoken(s: string): string {
  return tidy(s).replace(/[.。]+$/, "").trim();
}
