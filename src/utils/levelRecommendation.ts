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

export function getRecommendedLevel(
  result: SubjectPerformance
): LevelRecommendation {
  const { subject, accuracy, avgTimePerQuestion, currentLevel } = result;

  // High accuracy + fast → level up
  if (accuracy >= 80 && avgTimePerQuestion <= 90) {
    const next = Math.min(currentLevel + 1, 5);
    return {
      subject,
      currentLevel,
      recommendedLevel: next,
      reason:
        next === currentLevel
          ? "You've mastered the highest level!"
          : `Strong accuracy (${Math.round(accuracy)}%) and fast solving — ready for a challenge`,
      emoji: next === currentLevel ? "👑" : "🚀",
      type: next === currentLevel ? "stay" : "up",
    };
  }

  // High accuracy but slow → stay, build speed
  if (accuracy >= 80) {
    return {
      subject,
      currentLevel,
      recommendedLevel: currentLevel,
      reason: `Great accuracy (${Math.round(accuracy)}%) but averaging ${Math.round(avgTimePerQuestion)}s/question — build speed at this level`,
      emoji: "⏱️",
      type: "stay",
    };
  }

  // Moderate accuracy → stay, practice
  if (accuracy >= 50) {
    return {
      subject,
      currentLevel,
      recommendedLevel: currentLevel,
      reason: `${Math.round(accuracy)}% accuracy — keep practicing to strengthen concepts`,
      emoji: "💪",
      type: "stay",
    };
  }

  // Low accuracy → level down
  const prev = Math.max(currentLevel - 1, 1);
  return {
    subject,
    currentLevel,
    recommendedLevel: prev,
    reason:
      prev === currentLevel
        ? `${Math.round(accuracy)}% accuracy — focus on fundamentals at this level`
        : `${Math.round(accuracy)}% accuracy — solidify the basics first`,
    emoji: prev === currentLevel ? "📚" : "⬇️",
    type: prev === currentLevel ? "stay" : "down",
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
