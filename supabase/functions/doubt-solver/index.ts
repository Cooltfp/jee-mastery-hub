import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const { messages, sessionId, questionId } = await req.json();

    let contextPrompt = "";

    // If sessionId and questionId provided, look up the question for context
    if (sessionId && questionId) {
      const supabase = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
      );

      const { data: question } = await supabase
        .from("questions")
        .select("*")
        .eq("id", questionId)
        .single();

      if (question) {
        contextPrompt = `\n\nCONTEXT: The student just attempted this question:\n"${question.text}"\nCorrect answer: ${question.correct_answer}\nTopic: ${question.topic}\nSubject: ${question.subject}\nExplanation: ${question.explanation}\n\nUse this context to provide a more targeted explanation.`;
      }
    }

    const systemPrompt = `You are an expert JEE Mains tutor specializing in Physics, Chemistry, and Mathematics.

RULES:
- Explain concepts clearly and concisely, suitable for JEE aspirants
- Use LaTeX for ALL mathematical expressions: inline $...$ and display $$...$$
- Chemical formulas should use LaTeX: $\\text{H}_2\\text{SO}_4$
- Provide step-by-step solutions when solving problems
- Reference JEE-relevant tips and shortcuts
- Be encouraging but precise
- If asked about a specific question, explain the concept behind it, not just the answer${contextPrompt}`;

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
          ...messages,
        ],
        stream: true,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limited. Please try again shortly." }), {
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

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("doubt-solver error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
