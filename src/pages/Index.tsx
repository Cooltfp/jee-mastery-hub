import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { BookOpen, Brain, BarChart3, MessageCircle, ChevronRight, Atom, FlaskConical, Calculator, Clock, FileText, Zap } from "lucide-react";
import { useEffect, useRef, useState } from "react";

const Index = () => {
  const navigate = useNavigate();
  const [examDifficultyModal, setExamDifficultyModal] = useState<"jee_mains_2026" | "jee_advanced_2026" | null>(null);
  const [examDifficulty, setExamDifficulty] = useState<"easy" | "medium" | "hard" | "random">("medium");

  const handleStartExam = (examMode: string, difficulty: string) => {
    sessionStorage.setItem("examMode", examMode);
    sessionStorage.setItem("examDifficulty", difficulty);
    navigate("/test");
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Nav */}
      <nav className="border-b bg-card/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center">
              <BookOpen className="w-4 h-4 text-accent-foreground" />
            </div>
            <span className="font-bold text-lg tracking-tight">JEE Prep</span>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => navigate("/history")} className="active:scale-[0.97] transition-transform">
              <Clock className="w-4 h-4 mr-2" />
              History
            </Button>
            <Button variant="ghost" size="sm" onClick={() => navigate("/practice")} className="active:scale-[0.97] transition-transform">
              <BookOpen className="w-4 h-4 mr-2" />
              Practice
            </Button>
            <Button variant="ghost" size="sm" onClick={() => navigate("/doubt-solver")} className="active:scale-[0.97] transition-transform">
              <MessageCircle className="w-4 h-4 mr-2" />
              Doubt Solver
            </Button>
            <Button onClick={() => navigate("/test")} className="bg-accent text-accent-foreground hover:bg-accent/90 active:scale-[0.97] transition-transform" size="sm">
              Start Test
            </Button>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="py-16 lg:py-24 px-4">
        <div className="max-w-3xl mx-auto text-center">
          <ScrollReveal>
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-accent/10 text-accent text-xs font-semibold mb-6">
              <Brain className="w-3.5 h-3.5" />
              JEE Mains 2026 Ready
            </div>
          </ScrollReveal>
          <ScrollReveal delay={80}>
            <h1 className="text-4xl lg:text-5xl font-bold tracking-tight leading-[1.1] mb-4 text-balance">
              Practice smarter, not harder
            </h1>
          </ScrollReveal>
          <ScrollReveal delay={160}>
            <p className="text-muted-foreground text-lg max-w-xl mx-auto mb-8 text-pretty">
              NTA-style mock tests with real-time analytics, silly error detection, and an AI tutor that speaks your language — including LaTeX.
            </p>
          </ScrollReveal>
          <ScrollReveal delay={240}>
            <div className="flex items-center justify-center gap-3">
              <Button onClick={() => navigate("/test")} size="lg" className="bg-accent text-accent-foreground hover:bg-accent/90 active:scale-[0.97] transition-transform text-base px-6">
                Take a Mock Test
                <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
              <Button variant="outline" size="lg" onClick={() => navigate("/doubt-solver")} className="active:scale-[0.97] transition-transform text-base px-6">
                Ask a Doubt
              </Button>
            </div>
          </ScrollReveal>
        </div>
      </section>

      {/* Subject Cards */}
      <section className="pb-16 px-4">
        <div className="max-w-4xl mx-auto grid md:grid-cols-3 gap-4">
          <ScrollReveal delay={0}>
            <SubjectCard
              icon={<Atom className="w-5 h-5" />}
              title="Physics"
              topics={["Mechanics", "Electrodynamics", "Optics", "Modern Physics"]}
              colorClass="subject-physics"
              borderColor="border-physics/20"
              questions={5}
            />
          </ScrollReveal>
          <ScrollReveal delay={80}>
            <SubjectCard
              icon={<FlaskConical className="w-5 h-5" />}
              title="Chemistry"
              topics={["Physical", "Organic", "Inorganic", "Ionic Equilibrium"]}
              colorClass="subject-chemistry"
              borderColor="border-chemistry/20"
              questions={5}
            />
          </ScrollReveal>
          <ScrollReveal delay={160}>
            <SubjectCard
              icon={<Calculator className="w-5 h-5" />}
              title="Mathematics"
              topics={["Calculus", "Algebra", "Coordinate", "P&C"]}
              colorClass="subject-math"
              borderColor="border-math/20"
              questions={5}
            />
          </ScrollReveal>
        </div>
      </section>

      {/* Full Mock Papers */}
      <section className="pb-16 px-4">
        <div className="max-w-4xl mx-auto">
          <div className="mt-6 border-t pt-5">
            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Full Mock Papers</div>
            <div className="flex flex-col sm:flex-row gap-3">
              <button
                onClick={() => setExamDifficultyModal("jee_mains_2026")}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm transition-colors shadow-md"
              >
                <FileText className="w-4 h-4" />
                JEE Mains 2026
                <span className="text-xs opacity-75 ml-1">75 Qs · 3hrs</span>
              </button>
              <button
                onClick={() => setExamDifficultyModal("jee_advanced_2026")}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-semibold text-sm transition-colors shadow-md"
              >
                <Zap className="w-4 h-4" />
                JEE Advanced 2026
                <span className="text-xs opacity-75 ml-1">54 Qs · 3hrs</span>
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-16 px-4 bg-card border-y">
        <div className="max-w-4xl mx-auto">
          <ScrollReveal>
            <h2 className="text-2xl font-bold text-center mb-10 tracking-tight">Everything you need to crack JEE</h2>
          </ScrollReveal>
          <div className="grid md:grid-cols-2 gap-6">
            {[
              { icon: <BookOpen className="w-5 h-5" />, title: "NTA-Style Interface", desc: "Question palette, timer, mark for review — exactly like the real exam." },
              { icon: <BarChart3 className="w-5 h-5" />, title: "Smart Analytics", desc: "Accuracy vs speed analysis, subject heatmaps, and silly error detection." },
              { icon: <MessageCircle className="w-5 h-5" />, title: "AI Doubt Solver", desc: "Get step-by-step solutions with proper LaTeX rendering for equations." },
              { icon: <Brain className="w-5 h-5" />, title: "Learning Path", desc: "Personalized topic recommendations based on your test performance." },
            ].map((feat, i) => (
              <ScrollReveal key={i} delay={i * 80}>
                <div className="flex gap-4 p-4 rounded-xl hover:bg-muted/50 transition-colors">
                  <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center text-accent shrink-0">
                    {feat.icon}
                  </div>
                  <div>
                    <h3 className="font-semibold text-sm mb-1">{feat.title}</h3>
                    <p className="text-sm text-muted-foreground">{feat.desc}</p>
                  </div>
                </div>
              </ScrollReveal>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 px-4 text-center text-xs text-muted-foreground">
        Built for JEE aspirants. Keep practicing — your rank depends on it. 🚀
      </footer>

      {/* Difficulty Selection Modal */}
      {examDifficultyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-card rounded-2xl p-6 w-full max-w-sm space-y-5 shadow-2xl">
            <div>
              <h2 className="text-lg font-bold">
                {examDifficultyModal === "jee_mains_2026" ? "JEE Mains 2026" : "JEE Advanced 2026"}
              </h2>
              <p className="text-xs text-muted-foreground mt-1">Choose paper difficulty</p>
            </div>

            <div className="space-y-2">
              {[
                { value: "easy", label: "Easy", emoji: "🟢", desc: "Build confidence, more scoring questions" },
                { value: "medium", label: "Medium", emoji: "🟡", desc: "Standard JEE difficulty, realistic mix" },
                { value: "hard", label: "Hard", emoji: "🔴", desc: "Tough questions, exam pressure simulation" },
                { value: "random", label: "Random", emoji: "🎲", desc: "Mixed bag — unpredictable like the real exam" },
              ].map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setExamDifficulty(opt.value as any)}
                  className={`w-full text-left p-3 rounded-xl border-2 transition-all ${
                    examDifficulty === opt.value
                      ? "border-accent bg-accent/5"
                      : "border-border hover:border-muted-foreground/30"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-lg">{opt.emoji}</span>
                    <div>
                      <div className="font-semibold text-sm">{opt.label}</div>
                      <div className="text-xs text-muted-foreground">{opt.desc}</div>
                    </div>
                  </div>
                </button>
              ))}
            </div>

            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => setExamDifficultyModal(null)}>
                Cancel
              </Button>
              <Button
                className="flex-1 bg-accent text-accent-foreground hover:bg-accent/90"
                onClick={() => {
                  const resolvedDifficulty = examDifficulty === "random"
                    ? (["easy", "medium", "hard"][Math.floor(Math.random() * 3)] as string)
                    : examDifficulty;
                  handleStartExam(examDifficultyModal!, resolvedDifficulty);
                  setExamDifficultyModal(null);
                }}
              >
                Start Paper →
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

function SubjectCard({ icon, title, topics, colorClass, borderColor, questions }: {
  icon: React.ReactNode; title: string; topics: string[]; colorClass: string; borderColor: string; questions: number;
}) {
  return (
    <div className={`rounded-xl border ${borderColor} p-5 bg-card hover:shadow-md transition-shadow`}>
      <div className="flex items-center gap-2 mb-3">
        <span className={`w-9 h-9 rounded-lg flex items-center justify-center ${colorClass}`}>{icon}</span>
        <span className="font-semibold">{title}</span>
        <span className="ml-auto text-xs text-muted-foreground">{questions} Qs</span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {topics.map((t) => (
          <span key={t} className="text-xs px-2 py-1 rounded-md bg-secondary text-muted-foreground">{t}</span>
        ))}
      </div>
    </div>
  );
}

function ScrollReveal({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setTimeout(() => el.classList.add("visible"), delay);
          observer.unobserve(el);
        }
      },
      { threshold: 0.2 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [delay]);

  return <div ref={ref} className="scroll-reveal">{children}</div>;
}

export default Index;
