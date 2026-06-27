export type CharacterVoiceEvent =
  | "sevenQueen"
  | "reach"
  | "ron"
  | "tsumo"
  | "victory"
  | "defeat";

const voiceSources: Record<string, Record<CharacterVoiceEvent, string>> = {
  "home-character-1": {
    sevenQueen: new URL("../../イケメンキャラ_7渡し-Qボンバー.mp3", import.meta.url).href,
    reach: new URL("../../イケメンキャラ_リーチ.mp3", import.meta.url).href,
    ron: new URL("../../イケメンキャラ_ロン.mp3", import.meta.url).href,
    tsumo: new URL("../../イケメンキャラ_ツモ.mp3", import.meta.url).href,
    victory: new URL("../../イケメンキャラ_勝利.mp3", import.meta.url).href,
    defeat: new URL("../../イケメンキャラ_敗北.mp3", import.meta.url).href,
  },
  "home-character-2": {
    sevenQueen: new URL("../../高飛車キャラ_７渡し-Qボンバー.mp3", import.meta.url).href,
    reach: new URL("../../高飛車キャラ_リーチ.mp3", import.meta.url).href,
    ron: new URL("../../高飛車キャラ_ロン.mp3", import.meta.url).href,
    tsumo: new URL("../../高飛車キャラ_ツモ.mp3", import.meta.url).href,
    victory: new URL("../../高飛車キャラ_勝利.mp3", import.meta.url).href,
    defeat: new URL("../../高飛車キャラ_敗北.mp3", import.meta.url).href,
  },
  "home-character-3": {
    sevenQueen: new URL("../../クールキャラ_7渡し-Qボンバー.mp3", import.meta.url).href,
    reach: new URL("../../クールキャラ_リーチ.mp3", import.meta.url).href,
    ron: new URL("../../クールキャラ_ロン.mp3", import.meta.url).href,
    tsumo: new URL("../../クールキャラ_ツモ.mp3", import.meta.url).href,
    victory: new URL("../../クールキャラ_勝利.mp3", import.meta.url).href,
    defeat: new URL("../../クールキャラ_敗北.mp3", import.meta.url).href,
  },
  "home-character-4": {
    sevenQueen: new URL("../../イケオジキャラ_7渡し-Qボンバー.mp3", import.meta.url).href,
    reach: new URL("../../イケオジキャラ_リーチ.mp3", import.meta.url).href,
    ron: new URL("../../イケオジキャラ_ロン.mp3", import.meta.url).href,
    tsumo: new URL("../../イケオジキャラ_ツモ.mp3", import.meta.url).href,
    victory: new URL("../../イケオジキャラ_勝利.mp3", import.meta.url).href,
    defeat: new URL("../../イケオジキャラ_敗北.mp3", import.meta.url).href,
  },
  "home-character-5": {
    sevenQueen: new URL("../../熱血キャラ_7渡し-Qボンバー.mp3", import.meta.url).href,
    reach: new URL("../../熱血キャラ_リーチ.mp3", import.meta.url).href,
    ron: new URL("../../熱血キャラ_ロン.mp3", import.meta.url).href,
    tsumo: new URL("../../熱血キャラ_ツモ.mp3", import.meta.url).href,
    victory: new URL("../../熱血キャラ_勝利.mp3", import.meta.url).href,
    defeat: new URL("../../熱血キャラ敗北.mp3", import.meta.url).href,
  },
};

export function getSeatFallbackAvatarId(playerIndex: number) {
  return `home-character-${(playerIndex % 5) + 1}`;
}

export function playCharacterVoice(avatarId: string, event: CharacterVoiceEvent) {
  const src = voiceSources[avatarId]?.[event] ?? voiceSources["home-character-1"][event];
  if (!src || typeof Audio === "undefined") return;

  const audio = new Audio(src);
  audio.volume = getStoredSeVolume();
  const playPromise = audio.play();
  if (playPromise && typeof playPromise.catch === "function") {
    playPromise.catch(() => undefined);
  }
}

function getStoredSeVolume() {
  if (typeof localStorage === "undefined") return 0.7;
  const raw = localStorage.getItem("mahjong-settings-se-volume");
  const parsed = raw === null ? NaN : Number(raw);
  if (!Number.isFinite(parsed)) return 0.7;
  return Math.max(0, Math.min(1, parsed / 100));
}
