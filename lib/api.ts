"use client";

import { deviceId } from "@/lib/settings";
import type { Action, CardDraft, ImagePayload, ReplaceResult, Side, WhereAmIResult } from "@/types";

// 휴대폰은 AI나 TMAP을 직접 부르지 않고 항상 우리 서버 주소만 부른다.
async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-device-id": deviceId() },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok && !("nextStep" in json)) {
    throw new Error((json as { error?: string }).error || "지금은 확인이 어려워요. 잠시 뒤 다시 해 주세요.");
  }
  return json as T;
}

export const requestCards = (junctions: { photo: ImagePayload; note: string }[]) =>
  post<{ cards: CardDraft[]; mock?: boolean }>("/api/cards-from-walk", { junctions });

export const requestWhereAmI = (body: {
  photos: ImagePayload[];
  cards: { order: number; photoDescription: string; landmarkName: string; instruction: string }[];
  lastCardOrder: number;
}) => post<WhereAmIResult & { error?: string }>("/api/where-am-i", body);

export const requestReplace = (body: {
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
}) => post<ReplaceResult>("/api/replace-landmark", body);
