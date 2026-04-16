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
  RotateCcw,
  SlidersHorizontal,
  Shuffle,
} from "lucide-react";

type Confidence = "low" | "moderate" | "high";

export interface SubjectSelection {
  subject: string;
  chapters: string[];
  level?: number;
  questionsPerChapter?: Record<string, number>;
  totalQuestions?: number;
}

export interface PreTestConfig {
  level: number;
  confidence: Confidence;
  chapterName: string | null;
  selections: SubjectSelection[];
  totalTimerMinutes: number;
  totalQuestions: number;
  includeInteger: boolean;
  examMode?: string | null;
  examDifficulty?: string | null;
}

const SUBJECT_INFO = [
  { key: "physics" as const, label: "Physics", icon: Atom, timer: SUBJECT_TIMER_MINUTES.physics || 40 },
  { key: "chemistry" as const, label: "Chemistry", icon: FlaskConical, timer: SUBJECT_TIMER_MINUTES.chemistry || 30 },
  { key: "math" as const, label: "Mathematics", icon: Calculator, timer: SUBJECT_TIMER_MINUTES.math || 50 },
];

const DEFAULT_PER_SUBJECT = 10;

export default function PreTestDialog({
  onStart,
}: {
  onStart: (config: PreTestConfig) => void;
}) {
  const navigate = useNavigate();
  const [step, setStep] = useState<1 | 2 | 3>(1);

  // Step 1
  const [selectedSubjects, setSelectedSubjects] = useState<Set<string>>(new Set());

  // Step 2
  const [selectedChapters, setSelectedChapters] = useState<Record<string, Set<string>>>({});
  const [expandedSubject, setExpandedSubject] = useState<string | null>(null);
  const [customMode, setCustomMode] = useState(false);
  // Per-chapter question counts: { "physics": { "Kinematics": 5, "Optics": 3 }, ... }
  const [chapterCounts, setChapterCounts] = useState<Record<string, Record<string, number>>>({});
  // Per-subject total (when no specific chapters selected)
  const [subjectTotals, setSubjectTotals] = useState<Record<string, number>>({});

  // Step 3
  const [selectedLevel, setSelectedLevel] = useState<number | "random">(3);
  const [confidence, setConfidence] = useState<Confidence | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [perSubjectLevels, setPerSubjectLevels] = useState<Record<string, number>>({});
  const [includeInteger, setIncludeInteger] = useState(true);
  const [recommendations, setRecommendations] = useState<Record<string, number>>({});

  useEffect(() => {
    setRecommendations(loadRecommendations());

    const preConfig = sessionStorage.getItem("preTestConfig");
    if (preConfig) {
      try {
        const parsed = JSON.parse(preConfig);
        if (parsed.chapterName && parsed.subject) {
          const subj = parsed.subject.toLowerCase();
          setSelectedSubjects(new Set([subj]));
          setSelectedChapters({ [subj]: new Set([parsed.chapterName]) });
        } else if (parsed.chapterName) {
          for (const [subj, chapters] of Object.entries(JEE_CHAPTERS)) {
            if ((chapters as string[]).includes(parsed.chapterName)) {
              setSelectedSubjects(new Set([subj]));
              setSelectedChapters({ [subj]: new Set([parsed.chapterName]) });
              break;
            }
          }
        }
      } catch {}
      sessionStorage.removeItem("preTestConfig");
    }

    getProfile().then((p) => {
      if (p?.recommended_level) {
        setSelectedLevel(p.recommended_level);
      }
    });
  }, []);

  // ─── Subject toggle ─────────────────────────────────────────
  const toggleSubject = (key: string) => {
    setSelectedSubjects((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
        setSelectedChapters((ch) => {
          const copy = { ...ch };
          delete copy[key];
          return copy;
        });
        setChapterCounts((cc) => {
          const copy = { ...cc };
          delete copy[key];
          return copy;
        });
        setSubjectTotals((st) => {
          const copy = { ...st };
          delete copy[key];
          return copy;
        });
      } else {
        next.add(key);
        // Initialize subject total with default
        setSubjectTotals((st) => ({ ...st, [key]: DEFAULT_PER_SUBJECT }));
      }
      return next;
    });
  };

  // ─── Chapter toggle ─────────────────────────────────────────
  const toggleChapter = (subject: string, chapter: string) => {
    setSelectedChapters((prev) => {
      const subSet = new Set(prev[subject] || []);
      if (subSet.has(chapter)) {
        subSet.delete(chapter);
        // Remove count for this chapter
        setChapterCounts((cc) => {
          const copy = { ...cc };
          if (copy[subject]) {
            delete copy[subject][chapter];
          }
          return copy;
        });
      } else {
        subSet.add(chapter);
        // Set default count for this chapter
        setChapterCounts((cc) => {
          const subjCounts = { ...(cc[subject] || {}) };
          subjCounts[chapter] = 5; // Default 5 per chapter
          return { ...cc, [subject]: subjCounts };
        });
      }
      return { ...prev, [subject]: subSet };
    });
  };

  const toggleAllChapters = (subject: string) => {
    const chapters = JEE_CHAPTERS[subject as keyof typeof JEE_CHAPTERS] || [];
    const current = selectedChapters[subject] || new Set();
    if (current.size === chapters.length) {
      setSelectedChapters((prev) => ({ ...prev, [subject]: new Set() }));
      setChapterCounts((cc) => ({ ...cc, [subject]: {} }));
    } else {
      setSelectedChapters((prev) => ({ ...prev, [subject]: new Set(chapters) }));
      // Distribute default evenly
      const perChapter = Math.max(1, Math.floor(DEFAULT_PER_SUBJECT / chapters.length));
      const counts: Record<string, number> = {};
      chapters.forEach((ch) => { counts[ch] = perChapter; });
      setChapterCounts((cc) => ({ ...cc, [subject]: counts }));
    }
  };

  // ─── Set count for a specific chapter ───────────────────────
  const setChapterCount = (subject: string, chapter: string, count: number) => {
    setChapterCounts((cc) => {
      const subjCounts = { ...(cc[subject] || {}) };
      subjCounts[chapter] = Math.max(1, Math.min(15, count));
      return { ...cc, [subject]: subjCounts };
    });
  };

  // ─── Set total for a subject (no specific chapters mode) ───
  const setSubjectTotal = (subject: string, count: number) => {
    setSubjectTotals((st) => ({
      ...st,
      [subject]: Math.max(5, Math.min(20, count)),
    }));
  };

  // ─── Default distribution ───────────────────────────────────
  const applyDefault = (subject: string) => {
    const chapters = Array.from(selectedChapters[subject] || []);
    if (chapters.length === 0) {
      setSubjectTotals((st) => ({ ...st, [subject]: DEFAULT_PER_SUBJECT }));
      return;
    }
    const perChapter = Math.max(1, Math.round(DEFAULT_PER_SUBJECT / chapters.length));
    const counts: Record<string, number> = {};
    chapters.forEach((ch) => { counts[ch] = perChapter; });
    setChapterCounts((cc) => ({ ...cc, [subject]: counts }));
  };

  const applyDefaultAll = () => {
    Array.from(selectedSubjects).forEach((subj) => applyDefault(subj));
  };

  // ─── Calculate totals ──────────────────────────────────────
  const getSubjectQuestionCount = (subject: string): number => {
    const chapters = selectedChapters[subject];
    if (!chapters || chapters.size === 0) {
      return subjectTotals[subject] || DEFAULT_PER_SUBJECT;
    }
    const counts = chapterCounts[subject] || {};
    return Array.from(chapters).reduce((sum, ch) => sum + (counts[ch] || 5), 0);
  };

  const totalQuestions = Array.from(selectedSubjects).reduce(
    (sum, subj) => sum + getSubjectQuestionCount(subj),
    0
  );

  // Timer scales with question count: 2 min per question, adjusted by subject weight
  const calculateAdjustedTimer = (): number => {
    let total = 0;
    for (const subj of Array.from(selectedSubjects)) {
      const qCount = getSubjectQuestionCount(subj);
      const basePerQ = (SUBJECT_TIMER_MINUTES[subj] || 30) / DEFAULT_PER_SUBJECT; // min per question for this subject
      total += qCount * basePerQ;
    }
    return Math.round(total);
  };

  const totalTimer = calculateAdjustedTimer();

  // ─── Build selections for config ───────────────────────────
  const buildSelections = (overrideLevel?: number): SubjectSelection[] => {
    const effectiveLevel = overrideLevel ?? (selectedLevel === "random" ? 3 : selectedLevel);
    return Array.from(selectedSubjects).map((subj) => {
      const chapters = Array.from(selectedChapters[subj] || []);
      const qCount = getSubjectQuestionCount(subj);
      return {
        subject: subj,
        chapters,
        level: showAdvanced ? perSubjectLevels[subj] || effectiveLevel : undefined,
        questionsPerChapter: chapters.length > 0 ? (chapterCounts[subj] || {}) : undefined,
        totalQuestions: qCount,
      };
    });
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

  // ═══════════════════════════════════════════════════════════
  // STEP 1: SELECT SUBJECTS
  // ═══════════════════════════════════════════════════════════
  if (step === 1) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="max-w-lg w-full space-y-6">
          <div className="text-center">
            <h1 className="text-2xl font-bold tracking-tight mb-2">Select Subjects</h1>
            <p className="text-sm text-muted-foreground">
              Choose 1, 2, or all 3 — customize questions in the next step
            </p>
          </div>

          <div className="space-y-3">
            {SUBJECT_INFO.map(({ key, label, icon: Icon, timer }) => {
              const isSelected = selectedSubjects.has(key);
              return (
                <button
                  key={key}
                  onClick={() => toggleSubject(key)}
                  className={`w-full text-left p-4 rounded-xl border-2 transition-all duration-200 active:scale-[0.99] ${
                    isSelected
                      ? "border-accent bg-accent/5 shadow-sm"
                      : "border-border hover:border-muted-foreground/30 hover:shadow-sm"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
                      isSelected ? "bg-accent text-accent-foreground" : "bg-secondary text-foreground"
                    }`}>
                      <Icon className="w-5 h-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm">{label}</span>
                        <span className="text-xs text-muted-foreground">— {timer} min / 10 Qs</span>
                      </div>
                      <p className="text-xs text-muted-foreground">Customize question count next</p>
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
              <span className="font-semibold">{selectedSubjects.size} subject{selectedSubjects.size > 1 ? "s" : ""} selected</span>
            </div>
          )}

          <div className="flex gap-3">
            <Button variant="outline" onClick={() => navigate("/")} className="active:scale-[0.97] transition-transform">
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

  // ═══════════════════════════════════════════════════════════
  // STEP 2: SELECT TOPICS + QUESTION COUNTS
  // ═══════════════════════════════════════════════════════════
  if (step === 2) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="max-w-2xl w-full space-y-6">
          <div className="text-center">
            <h1 className="text-2xl font-bold tracking-tight mb-2">Select Topics & Question Count</h1>
            <p className="text-sm text-muted-foreground">
              Pick chapters and adjust how many questions per topic
            </p>
          </div>

          {/* Custom mode toggle + Default button */}
          <div className="flex items-center justify-between">
            <button
              onClick={() => setCustomMode(!customMode)}
              className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              {customMode ? "Hide question sliders" : "Customize question count per topic"}
            </button>
            {customMode && (
              <button
                onClick={applyDefaultAll}
                className="flex items-center gap-1.5 text-xs text-accent hover:text-accent/80 transition-colors"
              >
                <RotateCcw className="w-3 h-3" /> Reset to default
              </button>
            )}
          </div>

          <div className="space-y-4">
            {Array.from(selectedSubjects).map((subj) => {
              const info = SUBJECT_INFO.find((s) => s.key === subj)!;
              const chapters = JEE_CHAPTERS[subj as keyof typeof JEE_CHAPTERS] || [];
              const selected = selectedChapters[subj] || new Set();
              const isExpanded = expandedSubject === subj;
              const allSelected = selected.size === chapters.length;
              const subjQCount = getSubjectQuestionCount(subj);

              return (
                <div key={subj} className="border rounded-xl overflow-hidden">
                  {/* Subject header */}
                  <button
                    onClick={() => setExpandedSubject(isExpanded ? null : subj)}
                    className="w-full flex items-center gap-2 p-3 text-left hover:bg-muted/50 transition-colors text-sm font-medium"
                  >
                    <info.icon className="w-4 h-4" />
                    {info.label}
                    <span className="text-xs text-muted-foreground ml-1">
                      {selected.size > 0 ? `(${selected.size} topics)` : "(all chapters)"}
                    </span>
                    <span className="text-xs font-semibold text-accent ml-auto mr-2">
                      {subjQCount} Qs
                    </span>
                    <ChevronRight className={`w-3 h-3 transition-transform ${isExpanded ? "rotate-90" : ""}`} />
                  </button>

                  {isExpanded && (
                    <div className="px-3 pb-3 space-y-3">
                      {/* Select All + Default buttons */}
                      <div className="flex gap-2">
                        <button
                          onClick={() => toggleAllChapters(subj)}
                          className="text-xs px-2.5 py-1 rounded-md bg-secondary text-muted-foreground hover:text-foreground transition-colors"
                        >
                          {allSelected ? "Deselect All" : "Select All"}
                        </button>
                        {customMode && selected.size > 0 && (
                          <button
                            onClick={() => applyDefault(subj)}
                            className="text-xs px-2.5 py-1 rounded-md bg-accent/10 text-accent hover:bg-accent/20 transition-colors"
                          >
                            Default (10 Qs even split)
                          </button>
                        )}
                      </div>

                      {/* No chapters selected → subject-level slider */}
                      {selected.size === 0 && customMode && (
                        <div className="bg-muted/30 rounded-lg p-3">
                          <div className="flex items-center justify-between text-xs mb-2">
                            <span className="text-muted-foreground">Total questions for {info.label}</span>
                            <span className="font-semibold">{subjectTotals[subj] || DEFAULT_PER_SUBJECT}</span>
                          </div>
                          <input
                            type="range"
                            min={5}
                            max={20}
                            step={1}
                            value={subjectTotals[subj] || DEFAULT_PER_SUBJECT}
                            onChange={(e) => setSubjectTotal(subj, Number(e.target.value))}
                            className="w-full accent-[hsl(var(--accent))] h-1.5 rounded-full"
                          />
                          <div className="flex justify-between text-xs text-muted-foreground mt-1">
                            <span>5</span>
                            <span>20</span>
                          </div>
                        </div>
                      )}

                      {/* Chapter list with optional sliders */}
                      <div className="space-y-1.5">
                        {chapters.map((ch) => {
                          const isChSelected = selected.has(ch);
                          const count = chapterCounts[subj]?.[ch] || 5;
                          return (
                            <div key={ch}>
                              <div className="flex items-center gap-2">
                                <button
                                  onClick={() => toggleChapter(subj, ch)}
                                  className={`text-xs px-2.5 py-1.5 rounded-md transition-colors active:scale-[0.97] flex-1 text-left ${
                                    isChSelected
                                      ? "bg-accent text-accent-foreground"
                                      : "bg-secondary text-muted-foreground hover:text-foreground"
                                  }`}
                                >
                                  {ch}
                                </button>
                                {customMode && isChSelected && (
                                  <span className="text-xs font-semibold text-accent w-8 text-right">
                                    {count}
                                  </span>
                                )}
                              </div>
                              {/* Per-chapter slider */}
                              {customMode && isChSelected && (
                                <div className="ml-1 mr-1 mt-1 mb-2">
                                  <input
                                    type="range"
                                    min={1}
                                    max={15}
                                    step={1}
                                    value={count}
                                    onChange={(e) => setChapterCount(subj, ch, Number(e.target.value))}
                                    className="w-full accent-[hsl(var(--accent))] h-1 rounded-full"
                                  />
                                  <div className="flex justify-between text-xs text-muted-foreground" style={{ fontSize: "10px" }}>
                                    <span>1</span>
                                    <span>15</span>
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Summary */}
          <div className="bg-secondary/50 rounded-xl p-3 text-sm space-y-1">
            {Array.from(selectedSubjects).map((subj) => {
              const info = SUBJECT_INFO.find((s) => s.key === subj)!;
              const qCount = getSubjectQuestionCount(subj);
              const timePerQ = (info.timer / DEFAULT_PER_SUBJECT);
              const subjTime = Math.round(qCount * timePerQ);
              return (
                <div key={subj} className="flex justify-between">
                  <span>
                    {info.label} ({getChapterSummary(subj)})
                  </span>
                  <span className="text-muted-foreground">
                    {qCount} Qs • {subjTime} min
                  </span>
                </div>
              );
            })}
            <div className="border-t pt-1 mt-1 flex justify-between font-semibold">
              <span>Total</span>
              <span>{totalQuestions} Qs • {totalTimer} min</span>
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

  // ═══════════════════════════════════════════════════════════
  // STEP 3: LEVEL + CONFIDENCE
  // ═══════════════════════════════════════════════════════════
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="max-w-2xl w-full space-y-6">
        {/* Summary card */}
        <div className="bg-secondary/50 rounded-xl p-4 text-sm space-y-1">
          {Array.from(selectedSubjects).map((subj) => {
            const info = SUBJECT_INFO.find((s) => s.key === subj)!;
            const qCount = getSubjectQuestionCount(subj);
            const timePerQ = (info.timer / DEFAULT_PER_SUBJECT);
            const subjTime = Math.round(qCount * timePerQ);
            return (
              <div key={subj} className="flex justify-between">
                <span>
                  {info.label} ({getChapterSummary(subj)})
                </span>
                <span className="text-muted-foreground">
                  {qCount} Qs • {subjTime} min
                </span>
              </div>
            );
          })}
          <div className="border-t pt-1 mt-1 flex justify-between font-semibold">
            <span>Total</span>
            <span>{totalQuestions} Qs • {totalTimer} min</span>
          </div>
        </div>

        {/* Recommendations */}
        {Object.keys(recommendations).length > 0 && (
          <div className="bg-accent/5 border border-accent/20 rounded-xl p-4">
            <div className="text-xs font-semibold text-accent mb-2">⭐ Based on your last test</div>
            <div className="space-y-1">
              {Array.from(selectedSubjects).map((subj) => {
                const rec = recommendations[subj];
                if (!rec) return null;
                const info = SUBJECT_INFO.find((s) => s.key === subj)!;
                return (
                  <div key={subj} className="text-xs flex justify-between">
                    <span>{info.label}</span>
                    <span className="text-accent font-medium">Level {rec} recommended</span>
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
            {/* Random level tile */}
            <button
              onClick={() => setSelectedLevel("random")}
              className={`w-full text-left p-3 rounded-xl border-2 transition-all duration-200 active:scale-[0.99] ${
                selectedLevel === "random"
                  ? "border-accent bg-accent/5 shadow-sm"
                  : "border-border hover:border-muted-foreground/30"
              }`}
            >
              <div className="flex items-center gap-3">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                  selectedLevel === "random" ? "bg-accent text-accent-foreground" : "bg-secondary text-foreground"
                }`}>
                  <Shuffle className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <span className="font-semibold text-sm">Random</span>
                  <span className="text-xs text-muted-foreground ml-2">Surprise me — picks a level from 1–5</span>
                </div>
              </div>
            </button>
            {LEVELS.map((lvl) => {
              const Icon = levelIcons[lvl.id - 1];
              const selected = selectedLevel === lvl.id;
              const isRecommended = Object.values(recommendations).some((r) => r === lvl.id);
              return (
                <button
                  key={lvl.id}
                  onClick={() => setSelectedLevel(lvl.id)}
                  className={`w-full text-left p-3 rounded-xl border-2 transition-all duration-200 active:scale-[0.99] ${
                    selected ? "border-accent bg-accent/5 shadow-sm" : "border-border hover:border-muted-foreground/30"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                      selected ? "bg-accent text-accent-foreground" : "bg-secondary text-foreground"
                    }`}>
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="font-semibold text-sm">Level {lvl.id}</span>
                      <span className="text-xs text-muted-foreground ml-2">{lvl.name}</span>
                    </div>
                    {isRecommended && (
                      <span className="text-xs text-accent font-medium">⭐ Recommended</span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Advanced per-subject levels */}
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
                {selectedLevel === "random" ? (
                  <p className="text-xs text-muted-foreground italic">
                    Per-subject levels are not available in Random mode — a level will be picked randomly at start.
                  </p>
                ) : (
                  Array.from(selectedSubjects).map((subj) => {
                    const info = SUBJECT_INFO.find((s) => s.key === subj)!;
                    const rec = recommendations[subj];
                    return (
                      <div key={subj} className="flex items-center gap-3 text-sm">
                        <span className="w-24">{info.label}</span>
                        <select
                          value={perSubjectLevels[subj] || (typeof selectedLevel === "number" ? selectedLevel : 3)}
                          onChange={(e) =>
                            setPerSubjectLevels((prev) => ({ ...prev, [subj]: Number(e.target.value) }))
                          }
                          className="flex-1 rounded-md border bg-background px-2 py-1.5 text-sm"
                        >
                          {LEVELS.map((l) => (
                            <option key={l.id} value={l.id}>Level {l.id} — {l.name}</option>
                          ))}
                        </select>
                        {rec && <span className="text-xs text-accent whitespace-nowrap">⭐ {rec}</span>}
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </div>
        )}

        {/* Confidence */}
        <div>
          <h2 className="text-lg font-bold tracking-tight mb-3">Confidence Check</h2>
          <div className="space-y-2">
            {confidenceOptions.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setConfidence(opt.value)}
                className={`w-full text-left p-3 rounded-xl border-2 transition-all duration-200 active:scale-[0.99] ${
                  confidence === opt.value ? "border-accent bg-accent/5 shadow-sm" : "border-border hover:border-muted-foreground/30"
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className="text-xl">{opt.emoji}</span>
                  <div>
                    <div className="font-semibold text-sm">{opt.label}</div>
                    <div className="text-xs text-muted-foreground">{opt.desc}</div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Integer Type Toggle */}
        {(selectedLevel === "random" || selectedLevel >= 3) && (
          <div className="flex items-center justify-between p-3 rounded-xl border border-border bg-secondary/30">
            <div>
              <div className="font-semibold text-sm">Include Integer Type Questions</div>
              <div className="text-xs text-muted-foreground">Answer is any positive integer, +4/-1 marking</div>
            </div>
            <button
              onClick={() => setIncludeInteger(!includeInteger)}
              className={`w-11 h-6 rounded-full transition-colors relative ${
                includeInteger ? "bg-accent" : "bg-muted"
              }`}
            >
              <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
                includeInteger ? "left-[22px]" : "left-0.5"
              }`} />
            </button>
          </div>
        )}

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
              const resolvedLevel = selectedLevel === "random"
                ? Math.floor(Math.random() * 5) + 1
                : selectedLevel;
              const selections = buildSelections(resolvedLevel);
              let chapterName: string | null = null;
              if (selections.length === 1 && selections[0].chapters.length === 1) {
                chapterName = selections[0].chapters[0];
              }
              onStart({
                level: resolvedLevel,
                confidence,
                chapterName,
                selections,
                totalTimerMinutes: totalTimer,
                totalQuestions,
                includeInteger: resolvedLevel >= 3 ? includeInteger : false,
              });
            }}
            className="flex-1 bg-accent text-accent-foreground hover:bg-accent/90 active:scale-[0.97] transition-transform"
          >
            Start Test ({totalQuestions} Qs, {totalTimer} min) <ChevronRight className="w-4 h-4 ml-1" />
          </Button>
        </div>
      </div>
    </div>
  );
}
