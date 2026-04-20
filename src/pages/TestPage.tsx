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

const SUBJECT_ORDER = ["physics", "chemistry", "math"] as const;
const SUBJECT_LABELS: Record<string, string> = { physics: "Physics", chemistry: "Chemistry", math: "Mathematics" };

const TestPage = () => {
  const navigate = useNavigate();
  const [preTestConfig, setPreTestConfig] = useState<PreTestConfig | null>(null);
  const [session, setSession] = useState<TestSession | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState("");
  const [dbSessionId, setDbSessionId] = useState<string | null>(null);
  const [dbQuestionIds, setDbQuestionIds] = useState<string[]>([]);
  const [activeSection, setActiveSection] = useState<string>("physics");

  const questionTimerRef = useRef<number>(0);
  const lastTickRef = useRef<number>(Date.now());

  // Check for exam mode from sessionStorage (set by Index page)
  useEffect(() => {
    const examMode = sessionStorage.getItem("examMode");
    if (examMode) {
      sessionStorage.removeItem("examMode");
      const examDifficulty = sessionStorage.getItem("examDifficulty") || "medium";
      sessionStorage.removeItem("examDifficulty");
      const examConfig: PreTestConfig = {
        level: examMode === "jee_advanced_2026" ? 5 : 3,
        confidence: "high",
        chapterName: null,
        selections: [],
        totalTimerMinutes: 180,
        totalQuestions: examMode === "jee_mains_2026" ? 75 : 54,
        includeInteger: true,
        examMode,
        examDifficulty,
      };
      setPreTestConfig(examConfig);
      setLoading(true);
      setLoadingMessage(`Generating ${examMode === "jee_mains_2026" ? "JEE Mains 2026" : "JEE Advanced 2026"} paper...`);
    }
  }, []);

  const handlePreTestStart = (config: PreTestConfig) => {
    setPreTestConfig(config);
    setLoading(true);
    const subjectNames = config.selections?.map((s) => s.subject).join(", ") || "all subjects";
    setLoadingMessage(`Generating Level ${config.level} questions for ${subjectNames}...`);
  };

  // Generate questions via AI after pre-test config
  useEffect(() => {
    if (!preTestConfig || !loading) return;

    const generateQuestions = async () => {
      try {
        // Build edge function request body
        const requestBody: any = { level: preTestConfig.level, includeInteger: preTestConfig.includeInteger ?? true };

        // If exam mode, pass it directly
        if (preTestConfig.examMode) {
          requestBody.examMode = preTestConfig.examMode;
          if (preTestConfig.examDifficulty) {
            requestBody.difficulty = preTestConfig.examDifficulty;
          }
        }

        if (preTestConfig.selections && preTestConfig.selections.length > 0) {
          requestBody.selections = preTestConfig.selections.map((sel) => ({
            subject: sel.subject,
            chapters: sel.chapters,
            level: sel.level || preTestConfig.level,
            totalQuestions: sel.totalQuestions || 10,
            questionsPerChapter: sel.questionsPerChapter || undefined,
          }));
          requestBody.total_questions = preTestConfig.totalQuestions || preTestConfig.selections.length * 10;
        } else if (preTestConfig.chapterName) {
          requestBody.chapter_name = preTestConfig.chapterName;
        }

        const { data, error } = await supabase.functions.invoke("generate-questions", {
          body: requestBody,
        });

        if (error) throw error;
        if (!data?.questions || !Array.isArray(data.questions)) {
          throw new Error("Invalid response from AI");
        }

        // Get the list of selected subject keys for filtering
        const selectedSubjectKeys = preTestConfig.selections?.map(s => s.subject) || [];

        let questions: Question[] = data.questions.map((q: any, i: number) => {
          // Normalize subject: treat "mathematics", "maths", "math" all as "math"
          let subject = (q.subject || "").toLowerCase().trim();
          if (subject === "mathematics" || subject === "maths") subject = "math";

          return {
            id: i + 1,
            subject,
            type: q.type,
            difficulty: q.difficulty,
            text: q.text || q.question_text,
            options: q.options || undefined,
            correctAnswer: q.correctAnswer || q.correct_answer,
            explanation: q.explanation || q.solution,
            topic: q.topic || q.chapter,
            marks: q.marks || 4,
            negativeMarks: q.negativeMarks ?? (q.type === "numerical" ? 0 : 1),
            paragraph: q.paragraph || "",
            paragraphId: q.paragraphId || "",
            section: q.section || "",
          } as any;
        }).filter((q: Question) => {
          if (selectedSubjectKeys.length === 0) return true;
          return selectedSubjectKeys.includes(q.subject);
        });

        // Sort by subject then type
        const subjectOrder: Record<string, number> = { physics: 0, chemistry: 1, math: 2 };
        const typeOrder: Record<string, number> = { mcq: 0, single_correct: 0, multiple_correct: 1, comprehension: 2, numerical: 3, integer: 4 };
        questions.sort((a, b) => {
          const subDiff = (subjectOrder[a.subject] ?? 9) - (subjectOrder[b.subject] ?? 9);
          if (subDiff !== 0) return subDiff;
          return (typeOrder[a.type] ?? 5) - (typeOrder[b.type] ?? 5);
        });

        // Re-number IDs after sort
        questions.forEach((q, i) => { q.id = i + 1; });

        // Set active section to first question's subject
        if (questions.length > 0) {
          setActiveSection(questions[0].subject);
        }

        setLoadingMessage("Saving to database...");

        // Calculate total time in seconds from per-subject timers
        const totalTimeSeconds = (preTestConfig.totalTimerMinutes || 60) * 60;

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

        const questionRows = questions.map((q, i) => {
          const para = (q as any).paragraph;
          const textWithPara = para
            ? `<<<PARAGRAPH>>>\n${para}\n<<<END_PARAGRAPH>>>\n${q.text}`
            : q.text;
          return {
            session_id: sessionData.id,
            question_index: i,
            subject: q.subject as string,
            type: q.type as string,
            difficulty: q.difficulty as string,
            text: textWithPara,
            options: q.options ? JSON.parse(JSON.stringify(q.options)) : null,
            correct_answer: q.correctAnswer,
            explanation: q.explanation,
            topic: q.topic,
            marks: q.marks,
            negative_marks: q.negativeMarks,
          };
        });

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
        if (questionStates.length > 0) {
          questionStates[0].status = "not-answered";
        }

        setSession({
          questions,
          questionStates,
          currentQuestionIndex: 0,
          totalTime: totalTimeSeconds,
          startTime: Date.now(),
          isSubmitted: false,
        });
        setLoading(false);
      } catch (err: any) {
        console.error("Failed to generate questions:", err);
        toast.error("Failed to generate questions. Using sample questions instead.");

        const { sampleQuestions } = await import("@/data/questions");
        const totalTimeSeconds = (preTestConfig.totalTimerMinutes || 60) * 60;

        const selectedSubjectKeys = preTestConfig.selections?.map(s => s.subject) || [];
        const filtered = selectedSubjectKeys.length > 0
          ? sampleQuestions.filter(q => selectedSubjectKeys.includes(q.subject))
          : sampleQuestions;

        const questionStates: QuestionState[] = filtered.map((q) => ({
          questionId: q.id,
          status: "not-visited" as const,
          selectedAnswer: null,
          timeSpent: 0,
        }));
        if (questionStates.length > 0) {
          questionStates[0].status = "not-answered";
        }

        setSession({
          questions: filtered,
          questionStates,
          currentQuestionIndex: 0,
          totalTime: totalTimeSeconds,
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
    setSession((prev) => {
      if (!prev) return prev;
      const states = [...prev.questionStates];
      const updatedState = {
        ...states[prev.currentQuestionIndex],
        timeSpent: states[prev.currentQuestionIndex].timeSpent + questionTimerRef.current,
      };
      states[prev.currentQuestionIndex] = updatedState;
      questionTimerRef.current = 0;
      lastTickRef.current = Date.now();
      syncResponseToDb(prev.currentQuestionIndex, updatedState);
      if (states[index].status === "not-visited") {
        states[index] = { ...states[index], status: "not-answered" };
      }
      // Update active section
      const newSubject = prev.questions[index]?.subject;
      if (newSubject) setActiveSection(newSubject);
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

    const finalStates = [...session.questionStates];
    finalStates[session.currentQuestionIndex] = {
      ...finalStates[session.currentQuestionIndex],
      timeSpent: finalStates[session.currentQuestionIndex].timeSpent + questionTimerRef.current,
    };
    questionTimerRef.current = 0;

    const finalSession = { ...session, questionStates: finalStates };
    const result = calculateResults(finalSession);

    const percentage = result.maxScore > 0 ? (result.score / result.maxScore) * 100 : 0;
    const currentLevel = preTestConfig?.level || 3;
    let recommendedLevel = currentLevel;
    if (percentage >= 90) recommendedLevel = Math.min(currentLevel + 1, 5);
    else if (percentage >= 80) recommendedLevel = currentLevel;
    else if (percentage >= 60) recommendedLevel = Math.max(currentLevel - 1, 1);
    else if (percentage >= 40) recommendedLevel = Math.max(Math.min(currentLevel - 2, 2), 1);
    else if (percentage >= 20) recommendedLevel = currentLevel >= 4 ? 1 : Math.max(currentLevel - 2, 1);
    else recommendedLevel = 1;

    const testedSubjects = preTestConfig?.selections?.map((s) => s.subject) || ["physics", "chemistry", "math"];

    const enrichedResult = {
      ...result,
      confidence: preTestConfig?.confidence || null,
      level: currentLevel,
      chapterName: preTestConfig?.chapterName || null,
      recommendedLevel,
      testedSubjects,
      totalTimerMinutes: preTestConfig?.totalTimerMinutes || 60,
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

  const stats = {
    answered: session.questionStates.filter((s) => s.status === "answered").length,
    notAnswered: session.questionStates.filter((s) => s.status === "not-answered").length,
    marked: session.questionStates.filter((s) => s.status === "marked").length,
    notVisited: session.questionStates.filter((s) => s.status === "not-visited").length,
  };

  const renderPaletteButton = (q: Question, idx: number) => {
    const st = session.questionStates[idx];
    const paletteClass =
      st.status === "answered" ? "palette-answered" :
      st.status === "not-answered" ? "palette-not-answered" :
      st.status === "marked" ? "palette-marked" : "palette-not-visited";
    return (
      <button key={idx} onClick={() => goToQuestion(idx)}
        className={`question-palette-btn ${paletteClass} ${idx === session.currentQuestionIndex ? "palette-current" : ""} active:scale-[0.95] transition-transform`}>
        {idx + 1}
      </button>
    );
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

      {/* Section tabs */}
      <div className="flex border-b bg-card">
        {SUBJECT_ORDER.map((subj) => {
          const firstIdx = session.questions.findIndex(q => q.subject === subj);
          if (firstIdx === -1) return null;
          const isActive = activeSection === subj;
          const subjectCounts = session.questions.filter(q => q.subject === subj);
          const singleCount = subjectCounts.filter(q => q.type === "mcq" || q.type === "single_correct").length;
          const multiCount = subjectCounts.filter(q => q.type === "multiple_correct").length;
          const compCount = subjectCounts.filter(q => q.type === "comprehension").length;
          const intCount = subjectCounts.filter(q => q.type === "integer" || q.type === "numerical").length;
          return (
            <button
              key={subj}
              onClick={() => {
                saveCurrentQuestionTime();
                goToQuestion(firstIdx);
                setActiveSection(subj);
              }}
              className={`flex-1 py-2.5 text-xs font-semibold transition-colors border-b-2 ${
                isActive
                  ? "border-accent text-accent"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {SUBJECT_LABELS[subj]}
              <span className="block text-[10px] font-normal opacity-70 mt-0.5">
                {singleCount}S · {multiCount}M · {compCount}C · {intCount}Int
              </span>
            </button>
          );
        })}
      </div>

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

            <div className="mb-8 space-y-3">
              <div className="text-sm font-medium text-muted-foreground">
                Question {session.currentQuestionIndex + 1}
                {currentQ.type === "numerical" && (
                  <span className="ml-2 px-2 py-0.5 bg-secondary rounded text-xs">Numerical</span>
                )}
                {currentQ.type === "integer" && (
                  <span className="ml-2 px-2 py-0.5 bg-secondary rounded text-xs">Integer</span>
                )}
              </div>

              {currentQ.type === "multiple_correct" && (
                <div className="text-xs px-2.5 py-1 rounded-md bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300 font-medium w-fit">
                  ✦ Multiple Correct — one or more options may be correct
                </div>
              )}
              {currentQ.type === "single_correct" && (
                <div className="text-xs px-2.5 py-1 rounded-md bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 font-medium w-fit">
                  Single Correct Choice
                </div>
              )}
              {currentQ.type === "comprehension" && (
                <div className="text-xs px-2.5 py-1 rounded-md bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 font-medium w-fit">
                  📄 Comprehension Based
                </div>
              )}

              {(currentQ as any).paragraph && (
                <div className="bg-amber-50 dark:bg-amber-900/10 border border-amber-200/50 rounded-lg p-3 text-sm text-foreground/80 leading-relaxed">
                  <div className="text-xs font-semibold text-amber-700 dark:text-amber-400 mb-1">📄 Passage</div>
                  <MathRenderer>{(currentQ as any).paragraph}</MathRenderer>
                </div>
              )}

              <div className="text-base leading-relaxed">
                <MathRenderer>{currentQ.text}</MathRenderer>
              </div>
            </div>

            {(currentQ.type === "mcq" || currentQ.type === "single_correct" || currentQ.type === "comprehension" || currentQ.type === "multiple_correct") && currentQ.options ? (
              <div className="space-y-3">
                {currentQ.options.map((opt) => {
                  const isMulti = currentQ.type === "multiple_correct";
                  const selectedSet = new Set(
                    (currentState.selectedAnswer || "").split(",").map(s => s.trim()).filter(Boolean)
                  );
                  const isSelected = isMulti
                    ? selectedSet.has(opt.id)
                    : currentState.selectedAnswer === opt.id;

                  return (
                    <button
                      key={opt.id}
                      onClick={() => {
                        if (isMulti) {
                          const next = new Set(selectedSet);
                          if (next.has(opt.id)) next.delete(opt.id);
                          else next.add(opt.id);
                          const sorted = ["a", "b", "c", "d"].filter(x => next.has(x)).join(",");
                          if (sorted) selectAnswer(sorted);
                          else clearAnswer();
                        } else {
                          selectAnswer(opt.id);
                        }
                      }}
                      className={`w-full text-left p-4 rounded-lg border-2 transition-all duration-150 active:scale-[0.99] ${
                        isSelected
                          ? "border-accent bg-accent/10 shadow-sm"
                          : "border-border hover:border-muted-foreground/30 hover:shadow-sm"
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <span className={`w-7 h-7 ${isMulti ? "rounded-md" : "rounded-full"} flex items-center justify-center text-xs font-semibold shrink-0 mt-0.5 ${
                          isSelected
                            ? "bg-accent text-accent-foreground"
                            : "bg-secondary text-muted-foreground"
                        }`}>
                          {opt.id.toUpperCase()}
                        </span>
                        <MathRenderer>{opt.text}</MathRenderer>
                      </div>
                    </button>
                  );
                })}
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
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="flex items-center gap-2"><span className="w-3 h-3 rounded bg-success" /> Answered: {stats.answered}</div>
              <div className="flex items-center gap-2"><span className="w-3 h-3 rounded bg-destructive" /> Not Answered: {stats.notAnswered}</div>
              <div className="flex items-center gap-2"><span className="w-3 h-3 rounded bg-[hsl(var(--physics))]" /> Marked: {stats.marked}</div>
              <div className="flex items-center gap-2"><span className="w-3 h-3 rounded bg-secondary" /> Not Visited: {stats.notVisited}</div>
            </div>

            {/* Grouped palette by subject with MCQ/Integer rows */}
            {SUBJECT_ORDER.map((subj) => {
              const subjQuestions = session.questions
                .map((q, idx) => ({ q, idx }))
                .filter(({ q }) => q.subject === subj);
              if (subjQuestions.length === 0) return null;

              const singleQs = subjQuestions.filter(({ q }) => q.type === "mcq" || q.type === "single_correct");
              const multiQs = subjQuestions.filter(({ q }) => q.type === "multiple_correct");
              const compQs = subjQuestions.filter(({ q }) => q.type === "comprehension");
              const intQs = subjQuestions.filter(({ q }) => q.type === "integer" || q.type === "numerical");

              return (
                <div key={subj} className="mb-4">
                  <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5">
                    {SUBJECT_LABELS[subj]}
                  </div>
                  {singleQs.length > 0 && (
                    <>
                      <div className="text-[9px] text-muted-foreground mb-1">Single Correct</div>
                      <div className="flex flex-wrap gap-1.5 mb-2">
                        {singleQs.map(({ q, idx }) => renderPaletteButton(q, idx))}
                      </div>
                    </>
                  )}
                  {multiQs.length > 0 && (
                    <>
                      <div className="text-[9px] text-muted-foreground mb-1">Multiple Correct</div>
                      <div className="flex flex-wrap gap-1.5 mb-2">
                        {multiQs.map(({ q, idx }) => renderPaletteButton(q, idx))}
                      </div>
                    </>
                  )}
                  {compQs.length > 0 && (
                    <>
                      <div className="text-[9px] text-muted-foreground mb-1">Comprehension</div>
                      <div className="flex flex-wrap gap-1.5 mb-2">
                        {compQs.map(({ q, idx }) => renderPaletteButton(q, idx))}
                      </div>
                    </>
                  )}
                  {intQs.length > 0 && (
                    <>
                      <div className="text-[9px] text-muted-foreground mb-1">Integer</div>
                      <div className="flex flex-wrap gap-1.5">
                        {intQs.map(({ q, idx }) => renderPaletteButton(q, idx))}
                      </div>
                    </>
                  )}
                </div>
              );
            })}
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

export default TestPage;
