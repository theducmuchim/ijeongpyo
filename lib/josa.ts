// 이름 뒤에 붙는 조사를 받침에 맞게 고른다. "등굣길을", "꽃집이"처럼 쓰려고 만든 것.
// (예전처럼 "을(를)", "이(가)"로 쓰면 기계가 쓴 글처럼 보인다)
type Pair = "이/가" | "을/를" | "은/는" | "과/와" | "으로/로" | "이에요/예요";

const DIGIT_HAS_FINAL = "0136780"; // 영 일 삼 육 칠 팔 십: 받침 있음

function finalInfo(word: string): { has: boolean; rieul: boolean } {
  const ch = word.trim().slice(-1);
  const code = ch.charCodeAt(0) - 0xac00;
  if (code >= 0 && code <= 11171) {
    const jong = code % 28;
    return { has: jong !== 0, rieul: jong === 8 };
  }
  if (/[0-9]/.test(ch)) return { has: DIGIT_HAS_FINAL.includes(ch), rieul: "178".includes(ch) };
  return { has: false, rieul: false }; // 영어 등은 받침 없는 쪽으로
}

export function josa(word: string, pair: Pair): string {
  const { has, rieul } = finalInfo(word);
  const [withFinal, without] = pair.split("/");
  if (pair === "으로/로") return word + (has && !rieul ? withFinal : without);
  return word + (has ? withFinal : without);
}
