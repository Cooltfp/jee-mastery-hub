import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { sampleQuestions, Question } from "@/data/questions";
import { QuestionState, TestSession, calculateResults } from "@/lib/testStore";
import MathText from "@/components/MathText";
import { Button } from "@/components/ui/button";
import { Clock, ChevronLeft, ChevronRight, Flag, Send, AlertTriangle } from "lucide-react";

const TOTAL_TIME = 60 * 60; // 60 minutes

const TestPage = () => {
  const navigate = useNavigate();
  const [session, setSession] = useState<TestSession>(() => {
    const questions = sampleQuestions;
    const questionStates: QuestionState[] = questions.map((q) => ({
      questionId: q.id,
      status: "not-visited",
      selectedAnswer: null,
      timeSpent: 0,
    }));
    questionStates[0].status = "not-answered";
    return {
      questions,
      questionStates,
      currentQuestionIndex: 0,
      totalTime: TOTAL_TIME,
      startTime: Date.now(),
      isSubmitted: false,
    };
  });

  const questionTimerRef = useRef<number>(0);
  const lastTickRef = useRef<number>(Date.now());

  const currentQ = session.questions[session.currentQuestionIndex];
  const currentState = session.questionStates[session.currentQuestionIndex];

  // Timer
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      const delta = (now - lastTickRef.current) / 1000;
      lastTickRef.current = now;
      questionTimerRef.current += delta;

      setSession((prev) => {
        const newTime = prev.totalTime - delta;
        if (newTime <= 0) {
          clearInterval(interval);
          return { ...prev, totalTime: 0, isSubmitted: true };
        }
        return { ...prev, totalTime: newTime };
      });
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Auto-submit on time up
  useEffect(() => {
    if (session.totalTime <= 0 && !session.isSubmitted) {
      handleSubmit();
    }
  }, [session.totalTime]);

  const saveCurrentQuestionTime = useCallback(() => {
    setSession((prev) => {
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

  const goToQuestion = useCallback((index: number) => {
    saveCurrentQuestionTime();
    setSession((prev) => {
      const states = [...prev.questionStates];
      if (states[index].status === "not-visited") {
        states[index] = { ...states[index], status: "not-answered" };
      }
      return { ...prev, currentQuestionIndex: index, questionStates: states };
    });
  }, [saveCurrentQuestionTime]);

  const selectAnswer = (answer: string) => {
    setSession((prev) => {
      const states = [...prev.questionStates];
      states[prev.currentQuestionIndex] = {
        ...states[prev.currentQuestionIndex],
        selectedAnswer: answer,
        status: "answered",
      };
      return { ...prev, questionStates: states };
    });
  };

  const clearAnswer = () => {
    setSession((prev) => {
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
      const states = [...prev.questionStates];
      states[prev.currentQuestionIndex] = {
        ...states[prev.currentQuestionIndex],
        status: states[prev.currentQuestionIndex].status === "marked" ? 
          (states[prev.currentQuestionIndex].selectedAnswer ? "answered" : "not-answered") : "marked",
      };
      return { ...prev, questionStates: states };
    });
  };

  const handleSubmit = () => {
    saveCurrentQuestionTime();
    setSession((prev) => {
      const result = calculateResults(prev);
      // Store result for results page
      sessionStorage.setItem("testResult", JSON.stringify(result));
      return { ...prev, isSubmitted: true };
    });
    navigate("/results");
  };

  const [showConfirm, setShowConfirm] = useState(false);

  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

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
      {/* Header */}
      <header className="border-b bg-card px-4 py-3 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <div className="font-semibold text-lg tracking-tight">JEE Mains Mock Test</div>
          <span className="text-xs px-2 py-1 rounded-md bg-secondary text-muted-foreground font-medium">
            {session.questions.length} Questions
          </span>
        </div>
        <div className="flex items-center gap-4">
          <div className={`flex items-center gap-2 font-mono text-lg font-semibold tabular-nums ${
            session.totalTime < 300 ? "text-destructive animate-pulse-gentle" : "text-foreground"
          }`}>
            <Clock className="w-4 h-4" />
            {formatTime(session.totalTime)}
          </div>
          <Button
            onClick={() => setShowConfirm(true)}
            className="bg-accent text-accent-foreground hover:bg-accent/90 active:scale-[0.97] transition-transform"
          >
            <Send className="w-4 h-4 mr-2" />
            Submit Test
          </Button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Question Area */}
        <main className="flex-1 overflow-y-auto p-6 lg:p-8">
          <div className="max-w-3xl mx-auto">
            {/* Question header */}
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

            {/* Question number & text */}
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

            {/* Options or Numerical Input */}
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
                <label className="text-sm font-medium text-muted-foreground mb-2 block">
                  Enter your answer:
                </label>
                <input
                  type="number"
                  value={currentState.selectedAnswer || ""}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val) {
                      selectAnswer(val);
                    } else {
                      clearAnswer();
                    }
                  }}
                  className="w-full px-4 py-3 rounded-lg border-2 border-border bg-background text-foreground font-mono text-lg focus:border-accent focus:outline-none transition-colors"
                  placeholder="0"
                />
              </div>
            )}

            {/* Action buttons */}
            <div className="flex items-center gap-3 mt-8 pt-6 border-t">
              <Button variant="outline" onClick={clearAnswer} className="active:scale-[0.97] transition-transform">
                Clear Response
              </Button>
              <Button variant="outline" onClick={markForReview} className="active:scale-[0.97] transition-transform">
                <Flag className={`w-4 h-4 mr-2 ${currentState.status === "marked" ? "text-physics" : ""}`} />
                {currentState.status === "marked" ? "Unmark" : "Mark for Review"}
              </Button>
              <div className="ml-auto flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => goToQuestion(Math.max(0, session.currentQuestionIndex - 1))}
                  disabled={session.currentQuestionIndex === 0}
                  className="active:scale-[0.97] transition-transform"
                >
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <Button
                  onClick={() => goToQuestion(Math.min(session.questions.length - 1, session.currentQuestionIndex + 1))}
                  disabled={session.currentQuestionIndex === session.questions.length - 1}
                  className="active:scale-[0.97] transition-transform"
                >
                  <ChevronRight className="w-4 h-4 mr-1" />
                  Next
                </Button>
              </div>
            </div>
          </div>
        </main>

        {/* Sidebar - Question Palette */}
        <aside className="w-72 border-l bg-card overflow-y-auto p-4 hidden lg:block">
          <div className="space-y-6">
            {/* Stats */}
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="flex items-center gap-2"><span className="w-3 h-3 rounded bg-success" /> Answered: {stats.answered}</div>
              <div className="flex items-center gap-2"><span className="w-3 h-3 rounded bg-destructive" /> Not Answered: {stats.notAnswered}</div>
              <div className="flex items-center gap-2"><span className="w-3 h-3 rounded bg-physics" /> Marked: {stats.marked}</div>
              <div className="flex items-center gap-2"><span className="w-3 h-3 rounded bg-secondary" /> Not Visited: {stats.notVisited}</div>
            </div>

            {/* Physics */}
            <PaletteSection
              title="Physics"
              colorClass="subject-physics"
              indices={physicsQs}
              states={session.questionStates}
              currentIndex={session.currentQuestionIndex}
              onSelect={goToQuestion}
            />
            <PaletteSection
              title="Chemistry"
              colorClass="subject-chemistry"
              indices={chemistryQs}
              states={session.questionStates}
              currentIndex={session.currentQuestionIndex}
              onSelect={goToQuestion}
            />
            <PaletteSection
              title="Mathematics"
              colorClass="subject-math"
              indices={mathQs}
              states={session.questionStates}
              currentIndex={session.currentQuestionIndex}
              onSelect={goToQuestion}
            />
          </div>
        </aside>
      </div>

      {/* Submit Confirmation Modal */}
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
            {stats.notVisited > 0 && (
              <p className="text-sm text-destructive mb-2">{stats.notVisited} questions not visited.</p>
            )}
            {stats.marked > 0 && (
              <p className="text-sm text-physics mb-2">{stats.marked} questions marked for review.</p>
            )}
            <div className="flex gap-3 mt-6">
              <Button variant="outline" onClick={() => setShowConfirm(false)} className="flex-1 active:scale-[0.97] transition-transform">
                Continue Test
              </Button>
              <Button onClick={handleSubmit} className="flex-1 bg-accent text-accent-foreground hover:bg-accent/90 active:scale-[0.97] transition-transform">
                Submit
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

function PaletteSection({
  title,
  colorClass,
  indices,
  states,
  currentIndex,
  onSelect,
}: {
  title: string;
  colorClass: string;
  indices: number[];
  states: QuestionState[];
  currentIndex: number;
  onSelect: (i: number) => void;
}) {
  return (
    <div>
      <div className={`text-xs font-semibold px-2 py-1 rounded-md mb-2 inline-block ${colorClass}`}>
        {title}
      </div>
      <div className="flex flex-wrap gap-2">
        {indices.map((idx) => {
          const st = states[idx];
          const paletteClass =
            st.status === "answered" ? "palette-answered" :
            st.status === "not-answered" ? "palette-not-answered" :
            st.status === "marked" ? "palette-marked" : "palette-not-visited";
          return (
            <button
              key={idx}
              onClick={() => onSelect(idx)}
              className={`question-palette-btn ${paletteClass} ${idx === currentIndex ? "palette-current" : ""} active:scale-[0.95] transition-transform`}
            >
              {idx + 1}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default TestPage;
