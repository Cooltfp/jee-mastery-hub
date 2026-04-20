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
    "Units and Measurements",
    "Kinematics",
    "Laws of Motion",
    "Work, Energy and Power",
    "Rotational Motion",
    "Gravitation",
    "Properties of Solids and Liquids",
    "Thermodynamics",
    "Kinetic Theory of Gases",
    "Oscillations and Waves",
    "Electrostatics",
    "Current Electricity",
    "Magnetic Effects of Current and Magnetism",
    "Electromagnetic Induction and Alternating Currents",
    "Electromagnetic Waves",
    "Optics",
    "Dual Nature of Matter and Radiation",
    "Atoms and Nuclei",
    "Electronic Devices",
    "Experimental Skills",
  ],
  chemistry: [
    "Some Basic Concepts in Chemistry",
    "Atomic Structure",
    "Chemical Bonding and Molecular Structure",
    "Chemical Thermodynamics",
    "Solutions",
    "Equilibrium",
    "Redox Reactions and Electrochemistry",
    "Chemical Kinetics",
    "Classification of Elements and Periodicity",
    "p-Block Elements",
    "d and f-Block Elements",
    "Coordination Compounds",
    "Purification and Characterisation of Organic Compounds",
    "Basic Principles of Organic Chemistry",
    "Hydrocarbons",
    "Organic Compounds Containing Halogens",
    "Organic Compounds Containing Oxygen",
    "Organic Compounds Containing Nitrogen",
    "Biomolecules",
    "Principles Related to Practical Chemistry",
  ],
  math: [
    "Sets, Relations and Functions",
    "Complex Numbers and Quadratic Equations",
    "Matrices and Determinants",
    "Permutations and Combinations",
    "Binomial Theorem",
    "Sequences and Series",
    "Limits, Continuity and Differentiability",
    "Integral Calculus",
    "Differential Equations",
    "Straight Lines and Coordinate Geometry",
    "Circles and Conic Sections",
    "Three Dimensional Geometry",
    "Vector Algebra",
    "Statistics and Probability",
    "Trigonometry",
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
