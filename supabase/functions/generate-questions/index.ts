import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const LEVEL_DESCRIPTIONS: Record<number, string> = {
  1: "Level 1 (Foundational): Direct single-formula questions. One-step calculations only. Easy difficulty. Straightforward substitution problems a Class 11 student can solve.",
  2: "Level 2 (Standard): Standard NCERT-level problems. Two-step calculations. Mix of easy and medium. Moderate application of formulas.",
  3: "Level 3 (JEE Mains Upper): Upper-bracket JEE Mains difficulty. Multi-step problems requiring strong conceptual understanding. No trivial questions — every question must require genuine reasoning. 20% easy, 50% medium, 30% hard. Avoid questions solvable by direct formula substitution alone.",
  4: "Level 4 (JEE Advanced Light): JEE Advanced entry-level difficulty. Multi-concept problems that combine two or more chapters. Requires deep understanding, multi-step derivations, and elimination logic. 10% medium, 90% hard. Include at least 2 questions that involve graph/data interpretation.",
  5: "Level 5 (JEE Advanced Full): Full JEE Advanced difficulty. All questions must be hard. Paragraph-based reasoning, multi-concept integration, tricky edge cases and counterintuitive results. Requires mastery-level understanding. No straightforward calculations — every question must challenge even a well-prepared student.",
};

function parsePlainTextQuestions(raw: string): any[] {
  const questions: any[] = [];
  const blocks = raw.split("===QUESTION===").filter(b => b.trim());

  for (const block of blocks) {
    try {
      const content = block.split("===END===")[0];
      if (!content || !content.trim()) continue;

      const getField = (name: string): string => {
        const regex = new RegExp(`^${name}:\\s*(.+?)(?=\\n(?:ID|SUBJECT|CHAPTER|SECTION|PARAGRAPH_ID|PARAGRAPH|TYPE|DIFFICULTY|SOURCE|TEXT|OPTION_A|OPTION_B|OPTION_C|OPTION_D|CORRECT|SOLUTION|MARKS|NEGATIVE_MARKS):|===END===|$)`, "ms");
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
      const correctAnswer = type === "multiple_correct"
        ? correctRaw.split(",").map(c => correctMap[c.trim()] || c.trim().toLowerCase()).join(",")
        : correctMap[correctRaw] || correctRaw.toLowerCase();

      const optA = getField("OPTION_A");
      const optB = getField("OPTION_B");
      const optC = getField("OPTION_C");
      const optD = getField("OPTION_D");

      const options = (type === "mcq" || type === "multiple_correct" || type === "comprehension") && (optA || optB || optC || optD)
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
        source: getField("SOURCE") || "Original",
        section: getField("SECTION") || "",
        paragraphId: getField("PARAGRAPH_ID") || "",
        paragraph: getField("PARAGRAPH") || "",
        marks: type === "multiple_correct" ? 4 : type === "comprehension" ? 3 : 4,
        negativeMarks: type === "integer" ? 1 : type === "numerical" ? 0 : type === "multiple_correct" ? 2 : type === "comprehension" ? 1 : 1,
      });
    } catch (e) {
      console.error("Failed to parse question block:", e);
      continue;
    }
  }
  return questions;
}

