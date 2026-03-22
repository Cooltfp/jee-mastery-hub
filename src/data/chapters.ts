// Per-subject timer allocation (minutes)
export const SUBJECT_TIMER_MINUTES: Record<string, number> = {
  math: 50,
  physics: 40,
  chemistry: 30,
};

export function calculateTotalTimer(selectedSubjects: string[]): number {
  return selectedSubjects.reduce(
    (sum, s) => sum + (SUBJECT_TIMER_MINUTES[s] || 30),
    0
  );
}
