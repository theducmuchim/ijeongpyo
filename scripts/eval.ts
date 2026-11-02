// AI 평가 도구: npm run eval
// eval/answers.csv(정답표)에 적힌 사진을 하나씩 '길을 잃었어요'와 똑같은 방식으로 AI에게 보내고,
// 맞힌 비율과 '확신했는데 틀린' 비율을 잰다. 지시문(lib/prompts.ts)을 고칠 때마다 다시 돌려 비교한다.
//
//   npm run eval              정답표 전체
//   npm run eval -- --limit 3 앞의 3장만 (지시문을 고친 뒤 빨리 확인할 때)

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, appendFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { judge, parseAnswers, pct, summarize, toCsvCell, type AiAnswer, type AnswerRow, type Verdict } from "./evalScore";

const ROOT = path.resolve(import.meta.dirname, "..");
const EVAL = path.join(ROOT, "eval");
const DELAY_MS = Number(process.env.EVAL_DELAY_MS || 6500); // 무료 등급 분당 한도에 걸리지 않게 쉬는 시간

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function fail(msg: string): never {
  console.error(`\n멈춤: ${msg}\n`);
  process.exit(1);
}

// 앱과 똑같이: 긴 쪽 1024px, JPEG 품질 70, 사진 속 위치 정보는 지운다(sharp는 기본으로 지움)
async function loadPhoto(file: string) {
  const buf = await sharp(path.join(EVAL, "photos", file))
    .rotate()
    .resize({ width: 1024, height: 1024, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 70 })
    .toBuffer();
  return { base64: buf.toString("base64"), mediaType: "image/jpeg" as const };
}

