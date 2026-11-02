import { josa } from "@/lib/josa";
import type { Action } from "@/types";

// 길잡이 이름과 행동으로 안내 문장을 만든다 (AI를 못 쓸 때, 후보를 바꿀 때). 이름이 없으면 방향만.
const ACTION_WORDS: Record<Action, string> = {
  straight: "곧장 가세요",
  left: "왼쪽으로 가세요",
  right: "오른쪽으로 가세요",
  arrive: "도착이에요",
};

export function sentenceFor(name: string | null, action: Action, crossing = false): string {
  if (crossing && action === "straight") return name ? `${name} 앞 횡단보도를 건너세요` : "횡단보도를 건너세요";
  if (crossing && (action === "left" || action === "right")) {
    const dir = action === "left" ? "왼쪽" : "오른쪽";
    return name ? `${name}에서 ${dir}으로 가서 횡단보도를 건너세요` : `여기서 ${dir}으로 가서 횡단보도를 건너세요`;
  }
  if (!name) return action === "arrive" ? "여기가 도착 지점이에요" : `여기서 ${ACTION_WORDS[action]}`;
  if (action === "arrive") return `${josa(name, "이/가")} 보이면 도착이에요`;
  if (action === "straight") return `${josa(name, "을/를")} 지나 곧장 가세요`;
  return `${name}에서 ${ACTION_WORDS[action]}`;
}
