import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { LEVELS, JEE_CHAPTERS, getProfile, getDeviceId, LevelInfo } from "@/lib/levelSystem";
import { Lock, ChevronRight, Zap, Flame, Crown, Star, Shield, Atom, FlaskConical, Calculator } from "lucide-react";

type Confidence = "low" | "moderate" | "high";

interface PreTestConfig {
  level: number;
  confidence: Confidence;
  chapterName: string | null;
}

export default function PreTestDialog({ onStart }: { onStart: (config: PreTestConfig) => void }) {
  const [step, setStep] = useState<"level" | "confidence">("level");
  const [selectedLevel, setSelectedLevel] = useState(3);
  const [highestUnlocked, setHighestUnlocked] = useState(1);
  const [selectedChapter, setSelectedChapter] = useState<string | null>(null);
  const [expandedSubject, setExpandedSubject] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    getProfile().then((p) => {
      if (p) {
        setHighestUnlocked(p.highest_level_unlocked);
        setSelectedLevel(Math.min(3, p.highest_level_unlocked));
      }
    });
  }, []);

  const levelIcons = [Shield, Star, Zap, Flame, Crown];

  const subjectEntries = [
    { key: "physics" as const, label: "Physics", icon: <Atom className="w-4 h-4" /> },
    { key: "chemistry" as const, label: "Chemistry", icon: <FlaskConical className="w-4 h-4" /> },
    { key: "math" as const, label: "Mathematics", icon: <Calculator className="w-4 h-4" /> },
  ];

  if (step === "level") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="max-w-2xl w-full space-y-8">
          <div className="text-center">
            <h1 className="text-2xl font-bold tracking-tight mb-2">Choose Your Level</h1>
            <p className="text-sm text-muted-foreground">Score 60%+ to unlock the next level</p>
          </div>

          {/* Level Cards */}
          <div className="space-y-3">
            {LEVELS.map((lvl) => {
              const locked = lvl.id > highestUnlocked;
              const Icon = levelIcons[lvl.id - 1];
              const selected = selectedLevel === lvl.id;
              return (
                <button
                  key={lvl.id}
                  disabled={locked}
                  onClick={() => setSelectedLevel(lvl.id)}
                  className={`w-full text-left p-4 rounded-xl border-2 transition-all duration-200 active:scale-[0.99] ${
                    locked
                      ? "opacity-50 cursor-not-allowed border-border bg-muted/30"
                      : selected
                      ? "border-accent bg-accent/5 shadow-sm"
                      : "border-border hover:border-muted-foreground/30 hover:shadow-sm"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
                      locked ? "bg-muted text-muted-foreground" :
                      selected ? "bg-accent text-accent-foreground" : "bg-secondary text-foreground"
                    }`}>
                      {locked ? <Lock className="w-4 h-4" /> : <Icon className="w-5 h-5" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm">Level {lvl.id}</span>
                        <span className="text-xs text-muted-foreground">— {lvl.name}</span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">{lvl.description}</p>
                    </div>
                    {locked && <span className="text-xs text-muted-foreground">Locked</span>}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Optional Chapter Selection */}
          <div>
            <h3 className="text-sm font-semibold mb-3">Chapter Practice <span className="text-muted-foreground font-normal">(optional)</span></h3>
            <div className="space-y-2">
              {subjectEntries.map(({ key, label, icon }) => (
                <div key={key} className="border rounded-xl overflow-hidden">
                  <button
                    onClick={() => setExpandedSubject(expandedSubject === key ? null : key)}
                    className="w-full flex items-center gap-2 p-3 text-left hover:bg-muted/50 transition-colors text-sm font-medium"
                  >
                    {icon} {label}
                    <ChevronRight className={`w-3 h-3 ml-auto transition-transform ${expandedSubject === key ? "rotate-90" : ""}`} />
                  </button>
                  {expandedSubject === key && (
                    <div className="px-3 pb-3 flex flex-wrap gap-1.5">
                      {JEE_CHAPTERS[key].map((ch) => (
                        <button
                          key={ch}
                          onClick={() => setSelectedChapter(selectedChapter === ch ? null : ch)}
                          className={`text-xs px-2.5 py-1.5 rounded-md transition-colors active:scale-[0.97] ${
                            selectedChapter === ch
                              ? "bg-accent text-accent-foreground"
                              : "bg-secondary text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          {ch}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
            {selectedChapter && (
              <p className="text-xs text-accent mt-2">📎 Practicing: {selectedChapter}</p>
            )}
          </div>

          <div className="flex gap-3">
            <Button variant="outline" onClick={() => navigate("/")} className="active:scale-[0.97] transition-transform">
              Back
            </Button>
            <Button
              onClick={() => setStep("confidence")}
              className="flex-1 bg-accent text-accent-foreground hover:bg-accent/90 active:scale-[0.97] transition-transform"
            >
              Next <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Confidence step
  const confidenceOptions: { value: Confidence; label: string; emoji: string; desc: string }[] = [
    { value: "low", label: "Low", emoji: "😟", desc: "I need more practice on this" },
    { value: "moderate", label: "Moderate", emoji: "🤔", desc: "I know the basics, not fully confident" },
    { value: "high", label: "High", emoji: "😎", desc: "I'm well-prepared for this" },
  ];

  const [confidence, setConfidence] = useState<Confidence | null>(null);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="max-w-md w-full space-y-6">
        <div className="text-center">
          <h2 className="text-xl font-bold tracking-tight mb-2">Confidence Check</h2>
          <p className="text-sm text-muted-foreground">
            How confident are you{selectedChapter ? ` in ${selectedChapter}` : ""} at Level {selectedLevel}?
          </p>
        </div>

        <div className="space-y-3">
          {confidenceOptions.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setConfidence(opt.value)}
              className={`w-full text-left p-4 rounded-xl border-2 transition-all duration-200 active:scale-[0.99] ${
                confidence === opt.value
                  ? "border-accent bg-accent/5 shadow-sm"
                  : "border-border hover:border-muted-foreground/30"
              }`}
            >
              <div className="flex items-center gap-3">
                <span className="text-2xl">{opt.emoji}</span>
                <div>
                  <div className="font-semibold text-sm">{opt.label}</div>
                  <div className="text-xs text-muted-foreground">{opt.desc}</div>
                </div>
              </div>
            </button>
          ))}
        </div>

        <div className="flex gap-3">
          <Button variant="outline" onClick={() => setStep("level")} className="active:scale-[0.97] transition-transform">
            Back
          </Button>
          <Button
            disabled={!confidence}
            onClick={() => confidence && onStart({ level: selectedLevel, confidence, chapterName: selectedChapter })}
            className="flex-1 bg-accent text-accent-foreground hover:bg-accent/90 active:scale-[0.97] transition-transform"
          >
            Start Test <ChevronRight className="w-4 h-4 ml-1" />
          </Button>
        </div>
      </div>
    </div>
  );
}
