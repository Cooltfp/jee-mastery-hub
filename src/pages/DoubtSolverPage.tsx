import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import MathText from "@/components/MathText";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Send, Bot, User } from "lucide-react";

interface Message {
  role: "user" | "assistant";
  content: string;
}

const sampleResponses: Record<string, string> = {
  default: `I'm your JEE Doubt Solver! Ask me any Physics, Chemistry, or Math question. I can explain concepts, solve problems step-by-step, and help you understand tricky topics.

Try asking things like:
- "Explain moment of inertia"
- "Solve: Find the pH of 0.1M acetic acid (Ka = 1.8×10⁻⁵)"
- "What is the difference between SN1 and SN2 reactions?"`,
  
  "moment of inertia": `## Moment of Inertia

The **moment of inertia** ($I$) is the rotational analog of mass in linear motion. It measures how difficult it is to change an object's rotational motion.

### Definition
$$I = \\sum m_i r_i^2 \\quad \\text{(discrete)} \\qquad I = \\int r^2 \\, dm \\quad \\text{(continuous)}$$

### Common Formulas

| Shape | Axis | Moment of Inertia |
|-------|------|-------------------|
| Solid Sphere | Through center | $\\frac{2}{5}MR^2$ |
| Hollow Sphere | Through center | $\\frac{2}{3}MR^2$ |
| Solid Cylinder | Central axis | $\\frac{1}{2}MR^2$ |
| Rod (center) | Perpendicular | $\\frac{1}{12}ML^2$ |
| Rod (end) | Perpendicular | $\\frac{1}{3}ML^2$ |

### Parallel Axis Theorem
$$I = I_{cm} + Md^2$$

where $d$ is the distance between the parallel axes.

### Perpendicular Axis Theorem (for planar bodies)
$$I_z = I_x + I_y$$

This is crucial for JEE! Many problems combine these theorems. Practice deriving $I$ for composite bodies.`,

  "newton": `## Newton's Laws of Motion

### First Law (Inertia)
An object at rest stays at rest, and an object in motion stays in motion with the same velocity, unless acted upon by a net external force.

$$\\sum \\vec{F} = 0 \\implies \\vec{v} = \\text{constant}$$

### Second Law
$$\\vec{F}_{net} = m\\vec{a} = \\frac{d\\vec{p}}{dt}$$

For variable mass systems (rockets):
$$F_{ext} = m\\frac{dv}{dt} + v_{rel}\\frac{dm}{dt}$$

### Third Law
For every action, there is an equal and opposite reaction.
$$\\vec{F}_{12} = -\\vec{F}_{21}$$

**JEE Tip:** Free body diagrams are your best friend. Always draw them!`,
};

const DoubtSolverPage = () => {
  const navigate = useNavigate();
  const [messages, setMessages] = useState<Message[]>([
    { role: "assistant", content: sampleResponses.default },
  ]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = () => {
    if (!input.trim()) return;
    const userMsg = input.trim();
    setMessages((prev) => [...prev, { role: "user", content: userMsg }]);
    setInput("");
    setIsTyping(true);

    // Simulate AI response
    setTimeout(() => {
      const lower = userMsg.toLowerCase();
      let response = `Great question! Let me help you with that.

For **"${userMsg}"**, here's a detailed explanation:

This is a concept frequently tested in JEE Mains. The key is to understand the fundamental principles and apply them systematically.

**Key Formula:**
$$E = mc^2$$

*To get full AI-powered responses, connect Lovable Cloud for the AI Doubt Solver feature.*`;

      if (lower.includes("moment") || lower.includes("inertia")) {
        response = sampleResponses["moment of inertia"];
      } else if (lower.includes("newton") || lower.includes("law")) {
        response = sampleResponses["newton"];
      }

      setMessages((prev) => [...prev, { role: "assistant", content: response }]);
      setIsTyping(false);
    }, 1200);
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b bg-card px-4 py-3 flex items-center gap-3 sticky top-0 z-10">
        <Button variant="ghost" size="sm" onClick={() => navigate("/")} className="active:scale-[0.97] transition-transform">
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <Bot className="w-5 h-5 text-accent" />
        <h1 className="font-semibold text-lg">AI Doubt Solver</h1>
        <span className="text-xs px-2 py-1 rounded-md bg-accent/10 text-accent font-medium">
          LaTeX Enabled
        </span>
      </header>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((msg, i) => (
          <div key={i} className={`flex gap-3 ${msg.role === "user" ? "justify-end" : ""}`}>
            {msg.role === "assistant" && (
              <div className="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center shrink-0">
                <Bot className="w-4 h-4 text-accent" />
              </div>
            )}
            <div className={`max-w-2xl rounded-xl px-4 py-3 ${
              msg.role === "user"
                ? "bg-primary text-primary-foreground"
                : "bg-card border"
            }`}>
              {msg.role === "assistant" ? (
                <MathText>{msg.content}</MathText>
              ) : (
                <p className="text-sm">{msg.content}</p>
              )}
            </div>
            {msg.role === "user" && (
              <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center shrink-0">
                <User className="w-4 h-4 text-primary-foreground" />
              </div>
            )}
          </div>
        ))}
        {isTyping && (
          <div className="flex gap-3">
            <div className="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center shrink-0">
              <Bot className="w-4 h-4 text-accent" />
            </div>
            <div className="bg-card border rounded-xl px-4 py-3">
              <div className="flex gap-1">
                <span className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                <span className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                <span className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="border-t bg-card p-4">
        <div className="max-w-3xl mx-auto flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
            placeholder="Ask any JEE Physics, Chemistry, or Math question..."
            className="flex-1 px-4 py-3 rounded-lg border bg-background text-foreground focus:border-accent focus:outline-none transition-colors text-sm"
          />
          <Button
            onClick={handleSend}
            disabled={!input.trim() || isTyping}
            className="bg-accent text-accent-foreground hover:bg-accent/90 active:scale-[0.97] transition-transform px-4"
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
};

export default DoubtSolverPage;
