"use client";

// JSON 파일을 휴대폰에 저장하거나 공유한다.
// 공유 기능이 있으면(대부분의 휴대폰) 공유 창을 열고, 없으면 파일로 내려받는다.
// 저장했거나 공유했으면 true, 사용자가 공유 창을 닫았으면 false
export async function saveJson(fileName: string, data: unknown): Promise<boolean> {
  const text = JSON.stringify(data, null, 2);
  const file = new File([text], fileName, { type: "application/json" });
  try {
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: fileName });
      return true;
    }
  } catch (e) {
    if ((e as Error).name === "AbortError") return false; // 사용자가 공유 창을 닫음
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a); // 화면에 붙여야 파일 이름이 제대로 붙는 브라우저가 있다
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return true;
}
