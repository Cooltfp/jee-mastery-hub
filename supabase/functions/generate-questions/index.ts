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

    const systemPrompt = `You are a JEE Mains question paper generator. Generate exactly 30 unique JEE Mains level questions.

REQUIREMENTS:
- 10 Physics, 10 Chemistry, 10 Mathematics questions
- Each subject: 3 easy, 4 medium, 3 hard
- Mix of MCQ (25 questions) and Numerical (5 questions, at least 1 per subject)
- All mathematical expressions MUST use LaTeX: inline $...$ and display $$...$$
- Questions must be application-based, matching real JEE Mains difficulty
- Each MCQ must have exactly 4 options (a, b, c, d)
- Numerical questions: answer must be a single number (integer or up to 2 decimal places)

TOPICS TO COVER:
Physics: Mechanics, Electrodynamics, Optics, Thermodynamics, Modern Physics, Waves
Chemistry: Physical Chemistry, Organic Chemistry, Inorganic Chemistry, Ionic Equilibrium, Mole Concept, Chemical Bonding
Mathematics: Calculus, Algebra, Coordinate Geometry, Trigonometry, Probability, Vectors

Return ONLY a valid JSON array of 30 objects. Each object must have:
{
  "subject": "physics"|"chemistry"|"math",
  "type": "mcq"|"numerical",
  "difficulty": "easy"|"medium"|"hard",
  "text": "question text with $LaTeX$",
  "options": [{"id":"a","text":"..."},{"id":"b","text":"..."},{"id":"c","text":"..."},{"id":"d","text":"..."}] or null for numerical,
  "correctAnswer": "a"|"b"|"c"|"d" for MCQ or "number" for numerical,
  "explanation": "step-by-step solution with $LaTeX$",
  "topic": "specific topic name",
  "marks": 4,
  "negativeMarks": 1 for MCQ, 0 for numerical
}`;

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
          { role: "user", content: "Generate 30 JEE Mains questions now. Return ONLY the JSON array, no markdown fences." },
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
    let content = data.choices?.[0]?.message?.content || "";
    
    // Strip markdown code fences if present
    content = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    
    const questions = JSON.parse(content);

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