async function main() {
  try {
    process.loadEnvFile(path.join(ROOT, ".env.local"));
  } catch {
    // .env.local이 없으면 아래에서 키 확인할 때 알려 준다
  }
  if (!process.env.GEMINI_API_KEY) {
    fail(".env.local에 GEMINI_API_KEY가 없어요. 평가는 진짜 AI로만 할 수 있어요 (시험 모드 답은 정해진 답이라 의미가 없어요).");
  }

  const limitArg = process.argv.indexOf("--limit");
  const limit = limitArg > -1 ? Number(process.argv[limitArg + 1]) : Infinity;

  const answersPath = path.join(EVAL, "answers.csv");
  if (!existsSync(answersPath)) fail("eval/answers.csv가 없어요. eval/README.md를 보고 정답표를 만들어 주세요.");
  const { rows: allRows, problems } = parseAnswers(readFileSync(answersPath, "utf8"));
  if (problems.length) fail(`정답표에 고칠 곳이 있어요.\n  - ${problems.join("\n  - ")}`);

  // 사진과 경로 파일이 다 있는지 먼저 확인 (중간에 멈추면 한도만 쓰고 끝나니까)
  const missing: string[] = [];
  for (const r of allRows) {
    for (const p of r.photos) if (!existsSync(path.join(EVAL, "photos", p))) missing.push(`photos/${p}`);
    if (!existsSync(path.join(EVAL, "routes", r.route))) missing.push(`routes/${r.route}`);
  }
  if (missing.length) fail(`이 파일들이 eval 폴더에 없어요.\n  - ${[...new Set(missing)].join("\n  - ")}`);

  const rows = allRows.slice(0, limit);
  const routes = new Map<string, { order: number; photoDescription: string; landmarkName: string; instruction: string }[]>();
  for (const r of rows) {
    if (routes.has(r.route)) continue;
    const json = JSON.parse(readFileSync(path.join(EVAL, "routes", r.route), "utf8"));
    if (!Array.isArray(json.cards) || json.cards.length === 0) fail(`routes/${r.route}에 카드가 없어요`);
    routes.set(r.route, json.cards);
  }

  // 키를 읽은 뒤에 불러와야 lib/ai.ts가 키를 본다
  const { askWhereAmI } = await import("@/lib/whereAmI");
  const { WHERE_AM_I_PROMPT } = await import("@/lib/prompts");
  const model = process.env.GEMINI_MODEL || "gemini-3.8-flash";
  const promptId = createHash("sha1").update(WHERE_AM_I_PROMPT).digest("hex").slice(0, 7);

  console.log(`\n이정표 AI 평가 · 사진 ${rows.length}건 · 모델 ${model} · 지시문 ${promptId}`);
  console.log(`(무료 한도 때문에 한 건마다 ${DELAY_MS / 1000}초씩 쉬어요. 약 ${Math.ceil((rows.length * DELAY_MS) / 60000)}분 걸려요)\n`);

  const results: { row: AnswerRow; ai: (AiAnswer & Record<string, unknown>) | null; verdict: Verdict; ms: number; error?: string }[] = [];
  for (const [i, row] of rows.entries()) {
    const started = Date.now();
    let ai: (AiAnswer & Record<string, unknown>) | null = null;
    let error: string | undefined;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const photos = await Promise.all(row.photos.map(loadPhoto));
        ai = (await askWhereAmI(photos, routes.get(row.route)!, row.lastCard)) as AiAnswer & Record<string, unknown>;
        error = undefined;
        break;
      } catch (e) {
        error = String((e as Error).message ?? e).slice(0, 200);
        if (/429|RESOURCE_EXHAUSTED|quota/i.test(error) && attempt < 2) {
          console.log("   한도에 걸렸어요. 1분 쉬고 다시 해요…");
          await sleep(60_000);
          continue;
        }
        break;
      }
    }
    const verdict = judge(row, ai);
    const ms = Date.now() - started;
    results.push({ row, ai, verdict, ms, error });
    const mark = verdict === "맞음" ? "O" : verdict === "확신했는데 틀림" ? "X" : verdict === "오류" ? "!" : "?";
    const said = ai ? `AI: ${ai.matchedCardOrder ?? "없음"}번 (${Math.round(ai.confidence * 100)}%)` : `오류: ${error}`;
    console.log(`${String(i + 1).padStart(2)}. [${mark}] ${row.photos.join("+")} · 정답 ${row.answer ?? "없음"} · ${said}`);
    if (i < rows.length - 1) await sleep(DELAY_MS);
  }

  const s = summarize(results);
  const avgSec = Math.round(results.reduce((t, r) => t + r.ms, 0) / Math.max(1, results.length) / 100) / 10;

  console.log("\n───────── 결과 ─────────");
  console.log(`맞음                 ${s.correct} / ${s.total} (${pct(s.correct, s.total)})`);
  console.log(`확신했는데 틀림      ${s.confidentWrong}건 · 확신한 답 ${s.confidentCount}건 중 ${pct(s.confidentWrong, s.confidentCount)}  ← 가장 중요`);
  console.log(`모르겠다고 함        ${s.unsure}건 (${pct(s.unsure, s.total)})`);
  console.log(`길 위 사진 맞힘      ${s.onRouteCorrect} / ${s.onRouteTotal} (${pct(s.onRouteCorrect, s.onRouteTotal)})`);
  console.log(`엉뚱한 곳 걸러냄     ${s.offRouteCorrect} / ${s.offRouteTotal} (${pct(s.offRouteCorrect, s.offRouteTotal)})`);
  if (s.fallbacks) console.log(`답 모양이 두 번 다 틀려 기본 답을 쓴 경우 ${s.fallbacks}건`);
  if (s.errors) console.log(`오류로 못 잰 사진     ${s.errors}건 (위 비율에서는 뺐어요)`);
  console.log(`한 건당 평균 ${avgSec}초`);

  // 결과 파일: 건별 표 + 누적 기록
  const outDir = path.join(EVAL, "results");
  mkdirSync(outDir, { recursive: true });
  const stamp = new Date().toLocaleString("sv-SE", { timeZone: "Asia/Seoul" }).replace(/[-: ]/g, "").slice(0, 12);
  const detailPath = path.join(outDir, `${stamp}-${promptId}.csv`);
  const head = ["사진", "경로", "마지막카드", "정답카드", "AI카드", "확실한정도", "사진더요청", "판정", "AI가 본 것", "다음 할 일", "이유", "메모", "오류"];
  const lines = results.map(({ row, ai, verdict, error }) =>
    [
      row.photos.join("+"),
      row.route,
      row.lastCard,
      row.answer ?? "없음",
      ai ? (ai.matchedCardOrder ?? "없음") : "",
      ai ? ai.confidence : "",
      ai?.askPhoto ?? "",
      verdict,
      Array.isArray(ai?.seenLandmarks) ? (ai.seenLandmarks as string[]).join(" / ") : "",
      ai?.nextStep ?? "",
      ai?.reasonForUser ?? "",
      row.memo,
      error ?? "",
    ]
      .map(toCsvCell)
      .join(","),
  );
  // 엑셀에서 한글이 깨지지 않게 BOM을 붙인다
  writeFileSync(detailPath, "﻿" + [head.join(","), ...lines].join("\n") + "\n");

  const historyPath = path.join(outDir, "history.csv");
  if (!existsSync(historyPath)) {
    writeFileSync(historyPath, "﻿날짜,모델,지시문,사진수,맞음,확신했는데틀림(확신한 답 중),모르겠다고함,길위맞힘,엉뚱한곳걸러냄,오류\n");
  }
  appendFileSync(
    historyPath,
    [
      stamp,
      model,
      promptId,
      s.total,
      pct(s.correct, s.total),
      pct(s.confidentWrong, s.confidentCount),
      pct(s.unsure, s.total),
      pct(s.onRouteCorrect, s.onRouteTotal),
      pct(s.offRouteCorrect, s.offRouteTotal),
      s.errors,
    ]
      .map(toCsvCell)
      .join(",") + "\n",
  );

  const prev = readdirSync(outDir).filter((f) => f.endsWith(".csv") && f !== "history.csv").length;
  console.log(`\n건별 결과: eval/results/${path.basename(detailPath)}`);
  console.log(`지금까지 ${prev}번 잰 기록: eval/results/history.csv\n`);
}

main().catch((e) => fail(String((e as Error).stack ?? e)));
