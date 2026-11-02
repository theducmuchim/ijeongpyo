import { LineIcon } from "@/components/brand";
import { hasPlace, placeText } from "@/lib/place";
import type { PlaceInfo } from "@/types";

/** 길잡이 아래에 붙는 한 줄: 건물 이름과 번지. 가게가 없어져도 건물 번호판으로 찾을 수 있게 한다. */
export function PlaceLine({ place, className = "label-large muted" }: { place?: PlaceInfo | null; className?: string }) {
  if (!hasPlace(place)) return null;
  return (
    <p className={`place-line ${className}`} aria-label={`건물과 번지: ${placeText(place)}`}>
      <LineIcon name="pin" size={16} />
      <span>
        {placeText(place)}
        {place.near && <small> · 근처</small>}
      </span>
    </p>
  );
}
