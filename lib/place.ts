// 건물 이름과 번지를 화면과 소리에 쓰는 모양으로 만든다. (서버와 휴대폰 양쪽에서 쓴다)
import type { Candidate, PlaceInfo } from "@/types";

export const hasPlace = (p?: PlaceInfo | null): p is PlaceInfo => !!p && !!(p.building || p.road || p.jibun);

export function placeFromCandidate(c?: Candidate | null): PlaceInfo | undefined {
  if (!c) return undefined;
  const p: PlaceInfo = {};
  if (c.building) p.building = c.building;
  if (c.road) p.road = c.road;
  if (c.jibun) p.jibun = c.jibun;
  return hasPlace(p) ? p : undefined;
}

/** 화면용: "중앙빌딩 · 중앙로 123 (은행동 45-6)" */
export function placeText(p?: PlaceInfo | null): string {
  if (!hasPlace(p)) return "";
  const main = [p.building, p.road].filter(Boolean).join(" · ");
  if (!main) return p.jibun!;
  return p.jibun ? `${main} (${p.jibun})` : main;
}

/** 소리용: "중앙빌딩, 번호판 중앙로 123 건물이에요." */
export function placeSpeech(p?: PlaceInfo | null): string {
  if (!hasPlace(p)) return "";
  const parts = [p.building, p.road ? `번호판 ${p.road}` : p.jibun ? `지번 ${p.jibun}` : ""].filter(Boolean);
  return `${parts.join(", ")} 건물이에요.`;
}

/** 가게 후보가 다 안 보일 때 길잡이로 쓸 이름: 건물 이름, 없으면 "중앙로 123 건물" */
export function placeAsLandmark(p?: PlaceInfo | null): string | null {
  if (!hasPlace(p)) return null;
  if (p.building) return p.building;
  if (p.road) return `${p.road} 건물`;
  return null;
}
