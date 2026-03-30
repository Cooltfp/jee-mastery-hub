import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Clock, Trophy, Target, TrendingUp, ChevronRight, Calendar } from "lucide-react";

interface TestSession {
  id: string;
  created_at: string;
  score: number | null;
  max_score: number | null;
  level: number | null;
  chapter_name: string | null;
  confidence: string | null;
  is_completed: boolean;
  total_time_taken: number | null;
  subject_wise: any;
}

const HistoryPage = () => {
  const navigate = useNavigate();
  const [sessions, setSessions] = useState<TestSession[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchHistory = async () => {
      const deviceId = localStorage.getItem("jee_device_id") || "unknown";
      const { data, error } = await supabase
        .from("test_sessions")
        .select("*")
        .eq("device_id", deviceId)
        .eq("is_completed", true)
        .order("created_at", { ascending: false })
        .limit(50);

      if (!error && data) setSessions(data);
      setLoading(false);
    };
    fetchHistory();
  }, []);

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  };

  const formatTime = (seconds: number | null) => {
    if (!seconds) return "—";
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}m ${s}s`;
  };

  const getScoreColor = (score: number | null, max: number | null) => {
    if (score == null || max == null || max === 0) return "text-muted-foreground";
    const pct = (score / max) * 100;
    if (pct >= 80) return "text-green-500";
    if (pct >= 50) return "text-yellow-500";
    return "text-red-500";
  };

  const getLevelLabel = (level: number | null) => {
    const labels: Record<number, string> = {
      1: "Foundational",
      2: "Standard",
      3: "JEE Mains",
      4: "Intense",
      5: "Challenger",
    };
    return labels[level || 3] || "JEE Mains";
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card px-4 py-3 flex items-center gap-3 sticky top-0 z-10">
        <Button variant="ghost" size="sm" onClick={() => navigate("/")}>
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <Clock className="w-5 h-5 text-accent" />
        <h1 className="font-semibold text-lg">Test History</h1>
        <span className="text-xs text-muted-foreground ml-auto">{sessions.length} tests</span>
      </header>

      <div className="max-w-3xl mx-auto p-4 space-y-3">
        {loading ? (
          <div className="text-center py-20 text-muted-foreground">Loading history...</div>
        ) : sessions.length === 0 ? (
          <div className="text-center py-20">
            <Trophy className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
            <p className="text-muted-foreground mb-4">No tests taken yet</p>
            <Button onClick={() => navigate("/test")} className="bg-accent text-accent-foreground hover:bg-accent/90">
              Take Your First Test
            </Button>
          </div>
        ) : (
          sessions.map((s) => {
            const pct = s.max_score && s.max_score > 0 ? Math.round((s.score! / s.max_score) * 100) : 0;
            return (
              <div
                key={s.id}
                className="border rounded-xl bg-card p-4 hover:shadow-sm transition-shadow cursor-pointer"
                onClick={() => {
                  sessionStorage.setItem("lastSessionId", s.id);
                  navigate("/results");
                }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs px-2 py-0.5 rounded bg-accent/10 text-accent font-medium">
                        Level {s.level || 3} — {getLevelLabel(s.level)}
                      </span>
                      {s.chapter_name && (
                        <span className="text-xs px-2 py-0.5 rounded bg-secondary text-muted-foreground truncate max-w-[150px]">
                          {s.chapter_name}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-4 mt-2 text-sm">
                      <span className={`font-bold text-lg ${getScoreColor(s.score, s.max_score)}`}>
                        {s.score ?? 0}/{s.max_score ?? 0}
                      </span>
                      <span className="text-muted-foreground">({pct}%)</span>

                      <div className="flex items-center gap-1 text-muted-foreground text-xs">
                        <Target className="w-3 h-3" />
                        {formatTime(s.total_time_taken)}
                      </div>
                    </div>

                    {s.confidence && (
                      <div className="mt-1 text-xs text-muted-foreground">
                        Confidence: <span className="capitalize">{s.confidence}</span>
                      </div>
                    )}
                  </div>

                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Calendar className="w-3 h-3" />
                      {formatDate(s.created_at)}
                    </div>
                    <ChevronRight className="w-4 h-4 text-muted-foreground mt-2" />
                  </div>
                </div>

                {/* Score bar */}
                <div className="mt-3 h-1.5 rounded-full bg-secondary overflow-hidden">
                  <div
                    className="h-full rounded-full bg-accent transition-all"
                    style={{ width: `${Math.min(pct, 100)}%` }}
                  />
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default HistoryPage;
