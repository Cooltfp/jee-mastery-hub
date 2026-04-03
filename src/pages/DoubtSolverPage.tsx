import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import MathRenderer from "@/components/MathRenderer";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft,
  Send,
  Bot,
  User,
  Loader2,
  Atom,
  FlaskConical,
  Calculator,
  Sparkles,
  RotateCcw,
} from "lucide-react";
import { toast } from "sonner";

interface Message {
  role: "user" | "assistant";
  content: string;
}

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/doubt-solver`;

const SYSTEM_PROMPT = `You are an expert JEE tutor helping a student with Physics, Chemistry, and Mathematics.

STRICT FORMATTING RULES:
- Every math expression, formula, or LaTeX command MUST be wrapped in $ for inline or $$ for block — never write raw LaTeX outside $ delimiters
- No markdown: no # headings, no **bold**, no *italic*, no bullet points with *
- Use numbered steps (1. 2. 3.) for solutions
- Write in clear plain sentences
- Example: "The force is $F = ma$ where $m$ is mass and $a$ is acceleration"`;

const SUBJECTS = [
  { key: "physics", label: "Physics", icon: <Atom className="w-4 h-4" />, color: "subject-physics" },
  { key: "chemistry", label: "Chemistry", icon: <FlaskConical className="w-4 h-4" />, color: "subject-chemistry" },
  { key: "math", label: "Maths", icon: <Calculator className="w-4 h-4" />, color: "subject-math" },
  { key: "general", label: "General", icon: <Sparkles className="w-4 h-4" />, color: "bg-accent/10 text-accent" },
];

const SUGGESTIONS: Record<string, string[]> = {
  physics: [
    "Explain moment of inertia with an example",
    "Derive the equation of motion for SHM",
    "What is Gauss's law and how is it applied?",
    "Explain Bernoulli's principle",
  ],
  chemistry: [
    "Explain the concept of pH and pOH",
    "What is the hybridization of SF6?",
    "Derive the van't Hoff factor",
    "Explain nucleophilic substitution reactions",
  ],
  math: [
    "Integrate $\\int x^2 e^x dx$ by parts",
    "Explain the concept of limits with an example",
    "How do I find the area between two curves?",
    "Explain the binomial theorem",
  ],
  general: [
    "What topics should I focus on for JEE Mains?",
    "How do I improve my problem-solving speed?",
    "Explain dimensional analysis",
    "What is the difference between JEE Mains and Advanced?",
  ],
};

const stripMarkdown = (text: string): string => {
  return text
    .replace(/^#{1,6}\s*/gm, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/^[-*]\s+/gm, "• ")
    .trim();
};

const AIPage = () => {
  const navigate = useNavigate();
  const [subject, setSubject] = useState("general");
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const clearChat = () => {
    setMessages([]);
    inputRef.current?.focus();
  };

  const sendMessage = async (text: string) => {
    if (!text.trim() || isStreaming) return;
    const userMsg = text.trim();
    setInput("");

    const newMessages: Message[] = [...messages, { role: "user", content: userMsg }];
    setMessages(newMessages);
    setIsStreaming(true);

    let assistantContent = "";

    const subjectContext = subject !== "general"
      ? `The student is asking about ${subject.charAt(0).toUpperCase() + subject.slice(1)}. `
      : "";

    try {
      const resp = await fetch(CHAT_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({
          messages: [
            { role: "system", content: SYSTEM_PROMPT + "\n" + subjectContext },
            ...newMessages.map((m) => ({ role: m.role, content: m.content })),
          ],
        }),
      });

      if (!resp.ok) {
        if (resp.status === 429) { toast.error("Rate limited. Please wait and try again."); setIsStreaming(false); return; }
        if (resp.status === 402) { toast.error("AI credits exhausted."); setIsStreaming(false); return; }
        throw new Error(`Error: ${resp.status}`);
      }

      if (!resp.body) throw new Error("No response body");

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let textBuffer = "";

      const updateAssistant = (content: string) => {
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          if (last?.role === "assistant") {
            return [...prev.slice(0, -1), { role: "assistant", content }];
          }
          return [...prev, { role: "assistant", content }];
        });
      };

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
              updateAssistant(assistantContent);
            }
          } catch {
            textBuffer = line + "\n" + textBuffer;
            break;
          }
        }
      }

      if (!assistantContent) {
        setMessages((prev) => [...prev, { role: "assistant", content: "Sorry, I couldn't generate a response. Please try again." }]);
      }
    } catch (err) {
      console.error("AI error:", err);
      toast.error("Failed to get response. Please try again.");
      if (!assistantContent) {
        setMessages((prev) => [...prev, { role: "assistant", content: "Sorry, I encountered an error. Please try again." }]);
      }
    }

    setIsStreaming(false);
  };

  const isEmpty = messages.length === 0;

  return (
    <div className="h-screen bg-background flex flex-col overflow-hidden">
      {/* Header */}
      <header className="border-b bg-card px-4 py-3 flex items-center gap-3 shrink-0">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate("/")}
          className="active:scale-[0.97] transition-transform"
        >
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div className="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center">
          <Bot className="w-4 h-4 text-accent" />
        </div>
        <div>
          <h1 className="font-semibold text-base leading-tight">JEE AI Tutor</h1>
          <p className="text-xs text-muted-foreground leading-tight">Ask anything about Physics, Chemistry or Maths</p>
        </div>

        {/* Subject selector */}
        <div className="ml-auto flex items-center gap-1.5">
          {SUBJECTS.map((s) => (
            <button
              key={s.key}
              onClick={() => setSubject(s.key)}
              className={`flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg font-medium transition-all ${
                subject === s.key
                  ? s.color + " scale-105 shadow-sm"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`}
            >
              {s.icon}
              <span className="hidden sm:inline">{s.label}</span>
            </button>
          ))}
          {!isEmpty && (
            <button
              onClick={clearChat}
              className="ml-2 text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 px-2 py-1.5 rounded-lg hover:bg-muted transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Clear</span>
            </button>
          )}
        </div>
      </header>

      {/* Messages or empty state */}
      <div className="flex-1 overflow-y-auto">
        {isEmpty ? (
          /* Empty state */
          <div className="h-full flex flex-col items-center justify-center px-4 pb-8">
            <div className="w-16 h-16 rounded-2xl bg-accent/10 flex items-center justify-center mb-4">
              <Bot className="w-8 h-8 text-accent" />
            </div>
            <h2 className="text-xl font-bold mb-1">What do you want to learn?</h2>
            <p className="text-sm text-muted-foreground mb-8 text-center">
              Ask any JEE question — I'll give you step-by-step solutions with proper equations.
            </p>

            {/* Suggestion chips */}
            <div className="w-full max-w-xl grid grid-cols-1 sm:grid-cols-2 gap-2">
              {SUGGESTIONS[subject].map((s) => (
                <button
                  key={s}
                  onClick={() => sendMessage(s)}
                  className="text-left text-sm px-4 py-3 rounded-xl border bg-card hover:border-accent/40 hover:bg-accent/5 transition-all active:scale-[0.98]"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          /* Message thread */
          <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
            {messages.map((msg, i) => (
              <div key={i} className={`flex gap-3 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                {msg.role === "assistant" && (
                  <div className="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center shrink-0 mt-0.5">
                    <Bot className="w-4 h-4 text-accent" />
                  </div>
                )}
                <div
                  className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm ${
                    msg.role === "user"
                      ? "bg-primary text-primary-foreground rounded-tr-sm"
                      : "bg-card border rounded-tl-sm"
                  }`}
                >
                  {msg.role === "assistant" ? (
                    <MathRenderer>{stripMarkdown(msg.content)}</MathRenderer>
                  ) : (
                    <p>{msg.content}</p>
                  )}
                </div>
                {msg.role === "user" && (
                  <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center shrink-0 mt-0.5">
                    <User className="w-4 h-4 text-primary-foreground" />
                  </div>
                )}
              </div>
            ))}

            {/* Streaming indicator */}
            {isStreaming && messages[messages.length - 1]?.role !== "assistant" && (
              <div className="flex gap-3">
                <div className="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center shrink-0">
                  <Bot className="w-4 h-4 text-accent" />
                </div>
                <div className="bg-card border rounded-2xl rounded-tl-sm px-4 py-3 flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">Thinking...</span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input bar */}
      <div className="border-t bg-card px-4 py-3 shrink-0">
        <div className="max-w-3xl mx-auto flex gap-2 items-end">
          <div className="flex-1 relative">
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && sendMessage(input)}
              placeholder={`Ask a ${subject === "general" ? "JEE" : subject} question...`}
              className="w-full px-4 py-3 rounded-xl border bg-background text-foreground focus:border-accent focus:outline-none transition-colors text-sm pr-12"
              disabled={isStreaming}
              autoFocus
            />
          </div>
          <Button
            onClick={() => sendMessage(input)}
            disabled={!input.trim() || isStreaming}
            className="bg-accent text-accent-foreground hover:bg-accent/90 active:scale-[0.97] transition-transform rounded-xl h-11 px-4 shrink-0"
          >
            {isStreaming ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </Button>
        </div>
        <p className="text-center text-xs text-muted-foreground mt-2">
          All math will render as proper equations · Switch subjects above
        </p>
      </div>
    </div>
  );
};

export default DoubtSolverPage;
