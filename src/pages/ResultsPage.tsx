import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { TestResult } from "@/lib/testStore";
import MathText from "@/components/MathText";
import { Button } from "@/components/ui/button";
import { ArrowLeft, CheckCircle2, XCircle, MinusCircle, AlertTriangle, TrendingUp, Clock, Target, Brain } from "lucide-react";

const ResultsPage = () => {
  const navigate = useNavigate();
  const [result, setResult] = useState<TestResult | null>(null);
  const [expandedQ, setExpandedQ] = useState<number | null>(null);

  useEffect(() => {
    const stored = sessionStorage.getItem("testResult");
    if (stored) {
      setResult(JSON.parse(stored));
    }
  }, []);

  if (!result) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <p className="text-muted-foreground mb-4">No test results found.</p>
          <Button onClick={() => navigate("/")} className="active:scale-[0.97] transition-transform">
            <ArrowLeft className="w-4 h-4 mr-2" /> Go Home
          </Button>
        </div>
      </div>
    );
  }

  const { score, maxScore, subjectWise, sillyErrors, questions, questionStates, totalTimeTaken } = result;
  const percentage = maxScore > 0 ? (score / maxScore) * 100 : 0;
  const totalAttempted = questions.length - subjectWise.physics.unattempted - subjectWise.chemistry.unattempted - subjectWise.math.unattempted;
  const totalCorrect = subjectWise.physics.correct + subjectWise.chemistry.correct + subjectWise.math.correct;

  const formatTime = (s: number) => {
    if (s < 60) return `${Math.round(s)}s`;
    return `${Math.floor(s / 60)}m ${Math.round(s % 60)}s`;
  };

  const subjects = [
    { key: "physics" as const, label: "Physics", data: subjectWise.physics, color: "bg-physics" },
    { key: "chemistry" as const, label: "Chemistry", data: subjectWise.chemistry, color: "bg-chemistry" },
    { key: "math" as const, label: "Mathematics", data: subjectWise.math, color: "bg-math" },
  ];

  // Learning path suggestions
  const weakTopics: { subject: string; topic: string; accuracy: number }[] = [];
  for (const subj of subjects) {
    for (const [topic, data] of Object.entries(subj.data.topics)) {
      const acc = data.total > 0 ? (data.correct / data.total) * 100 : 0;
      if (acc < 60) {
        weakTopics.push({ subject: subj.label, topic, accuracy: acc });
      }
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card px-4 py-3 flex items-center gap-3 sticky top-0 z-10">
        <Button variant="ghost" size="sm" onClick={() => navigate("/")} className="active:scale-[0.97] transition-transform">
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <h1 className="font-semibold text-lg">Test Results & Analysis</h1>
      </header>

      <div className="max-w-5xl mx-auto p-6 space-y-8">
        {/* Score Overview */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <ScoreCard icon={<Target className="w-5 h-5 text-accent" />} label="Score" value={`${score}/${maxScore}`} sub={`${percentage.toFixed(1)}%`} />
          <ScoreCard icon={<CheckCircle2 className="w-5 h-5 text-success" />} label="Correct" value={`${totalCorrect}`} sub={`of ${totalAttempted} attempted`} />
          <ScoreCard icon={<Clock className="w-5 h-5 text-physics" />} label="Time Taken" value={formatTime(totalTimeTaken)} sub={`of 60m`} />
          <ScoreCard icon={<AlertTriangle className="w-5 h-5 text-destructive" />} label="Silly Errors" value={`${sillyErrors.length}`} sub={sillyErrors.length > 0 ? "Review below" : "Great focus!"} />
        </div>

        {/* Subject-wise Breakdown */}
        <section>
          <h2 className="font-semibold text-base mb-4 flex items-center gap-2">
            <TrendingUp className="w-4 h-4" /> Subject-wise Performance
          </h2>
          <div className="grid md:grid-cols-3 gap-4">
            {subjects.map((subj) => (
              <div key={subj.key} className="bg-card rounded-xl border p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <span className={`text-xs font-semibold px-2.5 py-1 rounded-md ${
                    subj.key === "physics" ? "subject-physics" :
                    subj.key === "chemistry" ? "subject-chemistry" : "subject-math"
                  }`}>{subj.label}</span>
                  <span className="text-sm font-semibold">{subj.data.score}/{subj.data.maxScore}</span>
                </div>

                {/* Accuracy bar */}
                <div>
                  <div className="flex justify-between text-xs text-muted-foreground mb-1">
                    <span>Accuracy</span>
                    <span>{subj.data.accuracy.toFixed(0)}%</span>
                  </div>
                  <div className="h-2 bg-secondary rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${subj.color} transition-all duration-500`}
                      style={{ width: `${subj.data.accuracy}%` }} />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2 text-center text-xs">
                  <div className="bg-success/10 text-success rounded-lg p-2">
                    <div className="font-semibold text-sm">{subj.data.correct}</div>
                    Correct
                  </div>
                  <div className="bg-destructive/10 text-destructive rounded-lg p-2">
                    <div className="font-semibold text-sm">{subj.data.incorrect}</div>
                    Wrong
                  </div>
                  <div className="bg-secondary rounded-lg p-2 text-muted-foreground">
                    <div className="font-semibold text-sm">{subj.data.unattempted}</div>
                    Skipped
                  </div>
                </div>

                <div className="text-xs text-muted-foreground">
                  Avg. time per question: <span className="font-medium text-foreground">{formatTime(subj.data.avgTime)}</span>
                </div>

                {/* Topic heatmap */}
                <div className="space-y-1.5">
                  {Object.entries(subj.data.topics).map(([topic, d]) => {
                    const acc = d.total > 0 ? (d.correct / d.total) * 100 : 0;
                    return (
                      <div key={topic} className="flex items-center gap-2 text-xs">
                        <div className={`w-2 h-2 rounded-full shrink-0 ${
                          acc >= 80 ? "bg-success" : acc >= 50 ? "bg-accent" : "bg-destructive"
                        }`} />
                        <span className="truncate flex-1">{topic}</span>
                        <span className="text-muted-foreground">{d.correct}/{d.total}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Silly Errors */}
        {sillyErrors.length > 0 && (
          <section>
            <h2 className="font-semibold text-base mb-4 flex items-center gap-2 text-destructive">
              <AlertTriangle className="w-4 h-4" /> Silly Errors Detected
            </h2>
            <div className="space-y-2">
              {sillyErrors.map((err, i) => (
                <div key={i} className="bg-destructive/5 border border-destructive/20 rounded-lg p-4 text-sm">
                  <div className="font-medium">Q{err.questionId}: {err.reason}</div>
                  <div className="text-xs text-muted-foreground mt-1">
                    Time spent: {formatTime(err.timeSpent)} • Difficulty: {err.difficulty}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Learning Path */}
        {weakTopics.length > 0 && (
          <section>
            <h2 className="font-semibold text-base mb-4 flex items-center gap-2">
              <Brain className="w-4 h-4 text-accent" /> Recommended Focus Areas
            </h2>
            <div className="bg-accent/5 border border-accent/20 rounded-xl p-5">
              <p className="text-sm text-muted-foreground mb-3">Based on your performance, we recommend revising:</p>
              <div className="space-y-2">
                {weakTopics.map((wt, i) => (
                  <div key={i} className="flex items-center gap-3 text-sm">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded ${
                      wt.subject === "Physics" ? "subject-physics" :
                      wt.subject === "Chemistry" ? "subject-chemistry" : "subject-math"
                    }`}>{wt.subject}</span>
                    <span className="font-medium">{wt.topic}</span>
                    <span className="text-xs text-muted-foreground ml-auto">
                      {wt.accuracy.toFixed(0)}% accuracy
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* Question-wise Review */}
        <section>
          <h2 className="font-semibold text-base mb-4">Question-wise Review</h2>
          <div className="space-y-2">
            {questions.map((q, i) => {
              const state = questionStates[i];
              const isCorrect = state.selectedAnswer?.trim() === q.correctAnswer.trim();
              const attempted = state.status === "answered";

              return (
                <div key={q.id} className="border rounded-lg overflow-hidden">
                  <button
                    onClick={() => setExpandedQ(expandedQ === i ? null : i)}
                    className="w-full flex items-center gap-3 p-3 text-left hover:bg-secondary/50 transition-colors active:scale-[0.995] transition-transform"
                  >
                    {attempted ? (
                      isCorrect ? <CheckCircle2 className="w-4 h-4 text-success shrink-0" /> :
                      <XCircle className="w-4 h-4 text-destructive shrink-0" />
                    ) : (
                      <MinusCircle className="w-4 h-4 text-muted-foreground shrink-0" />
                    )}
                    <span className="text-sm font-medium">Q{i + 1}</span>
                    <span className={`text-xs px-2 py-0.5 rounded ${
                      q.subject === "physics" ? "subject-physics" :
                      q.subject === "chemistry" ? "subject-chemistry" : "subject-math"
                    }`}>{q.topic}</span>
                    <span className="text-xs text-muted-foreground ml-auto">{formatTime(state.timeSpent)}</span>
                  </button>
                  {expandedQ === i && (
                    <div className="p-4 border-t bg-muted/30 space-y-3">
                      <MathText>{q.text}</MathText>
                      {attempted && (
                        <div className="text-sm">
                          Your answer: <span className={isCorrect ? "text-success font-medium" : "text-destructive font-medium"}>
                            {state.selectedAnswer}
                          </span>
                          {!isCorrect && <> • Correct: <span className="text-success font-medium">{q.correctAnswer}</span></>}
                        </div>
                      )}
                      <div className="text-sm bg-card rounded-lg p-3 border">
                        <div className="text-xs font-medium text-muted-foreground mb-1">Explanation</div>
                        <MathText>{q.explanation}</MathText>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {/* Actions */}
        <div className="flex gap-3 pb-8">
          <Button variant="outline" onClick={() => navigate("/")} className="active:scale-[0.97] transition-transform">
            <ArrowLeft className="w-4 h-4 mr-2" /> Back to Dashboard
          </Button>
          <Button onClick={() => navigate("/test")} className="bg-accent text-accent-foreground hover:bg-accent/90 active:scale-[0.97] transition-transform">
            Retake Test
          </Button>
        </div>
      </div>
    </div>
  );
};

function ScoreCard({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub: string }) {
  return (
    <div className="bg-card rounded-xl border p-4">
      <div className="flex items-center gap-2 mb-2">{icon}<span className="text-xs text-muted-foreground">{label}</span></div>
      <div className="text-2xl font-bold tracking-tight">{value}</div>
      <div className="text-xs text-muted-foreground mt-0.5">{sub}</div>
    </div>
  );
}

export default ResultsPage;
