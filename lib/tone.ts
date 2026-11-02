// AI가 쓴 화면 문장을 앱 말투(짧은 해요체, 느낌표·권유형 질문 없음)로 다듬는다.
// 지시문에 규칙을 적어도 가벼운 모델(flash-lite)은 "도착했습니다" 같은 합쇼체를 섞어 써서, 마지막에 한 번 더 걸러 낸다.

const RULES: [RegExp, string][] = [
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
