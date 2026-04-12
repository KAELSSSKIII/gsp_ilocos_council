import type { LucideIcon } from "lucide-react";
import {
  BookOpen,
  Briefcase,
  CalendarRange,
  Package2,
  Shirt,
  Sparkles,
  UserRound,
} from "lucide-react";

export type CategoryGroupDefinition = {
  key: string;
  label: string;
  icon: LucideIcon;
  names: string[];
};

export const CATEGORY_GROUPS: CategoryGroupDefinition[] = [
  {
    key: "tops",
    label: "Tops",
    icon: Shirt,
    names: [
      "BLOUSE SR/CDT.",
      "POLO SHIRT (Combi)",
      "BLACK ADULT POLO SHIRT",
      "MEN'S BLACK POLO",
      "FUN T-SHIRT",
      "RAGLAN SHIRT",
      "FUN SHIRT Raglan-Everyway",
      "FUN SHIRT Professionals - White",
      "Uniforms",
      "Shirts",
    ],
  },
  {
    key: "bottoms",
    label: "Bottoms",
    icon: Briefcase,
    names: [
      "JOGGING PANTS",
      "BERMUDA SHORTS (Sta&Jun)",
      "BERMUDA SHORT-Sen&Cad",
      "Green Pants-Wool",
      "Green Pants Wool (old price)",
      "PLAIN GREEN SKIRT",
    ],
  },
  {
    key: "outerwear",
    label: "Outerwear",
    icon: Package2,
    names: ["ADULT JACKET", "VEST - WOOL", "VEST - WOOL EMBRO", "GSP TERNO (SET)"],
  },
  {
    key: "accessories",
    label: "Accessories",
    icon: Sparkles,
    names: [
      "SCARF",
      "NYLON BELT",
      "SOCKS",
      "STRIPS",
      "SASH",
      "CAPS",
      "PINS",
      "FACE MASK",
      "Keychain-Gespie",
      "Goodwill Pouch",
      "Magic Carpet",
      "BADGES",
      "Accessories",
    ],
  },
  {
    key: "manuals",
    label: "Manuals / Books",
    icon: BookOpen,
    names: ["MANUAL (Old)", "MANUAL (New)", "HANDBOOK (Old)", "HANDBOOK (New)", "A Camping we go", "Songbook"],
  },
  {
    key: "dolls",
    label: "Dolls / Memorabilia",
    icon: UserRound,
    names: ["GESPIE Doll (big)", "Rag Doll Twinkler (S)", "TWINKLER"],
  },
  {
    key: "age",
    label: "Groups / Age Sets",
    icon: Sparkles,
    names: ["STAR", "JUNIOR", "SENIOR", "CADET", "RTW GIRLS:", "CLOTH:", "T-SHIRTS:"],
  },
  {
    key: "rentals",
    label: "Hall & Room Rentals",
    icon: CalendarRange,
    names: ["Hall Rental", "Room Rental", "Hall & Room Rentals"],
  },
];
