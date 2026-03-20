import { Question } from "@/data/questions";

export interface QuestionState {
  questionId: number;
  status: "not-visited" | "answered" | "not-answered" | "marked";
  selectedAnswer: string | null;
  timeSpent: number; // seconds
}

export interface TestSession {
  questions: Question[];
  questionStates: QuestionState[];
  currentQuestionIndex: number;
  totalTime: number; // seconds remaining
  startTime: number;
  isSubmitted: boolean;
}

export interface TestResult {
  questions: Question[];
  questionStates: QuestionState[];
  totalTimeTaken: number;
  score: number;
  maxScore: number;
  subjectWise: {
    physics: SubjectResult;
    chemistry: SubjectResult;
    math: SubjectResult;
  };
  sillyErrors: SillyError[];
}

export interface SubjectResult {
  correct: number;
  incorrect: number;
  unattempted: number;
  score: number;
  maxScore: number;
  accuracy: number;
  avgTime: number;
  topics: Record<string, { correct: number; total: number }>;
}

export interface SillyError {
  questionId: number;
  reason: string;
  timeSpent: number;
  difficulty: string;
}

export function calculateResults(session: TestSession): TestResult {
  const { questions, questionStates, totalTime, startTime } = session;
  const totalTimeTaken = Math.floor((Date.now() - startTime) / 1000);

  let score = 0;
  let maxScore = 0;

  const subjectInit = (): SubjectResult => ({
    correct: 0, incorrect: 0, unattempted: 0, score: 0, maxScore: 0,
    accuracy: 0, avgTime: 0, topics: {},
  });

  const subjectWise = {
    physics: subjectInit(),
    chemistry: subjectInit(),
    math: subjectInit(),
  };

  const sillyErrors: SillyError[] = [];

  questions.forEach((q, i) => {
    const state = questionStates[i];
    const subj = subjectWise[q.subject];
    maxScore += q.marks;
    subj.maxScore += q.marks;

    if (!subj.topics[q.topic]) {
      subj.topics[q.topic] = { correct: 0, total: 0 };
    }
    subj.topics[q.topic].total++;

    if (state.status === "answered" && state.selectedAnswer !== null) {
      const isCorrect = state.selectedAnswer.trim() === q.correctAnswer.trim();
      if (isCorrect) {
        score += q.marks;
        subj.score += q.marks;
        subj.correct++;
        subj.topics[q.topic].correct++;
      } else {
        score -= q.negativeMarks;
        subj.score -= q.negativeMarks;
        subj.incorrect++;

        // Silly error detection
        if (q.difficulty === "easy" && state.timeSpent > 180) {
          sillyErrors.push({
            questionId: q.id,
            reason: "Spent too long on an easy question and got it wrong",
            timeSpent: state.timeSpent,
            difficulty: q.difficulty,
          });
        }
        if (state.timeSpent < 15 && q.difficulty !== "easy") {
          sillyErrors.push({
            questionId: q.id,
            reason: "Rushed through without enough analysis",
            timeSpent: state.timeSpent,
            difficulty: q.difficulty,
          });
        }
      }
    } else {
      subj.unattempted++;
    }
  });

  for (const key of ["physics", "chemistry", "math"] as const) {
    const s = subjectWise[key];
    const attempted = s.correct + s.incorrect;
    s.accuracy = attempted > 0 ? (s.correct / attempted) * 100 : 0;
    const totalSubjTime = questionStates
      .filter((_, i) => questions[i].subject === key)
      .reduce((sum, qs) => sum + qs.timeSpent, 0);
    s.avgTime = attempted > 0 ? totalSubjTime / attempted : 0;
  }

  return { questions, questionStates, totalTimeTaken, score, maxScore, subjectWise, sillyErrors };
}
