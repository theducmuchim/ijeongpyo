"use client";

import type { ImagePayload } from "@/types";

const MAX_SIDE = 1024;
const QUALITY = 0.7;

// 찍은 사진의 긴 쪽을 1024px로 줄이고 JPEG로 다시 저장한다.
// 캔버스에 다시 그리면 사진 속 촬영 위치 정보(EXIF)도 함께 빠진다.
export async function shrinkPhoto(file: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("사진을 처리할 수 없어요");
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  return await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("사진 저장 실패"))), "image/jpeg", QUALITY),
  );
}

export async function blobToPayload(blob: Blob): Promise<ImagePayload> {
  const buf = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < buf.length; i += chunk) {
    binary += String.fromCharCode(...buf.subarray(i, i + chunk));
  }
  return { base64: btoa(binary), mediaType: "image/jpeg" };
}
