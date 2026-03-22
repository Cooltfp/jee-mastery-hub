import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { LEVELS, JEE_CHAPTERS, getProfile } from "@/lib/levelSystem";
import { SUBJECT_TIMER_MINUTES, calculateTotalTimer } from "@/data/chapters";
import { loadRecommendations } from "@/utils/levelRecommendation";
import {
  ChevronRight,
  ChevronLeft,
  Zap,
  Flame,
  Crown,
  Star,
  Shield,
  Atom,
  FlaskConical,
  Calculator,
  Check,
} from "lucide-react";

type Confidence = "low" | "moderate" | "high";

export interface SubjectSelection {
  subject: string; // "physics" | "chemistry" | "math"
  chapters: string[];
  level?: number;
}

export interface PreTestConfig {
  level: number;
  confidence: Confidence;
  chapterName: string | null;
  selections: SubjectSelection[];
  totalTimerMinutes: number;
}

const SUBJECT_INFO = [
  { key: "physics" as const, label: "Physics", icon: Atom, timer: SUBJECT_TIMER_MINUTES.physics || 40 },
  { key: "chemistry" as const, label: "Chemistry", icon: FlaskConical, timer: SUBJECT_TIMER_MINUTES.chemistry || 30 },
  { key: "math" as const, label: "Mathematics", icon: Calculator, timer: SUBJECT_TIMER_MINUTES.math || 50 },
];

