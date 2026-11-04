import { josa } from "@/lib/josa";
import type { Action } from "@/types";

// 길잡이 이름과 행동으로 안내 문장을 만든다. 처음 가는 길의 카드 초안, 후보를 바꿀 때 쓴다.
// rel: 갈림길로 걸어올 때 그 가게가 보이는 쪽. 알면 "왼쪽 ○○을 끼고 왼쪽으로"처럼 눈으로 찾을 곳을 같이 알려 준다.
export type Rel = "ahead" | "left" | "right" | "behind";

const DIR = { left: "왼쪽", right: "오른쪽" } as const;
const SIDE: Record<Rel, string> = { ahead: "정면", left: "왼쪽", right: "오른쪽", behind: "" };

export function sentenceFor(name: string | null, action: Action, crossing = false, rel?: Rel, start = false): string {
  const at = rel === "left" || rel === "right" ? `${SIDE[rel]} ` : ""; // "왼쪽 온누리약국"
  if (start) {
    // 출발 카드: 지금 서 있는 곳에서 어느 쪽으로 걸어가는지
    if (!name) return "길을 따라 곧장 출발하세요";
    // 출발 길잡이는 걸어 나갈 길 앞쪽에서 고른다. 옆에 있으면 "그 가게를 왼쪽에 두고" 걸어가면 된다.
    if (rel === "left" || rel === "right") return `${josa(name, "을/를")} ${SIDE[rel]}에 두고 출발하세요`;
    return `정면에 ${josa(name, "이/가")} 보이는 쪽으로 출발하세요`;
  }
  if (crossing && action === "straight") return name ? `${at}${name} 앞 횡단보도를 건너세요` : "횡단보도를 건너세요";
  if (crossing && (action === "left" || action === "right")) {
    if (!name) return `여기서 ${DIR[action]}으로 가서 횡단보도를 건너세요`;
    const dir = DIR[action];
    if (rel === action) return `${dir} ${josa(name, "을/를")} 끼고 ${dir}으로 가서 횡단보도를 건너세요`;
    if (rel === "left" || rel === "right") return `${SIDE[rel]}에 ${josa(name, "이/가")} 보이는 곳에서 ${dir}으로 가서 횡단보도를 건너세요`;
    return `${name}에서 ${dir}으로 가서 횡단보도를 건너세요`;
  }
  if (action === "arrive") {
    if (!name) return "여기가 도착 지점이에요";
    return rel === "left" || rel === "right" ? `${SIDE[rel]}에 ${josa(name, "이/가")} 보이면 도착이에요` : `${josa(name, "이/가")} 보이면 도착이에요`;
  }
  if (!name) return action === "straight" ? "여기서 곧장 가세요" : `여기서 ${DIR[action]}으로 가세요`;
  if (action === "straight") return `${at}${josa(name, "을/를")} 지나 곧장 가세요`;
  const dir = DIR[action];
  // 꺾는 쪽에 가게가 있으면 모퉁이 가게를 "끼고" 돈다
  if (rel === action) return `${dir} ${josa(name, "을/를")} 끼고 ${dir}으로 가세요`;
  if (rel === "left" || rel === "right") return `${SIDE[rel]}에 ${josa(name, "이/가")} 보이는 곳에서 ${dir}으로 가세요`;
  if (rel === "ahead") return `정면에 ${josa(name, "이/가")} 보이면 ${dir}으로 가세요`;
  if (rel === "behind") return `${josa(name, "을/를")} 지나서 ${dir}으로 가세요`;
  return `${name}에서 ${dir}으로 가세요`;
}
