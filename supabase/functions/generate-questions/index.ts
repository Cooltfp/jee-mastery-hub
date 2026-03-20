import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Fix broken LaTeX escapes that aren't valid JSON escape sequences
function sanitizeJsonString(raw: string): string {
  // Replace single backslashes that aren't valid JSON escapes (\", \\, \/, \b, \f, \n, \r, \t, \uXXXX)
  return raw.replace(/\\(?!["\\/bfnrtu])/g, "\\\\");
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const systemPrompt = `You are a JSON generator that creates JEE Mains questions. You MUST output ONLY valid JSON.

CRITICAL: All LaTeX backslashes MUST be double-escaped for JSON. Use \\\\frac not \\frac, \\\\sqrt not \\sqrt, \\\\alpha not \\alpha, \\\\int not \\int, \\\\times not \\times, \\\\rightarrow not \\rightarrow.

Generate exactly 30 unique JEE Mains level questions as a JSON object with a "questions" key.

REQUIREMENTS:
- 10 Physics, 10 Chemistry, 10 Mathematics questions
- Each subject: 3 easy, 4 medium, 3 hard
- Mix of MCQ (25) and Numerical (5, at least 1 per subject)
- Use LaTeX for math with dollar signs: $...$ for inline, $$...$$ for display
- Application-based MCQs matching JEE Mains difficulty
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
          { role: "user", content: "Generate 30 JEE Mains questions. Remember: double-escape ALL LaTeX backslashes for valid JSON." },
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
    const content = data.choices?.[0]?.message?.content || "";

    console.log("Response length:", content.length);

    // Try parsing directly first; if it fails, sanitize LaTeX escapes and retry
    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch (firstError) {
      console.warn("First JSON.parse failed, sanitizing LaTeX escapes...");
      console.log("Raw content (first 500 chars):", content.substring(0, 500));
      try {
        const sanitized = sanitizeJsonString(content);
        parsed = JSON.parse(sanitized);
        console.log("Sanitized JSON.parse succeeded");
      } catch (secondError) {
        console.error("Sanitized JSON.parse also failed:", secondError);
        console.log("Raw content (first 1000 chars):", content.substring(0, 1000));
        throw new Error("Failed to parse AI response as JSON");
      }
    }

    const questions = parsed.questions || parsed;

    if (!Array.isArray(questions) || questions.length === 0) {
      throw new Error("No questions in response");
    }

    console.log(`Successfully generated ${questions.length} questions`);

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
