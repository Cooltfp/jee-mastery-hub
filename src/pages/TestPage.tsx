import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Question } from "@/data/questions";
import { QuestionState, TestSession, calculateResults } from "@/lib/testStore";
import { supabase } from "@/integrations/supabase/client";
import { getDeviceId, checkAndUnlockLevel } from "@/lib/levelSystem";
import PreTestDialog, { PreTestConfig } from "@/components/PreTestDialog";
import MathRenderer from "@/components/MathRenderer";
import { Button } from "@/components/ui/button";
import { Clock, ChevronLeft, ChevronRight, Flag, Send, AlertTriangle, Loader2 } from "lucide-react";
import { toast } from "sonner";

const TOTAL_TIME = 60 * 60;

const TestPage = () => {
  const navigate = useNavigate();
  const [preTestConfig, setPreTestConfig] = useState<PreTestConfig | null>(null);
  const [session, setSession] = useState<TestSession | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState("");
  const [dbSessionId, setDbSessionId] = useState<string | null>(null);
  const [dbQuestionIds, setDbQuestionIds] = useState<string[]>([]);

  const questionTimerRef = useRef<number>(0);
  const lastTickRef = useRef<number>(Date.now());

  const handlePreTestStart = (config: PreTestConfig) => {
    setPreTestConfig(config);
    setLoading(true);
    setLoadingMessage(`Generating Level ${config.level} questions${config.chapterName ? ` for ${config.chapterName}` : ""}...`);
  };

  // Generate questions via AI after pre-test config
  useEffect(() => {
    if (!preTestConfig || !loading) return;

    const generateQuestions = async () => {
      try {
        const { data, error } = await supabase.functions.invoke("generate-questions", {
          body: { level: preTestConfig.level, chapter_name: preTestConfig.chapterName },
        });

        if (error) throw error;
        if (!data?.questions || !Array.isArray(data.questions)) {
          throw new Error("Invalid response from AI");
        }

        const questions: Question[] = data.questions.map((q: any, i: number) => {
          // Normalize subject: treat "mathematics", "maths", "math" all as "math"
          let subject = (q.subject || "").toLowerCase().trim();
          if (subject === "mathematics" || subject === "maths") subject = "math";

          return {
            id: i + 1,
            subject,
            type: q.type,
            difficulty: q.difficulty,
            text: q.text,
            options: q.options || undefined,
            correctAnswer: q.correctAnswer,
            explanation: q.explanation,
            topic: q.topic,
            marks: q.marks || 4,
            negativeMarks: q.negativeMarks ?? (q.type === "numerical" ? 0 : 1),
          };
        });

        setLoadingMessage("Saving to database...");

        const deviceId = getDeviceId();
        const { data: sessionData, error: sessionError } = await supabase
          .from("test_sessions")
          .insert({
            is_completed: false,
            confidence: preTestConfig.confidence,
            level: preTestConfig.level,
            chapter_name: preTestConfig.chapterName,
            device_id: deviceId,
          })
          .select()
          .single();

        if (sessionError) throw sessionError;
        setDbSessionId(sessionData.id);

        const questionRows = questions.map((q, i) => ({
          session_id: sessionData.id,
          question_index: i,
          subject: q.subject as string,
          type: q.type as string,
          difficulty: q.difficulty as string,
          text: q.text,
          options: q.options ? JSON.parse(JSON.stringify(q.options)) : null,
          correct_answer: q.correctAnswer,
          explanation: q.explanation,
          topic: q.topic,
          marks: q.marks,
          negative_marks: q.negativeMarks,
        }));

        const { data: savedQuestions, error: qError } = await supabase
          .from("questions")
          .insert(questionRows)
          .select();

        if (qError) throw qError;

        const sortedQIds = savedQuestions
          .sort((a: any, b: any) => a.question_index - b.question_index)
          .map((q: any) => q.id);
        setDbQuestionIds(sortedQIds);

        const responseRows = sortedQIds.map((qId: string) => ({
          session_id: sessionData.id,
          question_id: qId,
          status: "not-visited",
          time_spent: 0,
        }));
        await supabase.from("user_responses").insert(responseRows);

        const questionStates: QuestionState[] = questions.map((q) => ({
          questionId: q.id,
          status: "not-visited" as const,
          selectedAnswer: null,
          timeSpent: 0,
        }));
        questionStates[0].status = "not-answered";

        setSession({
          questions,
          questionStates,
          currentQuestionIndex: 0,
          totalTime: TOTAL_TIME,
          startTime: Date.now(),
          isSubmitted: false,
        });
        setLoading(false);
      } catch (err: any) {
        console.error("Failed to generate questions:", err);
        toast.error("Failed to generate questions. Using sample questions instead.");

        const { sampleQuestions } = await import("@/data/questions");
        const questionStates: QuestionState[] = sampleQuestions.map((q) => ({
          questionId: q.id,
          status: "not-visited" as const,
          selectedAnswer: null,
          timeSpent: 0,
        }));
        questionStates[0].status = "not-answered";

        setSession({
          questions: sampleQuestions,
          questionStates,
          currentQuestionIndex: 0,
          totalTime: TOTAL_TIME,
          startTime: Date.now(),
          isSubmitted: false,
        });
        setLoading(false);
      }
    };

    generateQuestions();
  }, [preTestConfig]);

  // Timer
  useEffect(() => {
    if (!session || loading) return;
    const interval = setInterval(() => {
      const now = Date.now();
      const delta = (now - lastTickRef.current) / 1000;
      lastTickRef.current = now;
      questionTimerRef.current += delta;

      setSession((prev) => {
        if (!prev) return prev;
        const newTime = prev.totalTime - delta;
        if (newTime <= 0) {
          clearInterval(interval);
          return { ...prev, totalTime: 0, isSubmitted: true };
        }
        return { ...prev, totalTime: newTime };
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [session, loading]);

  useEffect(() => {
    if (session && session.totalTime <= 0 && !session.isSubmitted) {
      handleSubmit();
    }
  }, [session?.totalTime]);

  const saveCurrentQuestionTime = useCallback(() => {
    setSession((prev) => {
      if (!prev) return prev;
      const states = [...prev.questionStates];
      states[prev.currentQuestionIndex] = {
        ...states[prev.currentQuestionIndex],
        timeSpent: states[prev.currentQuestionIndex].timeSpent + questionTimerRef.current,
      };
      return { ...prev, questionStates: states };
    });
    questionTimerRef.current = 0;
    lastTickRef.current = Date.now();
  }, []);

  const syncResponseToDb = useCallback(async (index: number, state: QuestionState) => {
    if (!dbSessionId || !dbQuestionIds[index]) return;
    await supabase.from("user_responses").update({
      selected_answer: state.selectedAnswer,
      status: state.status,
      time_spent: state.timeSpent,
    }).eq("session_id", dbSessionId).eq("question_id", dbQuestionIds[index]);
  }, [dbSessionId, dbQuestionIds]);

  const goToQuestion = useCallback((index: number) => {
    saveCurrentQuestionTime();
    setSession((prev) => {
      if (!prev) return prev;
      const states = [...prev.questionStates];
      syncResponseToDb(prev.currentQuestionIndex, states[prev.currentQuestionIndex]);
      if (states[index].status === "not-visited") {
        states[index] = { ...states[index], status: "not-answered" };
      }
      return { ...prev, currentQuestionIndex: index, questionStates: states };
    });
  }, [saveCurrentQuestionTime, syncResponseToDb]);

  const selectAnswer = (answer: string) => {
    setSession((prev) => {
      if (!prev) return prev;
      const states = [...prev.questionStates];
      states[prev.currentQuestionIndex] = {
        ...states[prev.currentQuestionIndex],
        selectedAnswer: answer,
        status: "answered",
      };
      syncResponseToDb(prev.currentQuestionIndex, states[prev.currentQuestionIndex]);
      return { ...prev, questionStates: states };
    });
  };

  const clearAnswer = () => {
    setSession((prev) => {
      if (!prev) return prev;
      const states = [...prev.questionStates];
      states[prev.currentQuestionIndex] = {
        ...states[prev.currentQuestionIndex],
        selectedAnswer: null,
        status: "not-answered",
      };
      return { ...prev, questionStates: states };
    });
  };

  const markForReview = () => {
    setSession((prev) => {
      if (!prev) return prev;
      const states = [...prev.questionStates];
      states[prev.currentQuestionIndex] = {
        ...states[prev.currentQuestionIndex],
        status: states[prev.currentQuestionIndex].status === "marked"
          ? (states[prev.currentQuestionIndex].selectedAnswer ? "answered" : "not-answered")
          : "marked",
      };
      return { ...prev, questionStates: states };
    });
  };

  const handleSubmit = async () => {
    if (!session) return;

    // Save current question time inline to avoid stale closure
    const finalStates = [...session.questionStates];
    finalStates[session.currentQuestionIndex] = {
      ...finalStates[session.currentQuestionIndex],
      timeSpent: finalStates[session.currentQuestionIndex].timeSpent + questionTimerRef.current,
    };
    questionTimerRef.current = 0;

    const finalSession = { ...session, questionStates: finalStates };
    const result = calculateResults(finalSession);

    // Calculate adaptive recommendation
    const percentage = result.maxScore > 0 ? (result.score / result.maxScore) * 100 : 0;
    const currentLevel = preTestConfig?.level || 3;
    let recommendedLevel = currentLevel;
    if (percentage > 80 && currentLevel < 5) {
      recommendedLevel = currentLevel + 1;
    } else if (percentage < 50 && currentLevel > 1) {
      recommendedLevel = currentLevel - 1;
    }

    const enrichedResult = {
      ...result,
      confidence: preTestConfig?.confidence || null,
      level: currentLevel,
      chapterName: preTestConfig?.chapterName || null,
      recommendedLevel,
    };

    sessionStorage.setItem("testResult", JSON.stringify(enrichedResult));

    if (dbSessionId) {
      const deviceId = getDeviceId();

      await Promise.all([
        supabase.from("test_sessions").update({
          is_completed: true,
          score: result.score,
          max_score: result.maxScore,
          total_time_taken: result.totalTimeTaken,
          subject_wise: JSON.parse(JSON.stringify(result.subjectWise)),
          silly_errors: JSON.parse(JSON.stringify(result.sillyErrors)),
        }).eq("id", dbSessionId),

        supabase.from("profiles").update({
          recommended_level: recommendedLevel,
        }).eq("device_id", deviceId),
      ]);

      sessionStorage.setItem("lastSessionId", dbSessionId);
      sessionStorage.setItem("dbQuestionIds", JSON.stringify(dbQuestionIds));
    }

    setSession((prev) => prev ? { ...prev, isSubmitted: true } : prev);
    navigate("/results");
  };

  const [showConfirm, setShowConfirm] = useState(false);

  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  // Show pre-test dialog first
  if (!preTestConfig) {
    return <PreTestDialog onStart={handlePreTestStart} />;
  }

  // Loading screen
  if (loading || !session) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-4">
          <Loader2 className="w-10 h-10 animate-spin text-accent mx-auto" />
          <p className="text-muted-foreground text-sm max-w-xs">{loadingMessage}</p>
          <p className="text-xs text-muted-foreground">This may take 15–30 seconds...</p>
        </div>
      </div>
    );
  }

  const currentQ = session.questions[session.currentQuestionIndex];
  const currentState = session.questionStates[session.currentQuestionIndex];

  const getSubjectQuestions = (subject: string) =>
    session.questions.reduce<number[]>((acc, q, i) => (q.subject === subject ? [...acc, i] : acc), []);

  const physicsQs = getSubjectQuestions("physics");
  const chemistryQs = getSubjectQuestions("chemistry");
  const mathQs = getSubjectQuestions("math");

  const stats = {
    answered: session.questionStates.filter((s) => s.status === "answered").length,
    notAnswered: session.questionStates.filter((s) => s.status === "not-answered").length,
    marked: session.questionStates.filter((s) => s.status === "marked").length,
    notVisited: session.questionStates.filter((s) => s.status === "not-visited").length,
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b bg-card px-4 py-3 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <div className="font-semibold text-lg tracking-tight">JEE Mains Mock Test</div>
          <span className="text-xs px-2 py-1 rounded-md bg-secondary text-muted-foreground font-medium">
            Level {preTestConfig.level} • {session.questions.length} Qs
          </span>
          {preTestConfig.chapterName && (
            <span className="text-xs px-2 py-1 rounded-md bg-accent/10 text-accent font-medium">
              {preTestConfig.chapterName}
            </span>
          )}
        </div>
        <div className="flex items-center gap-4">
          <div className={`flex items-center gap-2 font-mono text-lg font-semibold tabular-nums ${
            session.totalTime < 300 ? "text-destructive animate-pulse" : "text-foreground"
          }`}>
            <Clock className="w-4 h-4" />
            {formatTime(session.totalTime)}
          </div>
          <Button onClick={() => setShowConfirm(true)} className="bg-accent text-accent-foreground hover:bg-accent/90 active:scale-[0.97] transition-transform">
            <Send className="w-4 h-4 mr-2" /> Submit Test
          </Button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <main className="flex-1 overflow-y-auto p-6 lg:p-8">
          <div className="max-w-3xl mx-auto">
            <div className="flex items-center gap-3 mb-6">
              <span className={`text-xs font-semibold px-2.5 py-1 rounded-md ${
                currentQ.subject === "physics" ? "subject-physics" :
                currentQ.subject === "chemistry" ? "subject-chemistry" : "subject-math"
              }`}>
                {currentQ.subject.charAt(0).toUpperCase() + currentQ.subject.slice(1)}
              </span>
              <span className="text-xs text-muted-foreground">{currentQ.topic}</span>
              <span className="ml-auto text-xs text-muted-foreground">
                +{currentQ.marks} / -{currentQ.negativeMarks} marks
              </span>
            </div>

            <div className="mb-8">
              <div className="text-sm font-medium text-muted-foreground mb-2">
                Question {session.currentQuestionIndex + 1}
                {currentQ.type === "numerical" && (
                  <span className="ml-2 px-2 py-0.5 bg-secondary rounded text-xs">Numerical</span>
                )}
              </div>
              <div className="text-base leading-relaxed">
                <MathText>{currentQ.text}</MathText>
              </div>
            </div>

            {currentQ.type === "mcq" && currentQ.options ? (
              <div className="space-y-3">
                {currentQ.options.map((opt) => (
                  <button
                    key={opt.id}
                    onClick={() => selectAnswer(opt.id)}
                    className={`w-full text-left p-4 rounded-lg border-2 transition-all duration-150 active:scale-[0.99] ${
                      currentState.selectedAnswer === opt.id
                        ? "border-accent bg-accent/10 shadow-sm"
                        : "border-border hover:border-muted-foreground/30 hover:shadow-sm"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold shrink-0 mt-0.5 ${
                        currentState.selectedAnswer === opt.id
                          ? "bg-accent text-accent-foreground"
                          : "bg-secondary text-muted-foreground"
                      }`}>
                        {opt.id.toUpperCase()}
                      </span>
                      <MathText>{opt.text}</MathText>
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <div className="max-w-xs">
                <label className="text-sm font-medium text-muted-foreground mb-2 block">Enter your answer:</label>
                <input
                  type="number"
                  value={currentState.selectedAnswer || ""}
                  onChange={(e) => {
                    if (e.target.value) selectAnswer(e.target.value);
                    else clearAnswer();
                  }}
                  className="w-full px-4 py-3 rounded-lg border-2 border-border bg-background text-foreground font-mono text-lg focus:border-accent focus:outline-none transition-colors"
                  placeholder="0"
                />
              </div>
            )}

            <div className="flex items-center gap-3 mt-8 pt-6 border-t">
              <Button variant="outline" onClick={clearAnswer} className="active:scale-[0.97] transition-transform">Clear Response</Button>
              <Button variant="outline" onClick={markForReview} className="active:scale-[0.97] transition-transform">
                <Flag className={`w-4 h-4 mr-2 ${currentState.status === "marked" ? "text-[hsl(var(--physics))]" : ""}`} />
                {currentState.status === "marked" ? "Unmark" : "Mark for Review"}
              </Button>
              <div className="ml-auto flex gap-2">
                <Button variant="outline" onClick={() => goToQuestion(Math.max(0, session.currentQuestionIndex - 1))} disabled={session.currentQuestionIndex === 0} className="active:scale-[0.97] transition-transform">
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <Button onClick={() => goToQuestion(Math.min(session.questions.length - 1, session.currentQuestionIndex + 1))} disabled={session.currentQuestionIndex === session.questions.length - 1} className="active:scale-[0.97] transition-transform">
                  <ChevronRight className="w-4 h-4 mr-1" /> Next
                </Button>
              </div>
            </div>
          </div>
        </main>

        <aside className="w-72 border-l bg-card overflow-y-auto p-4 hidden lg:block">
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="flex items-center gap-2"><span className="w-3 h-3 rounded bg-success" /> Answered: {stats.answered}</div>
              <div className="flex items-center gap-2"><span className="w-3 h-3 rounded bg-destructive" /> Not Answered: {stats.notAnswered}</div>
              <div className="flex items-center gap-2"><span className="w-3 h-3 rounded bg-[hsl(var(--physics))]" /> Marked: {stats.marked}</div>
              <div className="flex items-center gap-2"><span className="w-3 h-3 rounded bg-secondary" /> Not Visited: {stats.notVisited}</div>
            </div>
            <PaletteSection title="Physics" colorClass="subject-physics" indices={physicsQs} states={session.questionStates} currentIndex={session.currentQuestionIndex} onSelect={goToQuestion} />
            <PaletteSection title="Chemistry" colorClass="subject-chemistry" indices={chemistryQs} states={session.questionStates} currentIndex={session.currentQuestionIndex} onSelect={goToQuestion} />
            <PaletteSection title="Mathematics" colorClass="subject-math" indices={mathQs} states={session.questionStates} currentIndex={session.currentQuestionIndex} onSelect={goToQuestion} />
          </div>
        </aside>
      </div>

      {showConfirm && (
        <div className="fixed inset-0 bg-foreground/20 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-card rounded-xl shadow-xl p-6 max-w-md w-full border">
            <div className="flex items-center gap-3 mb-4">
              <AlertTriangle className="w-5 h-5 text-accent" />
              <h3 className="font-semibold text-lg">Submit Test?</h3>
            </div>
            <p className="text-muted-foreground text-sm mb-2">
              You have answered <strong>{stats.answered}</strong> out of <strong>{session.questions.length}</strong> questions.
            </p>
            {stats.notVisited > 0 && <p className="text-sm text-destructive mb-2">{stats.notVisited} questions not visited.</p>}
            {stats.marked > 0 && <p className="text-sm text-[hsl(var(--physics))] mb-2">{stats.marked} questions marked for review.</p>}
            <div className="flex gap-3 mt-6">
              <Button variant="outline" onClick={() => setShowConfirm(false)} className="flex-1 active:scale-[0.97] transition-transform">Continue Test</Button>
              <Button onClick={handleSubmit} className="flex-1 bg-accent text-accent-foreground hover:bg-accent/90 active:scale-[0.97] transition-transform">Submit</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

function PaletteSection({ title, colorClass, indices, states, currentIndex, onSelect }: {
  title: string; colorClass: string; indices: number[]; states: QuestionState[]; currentIndex: number; onSelect: (i: number) => void;
}) {
  return (
    <div>
      <div className={`text-xs font-semibold px-2 py-1 rounded-md mb-2 inline-block ${colorClass}`}>{title}</div>
      <div className="flex flex-wrap gap-2">
        {indices.map((idx) => {
          const st = states[idx];
          const paletteClass =
            st.status === "answered" ? "palette-answered" :
            st.status === "not-answered" ? "palette-not-answered" :
            st.status === "marked" ? "palette-marked" : "palette-not-visited";
          return (
            <button key={idx} onClick={() => onSelect(idx)}
              className={`question-palette-btn ${paletteClass} ${idx === currentIndex ? "palette-current" : ""} active:scale-[0.95] transition-transform`}>
              {idx + 1}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default TestPage;
