import { useState } from "react";

interface StarRatingProps {
  value: number | null;
  onRate?: (rating: number) => void;
  size?: "sm" | "md";
}

export function StarRating({ value, onRate, size = "md" }: StarRatingProps) {
  const [hover, setHover] = useState<number | null>(null);
  const display = hover ?? value ?? 0;
  const fontSize = size === "sm" ? 14 : 18;

  return (
    <span className="star-row" onMouseLeave={() => setHover(null)}>
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          className={`star-btn ${star <= display ? "filled" : ""}`}
          style={{ fontSize, cursor: onRate ? "pointer" : "default" }}
          disabled={!onRate}
          onMouseEnter={() => onRate && setHover(star)}
          onClick={() => onRate?.(star)}
          aria-label={`${star} star${star > 1 ? "s" : ""}`}
        >
          ★
        </button>
      ))}
    </span>
  );
}
