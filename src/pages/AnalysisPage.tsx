import { useEffect, useState, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import MathRenderer from "@/components/MathRenderer";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft,
  CheckCircle2,
  XCircle,
  MinusCircle,
  Clock,
  Target,
  Bot,
  Loader2,
  Send,
  ChevronLeft,
  ChevronRight,
  Lightbulb,
  HelpCircle,
  Maximize2,
  Minimize2,
} from "lucide-react";
import { toast } from "sonner";

interface QuestionData {
  id: string;
  question_index: number;
  subject: string;
  topic: string;
  type: string;
  difficulty: string;
  text: string;
  options: any[] | null;
  correct_answer: string;
  explanation: string;
  marks: number;
  negative_marks: number;
}

interface ResponseData {
  question_id: string;
  selected_answer: string | null;
  status: string;
  time_spent: number;
}

interface SessionData {
  id: string;
  score: number | null;
  max_score: number | null;
  total_time_taken: number | null;
  level: number | null;
  chapter_name: string | null;
  created_at: string;
}

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/doubt-solver`;

const getOptionText = (opt: any): string => {
  if (typeof opt === "string") return opt;
  if (opt === null || opt === undefined) return "";
  if (typeof opt === "object") {
    return opt.text ?? opt.value ?? opt.label ?? opt.content ?? JSON.stringify(opt);
  }
  return String(opt);
};

const optionLabels = ["A", "B", "C", "D"];

const stripMarkdown = (text: string): string => {
  return text
    .replace(/^#{1,6}\s*/gm, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/^[-*]\s+/gm, "• ")
    .replace(/^\d+\.\s+/gm, (m) => m)
    .trim();
};

const AIMessage = ({ content }: { content: string }) => {
  const cleaned = stripMarkdown(content);
  const parts = cleaned.split(/(?=(?:^|\n)\d+\.\s)/);
  return (
    <div className="space-y-2">
      {parts.map((part, i) => {
        const match = part.match(/^\n?(\d+)\.\s([\s\S]*)/);
        if (match) {
          return (
            <div key={i} className="flex gap-2">
              <span className="font-bold text-accent shrink-0 min-w-[1.5rem]">{match[1]}.</span>
              <div className="flex-1">
                <MathRenderer>{match[2].trim()}</MathRenderer>
              </div>
            </div>
          );
        }
        return part.trim() ? (
          <div key={i}><MathRenderer>{part.trim()}</MathRenderer></div>
        ) : null;
      })}
    </div>
  );
};


const AnalysisPage = () => {
  const { testId } = useParams<{ testId: string }>();
  const navigate = useNavigate();
  const [sessionData, setSessionData] = useState<SessionData | null>(null);
  const [questions, setQuestions] = useState<QuestionData[]>([]);
  const [responses, setResponses] = useState<Map<string, ResponseData>>(new Map());
  const [loading, setLoading] = useState(true);
  const [currentIndex, setCurrentIndex] = useState(0);

  // Solution expanded state per question
  const [solutionOpen, setSolutionOpen] = useState<Set<string>>(new Set());

  // Constructive improvement per question
  const [improvements, setImprovements] = useState<Map<string, string>>(new Map());
  const [improvementLoading, setImprovementLoading] = useState<Set<string>>(new Set());

  // AI Doubt state per question
  const [doubtOpen, setDoubtOpen] = useState<string | null>(null);
  const [doubtInput, setDoubtInput] = useState("");
  const [doubtMessages, setDoubtMessages] = useState<
    Map<string, { role: "user" | "assistant"; content: string }[]>
  >(new Map());
  const [doubtLoading, setDoubtLoading] = useState(false);
  const [doubtFullscreen, setDoubtFullscreen] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [doubtMessages]);

  useEffect(() => {
    if (!testId) return;
    const fetchData = async () => {
      const [sessionRes, questionsRes, responsesRes] = await Promise.all([
        supabase.from("test_sessions").select("*").eq("id", testId).single(),
        supabase
          .from("questions")
          .select("*")
          .eq("session_id", testId)
          .order("question_index", { ascending: true }),
        supabase.from("user_responses").select("*").eq("session_id", testId),
      ]);

      if (sessionRes.error || !sessionRes.data) {
        toast.error("Test session not found");
        navigate("/history");
        return;
      }

      setSessionData(sessionRes.data as SessionData);

      const qs = (questionsRes.data || []).map((q: any) => ({
        ...q,
        options: Array.isArray(q.options) ? q.options : null,
      }));
      setQuestions(qs);

      const respMap = new Map<string, ResponseData>();
      (responsesRes.data || []).forEach((r: any) => {
        respMap.set(r.question_id, r);
      });
      setResponses(respMap);
      setLoading(false);
    };
    fetchData();
  }, [testId]);

  const formatTime = (s: number) => {
    if (!s || s <= 0) return null;
    if (s < 60) return `${Math.round(s)}s`;
    return `${Math.floor(s / 60)}m ${Math.round(s % 60)}s`;
  };

  const getStatus = (q: QuestionData, resp: ResponseData | undefined) => {
    if (!resp || resp.status === "not-visited" || !resp.selected_answer) return "unattempted";
    const isCorrect = resp.selected_answer.trim().toUpperCase() === q.correct_answer.trim().toUpperCase();
    return isCorrect ? "correct" : "wrong";
  };

  const correct = questions.filter((q) => getStatus(q, responses.get(q.id)) === "correct").length;
  const attempted = questions.filter((q) => responses.get(q.id)?.selected_answer).length;
  const incorrect = attempted - correct;
  const unattempted = questions.length - attempted;

  const buildContextMessage = (q: QuestionData, resp: ResponseData | undefined) => {
    const optionsText = q.options
      ? q.options.map((o, i) => `${optionLabels[i]}. ${getOptionText(o)}`).join("\n")
      : "No options (numerical type)";
    const userAnswer = resp?.selected_answer || "Not attempted";
    return `You are a JEE tutor. The student is reviewing their test. Here is the full context:

