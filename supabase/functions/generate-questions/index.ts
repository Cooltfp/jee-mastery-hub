import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function cleanAiResponse(rawText: string): string {
  const firstBrace = rawText.indexOf("{");
  const lastBrace = rawText.lastIndexOf("}");

  const extractedJson =
    firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace
      ? rawText.slice(firstBrace, lastBrace + 1)
      : rawText;

  // Mandatory sanitization for LaTeX and other backslash-heavy content
  return extractedJson.replace(/\\/g, "\\\\");
}

const LEVEL_DESCRIPTIONS: Record<number, string> = {
  1: "Level 1 (Foundational): Direct formula-based questions. Single-step calculations. Test basic concept recall. Easy difficulty only.",
  2: "Level 2 (Standard): Standard textbook problems. Two-step calculations. Mix of easy and medium difficulty.",
  3: "Level 3 (JEE Mains): Exact JEE Mains difficulty with multi-step logic. Application-based MCQs. Mix of easy, medium, and hard.",
  4: "Level 4 (Intense): Above-average JEE Mains difficulty. Multi-step problems requiring strong conceptual clarity. Mostly medium and hard.",
  5: "Level 5 (Challenger): Multi-concept questions mixing topics (e.g., Physics with Calculus, Thermodynamics with Chemistry). All hard difficulty. Requires deep understanding.",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const body = await req.json().catch(() => ({}));
    const level = Math.min(5, Math.max(1, body.level || 3));
    const chapterName: string | null = body.chapter_name || null;

    const levelDesc = LEVEL_DESCRIPTIONS[level];

    const chapterInstruction = chapterName
      ? `IMPORTANT: Generate ALL 30 questions ONLY from the chapter/topic "${chapterName}". Do not include questions from other chapters.`
      : "";

    const systemPrompt = `You are a JSON-only response engine.
Do not include any text, markdown code blocks, or explanations outside the JSON object.
All math symbols must use double-escaped LaTeX.
You MUST output ONLY valid JSON.

CRITICAL: All LaTeX backslashes MUST be double-escaped for JSON. Use \\\\frac not \\frac, \\\\sqrt not \\sqrt, \\\\alpha not \\alpha, \\\\int not \\int, \\\\times not \\times, \\\\rightarrow not \\rightarrow.

DIFFICULTY LEVEL: ${levelDesc}

${chapterInstruction}

Generate exactly 30 unique questions as a JSON object with a "questions" key.

REQUIREMENTS:
- ${chapterName ? `All 30 questions from "${chapterName}"` : "10 Physics, 10 Chemistry, 10 Mathematics questions"}
- ${level <= 2 ? "Mostly easy questions with some medium" : level === 3 ? "3 easy, 4 medium, 3 hard per subject" : "Mostly medium and hard questions"}
- Mix of MCQ (25) and Numerical (5, at least 1 per subject)
- Use LaTeX for math with dollar signs: $...$ for inline, $$...$$ for display
- Each MCQ: 4 options (a, b, c, d)
- Numerical: answer is a single number

TOPICS: Physics (Mechanics, Electrodynamics, Optics, Thermodynamics, Modern Physics, Waves), Chemistry (Physical, Organic, Inorganic, Ionic Equilibrium, Mole Concept, Chemical Bonding), Math (Calculus, Algebra, Coordinate Geometry, Trigonometry, Probability, Vectors)

JSON format:
{"questions": [{"subject":"physics","type":"mcq","difficulty":"easy","text":"...","options":[{"id":"a","text":"..."},{"id":"b","text":"..."},{"id":"c","text":"..."},{"id":"d","text":"..."}],"correctAnswer":"a","explanation":"...","topic":"...","marks":4,"negativeMarks":1}]}
For numerical: options should be null, negativeMarks should be 0.`;

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
          { role: "user", content: `Generate 30 questions at Level ${level}${chapterName ? ` for chapter "${chapterName}"` : ""}. Double-escape ALL LaTeX backslashes for valid JSON.` },
        ],
        response_format: { type: "json_object" },
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
    const text = data.choices?.[0]?.message?.content || "";
    console.log("Response length:", text.length);
    console.log("Raw AI Response:", text);

    const cleanedText = cleanAiResponse(text);

    let parsed;
    try {
      parsed = JSON.parse(cleanedText);
    } catch (parseError) {
      console.error("JSON parse failed after cleaning:", parseError);
      return new Response(JSON.stringify({ error: "AI formatting error, please try again" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const questions = parsed.questions || parsed;
    if (!Array.isArray(questions) || questions.length === 0) {
      return new Response(JSON.stringify({ error: "AI formatting error, please try again" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`Successfully generated ${questions.length} questions at level ${level}`);

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
