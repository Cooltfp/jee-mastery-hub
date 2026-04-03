import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import MathRenderer from "@/components/MathRenderer";
import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
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
  options: string[] | null;
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

const AnalysisPage = () => {
  const { testId } = useParams<{ testId: string }>();
  const navigate = useNavigate();
  const [sessionData, setSessionData] = useState<SessionData | null>(null);
  const [questions, setQuestions] = useState<QuestionData[]>([]);
  const [responses, setResponses] = useState<Map<string, ResponseData>>(new Map());
  const [loading, setLoading] = useState(true);

  // AI Doubt state per question
  const [doubtOpen, setDoubtOpen] = useState<string | null>(null);
  const [doubtInput, setDoubtInput] = useState("");
  const [doubtMessages, setDoubtMessages] = useState<
    Map<string, { role: "user" | "assistant"; content: string }[]>
  >(new Map());
  const [doubtLoading, setDoubtLoading] = useState(false);

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
    if (s < 60) return `${Math.round(s)}s`;
    return `${Math.floor(s / 60)}m ${Math.round(s % 60)}s`;
  };

  const optionLabels = ["A", "B", "C", "D"];

  const getStatusInfo = (q: QuestionData, resp: ResponseData | undefined) => {
    if (!resp || resp.status === "not-visited" || !resp.selected_answer) {
      return { type: "unattempted" as const, icon: <MinusCircle className="w-5 h-5 text-muted-foreground" /> };
    }
    const isCorrect = resp.selected_answer.trim().toUpperCase() === q.correct_answer.trim().toUpperCase();
    if (isCorrect) {
      return { type: "correct" as const, icon: <CheckCircle2 className="w-5 h-5 text-[hsl(var(--success))]" /> };
    }
    return { type: "wrong" as const, icon: <XCircle className="w-5 h-5 text-destructive" /> };
  };

  // Compute summary stats
  const correct = questions.filter((q) => {
    const r = responses.get(q.id);
    return r?.selected_answer && r.selected_answer.trim().toUpperCase() === q.correct_answer.trim().toUpperCase();
  }).length;
  const attempted = questions.filter((q) => {
    const r = responses.get(q.id);
    return r?.selected_answer;
  }).length;
  const incorrect = attempted - correct;
  const unattempted = questions.length - attempted;

  const handleAskDoubt = async (questionId: string, questionText: string) => {
    if (!doubtInput.trim() || doubtLoading) return;
    const userMsg = doubtInput.trim();
    setDoubtInput("");
    setDoubtLoading(true);

    const prev = doubtMessages.get(questionId) || [];
    const newMsgs = [...prev, { role: "user" as const, content: userMsg }];
    setDoubtMessages((m) => new Map(m).set(questionId, newMsgs));

    try {
      const body: any = {
        messages: [
          {
            role: "user",
            content: `Context: This is about the following JEE question:\n"${questionText}"\n\nStudent's doubt: ${userMsg}`,
          },
        ],
        sessionId: testId,
        questionId,
      };

      const resp = await fetch(CHAT_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify(body),
      });

      if (!resp.ok) throw new Error(`Error: ${resp.status}`);
      if (!resp.body) throw new Error("No body");

      const reader = resp.body.getReader();
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
                  return new Map(m).set(questionId, [
                    ...cur.slice(0, -1),
                    { role: "assistant", content: assistantContent },
                  ]);
                }
                return new Map(m).set(questionId, [
                  ...cur,
                  { role: "assistant", content: assistantContent },
                ]);
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
          return new Map(m).set(questionId, [
            ...cur,
            { role: "assistant", content: "Sorry, I couldn't generate a response. Please try again." },
          ]);
        });
      }
    } catch (err) {
      console.error("Doubt error:", err);
      setDoubtMessages((m) => {
        const cur = m.get(questionId) || [];
        return new Map(m).set(questionId, [
          ...cur,
          { role: "assistant", content: "Error connecting to AI. Please try again." },
        ]);
      });
    }

    setDoubtLoading(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-accent" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
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
      </header>

      <div className="max-w-4xl mx-auto p-4 space-y-6">
        {/* Summary Bar */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <SummaryCard
            label="Score"
            value={`${sessionData?.score ?? 0}/${sessionData?.max_score ?? 0}`}
            icon={<Target className="w-4 h-4 text-accent" />}
          />
          <SummaryCard
            label="Correct"
            value={`${correct}`}
            icon={<CheckCircle2 className="w-4 h-4 text-[hsl(var(--success))]" />}
          />
          <SummaryCard
            label="Incorrect"
            value={`${incorrect}`}
            icon={<XCircle className="w-4 h-4 text-destructive" />}
          />
          <SummaryCard
            label="Unattempted"
            value={`${unattempted}`}
            icon={<MinusCircle className="w-4 h-4 text-muted-foreground" />}
          />
          <SummaryCard
            label="Time"
            value={formatTime(sessionData?.total_time_taken || 0)}
            icon={<Clock className="w-4 h-4 text-[hsl(var(--physics))]" />}
          />
        </div>

        {/* Question Cards */}
        <div className="space-y-4">
          {questions.map((q, idx) => {
            const resp = responses.get(q.id);
            const status = getStatusInfo(q, resp);
            const msgs = doubtMessages.get(q.id) || [];

            return (
              <div
                key={q.id}
                className="border rounded-xl bg-card overflow-hidden"
              >
                {/* Question header */}
                <div className="p-4 pb-3">
                  <div className="flex items-start gap-3">
                    <div className="flex items-center gap-2 shrink-0 mt-0.5">
                      {status.icon}
                      <span className="text-sm font-bold text-muted-foreground">
                        Q{idx + 1}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2 flex-wrap">
                        <span
                          className={`text-xs px-2 py-0.5 rounded font-medium ${
                            q.subject === "physics"
                              ? "subject-physics"
                              : q.subject === "chemistry"
                              ? "subject-chemistry"
                              : "subject-math"
                          }`}
                        >
                          {q.subject === "math"
                            ? "Mathematics"
                            : q.subject.charAt(0).toUpperCase() +
                              q.subject.slice(1)}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {q.topic}
                        </span>
                        {resp && resp.time_spent > 0 && (
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {formatTime(resp.time_spent)}
                          </span>
                        )}
                      </div>
                      <div className="text-sm leading-relaxed">
                        <MathRenderer>{q.text}</MathRenderer>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Options */}
                {q.options && (
                  <div className="px-4 pb-3 space-y-2">
                    {q.options.map((opt, oi) => {
                      const label = optionLabels[oi];
                      const isCorrectOption =
                        q.correct_answer.trim().toUpperCase() === label;
                      const isUserPick =
                        resp?.selected_answer?.trim().toUpperCase() === label;
                      const isWrongPick = isUserPick && !isCorrectOption;

                      let borderClass = "border-border";
                      let bgClass = "";
                      if (isCorrectOption) {
                        borderClass = "border-[hsl(var(--success))]";
                        bgClass = "bg-[hsl(var(--success))]/10";
                      }
                      if (isWrongPick) {
                        borderClass = "border-destructive";
                        bgClass = "bg-destructive/10";
                      }

                      return (
                        <div
                          key={oi}
                          className={`flex items-start gap-3 rounded-lg border px-3 py-2 text-sm ${borderClass} ${bgClass}`}
                        >
                          <span className="font-semibold text-muted-foreground shrink-0 mt-0.5 w-5">
                            {label}.
                          </span>
                          <div className="flex-1 min-w-0">
                            <MathRenderer>{opt}</MathRenderer>
                          </div>
                          {isCorrectOption && (
                            <CheckCircle2 className="w-4 h-4 text-[hsl(var(--success))] shrink-0 mt-0.5" />
                          )}
                          {isWrongPick && (
                            <XCircle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Solution Accordion + AI Doubts */}
                <div className="border-t">
                  <Accordion type="single" collapsible>
                    <AccordionItem value="solution" className="border-b-0">
                      <AccordionTrigger className="px-4 py-3 text-sm font-medium hover:no-underline">
                        View Solution
                      </AccordionTrigger>
                      <AccordionContent className="px-4 pb-3">
                        <div className="bg-muted/50 rounded-lg p-4 text-sm leading-relaxed">
                          <MathRenderer>{q.explanation}</MathRenderer>
                        </div>

                        {/* AI Doubts Button & Chat */}
                        <div className="mt-3">
                          {doubtOpen !== q.id ? (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setDoubtOpen(q.id)}
                              className="gap-2"
                            >
                              <Bot className="w-4 h-4" />
                              AI Doubts 🤖
                            </Button>
                          ) : (
                            <div className="border rounded-lg p-3 space-y-3 bg-background">
                              <div className="flex items-center gap-2 text-sm font-medium">
                                <Bot className="w-4 h-4 text-accent" />
                                Ask AI about this question
                              </div>

                              {/* Messages */}
                              {msgs.length > 0 && (
                                <div className="space-y-2 max-h-64 overflow-y-auto">
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
                                        <MathRenderer>{m.content}</MathRenderer>
                                      ) : (
                                        m.content
                                      )}
                                    </div>
                                  ))}
                                </div>
                              )}

                              {/* Input */}
                              <div className="flex gap-2">
                                <input
                                  value={doubtInput}
                                  onChange={(e) => setDoubtInput(e.target.value)}
                                  onKeyDown={(e) =>
                                    e.key === "Enter" &&
                                    !e.shiftKey &&
                                    handleAskDoubt(q.id, q.text)
                                  }
                                  placeholder="Why is option A correct?"
                                  className="flex-1 px-3 py-2 rounded-md border bg-background text-foreground text-sm focus:border-accent focus:outline-none"
                                  disabled={doubtLoading}
                                />
                                <Button
                                  size="sm"
                                  onClick={() => handleAskDoubt(q.id, q.text)}
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
                      </AccordionContent>
                    </AccordionItem>
                  </Accordion>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

function SummaryCard({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="bg-card border rounded-xl p-3 flex items-center gap-3">
      {icon}
      <div>
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="text-sm font-bold">{value}</div>
      </div>
    </div>
  );
}

export default AnalysisPage;
