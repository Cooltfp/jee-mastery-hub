import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import MathRenderer from "@/components/MathRenderer";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Send, Bot, User, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface Message {
  role: "user" | "assistant";
  content: string;
}

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/doubt-solver`;

const DoubtSolverPage = () => {
  const navigate = useNavigate();
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content: `I'm your **JEE Doubt Solver** powered by AI! 🎯\n\nAsk me any Physics, Chemistry, or Math question. I'll explain with proper $LaTeX$ equations and step-by-step solutions.\n\nTry asking:\n- "Explain moment of inertia with examples"\n- "Solve: Find the pH of 0.1M acetic acid"\n- "What is $\\int x^2 \\, dx$?"`,
    },
  ]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Get context from last test session
  const sessionId = sessionStorage.getItem("lastSessionId");
  const dbQuestionIds = sessionStorage.getItem("dbQuestionIds");

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || isStreaming) return;
    const userMsg = input.trim();
    const newMessages: Message[] = [...messages, { role: "user", content: userMsg }];
    setMessages(newMessages);
    setInput("");
    setIsStreaming(true);

    let assistantContent = "";

    try {
      const body: any = {
        messages: newMessages.map((m) => ({ role: m.role, content: m.content })),
      };

      // Add context if available
      if (sessionId) {
        body.sessionId = sessionId;
        // Try to find a relevant question ID from the user message
        const qMatch = userMsg.match(/(?:question|q)\s*(\d+)/i);
        if (qMatch && dbQuestionIds) {
          const ids = JSON.parse(dbQuestionIds);
          const qIndex = parseInt(qMatch[1]) - 1;
          if (ids[qIndex]) body.questionId = ids[qIndex];
        }
      }

      const resp = await fetch(CHAT_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify(body),
      });

      if (!resp.ok) {
        if (resp.status === 429) {
          toast.error("Rate limited. Please wait a moment and try again.");
          setIsStreaming(false);
          return;
        }
        if (resp.status === 402) {
          toast.error("AI credits exhausted. Please add funds in Lovable settings.");
          setIsStreaming(false);
          return;
        }
        throw new Error(`Error: ${resp.status}`);
      }

      if (!resp.body) throw new Error("No response body");

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let textBuffer = "";

      const updateAssistant = (content: string) => {
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          if (last?.role === "assistant" && prev.length === newMessages.length + 1) {
            return prev.map((m, i) => (i === prev.length - 1 ? { ...m, content } : m));
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

      // Final flush
      if (textBuffer.trim()) {
        for (let raw of textBuffer.split("\n")) {
          if (!raw || raw.startsWith(":") || raw.trim() === "") continue;
          if (raw.endsWith("\r")) raw = raw.slice(0, -1);
          if (!raw.startsWith("data: ")) continue;
          const jsonStr = raw.slice(6).trim();
          if (jsonStr === "[DONE]") continue;
          try {
            const parsed = JSON.parse(jsonStr);
            const delta = parsed.choices?.[0]?.delta?.content;
            if (delta) {
              assistantContent += delta;
              updateAssistant(assistantContent);
            }
          } catch {}
        }
      }
    } catch (err) {
      console.error("Doubt solver error:", err);
      toast.error("Failed to get response. Please try again.");
      if (!assistantContent) {
        setMessages((prev) => [...prev, { role: "assistant", content: "Sorry, I encountered an error. Please try again." }]);
      }
    }

    setIsStreaming(false);
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b bg-card px-4 py-3 flex items-center gap-3 sticky top-0 z-10">
        <Button variant="ghost" size="sm" onClick={() => navigate("/")} className="active:scale-[0.97] transition-transform">
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <Bot className="w-5 h-5 text-accent" />
        <h1 className="font-semibold text-lg">AI Doubt Solver</h1>
        <span className="text-xs px-2 py-1 rounded-md bg-accent/10 text-accent font-medium">AI Powered</span>
        {sessionId && (
          <span className="text-xs px-2 py-1 rounded-md bg-success/10 text-success font-medium">Test Context Active</span>
        )}
      </header>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((msg, i) => (
          <div key={i} className={`flex gap-3 ${msg.role === "user" ? "justify-end" : ""}`}>
            {msg.role === "assistant" && (
              <div className="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center shrink-0">
                <Bot className="w-4 h-4 text-accent" />
              </div>
            )}
            <div className={`max-w-2xl rounded-xl px-4 py-3 ${
              msg.role === "user" ? "bg-primary text-primary-foreground" : "bg-card border"
            }`}>
              {msg.role === "assistant" ? <MathRenderer>{msg.content}</MathRenderer> : <p className="text-sm">{msg.content}</p>}
            </div>
            {msg.role === "user" && (
              <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center shrink-0">
                <User className="w-4 h-4 text-primary-foreground" />
              </div>
            )}
          </div>
        ))}
        {isStreaming && messages[messages.length - 1]?.role !== "assistant" && (
          <div className="flex gap-3">
            <div className="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center shrink-0">
              <Bot className="w-4 h-4 text-accent" />
            </div>
            <div className="bg-card border rounded-xl px-4 py-3">
              <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="border-t bg-card p-4">
        <div className="max-w-3xl mx-auto flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
            placeholder={sessionId ? "Ask about any question from your test, or any JEE topic..." : "Ask any JEE Physics, Chemistry, or Math question..."}
            className="flex-1 px-4 py-3 rounded-lg border bg-background text-foreground focus:border-accent focus:outline-none transition-colors text-sm"
            disabled={isStreaming}
          />
          <Button onClick={handleSend} disabled={!input.trim() || isStreaming} className="bg-accent text-accent-foreground hover:bg-accent/90 active:scale-[0.97] transition-transform px-4">
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
};

export default DoubtSolverPage;
