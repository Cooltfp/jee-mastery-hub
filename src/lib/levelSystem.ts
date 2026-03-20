import { supabase } from "@/integrations/supabase/client";

const DEVICE_ID_KEY = "jee_device_id";

export function getDeviceId(): string {
  let id = localStorage.getItem(DEVICE_ID_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(DEVICE_ID_KEY, id);
  }
  return id;
}

export interface LevelInfo {
  id: number;
  name: string;
  description: string;
}

export const LEVELS: LevelInfo[] = [
  { id: 1, name: "Foundational", description: "Direct formula-based, single-step" },
  { id: 2, name: "Standard", description: "Standard textbook, two-step problems" },
  { id: 3, name: "JEE Mains", description: "Application-based, multi-step logic" },
  { id: 4, name: "Intense", description: "Above-average JEE difficulty" },
  { id: 5, name: "Challenger", description: "Multi-concept, cross-topic mastery" },
];

export const JEE_CHAPTERS = {
  physics: [
    "Mechanics", "Rotational Mechanics", "Electrodynamics", "Electrostatics",
    "Current Electricity", "Magnetism", "Optics", "Thermodynamics",
    "Modern Physics", "Waves & Oscillations", "Fluid Mechanics", "Gravitation",
  ],
  chemistry: [
    "Physical Chemistry", "Organic Chemistry", "Inorganic Chemistry",
    "Chemical Bonding", "Ionic Equilibrium", "Mole Concept", "Electrochemistry",
    "Chemical Kinetics", "Thermochemistry", "Coordination Compounds",
    "Hydrocarbons", "Aldehydes & Ketones",
  ],
  math: [
    "Calculus", "Algebra", "Coordinate Geometry", "Trigonometry",
    "Probability & Statistics", "Vectors & 3D", "Matrices & Determinants",
    "Complex Numbers", "Sequences & Series", "Differential Equations",
    "Permutations & Combinations", "Conic Sections",
  ],
};

export async function getProfile() {
  const deviceId = getDeviceId();
  const { data } = await supabase
    .from("profiles")
    .select("*")
    .eq("device_id", deviceId)
    .maybeSingle();

  if (data) return data;

  // Create profile
  const { data: newProfile } = await supabase
    .from("profiles")
    .insert({ device_id: deviceId, highest_level_unlocked: 1 })
    .select()
    .single();

  return newProfile;
}

export async function checkAndUnlockLevel(sessionId: string, deviceId: string) {
  // Get the session result
  const { data: session } = await supabase
    .from("test_sessions")
    .select("score, max_score, level")
    .eq("id", sessionId)
    .single();

  if (!session || !session.score || !session.max_score || !session.level) return;

  const percentage = (session.score / session.max_score) * 100;

  if (percentage >= 60) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("highest_level_unlocked")
      .eq("device_id", deviceId)
      .single();

    if (profile && session.level >= profile.highest_level_unlocked && session.level < 5) {
      await supabase
        .from("profiles")
        .update({ highest_level_unlocked: session.level + 1 })
        .eq("device_id", deviceId);
      return session.level + 1;
    }
  }
  return null;
}
