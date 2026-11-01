import { askAI, friendlyError, isMockMode } from "@/lib/ai";
import { CARDS_FROM_WALK_PROMPT } from "@/lib/prompts";
import { checkLimit } from "@/lib/rateLimit";
import { parseCards } from "@/lib/schemas";
import type { CardDraft, ImagePayload } from "@/types";

export const maxDuration = 60;
const MAX_JUNCTIONS = 20; // 요청 크기를 서버 한도(약 4MB) 안에 두기 위한 제한

type Body = { junctions: { photo: ImagePayload; note: string }[] };

// 키 없이 화면 흐름을 시험할 때 쓰는 예시 카드. 메모를 그대로 안내 문장으로 쓴다.
function mockCards(junctions: Body["junctions"]): CardDraft[] {
  return junctions.map((j, i) => {
    const last = i === junctions.length - 1;
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
    return Response.json({ error: "요청을 읽을 수 없어요" }, { status: 400 });
  }
  const junctions = body.junctions ?? [];
  if (junctions.length === 0) return Response.json({ error: "갈림길이 없어요" }, { status: 400 });
  if (junctions.length > MAX_JUNCTIONS) {
    return Response.json({ error: `갈림길은 ${MAX_JUNCTIONS}곳까지 등록할 수 있어요` }, { status: 400 });
  }

  if (isMockMode()) return Response.json({ cards: mockCards(junctions), mock: true });

  if (!(await checkLimit(deviceId))) {
    return Response.json({ error: "오늘 쓸 수 있는 횟수를 다 썼어요. 내일 다시 해 주세요." }, { status: 429 });
  }

  // 사진은 순서대로 보내고, 메모는 번호를 붙여 글로 보낸다. 받은 사진과 글은 저장하지 않는다.
  const notes = junctions.map((j, i) => `${i + 1}번 사진 메모: ${j.note || "(메모 없음)"}`).join("\n");
  const question = `갈림길 사진 ${junctions.length}장을 순서대로 보냈다.\n${notes}\n카드 ${junctions.length}장을 만들어라.`;

  try {
    for (let i = 0; i < 2; i++) {
      const raw = await askAI(CARDS_FROM_WALK_PROMPT, junctions.map((j) => j.photo), question);
      const cards = parseCards(raw, junctions.length);
      if (cards) return Response.json({ cards });
    }
    return Response.json({ error: "카드를 만들지 못했어요. 메모로 직접 만들어 주세요." }, { status: 502 });
  } catch (e) {
    const { message, status } = friendlyError(e);
    return Response.json({ error: message }, { status });
  }
}
