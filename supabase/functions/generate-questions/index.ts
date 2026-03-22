import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const LEVEL_DESCRIPTIONS: Record<number, string> = {
  1: "Level 1 (Foundational): Direct formula-based questions. Single-step calculations. Easy difficulty only.",
  2: "Level 2 (Standard): Standard textbook problems. Two-step calculations. Mix of easy and medium difficulty.",
  3: "Level 3 (JEE Mains): Exact JEE Mains difficulty with multi-step logic. Application-based MCQs. Mix of easy, medium, and hard.",
  4: "Level 4 (Intense): Above-average JEE Mains difficulty. Multi-step problems requiring strong conceptual clarity. Mostly medium and hard.",
  5: "Level 5 (Challenger): Multi-concept questions mixing topics. All hard difficulty. Requires deep understanding.",
};

function parsePlainTextQuestions(raw: string): any[] {
  const questions: any[] = [];
  const blocks = raw.split("===QUESTION===").filter(b => b.trim());

  for (const block of blocks) {
    try {
      const content = block.split("===END===")[0];
      if (!content || !content.trim()) continue;

      const getField = (name: string): string => {
        const regex = new RegExp(
          `^${name}:\\\\s*(.+?)(?=\\\\n(?:ID|SUBJECT|CHAPTER|TYPE|DIFFICULTY|TEXT|OPTION_A|OPTION_B|OPTION_C|OPTION_D|CORRECT|SOLUTION|MARKS|NEGATIVE_MARKS):|===END===|$)`,
          "ms"
        );
        const match = content.match(regex);
        return match ? match[1].trim() : "";
      };

      const subject = getField("SUBJECT").toLowerCase().trim();
      const questionText = getField("TEXT");
      if (!subject || !questionText) continue;

      let normalizedSubject = subject;
      if (normalizedSubject === "mathematics" || normalizedSubject === "maths") {
        normalizedSubject = "math";
      }

      const type = (getField("TYPE") || "mcq").toLowerCase().trim();
      const correctRaw = getField("CORRECT").toUpperCase().trim();
      const correctMap: Record<string, string> = { A: "a", B: "b", C: "c", D: "d" };
      const correctAnswer = correctMap[correctRaw] || correctRaw.toLowerCase();

      const optA = getField("OPTION_A");
      const optB = getField("OPTION_B");
      const optC = getField("OPTION_C");
      const optD = getField("OPTION_D");

      const options = type === "mcq" && (optA || optB || optC || optD)
        ? [
            { id: "a", text: optA },
            { id: "b", text: optB },
            { id: "c", text: optC },
            { id: "d", text: optD },
          ]
        : null;

      questions.push({
        subject: normalizedSubject,
        type,
        difficulty: getField("DIFFICULTY") || "medium",
        text: questionText,
        options,
        correctAnswer,
        explanation: getField("SOLUTION"),
        topic: getField("CHAPTER") || "General",
        marks: 4,
        negativeMarks: type === "numerical" ? 0 : 1,
      });
    } catch (e) {
      console.error("Failed to parse question block:", e);
      continue;
    }
  }
  return questions;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const body = await req.json().catch(() => ({}));
    const globalLevel = Math.min(5, Math.max(1, body.level || 3));

    // ─── Build subject instructions from either `selections` or legacy params ───
    let totalQuestions = 30;
    let subjectInstructions = "";
    let topicHints = "";

    if (body.selections && Array.isArray(body.selections) && body.selections.length > 0) {
      // NEW: multi-subject selections format with per-subject question counts
      const subjectMap: Record<string, string> = { physics: "Physics", chemistry: "Chemistry", math: "Mathematics" };

      totalQuestions = 0;
      for (const sel of body.selections) {
        const subjectName = subjectMap[sel.subject] || sel.subject;
        const selLevel = Math.min(5, Math.max(1, sel.level || globalLevel));
        const levelDesc = LEVEL_DESCRIPTIONS[selLevel];
        const selCount = sel.totalQuestions || 10;
        totalQuestions += selCount;

        // If per-chapter question counts provided, build detailed instructions
        if (sel.questionsPerChapter && Object.keys(sel.questionsPerChapter).length > 0) {
          let chapterDetails = "";
          for (const [ch, count] of Object.entries(sel.questionsPerChapter)) {
            chapterDetails += `  * ${count} questions from "${ch}"\n`;
          }
          subjectInstructions += `- ${selCount} questions for ${subjectName} at ${levelDesc}, distributed as:\n${chapterDetails}`;
        } else if (sel.chapters && sel.chapters.length > 0) {
          subjectInstructions += `- ${selCount} questions for ${subjectName} at ${levelDesc}, ONLY from these chapters: ${sel.chapters.join(", ")}\n`;
        } else {
          subjectInstructions += `- ${selCount} questions for ${subjectName} at ${levelDesc}, from any chapter\n`;
        }
      }
    } else {
      // LEGACY: single chapter_name + level
      const chapterName: string | null = body.chapter_name || null;
      const levelDesc = LEVEL_DESCRIPTIONS[globalLevel];

      if (chapterName) {
        subjectInstructions = `IMPORTANT: Generate ALL 30 questions ONLY from the chapter/topic "${chapterName}" at ${levelDesc}. Do not include questions from other chapters.`;
      } else {
        subjectInstructions = `Generate 10 Physics, 10 Chemistry, 10 Mathematics questions at ${levelDesc}.`;
        topicHints = `TOPICS: Physics (Mechanics, Electrodynamics, Optics, Thermodynamics, Modern Physics, Waves), Chemistry (Physical, Organic, Inorganic, Ionic Equilibrium, Mole Concept, Chemical Bonding), Mathematics (Calculus, Algebra, Coordinate Geometry, Trigonometry, Probability, Vectors)`;
      }
    }

    const mcqCount = Math.max(1, totalQuestions - Math.ceil(totalQuestions / 6));
    const numCount = totalQuestions - mcqCount;

    const systemPrompt = `You are a JEE Mains question paper setter. Generate exactly ${totalQuestions} unique questions.

${subjectInstructions}
${topicHints}

Mix of MCQ (${mcqCount}) and Numerical (${numCount}, at least 1 per subject).
For Numerical questions: OPTION_A through OPTION_D should say "Numerical Answer" and CORRECT should be the numerical value.

RESPONSE FORMAT — USE THIS EXACT PLAIN TEXT FORMAT. DO NOT RETURN JSON. DO NOT USE MARKDOWN CODE BLOCKS. DO NOT wrap in \`\`\`.

For each question, use this exact template:

===QUESTION===
ID: (number)
SUBJECT: (Physics or Chemistry or Mathematics)
CHAPTER: (chapter name)
TYPE: (mcq or numerical)
DIFFICULTY: (easy, medium, or hard)
TEXT: (question text with LaTeX in dollar signs)
OPTION_A: (option with LaTeX in dollar signs)
OPTION_B: (option with LaTeX in dollar signs)
OPTION_C: (option with LaTeX in dollar signs)
OPTION_D: (option with LaTeX in dollar signs)
CORRECT: (A or B or C or D, or numerical value for numerical type)
SOLUTION: (step by step explanation with LaTeX in dollar signs)
===END===

CRITICAL LaTeX RULES:
- ALL math expressions MUST be wrapped in dollar signs: $\\frac{a}{b}$ for inline
- Use proper LaTeX commands with backslashes: $\\frac{1}{2}$, $\\sqrt{3}$, $\\lambda$, $\\epsilon_0$, $\\alpha$, $\\theta$, $\\mu$
- Subscripts: $v_0$, $\\rho_0$. Superscripts: $x^2$, $e^{-x}$
- Greek letters: $\\alpha$, $\\beta$, $\\gamma$, $\\delta$, $\\omega$, $\\pi$, $\\phi$
- Operators: $\\times$, $\\div$, $\\pm$, $\\leq$, $\\geq$, $\\neq$, $\\approx$
- Integrals: $\\int_0^1 x^2 \\, dx$
- NEVER write bare commands without backslashes (e.g., never write "frac", always write "$\\frac{}{}$")

EXAMPLE:
===QUESTION===
ID: 1
SUBJECT: Physics
CHAPTER: Electrostatics
TYPE: mcq
DIFFICULTY: medium
TEXT: The electric field at distance $r$ from an infinite line charge with linear charge density $\\lambda$ is:
OPTION_A: $\\frac{\\lambda}{2\\pi\\epsilon_0 r}$
OPTION_B: $\\frac{\\lambda}{4\\pi\\epsilon_0 r^2}$
OPTION_C: $\\frac{\\lambda}{2\\pi\\epsilon_0 r^2}$
OPTION_D: $\\frac{\\lambda r}{4\\pi\\epsilon_0}$
CORRECT: A
SOLUTION: Using Gauss's law with a cylindrical Gaussian surface, $E \\cdot 2\\pi r L = \\frac{\\lambda L}{\\epsilon_0}$, giving $E = \\frac{\\lambda}{2\\pi\\epsilon_0 r}$.
===END===

Now generate exactly ${totalQuestions} questions. Start immediately with ===QUESTION=== — no preamble.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Generate ${totalQuestions} JEE Mains questions. Use the exact plain text template. All math in $dollar signs$ with proper \\backslash commands.` },
        ],
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limited. Please try again in a moment." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Credits exhausted. Please add funds." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const data = await response.json();
    const rawText = data.choices?.[0]?.message?.content || "";

    console.log("Raw response length:", rawText.length);
    console.log("First 500 chars:", rawText.substring(0, 500));

    const questions = parsePlainTextQuestions(rawText);
    console.log("Parsed questions count:", questions.length);

    if (questions.length === 0) {
      console.error("No questions parsed. Full response:", rawText.substring(0, 2000));
      return new Response(JSON.stringify({ error: "AI formatting error, please try again" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ questions }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("generate-questions error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
