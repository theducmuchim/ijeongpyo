import "server-only";
import { askAI } from "@/lib/ai";
import { WHERE_AM_I_PROMPT } from "@/lib/prompts";
import { parseWhereAmI } from "@/lib/schemas";
import type { ImagePayload, WhereAmIResult } from "@/types";

// '길을 잃었어요'에서 AI에게 묻는 부분. 앱 서버(/api/where-am-i)와 평가 도구(npm run eval)가
// 똑같은 코드를 쓰게 하려고 따로 뺐다. 평가 결과가 실제 앱과 달라지지 않게 하기 위해서다.

export type CardText = { order: number; photoDescription: string; landmarkName: string; instruction: string; lat?: number; lng?: number };

export const FALLBACK: WhereAmIResult = {
  status: "unsure",
  confidence: 0,
  seenLandmarks: [],
  matchedCardOrder: null,
  nextStep: "마지막으로 지나간 카드 장소로 돌아가세요",
  askPhoto: null,
  reasonForUser: "사진만으로는 위치를 알 수 없어요",
};

// 카드 사진 대신 카드 설명 글만 보낸다 (비용과 속도 때문)
export function buildQuestion(cards: CardText[], lastCardOrder: number, extra = ""): string {
  const cardText = cards
    .map((c) => `${c.order}번: ${c.photoDescription} / 길잡이: ${c.landmarkName} / ${c.instruction}`)
    .join("\n");
  return `마지막으로 지나간 카드: ${lastCardOrder}번\n카드 목록:\n${cardText}${extra ? `\n${extra}` : ""}`;
}

// 답 모양이 틀리면 한 번만 다시 묻고, 그래도 틀리면 기본 답을 준다.
// AI 서버 오류(한도 초과 등)는 그대로 던진다. 부르는 쪽에서 처리한다.
export async function askWhereAmI(
  photos: ImagePayload[],
  cards: CardText[],
  lastCardOrder: number,
  extra = "",
): Promise<WhereAmIResult & { fallback?: boolean }> {
  const question = buildQuestion(cards, lastCardOrder, extra);
  for (let i = 0; i < 2; i++) {
    const raw = await askAI(WHERE_AM_I_PROMPT, photos, question);
    const result = parseWhereAmI(raw);
    if (result) return fixNextStep(result, cards);
  }
  return { ...FALLBACK, fallback: true };
}

// 가벼운 모델이 nextStep에 "신호를 직접 확인하세요"만 쓰고 정작 갈 곳은 reasonForUser에 쓰는 일이 있었다.
// 갈 곳이 빠졌으면 맞춘 카드의 안내 문장을 앞에 붙인다.
const SIGNAL = "신호를 직접 확인하세요";
function fixNextStep(r: WhereAmIResult, cards: CardText[]): WhereAmIResult {
  const onlySignal = r.nextStep.replace(/[.\s]/g, "") === SIGNAL.replace(/\s/g, "");
  if (!onlySignal) return r;
  const card = cards.find((c) => c.order === r.matchedCardOrder);
  const go = card?.instruction ?? (/세요/.test(r.reasonForUser) ? r.reasonForUser : null);
  if (!go) return r;
  return { ...r, nextStep: `${go.replace(/\.$/, "")}. ${SIGNAL}`, reasonForUser: go === r.reasonForUser ? "" : r.reasonForUser };
}
