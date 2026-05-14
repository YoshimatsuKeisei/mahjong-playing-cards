import type { AvatarCategory, AvatarOption } from "../types";

export const avatarCategoryLabels: Record<AvatarCategory, string> = {
  bishoujo: "美少女",
  animal: "動物",
  ikemen: "イケメン",
  busho: "武将",
  fantasy: "ファンタジー",
  casual: "カジュアル",
};

export const avatarOptions: AvatarOption[] = [
  { id: "bishoujo-long", category: "bishoujo", name: "ロングヘアの少女", face: "#f5c7aa", hair: "#6c3b7d", outfit: "#f07ca6", accent: "#ffe0f0", variant: "longHair" },
  { id: "bishoujo-short", category: "bishoujo", name: "ショートヘアの少女", face: "#f3c4a0", hair: "#2c4d78", outfit: "#7aa5f0", accent: "#f8d96b", variant: "shortHair" },
  { id: "animal-dog", category: "animal", name: "犬風の相棒", face: "#d99b5f", hair: "#8a552a", outfit: "#63a565", accent: "#fff4d8", variant: "ears" },
  { id: "animal-cat", category: "animal", name: "猫風の旅人", face: "#d7b18a", hair: "#59505a", outfit: "#8f6bd1", accent: "#ffd27d", variant: "ears" },
  { id: "ikemen-fresh", category: "ikemen", name: "爽やか青年", face: "#f0bf97", hair: "#3d2b22", outfit: "#4f83d1", accent: "#bfe8ff", variant: "cool" },
  { id: "ikemen-cool", category: "ikemen", name: "クール系青年", face: "#e8b891", hair: "#1f2933", outfit: "#2f3f56", accent: "#9bd3ff", variant: "cool" },
  { id: "busho-kabuto", category: "busho", name: "兜の武将", face: "#e8b485", hair: "#2b2119", outfit: "#8d3030", accent: "#d6a540", variant: "helmet" },
  { id: "busho-young", category: "busho", name: "若武者", face: "#efc09a", hair: "#3b251d", outfit: "#2f7658", accent: "#e6c15b", variant: "helmet" },
  { id: "fantasy-mage", category: "fantasy", name: "魔法使い", face: "#efc7a6", hair: "#66478b", outfit: "#56398c", accent: "#f6e27a", variant: "mage" },
  { id: "fantasy-archer", category: "fantasy", name: "弓使い", face: "#eec29b", hair: "#7b4a2d", outfit: "#2f7a58", accent: "#bde783", variant: "archer" },
  { id: "casual-hoodie", category: "casual", name: "パーカーの青年", face: "#f2c19a", hair: "#52372c", outfit: "#e0a23d", accent: "#fff0ca", variant: "hoodie" },
  { id: "casual-cap", category: "casual", name: "帽子の女の子", face: "#f4c5a4", hair: "#8b4a39", outfit: "#d85c5c", accent: "#245c47", variant: "cap" },
];

export function getAvatarById(id: string) {
  return avatarOptions.find((avatar) => avatar.id === id) ?? avatarOptions[0];
}
