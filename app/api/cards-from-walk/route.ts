import { askAI, friendlyError, isMockMode } from "@/lib/ai";
import { CARDS_FROM_WALK_PROMPT } from "@/lib/prompts";
import { checkLimit } from "@/lib/rateLimit";
import { parseCards } from "@/lib/schemas";
import type { CardDraft, ImagePayload } from "@/types";

export const maxDuration = 60;
// 갈림길 수에는 상한이 없다. 다만 요청 하나의 크기(서버 한도 약 4MB) 때문에 휴대폰이 사진을 몇 장씩 나눠 보낸다.
// startOrder: 이 묶음의 첫 사진이 전체에서 몇 번째인지, final: 마지막 묶음인지(마지막 사진이 도착).
const MAX_PER_REQUEST = 12;

type Body = { junctions: { photo: ImagePayload; note: string }[]; startOrder?: number; final?: boolean };

// 키 없이 화면 흐름을 시험할 때 쓰는 예시 카드. 메모를 그대로 안내 문장으로 쓴다.
function mockCards(junctions: Body["junctions"], final: boolean): CardDraft[] {
  return junctions.map((j, i) => {
    const last = final && i === junctions.length - 1;
    return {
      order: i + 1,
      photoDescription: `(시험 모드) ${i + 1}번째 갈림길 사진`,
      landmark: { name: j.note || `${i + 1}번 길잡이`, side: "ahead" },
      action: last ? "arrive" : "straight",
      instruction: j.note || (last ? "도착" : "다음 갈림길까지 가세요"),
      warning: null,
    };
  });
}

export async function POST(req: Request) {
  const deviceId = req.headers.get("x-device-id");
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return Response.json({ error: "보낸 내용을 읽지 못했어요. 다시 해 주세요." }, { status: 400 });
  }
  const junctions = body.junctions ?? [];
  if (junctions.length === 0) return Response.json({ error: "갈림길을 한 곳 이상 남겨 주세요." }, { status: 400 });
  if (junctions.length > MAX_PER_REQUEST) {
    return Response.json({ error: `사진은 한 번에 ${MAX_PER_REQUEST}장까지 보내요. 앱을 새로 고쳐 주세요.` }, { status: 400 });
  }
  const startOrder = Math.max(1, Math.floor(body.startOrder ?? 1));
  const final = body.final !== false;

  if (isMockMode()) return Response.json({ cards: mockCards(junctions, final), mock: true });

  // 한 길을 여러 묶음으로 보내도 하루 횟수는 한 번으로 센다 (첫 묶음에서만 센다)
  if (startOrder === 1 && !(await checkLimit(deviceId))) {
    return Response.json({ error: "오늘 쓸 수 있는 횟수를 다 썼어요. 내일 다시 해 주세요." }, { status: 429 });
  }

  // 사진은 순서대로 보내고, 메모는 번호를 붙여 글로 보낸다. 받은 사진과 글은 저장하지 않는다.
  const notes = junctions.map((j, i) => `${i + 1}번 사진 메모: ${j.note || "(메모 없음)"}`).join("\n");
  const part =
    startOrder > 1 || !final
      ? `\n이 사진들은 긴 길을 나눈 한 부분이다(전체 ${startOrder}번째 갈림길부터).${final ? " 이 묶음의 마지막 사진이 도착 지점이다." : " 이 묶음의 마지막 사진도 도착이 아니다. arrive를 쓰지 않는다."}`
      : "";
  const question = `갈림길 사진 ${junctions.length}장을 순서대로 보냈다.${part}\n${notes}\n카드 ${junctions.length}장을 만들어라.`;

  try {
    for (let i = 0; i < 2; i++) {
      const raw = await askAI(CARDS_FROM_WALK_PROMPT, junctions.map((j) => j.photo), question);
      const cards = parseCards(raw, junctions.length);
      // 중간 묶음에서 AI가 마지막을 도착으로 쓰면 곧장으로 바꾼다
      if (cards && !final) cards.forEach((c) => c.action === "arrive" && (c.action = "straight"));
      if (cards) return Response.json({ cards });
    }
    return Response.json({ error: "AI가 카드를 만들지 못했어요." }, { status: 502 });
  } catch (e) {
    const { message, status } = friendlyError(e);
    return Response.json({ error: message }, { status });
  }
}
