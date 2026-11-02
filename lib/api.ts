"use client";

import { deviceId } from "@/lib/settings";
import type { Action, CardDraft, CheckResult, ImagePayload, Place, PlanResult, ReplaceResult, Side, WhereAmIResult } from "@/types";

// 휴대폰은 AI나 TMAP을 직접 부르지 않고 항상 우리 서버 주소만 부른다.
async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-device-id": deviceId() },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok && !("nextStep" in json)) {
    throw new Error((json as { error?: string }).error || "서버에 연결하지 못했어요. 인터넷 연결을 확인하고 다시 해 주세요.");
  }
  return json as T;
}

export const requestCards = (junctions: { photo: ImagePayload; note: string }[]) =>
  post<{ cards: CardDraft[]; mock?: boolean }>("/api/cards-from-walk", { junctions });

export const requestWhereAmI = (body: {
  photos: ImagePayload[];
  cards: { order: number; photoDescription: string; landmarkName: string; instruction: string; lat?: number; lng?: number }[];
  lastCardOrder: number;
  gps?: { lat: number; lng: number } | null;
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

export const requestPlaces = (q: string, lat?: number, lng?: number) =>
  post<{ places: Place[]; mock?: boolean }>("/api/search-place", { q, lat, lng });

export const requestPlan = (body: { start: { lat: number; lng: number }; end: { lat: number; lng: number; name: string } }) =>
  post<PlanResult>("/api/plan-route", body);

export const requestCheck = (body: {
  photo: ImagePayload;
  expected: string | null; // 찾는 길잡이 이름. 후보가 다 안 보였으면 null (새로 골라 달라)
  candidates: string[];
  action: Action;
  instruction: string;
}) => post<CheckResult>("/api/check-landmark", body);