export default function PreTestDialog({
  onStart,
}: {
  onStart: (config: PreTestConfig) => void;
}) {
  const navigate = useNavigate();
  const [step, setStep] = useState<1 | 2 | 3>(1);

  // Step 1: Subject selection
  const [selectedSubjects, setSelectedSubjects] = useState<Set<string>>(new Set());

  // Step 2: Chapter selection per subject
  const [selectedChapters, setSelectedChapters] = useState<Record<string, Set<string>>>({});
  const [expandedSubject, setExpandedSubject] = useState<string | null>(null);

  // Step 3: Level + confidence
  const [selectedLevel, setSelectedLevel] = useState(3);
  const [confidence, setConfidence] = useState<Confidence | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [perSubjectLevels, setPerSubjectLevels] = useState<Record<string, number>>({});
  const [recommendations, setRecommendations] = useState<Record<string, number>>({});

  useEffect(() => {
    // Load recommendations from localStorage
    setRecommendations(loadRecommendations());

    // Check for pre-selected chapter from practice page
    const preConfig = sessionStorage.getItem("preTestConfig");
    if (preConfig) {
      try {
        const parsed = JSON.parse(preConfig);
        if (parsed.chapterName && parsed.subject) {
          const subj = parsed.subject.toLowerCase();
          setSelectedSubjects(new Set([subj]));
          setSelectedChapters({ [subj]: new Set([parsed.chapterName]) });
        } else if (parsed.chapterName) {
          // Try to find which subject this chapter belongs to
          for (const [subj, chapters] of Object.entries(JEE_CHAPTERS)) {
            if ((chapters as string[]).includes(parsed.chapterName)) {
              setSelectedSubjects(new Set([subj]));
              setSelectedChapters({ [subj]: new Set([parsed.chapterName]) });
              break;
            }
          }
        }
      } catch { }
      sessionStorage.removeItem("preTestConfig");
    }

    // Load profile for recommended level
    getProfile().then((p) => {
      if (p?.recommended_level) {
        setSelectedLevel(p.recommended_level);
      }
    });
  }, []);

  const toggleSubject = (key: string) => {
    setSelectedSubjects((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
        // Also remove chapters for this subject
        setSelectedChapters((ch) => {
          const copy = { ...ch };
          delete copy[key];
          return copy;
        });
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const toggleChapter = (subject: string, chapter: string) => {
    setSelectedChapters((prev) => {
      const subSet = new Set(prev[subject] || []);
      if (subSet.has(chapter)) subSet.delete(chapter);
      else subSet.add(chapter);
      return { ...prev, [subject]: subSet };
    });
  };

  const toggleAllChapters = (subject: string) => {
    const chapters = JEE_CHAPTERS[subject as keyof typeof JEE_CHAPTERS] || [];
    const current = selectedChapters[subject] || new Set();
    if (current.size === chapters.length) {
      // Deselect all
      setSelectedChapters((prev) => ({ ...prev, [subject]: new Set() }));
    } else {
      // Select all
      setSelectedChapters((prev) => ({ ...prev, [subject]: new Set(chapters) }));
    }
  };

  const totalQuestions = selectedSubjects.size * 10;
  const totalTimer = calculateTotalTimer(Array.from(selectedSubjects));

  const buildSelections = (): SubjectSelection[] => {
    return Array.from(selectedSubjects).map((subj) => ({
      subject: subj,
      chapters: Array.from(selectedChapters[subj] || []),
      level: showAdvanced ? perSubjectLevels[subj] || selectedLevel : undefined,
    }));
  };

  const getChapterSummary = (subj: string): string => {
    const ch = selectedChapters[subj];
    if (!ch || ch.size === 0) return "All chapters";
    if (ch.size <= 2) return Array.from(ch).join(", ");
    return `${ch.size} topics`;
  };

  const levelIcons = [Shield, Star, Zap, Flame, Crown];

  const confidenceOptions: { value: Confidence; label: string; emoji: string; desc: string }[] = [
    { value: "low", label: "Low", emoji: "😟", desc: "I need more practice on this" },
    { value: "moderate", label: "Moderate", emoji: "🤔", desc: "I know the basics, not fully confident" },
    { value: "high", label: "High", emoji: "😎", desc: "I'm well-prepared for this" },
  ];

  // ─── STEP 1: SELECT SUBJECTS ────────────────────────────────
  if (step === 1) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="max-w-lg w-full space-y-6">
          <div className="text-center">
            <h1 className="text-2xl font-bold tracking-tight mb-2">Select Subjects</h1>
            <p className="text-sm text-muted-foreground">
              Choose 1, 2, or all 3 — each subject adds 10 questions
            </p>
          </div>

          <div className="space-y-3">
            {SUBJECT_INFO.map(({ key, label, icon: Icon, timer }) => {
              const isSelected = selectedSubjects.has(key);
              return (
                <button
                  key={key}
                  onClick={() => toggleSubject(key)}
                  className={`w-full text-left p-4 rounded-xl border-2 transition-all duration-200 active:scale-[0.99] ${isSelected
                    ? "border-accent bg-accent/5 shadow-sm"
                    : "border-border hover:border-muted-foreground/30 hover:shadow-sm"
                    }`}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${isSelected
                        ? "bg-accent text-accent-foreground"
                        : "bg-secondary text-foreground"
                        }`}
                    >
                      <Icon className="w-5 h-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm">{label}</span>
                        <span className="text-xs text-muted-foreground">— {timer} min</span>
                      </div>
                      <p className="text-xs text-muted-foreground">10 questions</p>
                    </div>
                    {isSelected && (
                      <div className="w-6 h-6 rounded-full bg-accent flex items-center justify-center">
                        <Check className="w-3.5 h-3.5 text-accent-foreground" />
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          {selectedSubjects.size > 0 && (
            <div className="bg-secondary/50 rounded-xl p-3 text-center text-sm">
              <span className="font-semibold">{totalQuestions} questions</span>
              <span className="text-muted-foreground"> • </span>
              <span className="font-semibold">{totalTimer} min</span>
            </div>
          )}

          <div className="flex gap-3">
            <Button
              variant="outline"
              onClick={() => navigate("/")}
              className="active:scale-[0.97] transition-transform"
            >
              Back
            </Button>
            <Button
              disabled={selectedSubjects.size === 0}
              onClick={() => setStep(2)}
              className="flex-1 bg-accent text-accent-foreground hover:bg-accent/90 active:scale-[0.97] transition-transform"
            >
              Next <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ─── STEP 2: SELECT TOPICS ──────────────────────────────────
  if (step === 2) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="max-w-2xl w-full space-y-6">
          <div className="text-center">
            <h1 className="text-2xl font-bold tracking-tight mb-2">Select Topics</h1>
            <p className="text-sm text-muted-foreground">
              Pick specific chapters or leave empty for all chapters
            </p>
          </div>

          <div className="space-y-3">
            {Array.from(selectedSubjects).map((subj) => {
              const info = SUBJECT_INFO.find((s) => s.key === subj)!;
              const chapters = JEE_CHAPTERS[subj as keyof typeof JEE_CHAPTERS] || [];
              const selected = selectedChapters[subj] || new Set();
              const isExpanded = expandedSubject === subj;
              const allSelected = selected.size === chapters.length;

              return (
                <div key={subj} className="border rounded-xl overflow-hidden">
                  <button
                    onClick={() => setExpandedSubject(isExpanded ? null : subj)}
                    className="w-full flex items-center gap-2 p-3 text-left hover:bg-muted/50 transition-colors text-sm font-medium"
                  >
                    <info.icon className="w-4 h-4" />
                    {info.label}
                    <span className="text-xs text-muted-foreground ml-1">
                      {selected.size > 0
                        ? `(${selected.size} selected)`
                        : "(all chapters)"}
                    </span>
                    <ChevronRight
                      className={`w-3 h-3 ml-auto transition-transform ${isExpanded ? "rotate-90" : ""}`}
                    />
                  </button>
                  {isExpanded && (
                    <div className="px-3 pb-3 space-y-2">
                      <button
                        onClick={() => toggleAllChapters(subj)}
                        className="text-xs px-2.5 py-1 rounded-md bg-secondary text-muted-foreground hover:text-foreground transition-colors"
                      >
                        {allSelected ? "Deselect All" : "Select All"}
                      </button>
                      <div className="flex flex-wrap gap-1.5">
                        {chapters.map((ch) => (
                          <button
                            key={ch}
                            onClick={() => toggleChapter(subj, ch)}
                            className={`text-xs px-2.5 py-1.5 rounded-md transition-colors active:scale-[0.97] ${selected.has(ch)
                              ? "bg-accent text-accent-foreground"
                              : "bg-secondary text-muted-foreground hover:text-foreground"
                              }`}
                          >
                            {ch}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="bg-secondary/50 rounded-xl p-3 text-sm space-y-1">
            {Array.from(selectedSubjects).map((subj) => {
              const info = SUBJECT_INFO.find((s) => s.key === subj)!;
              return (
                <div key={subj} className="flex justify-between">
                  <span>
                    {info.label} ({getChapterSummary(subj)})
                  </span>
                  <span className="text-muted-foreground">
                    10 Qs • {info.timer} min
                  </span>
                </div>
              );
            })}
            <div className="border-t pt-1 mt-1 flex justify-between font-semibold">
              <span>Total</span>
              <span>
                {totalQuestions} Qs • {totalTimer} min
              </span>
            </div>
          </div>

          <div className="flex gap-3">
            <Button
              variant="outline"
              onClick={() => setStep(1)}
              className="active:scale-[0.97] transition-transform"
            >
              <ChevronLeft className="w-4 h-4 mr-1" /> Back
            </Button>
            <Button
              onClick={() => setStep(3)}
              className="flex-1 bg-accent text-accent-foreground hover:bg-accent/90 active:scale-[0.97] transition-transform"
            >
              Next <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ─── STEP 3: LEVEL + CONFIDENCE ─────────────────────────────
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="max-w-2xl w-full space-y-6">
        {/* Summary card */}
        <div className="bg-secondary/50 rounded-xl p-4 text-sm space-y-1">
          {Array.from(selectedSubjects).map((subj) => {
            const info = SUBJECT_INFO.find((s) => s.key === subj)!;
            return (
              <div key={subj} className="flex justify-between">
                <span>
                  {info.label} ({getChapterSummary(subj)})
                </span>
                <span className="text-muted-foreground">
                  10 Qs • {info.timer} min
                </span>
              </div>
            );
          })}
          <div className="border-t pt-1 mt-1 flex justify-between font-semibold">
            <span>Total</span>
            <span>
              {totalQuestions} Qs • {totalTimer} min
            </span>
          </div>
        </div>

        {/* Recommendations */}
        {Object.keys(recommendations).length > 0 && (
          <div className="bg-accent/5 border border-accent/20 rounded-xl p-4">
            <div className="text-xs font-semibold text-accent mb-2">
              ⭐ Based on your last test
            </div>
            <div className="space-y-1">
              {Array.from(selectedSubjects).map((subj) => {
                const rec = recommendations[subj];
                if (!rec) return null;
                const info = SUBJECT_INFO.find((s) => s.key === subj)!;
                return (
                  <div key={subj} className="text-xs flex justify-between">
                    <span>{info.label}</span>
                    <span className="text-accent font-medium">
                      Level {rec} recommended
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Level selector */}
        <div>
          <h2 className="text-lg font-bold tracking-tight mb-3">Choose Level</h2>
          <div className="space-y-2">
            {LEVELS.map((lvl) => {
              const Icon = levelIcons[lvl.id - 1];
              const selected = selectedLevel === lvl.id;
              const isRecommended = Object.values(recommendations).some(
                (r) => r === lvl.id
              );
              return (
                <button
                  key={lvl.id}
                  onClick={() => setSelectedLevel(lvl.id)}
                  className={`w-full text-left p-3 rounded-xl border-2 transition-all duration-200 active:scale-[0.99] ${selected
                    ? "border-accent bg-accent/5 shadow-sm"
                    : "border-border hover:border-muted-foreground/30"
                    }`}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${selected
                        ? "bg-accent text-accent-foreground"
                        : "bg-secondary text-foreground"
                        }`}
                    >
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="font-semibold text-sm">
                        Level {lvl.id}
                      </span>
                      <span className="text-xs text-muted-foreground ml-2">
                        {lvl.name}
                      </span>
                    </div>
                    {isRecommended && (
                      <span className="text-xs text-accent font-medium">
                        ⭐ Recommended
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Advanced: per-subject levels */}
        {selectedSubjects.size > 1 && (
          <div>
            <button
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              {showAdvanced ? "▾" : "▸"} Advanced: Set level per subject
            </button>
            {showAdvanced && (
              <div className="mt-2 space-y-2 bg-secondary/30 rounded-xl p-3">
                {Array.from(selectedSubjects).map((subj) => {
                  const info = SUBJECT_INFO.find((s) => s.key === subj)!;
                  const rec = recommendations[subj];
                  return (
                    <div
                      key={subj}
                      className="flex items-center gap-3 text-sm"
                    >
                      <span className="w-24">{info.label}</span>
                      <select
                        value={perSubjectLevels[subj] || selectedLevel}
                        onChange={(e) =>
                          setPerSubjectLevels((prev) => ({
                            ...prev,
                            [subj]: Number(e.target.value),
                          }))
                        }
                        className="flex-1 rounded-md border bg-background px-2 py-1.5 text-sm"
                      >
                        {LEVELS.map((l) => (
                          <option key={l.id} value={l.id}>
                            Level {l.id} — {l.name}
                          </option>
                        ))}
                      </select>
                      {rec && (
                        <span className="text-xs text-accent whitespace-nowrap">
                          ⭐ {rec}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Confidence */}
        <div>
          <h2 className="text-lg font-bold tracking-tight mb-3">
            Confidence Check
          </h2>
          <div className="space-y-2">
            {confidenceOptions.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setConfidence(opt.value)}
                className={`w-full text-left p-3 rounded-xl border-2 transition-all duration-200 active:scale-[0.99] ${confidence === opt.value
                  ? "border-accent bg-accent/5 shadow-sm"
                  : "border-border hover:border-muted-foreground/30"
                  }`}
              >
                <div className="flex items-center gap-3">
                  <span className="text-xl">{opt.emoji}</span>
                  <div>
                    <div className="font-semibold text-sm">{opt.label}</div>
                    <div className="text-xs text-muted-foreground">
                      {opt.desc}
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="flex gap-3">
          <Button
            variant="outline"
            onClick={() => setStep(2)}
            className="active:scale-[0.97] transition-transform"
          >
            <ChevronLeft className="w-4 h-4 mr-1" /> Back
          </Button>
          <Button
            disabled={!confidence}
            onClick={() => {
              if (!confidence) return;
              const selections = buildSelections();
              // For backward compat, also set chapterName if single subject + single chapter
              let chapterName: string | null = null;
              if (selections.length === 1 && selections[0].chapters.length === 1) {
                chapterName = selections[0].chapters[0];
              }
              onStart({
                level: selectedLevel,
                confidence,
                chapterName,
                selections,
                totalTimerMinutes: totalTimer,
              });
            }}
            className="flex-1 bg-accent text-accent-foreground hover:bg-accent/90 active:scale-[0.97] transition-transform"
          >
            Start Test <ChevronRight className="w-4 h-4 ml-1" />
          </Button>
        </div>
      </div>
    </div>
  );
}
