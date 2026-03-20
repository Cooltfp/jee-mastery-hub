import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const systemPrompt = `You are a JEE Mains question paper generator. You MUST return valid JSON.

Generate exactly 30 unique JEE Mains level questions as a JSON object with a "questions" key.

REQUIREMENTS:
- 10 Physics, 10 Chemistry, 10 Mathematics questions
- Each subject: 3 easy, 4 medium, 3 hard
- Mix of MCQ (25) and Numerical (5, at least 1 per subject)
- Use LaTeX for math: inline $...$ and display $$...$$
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
          { role: "user", content: "Generate 30 JEE Mains questions as valid JSON." },
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

    // response_format: json_object guarantees valid JSON
    const parsed = JSON.parse(content);
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
