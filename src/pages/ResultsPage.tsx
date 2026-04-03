import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { TestResult } from "@/lib/testStore";
import { LEVELS } from "@/lib/levelSystem";
import { getRecommendedLevel, saveRecommendations, LevelRecommendation } from "@/utils/levelRecommendation";
import { Progress } from "@/components/ui/progress";
import MathRenderer from "@/components/MathRenderer";
import { Button } from "@/components/ui/button";
import { ArrowLeft, CheckCircle2, XCircle, MinusCircle, AlertTriangle, TrendingUp, Clock, Target, Brain, Trophy } from "lucide-react";
import {
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine,
  PieChart, Pie, Cell, ResponsiveContainer, Legend,
} from "recharts";

interface EnrichedResult extends TestResult {
  confidence?: string | null;
  level?: number;
  chapterName?: string | null;
  recommendedLevel?: number;
  testedSubjects?: string[];
  totalTimerMinutes?: number;
}

const ResultsPage = () => {
  const navigate = useNavigate();
  const [result, setResult] = useState<EnrichedResult | null>(null);
  const [expandedQ, setExpandedQ] = useState<number | null>(null);
  const [levelUnlocked, setLevelUnlocked] = useState<number | null>(null);
  const [perSubjectRecs, setPerSubjectRecs] = useState<LevelRecommendation[]>([]);

  useEffect(() => {
    const stored = sessionStorage.getItem("testResult");
    if (!stored) return;

    const parsed: EnrichedResult = JSON.parse(stored);
    setResult(parsed);

    const unlocked = sessionStorage.getItem("levelUnlocked");
    if (unlocked) {
      setLevelUnlocked(Number(unlocked));
      sessionStorage.removeItem("levelUnlocked");
    }

    // Calculate per-subject recommendations
    const currentLevel = parsed.level || 3;
    const recs: LevelRecommendation[] = [];
    const recMap: Record<string, number> = {};
    const testedSubjects = parsed.testedSubjects || ["physics", "chemistry", "math"];

    for (const key of ["physics", "chemistry", "math"] as const) {
      if (!testedSubjects.includes(key)) continue;
      const subj = parsed.subjectWise[key];
      const attempted = subj.correct + subj.incorrect;
      if (attempted === 0 && subj.unattempted === 0) continue; // Subject not in test

      const rec = getRecommendedLevel({
        subject: key,
        accuracy: subj.accuracy,
        avgTimePerQuestion: subj.avgTime,
        currentLevel,
      });
      recs.push(rec);
      recMap[key] = rec.recommendedLevel;
    }

    setPerSubjectRecs(recs);
    if (Object.keys(recMap).length > 0) {
      saveRecommendations(recMap);
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

  const { score, maxScore, subjectWise, sillyErrors, questions, questionStates, totalTimeTaken, confidence, level, recommendedLevel, testedSubjects, totalTimerMinutes } = result;
  const percentage = maxScore > 0 ? (score / maxScore) * 100 : 0;
  const totalCorrect = subjectWise.physics.correct + subjectWise.chemistry.correct + subjectWise.math.correct;
  const totalIncorrect = subjectWise.physics.incorrect + subjectWise.chemistry.incorrect + subjectWise.math.incorrect;
  const totalUnattempted = subjectWise.physics.unattempted + subjectWise.chemistry.unattempted + subjectWise.math.unattempted;
  const totalAttempted = totalCorrect + totalIncorrect;

  const formatTime = (s: number) => {
    if (s < 60) return `${Math.round(s)}s`;
    return `${Math.floor(s / 60)}m ${Math.round(s % 60)}s`;
  };

  const tested = testedSubjects || ["physics", "chemistry", "math"];
  const subjects = [
    { key: "physics" as const, label: "Physics", data: subjectWise.physics, color: "hsl(217, 91%, 60%)" },
    { key: "chemistry" as const, label: "Chemistry", data: subjectWise.chemistry, color: "hsl(142, 71%, 45%)" },
    { key: "math" as const, label: "Mathematics", data: subjectWise.math, color: "hsl(38, 92%, 50%)" },
  ].filter((s) => tested.includes(s.key));

  const showRadarChart = subjects.length >= 2;

  const radarData = subjects.map((s) => ({
    subject: s.label,
    accuracy: Math.round(s.data.accuracy),
    score: s.data.maxScore > 0 ? Math.round((s.data.score / s.data.maxScore) * 100) : 0,
  }));

  const timeBarData = questionStates.map((qs, i) => ({
    name: `Q${i + 1}`,
    time: Math.round(qs.timeSpent),
    fill: questions[i].subject === "physics" ? "hsl(217, 91%, 60%)" :
          questions[i].subject === "chemistry" ? "hsl(142, 71%, 45%)" : "hsl(38, 92%, 50%)",
  }));

  const pieData = [
    { name: "Correct", value: totalCorrect, color: "hsl(142, 71%, 45%)" },
    { name: "Incorrect", value: totalIncorrect, color: "hsl(0, 72%, 51%)" },
    { name: "Unattempted", value: totalUnattempted, color: "hsl(215, 13%, 50%)" },
  ].filter(d => d.value > 0);

  const weakTopics: { subject: string; topic: string; accuracy: number }[] = [];
  for (const subj of subjects) {
    for (const [topic, data] of Object.entries(subj.data.topics)) {
      const acc = data.total > 0 ? (data.correct / data.total) * 100 : 0;
      if (acc < 60) weakTopics.push({ subject: subj.label, topic, accuracy: acc });
    }
  }

  // Confidence gap analysis
  const confidenceMap: Record<string, number> = { low: 1, moderate: 2, high: 3 };
  const scoreLevel = percentage >= 70 ? 3 : percentage >= 40 ? 2 : 1;
  const confLevel = confidence ? confidenceMap[confidence] || 2 : 2;
  const confidenceGap = confLevel - scoreLevel;
  const confidenceLabel = confidenceGap > 0 ? "Overconfident" : confidenceGap < 0 ? "Underconfident" : "Well Calibrated";
  const confidenceColor = confidenceGap > 0 ? "text-destructive" : confidenceGap < 0 ? "text-[hsl(var(--physics))]" : "text-[hsl(var(--success))]";

  const currentLevel = level || 3;
  const unlockThreshold = 60;
  const progressToNext = Math.min(100, (percentage / unlockThreshold) * 100);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card px-4 py-3 flex items-center gap-3 sticky top-0 z-10">
        <Button variant="ghost" size="sm" onClick={() => navigate("/")} className="active:scale-[0.97] transition-transform">
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <h1 className="font-semibold text-lg">Test Results & Analysis</h1>
        {currentLevel && (
          <span className="text-xs px-2 py-1 rounded-md bg-accent/10 text-accent font-medium ml-auto">
            Level {currentLevel}
          </span>
        )}
      </header>

      <div className="max-w-5xl mx-auto p-6 space-y-8">
        {/* Per-subject Recommended Levels */}
        {perSubjectRecs.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <Trophy className="w-4 h-4 text-accent" /> Recommended next levels
            </h3>
            <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${Math.min(perSubjectRecs.length, 3)}, 1fr)` }}>
              {perSubjectRecs.map((rec) => (
                <div
                  key={rec.subject}
                  className={`rounded-xl p-4 border ${
                    rec.type === "up"
                      ? "bg-[hsl(var(--success))]/10 border-[hsl(var(--success))]/30"
                      : rec.type === "down"
                      ? "bg-[hsl(var(--physics))]/10 border-[hsl(var(--physics))]/30"
                      : "bg-accent/10 border-accent/30"
                  }`}
                >
                  <div className="text-sm font-bold mb-1">
                    {rec.emoji} {rec.subject.charAt(0).toUpperCase() + rec.subject.slice(1)}
                  </div>
                  <div className="text-xs text-muted-foreground mb-2">{rec.reason}</div>
                  <div className="text-xs font-semibold">
                    Level {rec.currentLevel} → Level {rec.recommendedLevel}{" "}
                    {rec.recommendedLevel !== rec.currentLevel && (
                      <span className="text-accent">
                        ({LEVELS[rec.recommendedLevel - 1]?.name})
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <Button
              onClick={() => navigate("/test")}
              className="w-full bg-accent text-accent-foreground hover:bg-accent/90 active:scale-[0.97] transition-transform mt-2"
              size="sm"
            >
              Start Recommended Test
            </Button>
          </div>
        )}

        {/* Score Overview */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <ScoreCard icon={<Target className="w-5 h-5 text-accent" />} label="Score" value={`${score}/${maxScore}`} sub={`${percentage.toFixed(1)}%`} />
          <ScoreCard icon={<CheckCircle2 className="w-5 h-5 text-[hsl(var(--success))]" />} label="Correct" value={`${totalCorrect}`} sub={`of ${totalAttempted} attempted`} />
          <ScoreCard icon={<Clock className="w-5 h-5 text-[hsl(var(--physics))]" />} label="Time Taken" value={formatTime(totalTimeTaken)} sub={`of ${totalTimerMinutes || 60}m`} />
          <ScoreCard icon={<AlertTriangle className="w-5 h-5 text-destructive" />} label="Silly Errors" value={`${sillyErrors.length}`} sub={sillyErrors.length > 0 ? "Review below" : "Great focus!"} />
        </div>

        {/* Level Progress & Confidence Gap */}
        <div className="grid md:grid-cols-2 gap-4">
          <div className="bg-card rounded-xl border p-5">
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <Trophy className="w-4 h-4 text-accent" /> Level Progress
            </h3>
            <div className="flex items-center gap-3 mb-2">
              <span className="text-xs text-muted-foreground">Level {currentLevel}</span>
              <div className="flex-1">
                <Progress value={progressToNext} className="h-2.5" />
              </div>
              <span className="text-xs text-muted-foreground">Level {Math.min(5, currentLevel + 1)}</span>
            </div>
            <p className="text-xs text-muted-foreground">
              {percentage >= unlockThreshold
                ? `✅ You scored ${percentage.toFixed(0)}% — threshold met!`
                : `Need ${unlockThreshold}% to unlock next level (currently ${percentage.toFixed(0)}%)`}
            </p>
          </div>

          {confidence && (
            <div className="bg-card rounded-xl border p-5">
              <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                <Brain className="w-4 h-4 text-accent" /> Confidence Gap
              </h3>
              <div className="flex items-center gap-4">
                <div className="text-center">
                  <div className="text-xs text-muted-foreground mb-1">Your Confidence</div>
                  <div className="text-lg font-bold capitalize">{confidence}</div>
                </div>
                <div className="text-2xl text-muted-foreground">→</div>
                <div className="text-center">
                  <div className="text-xs text-muted-foreground mb-1">Actual Score</div>
                  <div className="text-lg font-bold">{percentage.toFixed(0)}%</div>
                </div>
                <div className="ml-auto text-right">
                  <div className={`text-sm font-bold ${confidenceColor}`}>{confidenceLabel}</div>
                  <div className="text-xs text-muted-foreground">
                    {confidenceGap > 0 ? "Lower expectations slightly" : confidenceGap < 0 ? "You're better than you think!" : "Perfect self-assessment"}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Charts Row */}
        <section className={`grid gap-6 ${showRadarChart ? "md:grid-cols-3" : "md:grid-cols-2"}`}>
          {showRadarChart && (
            <div className="bg-card rounded-xl border p-5">
              <h3 className="text-sm font-semibold mb-4">Subject Balance</h3>
              <ResponsiveContainer width="100%" height={220}>
                <RadarChart data={radarData}>
                  <PolarGrid stroke="hsl(214, 20%, 90%)" />
                  <PolarAngleAxis dataKey="subject" tick={{ fontSize: 11 }} />
                  <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fontSize: 10 }} />
                  <Radar name="Accuracy" dataKey="accuracy" stroke="hsl(217, 91%, 60%)" fill="hsl(217, 91%, 60%)" fillOpacity={0.3} />
                  <Radar name="Score %" dataKey="score" stroke="hsl(38, 92%, 50%)" fill="hsl(38, 92%, 50%)" fillOpacity={0.2} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          )}

          <div className="bg-card rounded-xl border p-5">
            <h3 className="text-sm font-semibold mb-4">Accuracy Rate</h3>
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={pieData} cx="50%" cy="50%" innerRadius={45} outerRadius={75} dataKey="value" paddingAngle={3}>
                  {pieData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                </Pie>
                <Tooltip formatter={(value: number) => [`${value} questions`, ""]} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>

          <div className="space-y-3">
            {subjects.map((subj) => (
              <div key={subj.key} className="bg-card rounded-xl border p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-md ${
                    subj.key === "physics" ? "subject-physics" : subj.key === "chemistry" ? "subject-chemistry" : "subject-math"
                  }`}>{subj.label}</span>
                  <span className="text-sm font-semibold">{subj.data.score}/{subj.data.maxScore}</span>
                </div>
                <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
                  <div className="h-full rounded-full transition-all duration-500" style={{ width: `${subj.data.accuracy}%`, backgroundColor: subj.color }} />
                </div>
                <div className="flex justify-between text-xs text-muted-foreground mt-1.5">
                  <span>{subj.data.correct}✓ {subj.data.incorrect}✗ {subj.data.unattempted}–</span>
                  <span>{subj.data.accuracy.toFixed(0)}%</span>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Time Bar Chart */}
        <section className="bg-card rounded-xl border p-5">
          <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
            <Clock className="w-4 h-4" /> Time Spent per Question vs. 2-min Average
          </h3>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={timeBarData} margin={{ top: 5, right: 5, bottom: 5, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(214, 20%, 90%)" />
              <XAxis dataKey="name" tick={{ fontSize: 9 }} interval={1} />
              <YAxis tick={{ fontSize: 10 }} label={{ value: "seconds", angle: -90, position: "insideLeft", style: { fontSize: 10 } }} />
              <Tooltip formatter={(value: number) => [`${value}s`, "Time spent"]} />
              <ReferenceLine y={120} stroke="hsl(0, 72%, 51%)" strokeDasharray="5 5" label={{ value: "2 min avg", position: "right", style: { fontSize: 10, fill: "hsl(0, 72%, 51%)" } }} />
              <Bar dataKey="time" radius={[3, 3, 0, 0]}>
                {timeBarData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </section>

        {/* Topic Heatmap */}
        <section>
          <h2 className="font-semibold text-base mb-4 flex items-center gap-2">
            <TrendingUp className="w-4 h-4" /> Topic-wise Performance
          </h2>
          <div className={`grid gap-4 ${subjects.length >= 3 ? "md:grid-cols-3" : subjects.length === 2 ? "md:grid-cols-2" : "md:grid-cols-1"}`}>
            {subjects.map((subj) => (
              <div key={subj.key} className="bg-card rounded-xl border p-5 space-y-2">
                <span className={`text-xs font-semibold px-2.5 py-1 rounded-md inline-block ${
                  subj.key === "physics" ? "subject-physics" : subj.key === "chemistry" ? "subject-chemistry" : "subject-math"
                }`}>{subj.label}</span>
                {Object.entries(subj.data.topics).map(([topic, d]) => {
                  const acc = d.total > 0 ? (d.correct / d.total) * 100 : 0;
                  return (
                    <div key={topic} className="flex items-center gap-2 text-xs">
                      <div className={`w-2 h-2 rounded-full shrink-0 ${acc >= 80 ? "bg-[hsl(var(--success))]" : acc >= 50 ? "bg-accent" : "bg-destructive"}`} />
                      <span className="truncate flex-1">{topic}</span>
                      <span className="text-muted-foreground">{d.correct}/{d.total}</span>
                    </div>
                  );
                })}
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
                  <div className="text-xs text-muted-foreground mt-1">Time: {formatTime(err.timeSpent)} • Difficulty: {err.difficulty}</div>
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
              <p className="text-sm text-muted-foreground mb-3">Based on your performance, revise these topics:</p>
              <div className="space-y-2">
                {weakTopics.map((wt, i) => (
                  <div key={i} className="flex items-center gap-3 text-sm">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded ${
                      wt.subject === "Physics" ? "subject-physics" : wt.subject === "Chemistry" ? "subject-chemistry" : "subject-math"
                    }`}>{wt.subject}</span>
                    <span className="font-medium">{wt.topic}</span>
                    <span className="text-xs text-muted-foreground ml-auto">{wt.accuracy.toFixed(0)}%</span>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* Question Review */}
        <section>
          <h2 className="font-semibold text-base mb-4">Question-wise Review</h2>
          <div className="space-y-2">
            {questions.map((q, i) => {
              const state = questionStates[i];
              const isCorrect = state.selectedAnswer?.trim() === q.correctAnswer.trim();
              const attempted = state.status === "answered";
              return (
                <div key={q.id} className="border rounded-lg overflow-hidden">
                  <button onClick={() => setExpandedQ(expandedQ === i ? null : i)}
                    className="w-full flex items-center gap-3 p-3 text-left hover:bg-secondary/50 transition-colors active:scale-[0.995]">
                    {attempted ? (isCorrect ? <CheckCircle2 className="w-4 h-4 text-[hsl(var(--success))] shrink-0" /> : <XCircle className="w-4 h-4 text-destructive shrink-0" />) : <MinusCircle className="w-4 h-4 text-muted-foreground shrink-0" />}
                    <span className="text-sm font-medium">Q{i + 1}</span>
                    <span className={`text-xs px-2 py-0.5 rounded ${q.subject === "physics" ? "subject-physics" : q.subject === "chemistry" ? "subject-chemistry" : "subject-math"}`}>{q.topic}</span>
                    <span className="text-xs text-muted-foreground ml-auto">{formatTime(state.timeSpent)}</span>
                  </button>
                  {expandedQ === i && (
                    <div className="p-4 border-t bg-muted/30 space-y-3">
                      <MathRenderer>{q.text}</MathRenderer>
                      {attempted && (
                        <div className="text-sm">
                          Your answer: <span className={isCorrect ? "text-[hsl(var(--success))] font-medium" : "text-destructive font-medium"}>{state.selectedAnswer}</span>
                          {!isCorrect && <> • Correct: <span className="text-[hsl(var(--success))] font-medium">{q.correctAnswer}</span></>}
                        </div>
                      )}
                      <div className="text-sm bg-card rounded-lg p-3 border">
                        <div className="text-xs font-medium text-muted-foreground mb-1">Explanation</div>
                        <MathRenderer>{q.explanation}</MathRenderer>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        <div className="flex gap-3 pb-8">
          <Button variant="outline" onClick={() => navigate("/")} className="active:scale-[0.97] transition-transform">
            <ArrowLeft className="w-4 h-4 mr-2" /> Back to Dashboard
          </Button>
          {sessionStorage.getItem("lastSessionId") && (
            <Button variant="outline" onClick={() => navigate(`/analysis/${sessionStorage.getItem("lastSessionId")}`)} className="active:scale-[0.97] transition-transform">
              View Detailed Analysis
            </Button>
          )}
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
