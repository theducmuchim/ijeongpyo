import { askAI, friendlyError, isMockMode } from "@/lib/ai";
import { CHECK_LANDMARK_PROMPT } from "@/lib/prompts";
import { checkLimit } from "@/lib/rateLimit";
import { parseCheck } from "@/lib/schemas";
import type { Action, CheckResult, ImagePayload } from "@/types";

export const maxDuration = 60;

type Body = { photo?: ImagePayload; expected?: string | null; candidates?: string[]; action?: Action; instruction?: string };

// 처음 가는 길: '보여요'로 찍은 사진에 길잡이가 정말 있는지 확인하고, 카드에 넣을 사진 설명을 받는다.
export async function POST(req: Request) {
  const deviceId = req.headers.get("x-device-id");
  let body: Body;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "요청을 읽을 수 없어요" }, { status: 400 });
  }
  if (!body.photo?.base64) return Response.json({ error: "사진이 없어요" }, { status: 400 });
  const action: Action = body.action ?? "straight";
  const expected = body.expected?.trim() || null;

  if (isMockMode()) {
    const result: CheckResult = {
      seen: !!expected,
      matched: expected,
      photoDescription: `(시험 모드) ${expected ?? "갈림길"} 근처에서 찍은 사진`,
      landmark: { name: expected ?? "(시험) 새 길잡이", side: "ahead" },
      instruction: body.instruction || "다음 갈림길까지 가세요",
      warning: null,
      mock: true,
    };
    return Response.json(result);
  }
  if (!(await checkLimit(deviceId))) {
    return Response.json({ error: "오늘 쓸 수 있는 횟수를 다 썼어요. 카드 문장만 보고 걸어 주세요." }, { status: 429 });
  }

  const question = [
    `기대한 길잡이: ${expected ?? "없음 (사진에서 새로 골라라)"}`,
    `다른 후보: ${(body.candidates ?? []).filter((c) => c !== expected).join(", ") || "없음"}`,
    `이 지점에서 할 행동(action): ${action}`,
    `지금 카드 문장: ${body.instruction ?? ""}`,
  ].join("\n");

  try {
    for (let i = 0; i < 2; i++) {
      const result = parseCheck(await askAI(CHECK_LANDMARK_PROMPT, [body.photo], question));
      if (result) return Response.json(result);
    }
    return Response.json({ error: "사진을 확인하지 못했어요. 다시 찍어 주세요." }, { status: 502 });
  } catch (e) {
    const { message, status } = friendlyError(e);
    return Response.json({ error: message }, { status });
  }
}
