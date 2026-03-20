import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { JEE_CHAPTERS, LEVELS, getProfile } from "@/lib/levelSystem";
import { ArrowLeft, Atom, FlaskConical, Calculator, Lock, ChevronRight } from "lucide-react";

const PracticePage = () => {
  const navigate = useNavigate();
  const [highestUnlocked, setHighestUnlocked] = useState(1);

  useEffect(() => {
    getProfile().then((p) => {
      if (p) setHighestUnlocked(p.highest_level_unlocked);
    });
  }, []);

  const subjects = [
    { key: "physics" as const, label: "Physics", icon: <Atom className="w-5 h-5" />, colorClass: "subject-physics" },
    { key: "chemistry" as const, label: "Chemistry", icon: <FlaskConical className="w-5 h-5" />, colorClass: "subject-chemistry" },
    { key: "math" as const, label: "Mathematics", icon: <Calculator className="w-5 h-5" />, colorClass: "subject-math" },
  ];

  const startChapterPractice = (chapter: string) => {
    // Navigate to test with chapter pre-selected
    sessionStorage.setItem("preTestConfig", JSON.stringify({ chapterName: chapter }));
    navigate("/test");
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card px-4 py-3 flex items-center gap-3 sticky top-0 z-10">
        <Button variant="ghost" size="sm" onClick={() => navigate("/")} className="active:scale-[0.97] transition-transform">
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <h1 className="font-semibold text-lg">Chapter Practice</h1>
      </header>

      <div className="max-w-4xl mx-auto p-6 space-y-8">
        {/* Level Progress */}
        <div className="bg-card rounded-xl border p-5">
          <h2 className="text-sm font-semibold mb-3">Your Level Progress</h2>
          <div className="flex gap-2">
            {LEVELS.map((lvl) => {
              const unlocked = lvl.id <= highestUnlocked;
              return (
                <div
                  key={lvl.id}
                  className={`flex-1 text-center p-3 rounded-lg border ${
                    unlocked ? "bg-accent/10 border-accent/30" : "bg-muted/30 border-border"
                  }`}
                >
                  <div className="text-lg font-bold">{unlocked ? lvl.id : <Lock className="w-4 h-4 mx-auto text-muted-foreground" />}</div>
                  <div className="text-xs text-muted-foreground mt-1">{lvl.name}</div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Chapters by Subject */}
        {subjects.map(({ key, label, icon, colorClass }) => (
          <section key={key}>
            <div className="flex items-center gap-2 mb-4">
              <span className={`w-8 h-8 rounded-lg flex items-center justify-center ${colorClass}`}>{icon}</span>
              <h2 className="font-semibold text-base">{label}</h2>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {JEE_CHAPTERS[key].map((chapter) => (
                <button
                  key={chapter}
                  onClick={() => startChapterPractice(chapter)}
                  className="text-left p-4 rounded-xl border bg-card hover:shadow-md hover:border-muted-foreground/30 transition-all active:scale-[0.98] group"
                >
                  <div className="text-sm font-medium mb-1">{chapter}</div>
                  <div className="flex items-center text-xs text-accent opacity-0 group-hover:opacity-100 transition-opacity">
                    Practice <ChevronRight className="w-3 h-3 ml-1" />
                  </div>
                </button>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
};

export default PracticePage;
