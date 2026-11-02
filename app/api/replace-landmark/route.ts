import { askAI, friendlyError, isMockMode } from "@/lib/ai";
import { REPLACE_LANDMARK_PROMPT } from "@/lib/prompts";
import { checkLimit } from "@/lib/rateLimit";
import { parseReplace } from "@/lib/schemas";
import type { Action, ImagePayload, ReplaceResult, Side } from "@/types";

export const maxDuration = 60;

// 2차 기능: 없어진 길잡이를 새 사진으로 바꾼다. 꺾는 방향(action)은 바꾸지 않는다.
type Body = {
  photo: ImagePayload;
  card: {
    order: number;
    photoDescription: string;
    landmarkName: string;
    side: Side;
    action: Action;
    instruction: string;
    userNote?: string;
  };
  prevInstruction?: string;
  nextInstruction?: string;
};

const ACTION_KO: Record<Action, string> = { straight: "곧장 가기", left: "왼쪽으로 꺾기", right: "오른쪽으로 꺾기", arrive: "도착" };

export async function POST(req: Request) {
  const deviceId = req.headers.get("x-device-id");
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return Response.json({ error: "요청을 읽을 수 없어요" }, { status: 400 });
  }
  if (!body.photo?.base64 || !body.card) return Response.json({ error: "사진이나 카드가 없어요" }, { status: 400 });
  const c = body.card;

  if (isMockMode()) {
    const result: ReplaceResult = {
      photoDescription: `(시험 모드) 새로 찍은 ${c.order}번 갈림길 사진`,
      landmark: { name: "새 길잡이", side: c.side },
      instruction: c.instruction,
      changeNote: "(시험 모드) 사진만 바꿨어요",
      warning: null,
      mock: true,
    };
    return Response.json(result);
  }

  if (!(await checkLimit(deviceId))) {
    return Response.json({ error: "오늘 쓸 수 있는 횟수를 다 썼어요. 내일 다시 해 주세요." }, { status: 429 });
  }

  const question = [
    `원래 ${c.order}번 카드`,
    `- 장소 설명: ${c.photoDescription}`,
    `- 길잡이: ${c.landmarkName} (${c.side})`,
    `- 행동(action, 바꾸지 말 것): ${c.action} = ${ACTION_KO[c.action] ?? c.action}`,
    `- 안내 문장: ${c.instruction}`,
    c.userNote ? `- 등록할 때 메모: ${c.userNote}` : "",
    body.prevInstruction ? `바로 앞 카드 문장: ${body.prevInstruction}` : "",
    body.nextInstruction ? `바로 다음 카드 문장: ${body.nextInstruction}` : "",
    "새로 찍은 사진을 보고 이 카드를 고쳐라.",
  ]
    .filter(Boolean)
    .join("\n");

  try {
    for (let i = 0; i < 2; i++) {
      const raw = await askAI(REPLACE_LANDMARK_PROMPT, [body.photo], question);
      const result = parseReplace(raw);
      if (result) return Response.json(result);
    }
    return Response.json({ error: "새 길잡이를 고르지 못했어요. 문장을 직접 고쳐 주세요." }, { status: 502 });
  } catch (e) {
    const { message, status } = friendlyError(e);
    return Response.json({ error: message }, { status });
  }
}
