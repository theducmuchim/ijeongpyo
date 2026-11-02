// 화면 문장이 말투 기준(docs/말투 기준.md)을 지키는지 훑어본다.  npm run tone
// 주석, AI 지시문(lib/prompts.ts), 점검용 API, 시험용 화면은 빼고 본다.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = join(import.meta.dirname, "..");
const DIRS = ["app", "components", "lib"];
const SKIP = [/lib\/prompts\.ts$/, /lib\/tone\.ts$/, /app\/api\/health\//, /app\/roadview-test\//];

// [무엇을 찾는지, 왜 안 되는지]
const RULES: [RegExp, string][] = [
  [/[가-힣](습니다|십시오)[.?"'`\s<]/, "합쇼체예요. 해요체로 써요 (예외: 도움 요청 화면의 '고맙습니다')"],
  [/[가-힣]!/, "느낌표는 쓰지 않아요"],
  [/볼까요\?/, "권유형 질문은 쓰지 않아요. 할 일을 그대로 적어요"],
  [/(할 것|바랍니다|하기 바람)[."'`]/, "명사형·공문서 끝맺음이에요"],
  [/랜드마크/, "'길잡이'로 써요"],
  [/길치/, "누군가를 낮추는 말이에요"],
  [/"취소"/, "두 버튼 창에서는 '닫기'로 써요"],
  [/(좌회전|우회전|직진)(하세요|해요)/, "'왼쪽으로/오른쪽으로/곧장'으로 써요"],
  [/누르세요/, "설명은 '눌러요', 부탁은 '눌러 주세요'로 써요"],
  [/(잘했어요|대단해요|걱정 마세요|괜찮아요\.)/, "위로나 칭찬은 쓰지 않아요"],
];
// 검색어(keywords)는 화면에 안 보이고, 사람들이 실제로 치는 말이라 그대로 둔다.
const ALLOW = [/고맙습니다/, /keywords:/];

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(tsx?|mdx?)$/.test(name)) out.push(p);
  }
  return out;
}

let found = 0;
for (const d of DIRS) {
  for (const file of walk(join(ROOT, d))) {
    const rel = relative(ROOT, file);
    if (SKIP.some((re) => re.test(rel))) continue;
    readFileSync(file, "utf8").split("\n").forEach((line, i) => {
      const code = line.replace(/\/\/.*$/, "").replace(/\{\/\*.*?\*\/\}/g, "");
      if (/^\s*(\*|\/\*)/.test(code) || ALLOW.some((re) => re.test(code))) return;
      for (const [re, why] of RULES) {
        if (re.test(code)) {
          found++;
          console.log(`${rel}:${i + 1}  ${why}\n    ${code.trim().slice(0, 120)}`);
        }
      }
    });
  }
}
console.log(found ? `\n${found}곳을 확인해 주세요.` : "말투 기준에 어긋난 곳이 없어요.");
process.exit(found ? 1 : 0);
