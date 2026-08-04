import type { LucideIcon } from "lucide-react";
import {
  Building2,
  Camera,
  Coffee,
  Cpu,
  Dumbbell,
  Flower2,
  Gamepad2,
  Leaf,
  Music2,
  Palette,
  Plane,
  Scale,
  TrendingUp,
  UtensilsCrossed,
} from "lucide-react";

/**
 * Starter presets: one-tap seeds for the whole form (logo type + style +
 * description seed + a curated background), so a first-timer never faces a blank
 * page. The brand color is left to the AI ("auto") so each preset stays fresh
 * and the model picks a palette that fits the vibe; backgrounds stay curated so
 * the gallery keeps a nice light/dark mix. Values reference the exact
 * LOGO_TYPES keys and logoStyles names used in the app.
 */
export type StarterPreset = {
  id: string;
  label: string;
  icon: LucideIcon;
  logoType: string; // LOGO_TYPES key
  style: string; // logoStyles name
  primaryColor: string; // hex or "auto"
  backgroundColor: string; // hex or "auto"
  detailLevel: string; // detailLevels value
  describe: string; // seeds the "Describe it" field
};

export const STARTER_PRESETS: StarterPreset[] = [
  {
    id: "tech",
    label: "Tech",
    icon: Cpu,
    logoType: "icon-name",
    style: "Geometric",
    primaryColor: "auto",
    backgroundColor: "#FFFFFF",
    detailLevel: "Balanced",
    describe: "a clean geometric mark suggesting connection, speed and reliability",
  },
  {
    id: "coffee",
    label: "Coffee",
    icon: Coffee,
    logoType: "icon-name",
    style: "Hand-drawn",
    primaryColor: "auto",
    backgroundColor: "#F5F1E8",
    detailLevel: "Balanced",
    describe: "a warm hand-drawn coffee cup with rising steam, cozy and artisanal",
  },
  {
    id: "fitness",
    label: "Fitness",
    icon: Dumbbell,
    logoType: "icon-name",
    style: "Minimal",
    primaryColor: "auto",
    backgroundColor: "#14130F",
    detailLevel: "Balanced",
    describe: "a bold dynamic mark suggesting motion, energy and strength",
  },
  {
    id: "finance",
    label: "Finance",
    icon: TrendingUp,
    logoType: "emblem",
    style: "Luxury",
    primaryColor: "auto",
    backgroundColor: "#FFFFFF",
    detailLevel: "Balanced",
    describe: "a refined emblem suggesting trust, stability and growth",
  },
  {
    id: "beauty",
    label: "Beauty",
    icon: Flower2,
    logoType: "icon-name",
    style: "Luxury",
    primaryColor: "auto",
    backgroundColor: "#FFFFFF",
    detailLevel: "Balanced",
    describe: "an elegant minimal floral mark, soft, premium and refined",
  },
  {
    id: "food",
    label: "Restaurant",
    icon: UtensilsCrossed,
    logoType: "emblem",
    style: "Retro",
    primaryColor: "auto",
    backgroundColor: "#F5F1E8",
    detailLevel: "Detailed",
    describe: "a vintage restaurant badge, appetizing, classic and crafted",
  },
  {
    id: "nature",
    label: "Eco",
    icon: Leaf,
    logoType: "icon-name",
    style: "Minimal",
    primaryColor: "auto",
    backgroundColor: "#FFFFFF",
    detailLevel: "Minimal",
    describe: "a simple leaf-based mark, organic, calm and sustainable",
  },
  {
    id: "gaming",
    label: "Gaming",
    icon: Gamepad2,
    logoType: "icon-name",
    style: "3D",
    primaryColor: "auto",
    backgroundColor: "#14130F",
    detailLevel: "Detailed",
    describe: "a bold 3D emblem with energy, edge and a futuristic feel",
  },
  {
    id: "law",
    label: "Law",
    icon: Scale,
    logoType: "monogram",
    style: "Luxury",
    primaryColor: "auto",
    backgroundColor: "#FFFFFF",
    detailLevel: "Balanced",
    describe: "a classic monogram, authoritative, timeless and trustworthy",
  },
  {
    id: "creative",
    label: "Creative",
    icon: Palette,
    logoType: "abstract",
    style: "Gradient",
    primaryColor: "auto",
    backgroundColor: "#FFFFFF",
    detailLevel: "Balanced",
    describe: "a vibrant gradient abstract mark, playful, bold and modern",
  },
  {
    id: "realestate",
    label: "Real Estate",
    icon: Building2,
    logoType: "icon-name",
    style: "Minimal",
    primaryColor: "auto",
    backgroundColor: "#FFFFFF",
    detailLevel: "Balanced",
    describe: "a clean architectural mark suggesting property, trust and modern living",
  },
  {
    id: "photo",
    label: "Photo",
    icon: Camera,
    logoType: "icon-name",
    style: "Minimal",
    primaryColor: "auto",
    backgroundColor: "#14130F",
    detailLevel: "Minimal",
    describe: "a sleek minimal aperture or lens mark, sharp, modern and professional",
  },
  {
    id: "music",
    label: "Music",
    icon: Music2,
    logoType: "abstract",
    style: "Gradient",
    primaryColor: "auto",
    backgroundColor: "#14130F",
    detailLevel: "Balanced",
    describe: "a vibrant abstract sound-wave mark, energetic and rhythmic",
  },
  {
    id: "travel",
    label: "Travel",
    icon: Plane,
    logoType: "icon-name",
    style: "Hand-drawn",
    primaryColor: "auto",
    backgroundColor: "#F5F1E8",
    detailLevel: "Balanced",
    describe: "a friendly mark evoking journeys, destinations and adventure",
  },
];

/** Inspiration chips for the "Describe it" field (shown when it's empty). */
export const DESCRIBE_SUGGESTIONS: string[] = [
  "a friendly fox with a subtle leaf, modern and rounded",
  "a minimal mountain peak inside a circle",
  "an abstract mark that suggests upward motion",
  "a soft geometric bird taking flight",
];
