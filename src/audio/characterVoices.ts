export type CharacterVoiceEvent =
  | "sevenQueen"
  | "reach"
  | "ron"
  | "tsumo"
  | "victory"
  | "defeat";

const voiceSources: Record<string, Record<CharacterVoiceEvent, string>> = {
  "home-character-1": {
    sevenQueen: new URL("../../mp3-file/イケメンキャラ_7渡し-Qボンバー.mp3", import.meta.url).href,
    reach: new URL("../../mp3-file/イケメンキャラ_リーチ.mp3", import.meta.url).href,
    ron: new URL("../../mp3-file/イケメンキャラ_ロン.mp3", import.meta.url).href,
    tsumo: new URL("../../mp3-file/イケメンキャラ_ツモ.mp3", import.meta.url).href,
    victory: new URL("../../mp3-file/イケメンキャラ_勝利.mp3", import.meta.url).href,
    defeat: new URL("../../mp3-file/イケメンキャラ_敗北.mp3", import.meta.url).href,
  },
  "home-character-2": {
    sevenQueen: new URL("../../mp3-file/高飛車キャラ_７渡し-Qボンバー.mp3", import.meta.url).href,
    reach: new URL("../../mp3-file/高飛車キャラ_リーチ.mp3", import.meta.url).href,
    ron: new URL("../../mp3-file/高飛車キャラ_ロン.mp3", import.meta.url).href,
    tsumo: new URL("../../mp3-file/高飛車キャラ_ツモ.mp3", import.meta.url).href,
    victory: new URL("../../mp3-file/高飛車キャラ_勝利.mp3", import.meta.url).href,
    defeat: new URL("../../mp3-file/高飛車キャラ_敗北.mp3", import.meta.url).href,
  },
  "home-character-3": {
    sevenQueen: new URL("../../mp3-file/クールキャラ_7渡し-Qボンバー.mp3", import.meta.url).href,
    reach: new URL("../../mp3-file/クールキャラ_リーチ.mp3", import.meta.url).href,
    ron: new URL("../../mp3-file/クールキャラ_ロン.mp3", import.meta.url).href,
    tsumo: new URL("../../mp3-file/クールキャラ_ツモ.mp3", import.meta.url).href,
    victory: new URL("../../mp3-file/クールキャラ_勝利.mp3", import.meta.url).href,
    defeat: new URL("../../mp3-file/クールキャラ_敗北.mp3", import.meta.url).href,
  },
  "home-character-4": {
    sevenQueen: new URL("../../mp3-file/イケオジキャラ_7渡し-Qボンバー.mp3", import.meta.url).href,
    reach: new URL("../../mp3-file/イケオジキャラ_リーチ.mp3", import.meta.url).href,
    ron: new URL("../../mp3-file/イケオジキャラ_ロン.mp3", import.meta.url).href,
    tsumo: new URL("../../mp3-file/イケオジキャラ_ツモ.mp3", import.meta.url).href,
    victory: new URL("../../mp3-file/イケオジキャラ_勝利.mp3", import.meta.url).href,
    defeat: new URL("../../mp3-file/イケオジキャラ_敗北.mp3", import.meta.url).href,
  },
  "home-character-5": {
    sevenQueen: new URL("../../mp3-file/熱血キャラ_7渡し-Qボンバー.mp3", import.meta.url).href,
    reach: new URL("../../mp3-file/熱血キャラ_リーチ.mp3", import.meta.url).href,
    ron: new URL("../../mp3-file/熱血キャラ_ロン.mp3", import.meta.url).href,
    tsumo: new URL("../../mp3-file/熱血キャラ_ツモ.mp3", import.meta.url).href,
    victory: new URL("../../mp3-file/熱血キャラ_勝利.mp3", import.meta.url).href,
    defeat: new URL("../../mp3-file/熱血キャラ敗北.mp3", import.meta.url).href,
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