function getExamPreset(examMode: string, difficulty: string, varietySeed: string): { totalQuestions: number; systemPrompt: string } | null {
  const difficultyOverrideMains = `
DIFFICULTY OVERRIDE: The overall paper difficulty is "${difficulty}". Apply this globally:
- easy: 50% easy, 40% medium, 10% hard questions
- medium: 20% easy, 50% medium, 30% hard questions
- hard: 5% easy, 25% medium, 70% hard questions`;

  const difficultyOverrideAdvanced = `
DIFFICULTY OVERRIDE: Paper difficulty is "${difficulty}". easy = slightly less tricky multi-concepts, medium = standard JEE Advanced, hard = extremely counterintuitive and multi-layered.`;

  if (examMode === "jee_mains_2026") {
    return {
      totalQuestions: 75,
      systemPrompt: `You are setting the JEE Mains 2026 paper. Generate exactly 75 questions — 25 Physics, 25 Chemistry, 25 Mathematics.

For each subject, generate:
- 20 MCQ questions (4 options, single correct, +4/-1 marking)
- 5 Integer type questions (answer is any positive integer, +4/-1 marking, no options needed)

Difficulty: Mix of JEE Mains upper-bracket difficulty. Questions must be of genuine JEE Mains 2026 standard — no trivial substitutions. Include concepts from both Class 11 and Class 12 syllabus.
${difficultyOverrideMains}

VARIETY DIRECTIVE: ${varietySeed}

RESPONSE FORMAT — USE THIS EXACT PLAIN TEXT FORMAT. DO NOT RETURN JSON. DO NOT USE MARKDOWN CODE BLOCKS.

For each question use exactly:

===QUESTION===
ID: (number 1–75)
SUBJECT: (Physics or Chemistry or Mathematics)
CHAPTER: (chapter name)
TYPE: (mcq or integer)
DIFFICULTY: (easy, medium, or hard)
TEXT: (question text with LaTeX in dollar signs)
OPTION_A: (option or "Integer Answer" for integer type)
OPTION_B: (option or "Integer Answer" for integer type)
OPTION_C: (option or "Integer Answer" for integer type)
OPTION_D: (option or "Integer Answer" for integer type)
CORRECT: (A, B, C, D for MCQ — or the integer value for integer type)
SOLUTION: (step by step solution with LaTeX in dollar signs)
===END===

CRITICAL LaTeX RULES:
- ALL math in dollar signs: $\\frac{a}{b}$, $\\sqrt{3}$, $\\lambda$, $\\epsilon_0$
- Use backslashes: $\\alpha$, $\\beta$, $\\omega$, $\\times$, $\\pm$
- NEVER write bare LaTeX without $ delimiters

Order: Questions 1–25 Physics, 26–50 Chemistry, 51–75 Mathematics.
Within each subject: questions 1–20 are MCQ, questions 21–25 are Integer type.
Start immediately with ===QUESTION=== — no preamble.`,
    };
  }

  if (examMode === "jee_advanced_2026") {
    return {
      totalQuestions: 54,
      systemPrompt: `You are setting the JEE Advanced 2026 Paper. Generate exactly 54 questions — 18 Physics, 18 Chemistry, 18 Mathematics.

For each subject (18 questions), use this section structure:

SECTION 1 — Multiple Correct MCQ (6 questions):
- Each question has 4 options, ONE OR MORE correct answers
- Marking: +4 if all correct options marked, partial credit +1 per correct option marked (max +4), -2 for wrong combination
- TYPE: multiple_correct

SECTION 2 — Comprehension / Paragraph Based (8 questions = 4 paragraphs × 2 questions each):
- Each paragraph is ~3–4 lines describing a scenario/experiment/setup
- 2 MCQ questions follow each paragraph (single correct each)
- Marking: +3/-1
- TYPE: comprehension
- Add a PARAGRAPH field with the passage text, and PARAGRAPH_ID (e.g. P1, P2...) to group the 2 questions of each paragraph

SECTION 3 — Integer type (4 questions):
- Answer is any positive integer
- Marking: +4/-1, no options
- TYPE: integer

Difficulty: Full JEE Advanced 2026 standard. Multi-concept, counterintuitive, requires deep mastery. No straightforward calculations.
${difficultyOverrideAdvanced}

VARIETY DIRECTIVE: ${varietySeed}

RESPONSE FORMAT — USE THIS EXACT PLAIN TEXT FORMAT. DO NOT RETURN JSON. DO NOT USE MARKDOWN CODE BLOCKS.

===QUESTION===
ID: (number 1–54)
SUBJECT: (Physics or Chemistry or Mathematics)
CHAPTER: (chapter name)
SECTION: (1 or 2 or 3)
TYPE: (multiple_correct or comprehension or integer)
PARAGRAPH_ID: (P1/P2/P3/P4 — only for comprehension type, else leave blank)
PARAGRAPH: (paragraph text — only for first question of each paragraph pair, else leave blank)
DIFFICULTY: hard
TEXT: (question text with LaTeX in dollar signs)
OPTION_A: (option or "Integer Answer")
OPTION_B: (option or "Integer Answer")
OPTION_C: (option or "Integer Answer")
OPTION_D: (option or "Integer Answer")
CORRECT: (for multiple_correct: comma-separated like "A,C" — for comprehension: A/B/C/D — for integer: the integer value)
SOLUTION: (full step-by-step solution with LaTeX)
===END===

CRITICAL LaTeX RULES:
- ALL math in dollar signs: $\\frac{a}{b}$, $\\sqrt{3}$, $\\lambda$, $\\epsilon_0$
- Use backslashes: $\\alpha$, $\\beta$, $\\omega$, $\\times$, $\\pm$

Order: Questions 1–18 Physics, 19–36 Chemistry, 37–54 Mathematics.
Within each subject: questions 1–6 multiple_correct, 7–14 comprehension (4 paragraphs × 2), 15–18 integer.
Start immediately with ===QUESTION=== — no preamble.`,
    };
  }

  return null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const body = await req.json().catch(() => ({}));
    const globalLevel = Math.min(5, Math.max(1, body.level || 3));
    const includeInteger = body.includeInteger !== false;
    const examMode: string | null = body.examMode || null;
    const examDifficulty: string = body.difficulty || "medium";

    const varietySeeds = [
      "Focus on conceptual traps and common misconceptions students fall for.",
      "Focus on data interpretation and graph-based reasoning.",
      "Focus on multi-step derivations and proof-based reasoning.",
      "Focus on real-world application and unit analysis problems.",
      "Focus on problems where eliminating wrong options by logic is key.",
      "Focus on mixed formula application across sub-topics.",
      "Focus on problems involving approximations and limiting cases.",
    ];
    const pyqYears = [2019, 2020, 2021, 2022, 2023, 2024];
    const pickedYear1 = pyqYears[Math.floor(Math.random() * pyqYears.length)];
    const pickedYear2 = pyqYears[Math.floor(Math.random() * pyqYears.length)];
    const varietySeed = varietySeeds[Math.floor(Math.random() * varietySeeds.length)];

    // ─── Handle exam mode ───────────────────────────────────────
    if (examMode) {
      const preset = getExamPreset(examMode, examDifficulty, varietySeed);
      if (preset) {
        const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${LOVABLE_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "google/gemini-3-flash-preview",
            messages: [
              { role: "system", content: preset.systemPrompt },
              { role: "user", content: `Generate exactly ${preset.totalQuestions} questions now. Start with ===QUESTION===` },
            ],
          }),
        });

        if (!response.ok) {
          if (response.status === 429) return new Response(JSON.stringify({ error: "Rate limited. Please try again." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
          if (response.status === 402) return new Response(JSON.stringify({ error: "Credits exhausted." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
          throw new Error(`AI gateway error: ${response.status}`);
        }

        const data = await response.json();
        const rawText = data.choices?.[0]?.message?.content || "";
        console.log("Exam mode raw response length:", rawText.length);
        const questions = parsePlainTextQuestions(rawText);
        console.log("Exam mode parsed questions:", questions.length);

        if (questions.length === 0) {
          return new Response(JSON.stringify({ error: "AI formatting error, please try again" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        return new Response(JSON.stringify({ questions }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    // ─── Regular question generation ────────────────────────────
    let totalQuestions = 30;
    let subjectInstructions = "";
    let topicHints = "";

    if (body.selections && Array.isArray(body.selections) && body.selections.length > 0) {
      const subjectMap: Record<string, string> = { physics: "Physics", chemistry: "Chemistry", math: "Mathematics" };

      totalQuestions = 0;
      for (const sel of body.selections) {
        const subjectName = subjectMap[sel.subject] || sel.subject;
        const selLevel = Math.min(5, Math.max(1, sel.level || globalLevel));
        const levelDesc = LEVEL_DESCRIPTIONS[selLevel];
        const selCount = sel.totalQuestions || 10;
        totalQuestions += selCount;

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
    const integerCount = (includeInteger && globalLevel >= 3) ? Math.ceil(numCount * 0.4) : 0;
    const pureNumericalCount = numCount - integerCount;
    const pyqCount = globalLevel >= 3 ? Math.ceil(totalQuestions * 0.25) : Math.ceil(totalQuestions * 0.10);

    const integerInstructions = integerCount > 0
      ? `\n- ${integerCount} of the non-MCQ questions must be Integer type (TYPE: integer). Answer is any POSITIVE INTEGER (not limited to 0-9, can be any whole number like 12, 48, 100, etc.). For Physical Chemistry problems, answer may be the nearest integer of a calculated value. OPTION_A through OPTION_D say "Integer Answer". CORRECT is the integer value. Marking: +4 for correct, -1 for wrong. At least 1 integer type question per subject when total questions allow it.
- The remaining ${pureNumericalCount} non-MCQ questions are Numerical type (TYPE: numerical). Answer is any real number (decimals allowed). OPTION_A through OPTION_D say "Numerical Answer". CORRECT is the decimal value.`
      : `\n- For Numerical questions: OPTION_A through OPTION_D should say "Numerical Answer" and CORRECT should be the numerical value.`;

    const systemPrompt = `You are a JEE Mains question paper setter with access to JEE PYQ archives from 2019–2024. Generate exactly ${totalQuestions} unique questions.

${subjectInstructions}
${topicHints}

VARIETY DIRECTIVE (important — apply this throughout): ${varietySeed}

QUESTION MIX RULES:
- Total: ${totalQuestions} questions — ${mcqCount} MCQ and ${numCount} non-MCQ (at least 1 non-MCQ per subject)${integerInstructions}
- Exactly ${pyqCount} of the total questions must be styled as JEE PYQ (Previous Year Questions). For these, add a SOURCE tag like: SOURCE: JEE Mains ${pickedYear1} or JEE Mains ${pickedYear2}. Alternate years across the PYQ questions.
- The remaining ${totalQuestions - pyqCount} questions must be original, freshly composed questions — NOT recycled versions of common textbook examples.
- Do NOT repeat question patterns across the set. Each question must test a distinctly different concept, formula, or reasoning style from the others.

DIFFICULTY DISTRIBUTION (strictly enforce for level ${globalLevel}):
${globalLevel === 1 ? "- 80% easy, 20% medium. Only direct single-formula substitution. No multi-step reasoning." : ""}${globalLevel === 2 ? "- 50% easy, 40% medium, 10% hard. Standard textbook style." : ""}${globalLevel === 3 ? "- 20% easy, 50% medium, 30% hard. No trivially solvable questions. Every question must require at least 2 reasoning steps." : ""}${globalLevel === 4 ? "- 10% medium, 90% hard. Multi-concept, multi-step. At least 2 questions combining two chapters." : ""}${globalLevel === 5 ? "- 100% hard. JEE Advanced level only. Counterintuitive results, multi-concept, paragraph-based logic." : ""}

RESPONSE FORMAT — USE THIS EXACT PLAIN TEXT FORMAT. DO NOT RETURN JSON. DO NOT USE MARKDOWN CODE BLOCKS. DO NOT wrap in \`\`\`.

For each question, use this exact template:

===QUESTION===
ID: (number)
SUBJECT: (Physics or Chemistry or Mathematics)
CHAPTER: (chapter name)
TYPE: (mcq or numerical or integer)
DIFFICULTY: (easy, medium, or hard)
SOURCE: (either "Original" or "JEE Mains YYYY" for PYQ questions)
TEXT: (question text with LaTeX in dollar signs)
OPTION_A: (option with LaTeX in dollar signs)
OPTION_B: (option with LaTeX in dollar signs)
OPTION_C: (option with LaTeX in dollar signs)
OPTION_D: (option with LaTeX in dollar signs)
CORRECT: (A, B, C, or D for MCQ — or the numerical/integer value)
SOLUTION: (step by step solution with LaTeX in dollar signs)
===END===

CRITICAL LaTeX RULES:
- ALL math expressions MUST be wrapped in dollar signs: $\\frac{a}{b}$, $\\sqrt{3}$, $\\lambda$, $\\epsilon_0$
- Use proper backslash commands: $\\alpha$, $\\beta$, $\\omega$, $\\times$, $\\pm$
- NEVER write bare LaTeX without $ delimiters
- For display math, use $$...$$

Start immediately with ===QUESTION=== — no preamble, no commentary.`;

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
          { role: "user", content: `Generate exactly ${totalQuestions} questions now. Start with ===QUESTION===` },
        ],
      }),
    });

    if (!response.ok) {
      if (response.status === 429) return new Response(JSON.stringify({ error: "Rate limited. Please try again in a minute." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (response.status === 402) return new Response(JSON.stringify({ error: "Credits exhausted. Please check your plan." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const data = await response.json();
    const rawText = data.choices?.[0]?.message?.content || "";
    console.log("Raw response length:", rawText.length);

    const questions = parsePlainTextQuestions(rawText);
    console.log("Parsed questions:", questions.length);

    if (questions.length === 0) {
      console.error("No questions parsed. Raw text sample:", rawText.substring(0, 500));
      return new Response(
        JSON.stringify({ error: "AI returned incorrectly formatted questions. Please try again." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(JSON.stringify({ questions }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Edge function error:", err);
    return new Response(
      JSON.stringify({ error: err.message || "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
