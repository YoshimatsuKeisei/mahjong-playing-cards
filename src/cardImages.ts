import type { Card } from "./types";

const playingCardModules = import.meta.glob("../playing cards/*.png", {
  eager: true,
  import: "default",
  query: "?url",
}) as Record<string, string>;

const playingCardImageEntries = Object.entries(playingCardModules);

const rankFileNames: Record<number, string> = {
  1: "ace",
  2: "2",
  3: "3",
  4: "4",
  5: "5",
  6: "6",
  7: "7",
  8: "8",
  9: "9",
  10: "10",
  11: "jack",
  12: "queen",
  13: "king",
};

const suitFileNames: Record<Card["suit"], string> = {
  C: "clubs",
  D: "diamonds",
  H: "hearts",
  S: "spades",
};

let preloadPromise: Promise<void> | null = null;

function findImageSrc(fileName: string) {
  return playingCardImageEntries.find(([path]) => path.endsWith(`/${fileName}`))?.[1];
}

export function getCardFaceImageSrc(card: Card) {
  const rankName = rankFileNames[card.rank];
  const suitName = suitFileNames[card.suit];
  if (!rankName || !suitName) return undefined;
  return findImageSrc(`${rankName}_of_${suitName}.png`);
}

export const cardBackImageSrc = findImageSrc("カード裏面.png");

export const allPlayingCardImageSrcs = Object.values(playingCardModules);

export function preloadPlayingCardImages() {
  if (preloadPromise) return preloadPromise;
  if (typeof Image === "undefined") {
    preloadPromise = Promise.resolve();
    return preloadPromise;
  }

  preloadPromise = Promise.all(
    allPlayingCardImageSrcs.map(
      (src) =>
        new Promise<void>((resolve) => {
          const image = new Image();
          image.onload = () => resolve();
          image.onerror = () => resolve();
          image.src = src;
          if (typeof image.decode === "function") {
            image.decode().then(resolve, resolve);
          }
        }),
    ),
  ).then(() => undefined);

  return preloadPromise;
}
