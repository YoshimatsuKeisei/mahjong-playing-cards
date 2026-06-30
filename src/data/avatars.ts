import type { AvatarCategory, AvatarOption } from "../types";

const homeCharacter1AvatarSrc = new URL("../../png-file/ホームキャラクター①-avator.png", import.meta.url).href;
const homeCharacter2AvatarSrc = new URL("../../png-file/ホームキャラクター② - avator.png", import.meta.url).href;
const homeCharacter3AvatarSrc = new URL("../../png-file/ホームキャラクター③-avator.png", import.meta.url).href;
const homeCharacter4AvatarSrc = new URL("../../png-file/ホームキャラクター④avator.png", import.meta.url).href;
const homeCharacter5AvatarSrc = new URL("../../png-file/ホームキャラクター⑤-avator.png", import.meta.url).href;

const homeCharacter1Src = new URL("../../png-file/ホームキャラクター①-modified.png", import.meta.url).href;
const homeCharacter2Src = new URL("../../png-file/ホームキャラクター②.png", import.meta.url).href;
const homeCharacter3Src = new URL("../../png-file/ホームキャラクター③.png", import.meta.url).href;
const homeCharacter4Src = new URL("../../png-file/ホームキャラクター④.png", import.meta.url).href;
const homeCharacter5Src = new URL("../../png-file/ホームキャラクター⑤.png", import.meta.url).href;

export const avatarCategoryLabels: Record<AvatarCategory, string> = {
  homeCharacter: "Character",
};

export const avatarOptions: AvatarOption[] = [
  {
    id: "home-character-1",
    category: "homeCharacter",
    name: "Character 1",
    face: "#efc7a6",
    hair: "#66478b",
    outfit: "#56398c",
    accent: "#f6e27a",
    variant: "mage",
    imageSrc: homeCharacter1AvatarSrc,
    homeCharacterSrc: homeCharacter1Src,
  },
  {
    id: "home-character-2",
    category: "homeCharacter",
    name: "Character 2",
    face: "#efc7a6",
    hair: "#66478b",
    outfit: "#56398c",
    accent: "#f6e27a",
    variant: "mage",
    imageSrc: homeCharacter2AvatarSrc,
    homeCharacterSrc: homeCharacter2Src,
  },
  {
    id: "home-character-3",
    category: "homeCharacter",
    name: "Character 3",
    face: "#efc7a6",
    hair: "#66478b",
    outfit: "#56398c",
    accent: "#f6e27a",
    variant: "mage",
    imageSrc: homeCharacter3AvatarSrc,
    homeCharacterSrc: homeCharacter3Src,
  },
  {
    id: "home-character-4",
    category: "homeCharacter",
    name: "Character 4",
    face: "#efc7a6",
    hair: "#66478b",
    outfit: "#56398c",
    accent: "#f6e27a",
    variant: "mage",
    imageSrc: homeCharacter4AvatarSrc,
    homeCharacterSrc: homeCharacter4Src,
  },
  {
    id: "home-character-5",
    category: "homeCharacter",
    name: "Character 5",
    face: "#efc7a6",
    hair: "#66478b",
    outfit: "#56398c",
    accent: "#f6e27a",
    variant: "mage",
    imageSrc: homeCharacter5AvatarSrc,
    homeCharacterSrc: homeCharacter5Src,
  },
];

export function getAvatarById(id: string) {
  return avatarOptions.find((avatar) => avatar.id === id) ?? avatarOptions[0];
}

export function getHomeCharacterSrcByAvatarId(id: string) {
  return getAvatarById(id).homeCharacterSrc ?? homeCharacter1Src;
}
