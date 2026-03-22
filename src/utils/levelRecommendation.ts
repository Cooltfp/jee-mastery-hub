export interface SubjectPerformance {
  subject: string;
  accuracy: number; // 0-100
  avgTimePerQuestion: number; // seconds
  currentLevel: number; // 1-5
}

export interface LevelRecommendation {
  subject: string;
  currentLevel: number;
  recommendedLevel: number;
  reason: string;
  emoji: string;
  type: "up" | "stay" | "down";
}

/**
 * Maps accuracy + speed to an absolute recommended level.
 * Not just ±1 — if you pick Level 5 and score 20%, it sends you to Level 1.
 *
 * Score → Level mapping:
 *   90%+ fast  → current + 1 (mastery, ready to move up)
 *   80-89% fast → current (solid, stay and polish)
 *   80%+ slow  → current (knows material, needs speed)
 *   60-79%     → current - 1 (concepts shaky at this level)
 *   40-59%     → maps to Level 2 or current - 2, whichever is lower
 *   20-39%     → maps to Level 1-2 (fundamentals weak)
 *   <20%       → Level 1 (start from basics)
 */
export function getRecommendedLevel(
  result: SubjectPerformance
): LevelRecommendation {
  const { subject, accuracy, avgTimePerQuestion, currentLevel } = result;
  const acc = Math.round(accuracy);

  let targetLevel: number;
  let reason: string;
  let emoji: string;

  if (acc >= 90 && avgTimePerQuestion <= 90) {
    // Mastery: high accuracy + fast speed → level up
    targetLevel = Math.min(currentLevel + 1, 5);
    reason = targetLevel === currentLevel
      ? `${acc}% accuracy in ${Math.round(avgTimePerQuestion)}s/q — you've mastered the highest level!`
      : `${acc}% accuracy in ${Math.round(avgTimePerQuestion)}s/q — you've mastered Level ${currentLevel}, ready to move up`;
    emoji = targetLevel === currentLevel ? "👑" : "🚀";
  } else if (acc >= 80 && avgTimePerQuestion <= 90) {
    // Strong: good accuracy + fast → stay and solidify
    targetLevel = currentLevel;
    reason = `${acc}% accuracy in ${Math.round(avgTimePerQuestion)}s/q — solid performance, keep sharpening at this level`;
    emoji = "💪";
  } else if (acc >= 80 && avgTimePerQuestion > 90) {
    // Knows the material but slow → stay, build speed
    targetLevel = currentLevel;
    reason = `${acc}% accuracy but ${Math.round(avgTimePerQuestion)}s/q is slow — you know the concepts, focus on speed`;
    emoji = "⏱️";
  } else if (acc >= 60) {
    // Moderate: some gaps → drop 1 level
    targetLevel = Math.max(currentLevel - 1, 1);
    reason = `${acc}% accuracy — some concepts need work. Strengthen at Level ${targetLevel} before reattempting Level ${currentLevel}`;
    emoji = "📖";
  } else if (acc >= 40) {
    // Struggling: significant gaps → drop to Level 2 or current - 2
    targetLevel = Math.max(Math.min(currentLevel - 2, 2), 1);
    reason = `${acc}% accuracy at Level ${currentLevel} — multiple concept gaps. Build a stronger foundation at Level ${targetLevel}`;
    emoji = "📚";
  } else if (acc >= 20) {
    // Very weak: most concepts missing → Level 1-2
    targetLevel = currentLevel >= 4 ? 1 : Math.max(currentLevel - 2, 1);
    reason = `${acc}% accuracy — fundamentals need serious attention. Start with Level ${targetLevel} to build core understanding`;
    emoji = "🔨";
  } else {
    // Below 20%: start from scratch
    targetLevel = 1;
    reason = `${acc}% accuracy — let's rebuild from the ground up. Level 1 will strengthen your fundamentals`;
    emoji = "🌱";
  }

  // Determine recommendation type
  let type: "up" | "stay" | "down";
  if (targetLevel > currentLevel) type = "up";
  else if (targetLevel < currentLevel) type = "down";
  else type = "stay";

  return {
    subject,
    currentLevel,
    recommendedLevel: targetLevel,
    reason,
    emoji,
    type,
  };
}

export function saveRecommendations(
  recs: Record<string, number>
): void {
  const existing = loadRecommendations();
  const merged = { ...existing, ...recs };
  localStorage.setItem("recommendedLevels", JSON.stringify(merged));
}

export function loadRecommendations(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem("recommendedLevels") || "{}");
  } catch {
    return {};
  }
}