**Question:** ${q.text}

**Options:**
${optionsText}

**Correct Answer:** ${q.correct_answer}
**Student's Answer:** ${userAnswer}

**Solution/Explanation:** ${q.explanation}

You already know everything about this question. Answer the student's doubts clearly and concisely.

STRICT FORMATTING RULES — follow exactly:
- Never use markdown: no # headings, no **bold**, no *italic*, no bullet points with *, no numbered lists with markdown
- Every math expression, chemical equation, formula, or LaTeX command MUST be wrapped in $ for inline or $$ for block — never write raw LaTeX like \\text{} or \\rightleftharpoons outside of $ delimiters
- Write in plain numbered sentences (1. 2. 3.) for steps
- Example correct format: "The equilibrium is $\\text{Ag}_2\\text{CrO}_4 \\rightleftharpoons 2\\text{Ag}^+ + \\text{CrO}_4^{2-}$"
- Example wrong format: "\\text{Ag}_2 \\rightleftharpoons" (missing $ signs)

Do not ask the student to provide the question again.`;
  };

  const fetchImprovement = async (q: QuestionData) => {
    if (improvements.has(q.id) || improvementLoading.has(q.id)) return;
    setImprovementLoading((s) => new Set(s).add(q.id));

    const resp = responses.get(q.id);
    const status = getStatus(q, resp);
    const optionsText = q.options
      ? q.options.map((o, i) => `${optionLabels[i]}. ${getOptionText(o)}`).join("\n")
      : "No options";

    const prompt = `You are a JEE coach giving a student quick, actionable feedback after reviewing a test question.

Question: ${q.text}
Options: ${optionsText}
Correct Answer: ${q.correct_answer}
Student's Answer: ${resp?.selected_answer || "Not attempted"}
Result: ${status === "correct" ? "Correct" : status === "wrong" ? "Wrong" : "Not attempted"}
Solution: ${q.explanation}

