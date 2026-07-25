import type { Artifact } from "./types.js";

/** Raw telemetry a trust score is derived from. */
export interface TrustInputs {
  usageCount: number;
  runCount: number;
  successCount: number;
  ratingSum: number;
  ratingCount: number;
  certified: boolean;
}

const WEIGHTS = { usage: 0.3, rating: 0.25, success: 0.3, certified: 0.15 };

/** Usage saturates at ~50 runs so a runaway artifact cannot dominate the score. */
const USAGE_SATURATION = 50;

/**
 * Blends adoption, peer rating, reliability and executive certification into a
 * single 0-100 figure. Unknown rating/reliability fall back to a neutral 0.5
 * prior so a brand new artifact is neither promoted nor buried.
 */
export function computeTrust(input: TrustInputs): Pick<Artifact, "trustScore" | "trust"> {
  const usage = Math.min(1, Math.log10(1 + input.usageCount) / Math.log10(1 + USAGE_SATURATION));
  const avgRating = input.ratingCount > 0 ? input.ratingSum / input.ratingCount : null;
  const successRate = input.runCount > 0 ? input.successCount / input.runCount : null;

  const rating = avgRating === null ? 0.5 : (avgRating - 1) / 4;
  const success = successRate ?? 0.5;

  const score =
    WEIGHTS.usage * usage +
    WEIGHTS.rating * rating +
    WEIGHTS.success * success +
    WEIGHTS.certified * (input.certified ? 1 : 0);

  return {
    trustScore: Math.round(Math.max(0, Math.min(1, score)) * 100),
    trust: {
      usageCount: input.usageCount,
      avgRating: avgRating === null ? null : Math.round(avgRating * 10) / 10,
      ratingCount: input.ratingCount,
      successRate: successRate === null ? null : Math.round(successRate * 1000) / 1000,
      certified: input.certified,
    },
  };
}
