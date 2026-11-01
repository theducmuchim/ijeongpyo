// 평가 도구의 채점 규칙 (설계서 11장 'AI 평가 사진').
// 앱과 똑같이, 확실한 정도 0.6 이상이고 사진을 더 달라고 하지 않으면 '확실하다'고 본다.

export type AnswerRow = {
  photos: string[]; // eval/photos 안의 파일 이름. 여러 장이면 '+'로 이어 쓴다
  route: string; // eval/routes 안의 경로 파일 이름
  lastCard: number; // AI에게 알려 줄 '마지막으로 지나간 카드'
  answer: number | null; // 정답 카드 번호. 엉뚱한 곳이면 null ('없음')
  memo: string;
};

export type AiAnswer = {
  confidence: number;
  askPhoto: string | null;
  matchedCardOrder: number | null;
  fallback?: boolean;
};

export type Verdict = "맞음" | "확신했는데 틀림" | "모르겠다고 함" | "오류";

export function isConfident(a: AiAnswer) {
  return a.confidence >= 0.6 && !a.askPhoto;
}

export function judge(row: AnswerRow, ai: AiAnswer | null): Verdict {
  if (!ai) return "오류";
  if (!isConfident(ai)) return "모르겠다고 함";
  if (row.answer === null) {
    // 엉뚱한 곳 사진인데 어느 카드 근처라고 말하면 틀림
    return ai.matchedCardOrder === null ? "맞음" : "확신했는데 틀림";
  }
  return ai.matchedCardOrder === row.answer ? "맞음" : "확신했는데 틀림";
}

export type Summary = {
  total: number; // 오류를 뺀, 실제로 잰 사진 수
  correct: number;
  confidentWrong: number;
  unsure: number;
  errors: number;
  fallbacks: number;
  confidentCount: number;
  onRouteTotal: number;
  onRouteCorrect: number;
  offRouteTotal: number;
  offRouteCorrect: number;
};

export function summarize(rows: { row: AnswerRow; ai: AiAnswer | null; verdict: Verdict }[]): Summary {
  const s: Summary = {
    total: rows.length,
    correct: 0,
    confidentWrong: 0,
    unsure: 0,
    errors: 0,
    fallbacks: 0,
    confidentCount: 0,
    onRouteTotal: 0,
    onRouteCorrect: 0,
    offRouteTotal: 0,
    offRouteCorrect: 0,
  };
  for (const { row, ai, verdict } of rows) {
    // 오류로 못 잰 사진은 비율에서 뺀다 (AI가 틀린 게 아니니까)
    if (verdict === "오류") {
      s.errors++;
      s.total--;
      continue;
    }
    if (verdict === "맞음") s.correct++;
    if (verdict === "확신했는데 틀림") s.confidentWrong++;
    if (verdict === "모르겠다고 함") s.unsure++;
    if (ai?.fallback) s.fallbacks++;
    if (ai && isConfident(ai)) s.confidentCount++;
    if (row.answer === null) {
      s.offRouteTotal++;
      if (verdict === "맞음") s.offRouteCorrect++;
    } else {
      s.onRouteTotal++;
      if (verdict === "맞음") s.onRouteCorrect++;
    }
  }
  return s;
}

export const pct = (a: number, b: number) => (b === 0 ? "-" : `${Math.round((a / b) * 100)}%`);

// 아주 단순한 CSV 읽기 (따옴표 안의 쉼표와 줄바꿈 처리)
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let cell = "";
  let row: string[] = [];
  let quoted = false;
  const src = text.replace(/^﻿/, "");
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

export const toCsvCell = (v: unknown) => {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

// 정답표(answers.csv)를 읽는다. 첫 줄은 제목: 사진,경로,마지막카드,정답카드,메모
export function parseAnswers(text: string): { rows: AnswerRow[]; problems: string[] } {
  const [header, ...lines] = parseCsv(text);
  const problems: string[] = [];
  if (!header) return { rows: [], problems: ["정답표가 비어 있어요"] };
  const col = (name: string) => header.findIndex((h) => h.trim() === name);
  const idx = { photo: col("사진"), route: col("경로"), last: col("마지막카드"), answer: col("정답카드"), memo: col("메모") };
  for (const [k, v] of Object.entries(idx)) {
    if (v === -1 && k !== "memo") problems.push(`정답표 첫 줄에 '${{ photo: "사진", route: "경로", last: "마지막카드", answer: "정답카드" }[k]}' 칸이 없어요`);
  }
  if (problems.length) return { rows: [], problems };
  const rows: AnswerRow[] = [];
  lines.forEach((l, i) => {
    const line = i + 2;
    const photos = (l[idx.photo] ?? "").split("+").map((p) => p.trim()).filter(Boolean);
    const route = (l[idx.route] ?? "").trim();
    const last = Number((l[idx.last] ?? "").trim());
    const ansRaw = (l[idx.answer] ?? "").trim();
    const answer = ansRaw === "" || ansRaw === "없음" || ansRaw === "0" ? null : Number(ansRaw);
    if (photos.length === 0) return problems.push(`${line}번째 줄: 사진 이름이 없어요`);
    if (photos.length > 3) return problems.push(`${line}번째 줄: 사진은 3장까지예요`);
    if (!route) return problems.push(`${line}번째 줄: 경로 파일 이름이 없어요`);
    if (!Number.isInteger(last) || last < 0) return problems.push(`${line}번째 줄: 마지막카드는 숫자로 적어 주세요`);
    if (answer !== null && (!Number.isInteger(answer) || answer < 1))
      return problems.push(`${line}번째 줄: 정답카드는 숫자나 '없음'으로 적어 주세요`);
    rows.push({ photos, route, lastCard: last, answer, memo: idx.memo >= 0 ? (l[idx.memo] ?? "").trim() : "" });
  });
  return { rows, problems };
}