Give 2-3 sentences of constructive feedback. If correct: reinforce the concept and mention a common mistake to avoid. If wrong or unattempted: identify the likely gap in understanding and suggest what to review. Be specific, not generic. Do not repeat the question. Use plain text only — no LaTeX, no markdown, no hashtags, no asterisks, no bullet points, no headers. Just plain readable sentences.`;

    try {
      const res = await fetch(CHAT_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({
          messages: [{ role: "user", content: prompt }],
          sessionId: testId,
          questionId: q.id,
        }),
      });

      if (!res.ok || !res.body) throw new Error("Failed");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let content = "";
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let ni: number;
        while ((ni = buffer.indexOf("\n")) !== -1) {
          let line = buffer.slice(0, ni);
          buffer = buffer.slice(ni + 1);
          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (!line.startsWith("data: ")) continue;
          const jsonStr = line.slice(6).trim();
          if (jsonStr === "[DONE]") break;
          try {
            const parsed = JSON.parse(jsonStr);
            const delta = parsed.choices?.[0]?.delta?.content;
            if (delta) {
              content += delta;
              setImprovements((m) => new Map(m).set(q.id, content));
            }
          } catch { buffer = line + "\n" + buffer; break; }
        }
      }

      if (!content) setImprovements((m) => new Map(m).set(q.id, "Could not generate feedback."));
    } catch {
      setImprovements((m) => new Map(m).set(q.id, "Could not generate feedback."));
    } finally {
      setImprovementLoading((s) => { const n = new Set(s); n.delete(q.id); return n; });
    }
  };

  const toggleSolution = (q: QuestionData) => {
    setSolutionOpen((s) => {
      const next = new Set(s);
      if (next.has(q.id)) {
        next.delete(q.id);
      } else {
        next.add(q.id);
        fetchImprovement(q);
      }
      return next;
    });
  };

  const handleAskDoubt = async (questionId: string, q: QuestionData, overrideInput?: string) => {
    const msgText = overrideInput || doubtInput.trim();
    if (!msgText || doubtLoading) return;
    if (!overrideInput) setDoubtInput("");
    setDoubtLoading(true);
    const userMsg = msgText;

    const prev = doubtMessages.get(questionId) || [];
    const newMsgs = [...prev, { role: "user" as const, content: userMsg }];
    setDoubtMessages((m) => new Map(m).set(questionId, newMsgs));

    const userResp = responses.get(questionId);

    try {
      const contextMsg = buildContextMessage(q, userResp);
      const chatHistory = prev.map((m) => ({ role: m.role, content: m.content }));

      const res = await fetch(CHAT_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({
          messages: [
            { role: "system", content: contextMsg },
            ...chatHistory,
            { role: "user", content: userMsg },
          ],
          sessionId: testId,
          questionId,
        }),
      });

      if (!res.ok || !res.body) throw new Error(`Error: ${res.status}`);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let assistantContent = "";
      let textBuffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        textBuffer += decoder.decode(value, { stream: true });
        let newlineIndex: number;
        while ((newlineIndex = textBuffer.indexOf("\n")) !== -1) {
          let line = textBuffer.slice(0, newlineIndex);
          textBuffer = textBuffer.slice(newlineIndex + 1);
          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (line.startsWith(":") || line.trim() === "") continue;
          if (!line.startsWith("data: ")) continue;
          const jsonStr = line.slice(6).trim();
          if (jsonStr === "[DONE]") break;
          try {
            const parsed = JSON.parse(jsonStr);
            const delta = parsed.choices?.[0]?.delta?.content;
            if (delta) {
              assistantContent += delta;
              setDoubtMessages((m) => {
                const cur = m.get(questionId) || [];
                const last = cur[cur.length - 1];
                if (last?.role === "assistant") {
                  return new Map(m).set(questionId, [...cur.slice(0, -1), { role: "assistant", content: assistantContent }]);
                }
                return new Map(m).set(questionId, [...cur, { role: "assistant", content: assistantContent }]);
              });
            }
          } catch {
            textBuffer = line + "\n" + textBuffer;
            break;
          }
        }
      }

      if (!assistantContent) {
        setDoubtMessages((m) => {
          const cur = m.get(questionId) || [];
          return new Map(m).set(questionId, [...cur, { role: "assistant", content: "Sorry, I couldn't generate a response. Please try again." }]);
        });
      }
    } catch (err) {
      console.error("Doubt error:", err);
      setDoubtMessages((m) => {
        const cur = m.get(questionId) || [];
        return new Map(m).set(questionId, [...cur, { role: "assistant", content: "Error connecting to AI. Please try again." }]);
      });
    }
    setDoubtLoading(false);
  };

  const goTo = (idx: number) => {
    if (idx < 0 || idx >= questions.length) return;
    setCurrentIndex(idx);
    setDoubtOpen(null);
    setDoubtFullscreen(false);
    setDoubtInput("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-accent" />
      </div>
    );
  }

  const q = questions[currentIndex];
  if (!q) return null;
  const resp = responses.get(q.id);
  const status = getStatus(q, resp);
  const msgs = doubtMessages.get(q.id) || [];
  const isSolutionOpen = solutionOpen.has(q.id);
  const improvement = improvements.get(q.id);
  const isImprovementLoading = improvementLoading.has(q.id);
  const timeStr = formatTime(resp?.time_spent ?? 0);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="border-b bg-card px-4 py-3 flex items-center gap-3 sticky top-0 z-10">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate("/history")}
          className="active:scale-[0.97] transition-transform"
        >
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <h1 className="font-semibold text-lg">Test Analysis</h1>
        {sessionData?.level && (
          <span className="text-xs px-2 py-1 rounded-md bg-accent/10 text-accent font-medium">
            Level {sessionData.level}
          </span>
        )}
        {sessionData?.chapter_name && (
          <span className="text-xs px-2 py-1 rounded-md bg-secondary text-muted-foreground font-medium">
            {sessionData.chapter_name}
          </span>
        )}
        {/* Summary chips */}
        <div className="ml-auto flex items-center gap-3 text-xs">
          <span className="flex items-center gap-1 text-[hsl(var(--success))] font-semibold">
            <CheckCircle2 className="w-3.5 h-3.5" /> {correct}
          </span>
          <span className="flex items-center gap-1 text-destructive font-semibold">
            <XCircle className="w-3.5 h-3.5" /> {incorrect}
          </span>
          <span className="flex items-center gap-1 text-muted-foreground font-semibold">
            <MinusCircle className="w-3.5 h-3.5" /> {unattempted}
          </span>
          <span className="flex items-center gap-1 text-accent font-semibold ml-1">
            <Target className="w-3.5 h-3.5" /> {sessionData?.score ?? 0}/{sessionData?.max_score ?? 0}
          </span>
        </div>
      </header>

      {/* Section tabs */}
      <div className="flex border-b bg-card">
        {(["physics", "chemistry", "math"] as const).map((subj) => {
          const firstIdx = questions.findIndex(q => q.subject === subj);
          if (firstIdx === -1) return null;
          const subjectLabels: Record<string, string> = { physics: "Physics", chemistry: "Chemistry", math: "Mathematics" };
          const isActive = questions[currentIndex]?.subject === subj;
          const subjectCounts = questions.filter(q => q.subject === subj);
          const mcqCount = subjectCounts.filter(q => q.type === "mcq" || q.type === "multiple_correct" || q.type === "comprehension").length;
          const intCount = subjectCounts.filter(q => q.type === "integer" || q.type === "numerical").length;
          return (
            <button
              key={subj}
              onClick={() => goTo(firstIdx)}
              className={`flex-1 py-2.5 text-xs font-semibold transition-colors border-b-2 ${
                isActive
                  ? "border-accent text-accent"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {subjectLabels[subj]}
              <span className="block text-[10px] font-normal opacity-70 mt-0.5">{mcqCount} MCQ · {intCount} Int</span>
            </button>
          );
        })}
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Main question area */}
        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          <div className="max-w-3xl mx-auto space-y-5">

            {/* Question meta bar */}
            <div className="flex items-center gap-3 flex-wrap">
              <span className={`text-xs font-semibold px-2.5 py-1 rounded-md ${
                q.subject === "physics" ? "subject-physics" :
                q.subject === "chemistry" ? "subject-chemistry" : "subject-math"
              }`}>
                {q.subject === "math" ? "Mathematics" : q.subject.charAt(0).toUpperCase() + q.subject.slice(1)}
              </span>
              <span className="text-xs text-muted-foreground">{q.topic}</span>
              <span className="text-xs text-muted-foreground px-2 py-0.5 rounded bg-muted capitalize">{q.difficulty}</span>
              {timeStr ? (
                <span className="ml-auto text-xs text-muted-foreground flex items-center gap-1 bg-muted px-2 py-1 rounded-md">
                  <Clock className="w-3 h-3" /> {timeStr}
                </span>
              ) : !resp?.selected_answer ? (
                <span className="ml-auto text-xs text-muted-foreground bg-muted px-2 py-1 rounded-md">Not attempted</span>
              ) : null}
            </div>

            {/* Status banner */}
            <div className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium border ${
              status === "correct"
                ? "bg-[hsl(var(--success))]/10 text-[hsl(var(--success))] border-[hsl(var(--success))]/30"
                : status === "wrong"
                ? "bg-destructive/10 text-destructive border-destructive/30"
                : "bg-muted text-muted-foreground border-border"
            }`}>
              {status === "correct" && <CheckCircle2 className="w-4 h-4" />}
              {status === "wrong" && <XCircle className="w-4 h-4" />}
              {status === "unattempted" && <MinusCircle className="w-4 h-4" />}
              {status === "correct"
                ? "Correct"
                : status === "wrong"
                ? `Wrong — You chose ${resp?.selected_answer?.toUpperCase()}, Correct is ${q.correct_answer.toUpperCase()}`
                : "Not Attempted"}
            </div>

            {/* Question number + text */}
            <div>
              <div className="text-xs font-medium text-muted-foreground mb-2">
                Question {currentIndex + 1} of {questions.length}
                {q.type === "numerical" && (
                  <span className="ml-2 px-2 py-0.5 bg-secondary rounded text-xs">Numerical</span>
                )}
              </div>
              <div className="text-base leading-relaxed">
                <MathRenderer>{q.text}</MathRenderer>
              </div>
            </div>

            {/* MCQ Options */}
            {q.options && (
              <div className="space-y-2.5">
                {q.options.map((opt, oi) => {
                  const label = optionLabels[oi];
                  const isCorrectOption = q.correct_answer.trim().toUpperCase() === label;
                  const isUserPick = resp?.selected_answer?.trim().toUpperCase() === label;
                  const isWrongPick = isUserPick && !isCorrectOption;

                  return (
                    <div
                      key={oi}
                      className={`flex items-start gap-3 rounded-lg border-2 px-4 py-3 text-sm transition-colors ${
                        isCorrectOption
                          ? "border-[hsl(var(--success))] bg-[hsl(var(--success))]/10"
                          : isWrongPick
                          ? "border-destructive bg-destructive/10"
                          : "border-border"
                      }`}
                    >
                      <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 mt-0.5 ${
                        isCorrectOption
                          ? "bg-[hsl(var(--success))] text-white"
                          : isWrongPick
                          ? "bg-destructive text-white"
                          : "bg-secondary text-muted-foreground"
                      }`}>
                        {label}
                      </span>
                      <div className="flex-1 min-w-0 pt-0.5">
                        <MathRenderer>{getOptionText(opt)}</MathRenderer>
                      </div>
                      {isCorrectOption && <CheckCircle2 className="w-4 h-4 text-[hsl(var(--success))] shrink-0 mt-1" />}
                      {isWrongPick && <XCircle className="w-4 h-4 text-destructive shrink-0 mt-1" />}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Numerical answer display */}
            {q.type === "numerical" && (
              <div className="flex items-center gap-4 text-sm flex-wrap">
                <div className="px-4 py-2 rounded-lg bg-[hsl(var(--success))]/10 border border-[hsl(var(--success))]/30 text-[hsl(var(--success))] font-mono font-semibold">
                  Correct: {q.correct_answer}
                </div>
                {resp?.selected_answer && (
                  <div className={`px-4 py-2 rounded-lg font-mono font-semibold border ${
                    status === "correct"
                      ? "bg-[hsl(var(--success))]/10 border-[hsl(var(--success))]/30 text-[hsl(var(--success))]"
                      : "bg-destructive/10 border-destructive/30 text-destructive"
                  }`}>
                    Your answer: {resp.selected_answer}
                  </div>
                )}
              </div>
            )}

            {/* Solution + Coach Tip + AI Doubts */}
            <div className="border rounded-xl overflow-hidden">
              <button
                onClick={() => toggleSolution(q)}
                className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium hover:bg-muted/50 transition-colors"
              >
                <span>View Solution</span>
                <ChevronRight className={`w-4 h-4 transition-transform ${isSolutionOpen ? "rotate-90" : ""}`} />
              </button>

              {isSolutionOpen && (
                <div className="border-t px-4 pb-4 space-y-4 mt-0">
                  {/* Solution */}
                  <div className="bg-muted/50 rounded-lg p-4 text-sm leading-relaxed mt-3">
                    <MathRenderer>{q.explanation}</MathRenderer>
                  </div>

                  {/* "I don't understand" button */}
                  <button
                    onClick={() => {
                      setDoubtOpen(q.id);
                      setDoubtFullscreen(false);
                      const prev = doubtMessages.get(q.id) || [];
                      if (prev.length === 0) {
                        const suggestion = "I don't understand the solution. Can you explain it step by step?";
                        handleAskDoubt(q.id, q, suggestion);
                      }
                    }}
                    className="flex items-center gap-2 text-xs px-3 py-2 rounded-lg border border-destructive/30 bg-destructive/5 text-destructive hover:bg-destructive/10 transition-colors font-medium"
                  >
                    <HelpCircle className="w-3.5 h-3.5" />
                    I don't understand this solution — Ask AI
                  </button>

                  {/* Coach's Tip */}
                  <div className="rounded-lg border border-accent/20 bg-accent/5 px-4 py-3">
                    <div className="flex items-center gap-2 text-xs font-semibold text-accent mb-2">
                      <Lightbulb className="w-3.5 h-3.5" />
                      Coach's Tip
                    </div>
                    {isImprovementLoading ? (
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Loader2 className="w-3 h-3 animate-spin" /> Generating feedback...
                      </div>
                    ) : improvement ? (
                      <p className="text-sm text-foreground/80 leading-relaxed">{stripMarkdown(improvement)}</p>
                    ) : null}
                  </div>

                  {/* AI Doubts */}
                  <div>
                    {doubtOpen !== q.id ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => { setDoubtOpen(q.id); setDoubtFullscreen(false); }}
                        className="gap-2"
                      >
                        <Bot className="w-4 h-4" />
                        AI Doubts 🤖
                      </Button>
                    ) : (
                      <div className={doubtFullscreen
                        ? "fixed inset-0 z-50 bg-background flex flex-col p-6 gap-4"
                        : "border rounded-lg p-3 space-y-3 bg-background"
                      }>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2 text-sm font-medium">
                            <Bot className="w-4 h-4 text-accent" />
                            Ask AI about this question
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => setDoubtFullscreen(f => !f)}
                              className="text-xs text-muted-foreground hover:text-foreground"
                              title={doubtFullscreen ? "Exit fullscreen" : "Expand"}
                            >
                              {doubtFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                            </button>
                            <button
                              onClick={() => { setDoubtOpen(null); setDoubtFullscreen(false); }}
                              className="text-xs text-muted-foreground hover:text-foreground"
                            >
                              ✕
                            </button>
                          </div>
                        </div>

                        {/* Suggested starters */}
                        {msgs.length === 0 && (
                          <div className="flex flex-wrap gap-2">
                            {[
                              "How did you get this answer?",
                              `Why is option ${q.correct_answer} correct?`,
                              "Explain the formula used here",
                            ].map((suggestion) => (
                              <button
                                key={suggestion}
                                onClick={() => handleAskDoubt(q.id, q, suggestion)}
                                className="text-xs px-3 py-1.5 rounded-full border border-accent/30 bg-accent/5 text-accent hover:bg-accent/10 transition-colors"
                              >
                                {suggestion}
                              </button>
                            ))}
                          </div>
                        )}

                        {/* Messages */}
                        {msgs.length > 0 && (
                          <div className={`space-y-2 overflow-y-auto scroll-smooth ${doubtFullscreen ? "flex-1 max-h-[calc(100vh-200px)]" : "max-h-72"}`}>
                            {msgs.map((m, mi) => (
                              <div
                                key={mi}
                                className={`text-sm rounded-lg px-3 py-2 ${
                                  m.role === "user"
                                    ? "bg-primary text-primary-foreground ml-8"
                                    : "bg-muted mr-8"
                                }`}
                              >
                                {m.role === "assistant" ? (
                                  <AIMessage content={m.content} />
                                ) : (
                                  m.content
                                )}
                              </div>
                            ))}
                            <div ref={messagesEndRef} />
                          </div>
                        )}

                        {/* Input */}
                        <div className={`flex gap-2 ${doubtFullscreen ? "mt-auto" : ""}`}>
                          <input
                            value={doubtInput}
                            onChange={(e) => setDoubtInput(e.target.value)}
                            onKeyDown={(e) =>
                              e.key === "Enter" && !e.shiftKey && handleAskDoubt(q.id, q)
                            }
                            placeholder="Ask anything about this question..."
                            className="flex-1 px-3 py-2 rounded-md border bg-background text-foreground text-sm focus:border-accent focus:outline-none"
                            disabled={doubtLoading}
                          />
                          <Button
                            size="sm"
                            onClick={() => handleAskDoubt(q.id, q)}
                            disabled={!doubtInput.trim() || doubtLoading}
                            className="bg-accent text-accent-foreground hover:bg-accent/90"
                          >
                            {doubtLoading ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <Send className="w-4 h-4" />
                            )}
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Prev / Next navigation */}
            <div className="flex items-center gap-3 pt-2 border-t">
              <Button
                variant="outline"
                onClick={() => goTo(currentIndex - 1)}
                disabled={currentIndex === 0}
                className="active:scale-[0.97] transition-transform"
              >
                <ChevronLeft className="w-4 h-4 mr-1" />
                Prev
              </Button>
              <span className="text-xs text-muted-foreground mx-auto">
                {currentIndex + 1} / {questions.length}
              </span>
              <Button
                onClick={() => goTo(currentIndex + 1)}
                disabled={currentIndex === questions.length - 1}
                className="bg-accent text-accent-foreground hover:bg-accent/90 active:scale-[0.97] transition-transform"
              >
                Next
                <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </div>

          </div>
        </main>

        {/* Question palette sidebar */}
        <aside className="w-64 border-l bg-card overflow-y-auto p-4 hidden lg:block shrink-0">
          <div className="text-xs font-semibold text-muted-foreground mb-3 uppercase tracking-wide">Questions</div>
          <div className="grid grid-cols-2 gap-1.5 text-xs mb-4">
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded bg-[hsl(var(--success))]" /> Correct: {correct}
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded bg-destructive" /> Wrong: {incorrect}
            </div>
            <div className="flex items-center gap-1.5 col-span-2">
              <span className="w-3 h-3 rounded bg-secondary border" /> Skipped: {unattempted}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {(["physics", "chemistry", "math"] as const).map((subj) => {
              const subjQuestions = questions
                .map((q, idx) => ({ q, idx }))
                .filter(({ q }) => q.subject === subj);
              if (subjQuestions.length === 0) return null;

              const mcqQs = subjQuestions.filter(({ q }) => q.type !== "integer" && q.type !== "numerical");
              const intQs = subjQuestions.filter(({ q }) => q.type === "integer" || q.type === "numerical");
              const subjectLabels: Record<string, string> = { physics: "Physics", chemistry: "Chemistry", math: "Mathematics" };

              return (
                <div key={subj} className="w-full mb-3">
                  <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5">
                    {subjectLabels[subj]}
                  </div>
                  {mcqQs.length > 0 && (
                    <>
                      <div className="text-[9px] text-muted-foreground mb-1">MCQ</div>
                      <div className="flex flex-wrap gap-2 mb-2">
                        {mcqQs.map(({ q: question, idx }) => {
                          const r = responses.get(question.id);
                          const s = getStatus(question, r);
                          return (
                            <button
                              key={question.id}
                              onClick={() => goTo(idx)}
                              className={`w-9 h-9 rounded-lg text-xs font-bold transition-all active:scale-95 border-2 ${
                                idx === currentIndex
                                  ? "border-accent scale-110 shadow-md"
                                  : "border-transparent"
                              } ${
                                s === "correct"
                                  ? "bg-[hsl(var(--success))] text-white"
                                  : s === "wrong"
                                  ? "bg-destructive text-white"
                                  : "bg-secondary text-muted-foreground"
                              }`}
                            >
                              {idx + 1}
                            </button>
                          );
                        })}
                      </div>
                    </>
                  )}
                  {intQs.length > 0 && (
                    <>
                      <div className="text-[9px] text-muted-foreground mb-1">Integer</div>
                      <div className="flex flex-wrap gap-2">
                        {intQs.map(({ q: question, idx }) => {
                          const r = responses.get(question.id);
                          const s = getStatus(question, r);
                          return (
                            <button
                              key={question.id}
                              onClick={() => goTo(idx)}
                              className={`w-9 h-9 rounded-lg text-xs font-bold transition-all active:scale-95 border-2 ${
                                idx === currentIndex
                                  ? "border-accent scale-110 shadow-md"
                                  : "border-transparent"
                              } ${
                                s === "correct"
                                  ? "bg-[hsl(var(--success))] text-white"
                                  : s === "wrong"
                                  ? "bg-destructive text-white"
                                  : "bg-secondary text-muted-foreground"
                              }`}
                            >
                              {idx + 1}
                            </button>
                          );
                        })}
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </aside>
      </div>
    </div>
  );
};

export default AnalysisPage;
