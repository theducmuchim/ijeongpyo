import type { Route } from "@/types";

// 길 목록에 쓰는 한 줄 설명
export function ago(iso?: string) {
  if (!iso) return "아직 안 걸음";
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (days <= 0) return "오늘 걸음";
  if (days === 1) return "어제 걸음";
  if (days < 7) return `${days}일 전 걸음`;
  return "지난주 이전에 걸음";
}

export function routeSubtitle(r: Route) {
  if (r.status !== "ready") return "카드 확인 전";
  const drafts = r.cards.filter((c) => c.source === "draft" && !c.checkedAt).length;
  if (r.kind === "planned" && drafts > 0) return `사진 ${r.cards.length - drafts}/${r.cards.length}`;
  return ago(r.lastWalkedAt);
}

