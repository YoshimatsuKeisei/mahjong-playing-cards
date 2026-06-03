import type { CpuModel } from "./cpuTypes";
import { chooseDaifugoExtraDiscardForModel, chooseDaifugoSevenExchangeCardForModel } from "./daifugoCpu";
import { tacticalCpuModel } from "./tacticalCpu";
export { createMasterRankEstimate } from "./masterRankEstimate";

export const masterCpuModel: CpuModel = {
  ...tacticalCpuModel,
  id: "master",
  name: "Master CPU",
  chooseDaifugoSevenExchangeCard: (context, candidates, role) =>
    chooseDaifugoSevenExchangeCardForModel("master", context, candidates, role),
  chooseDaifugoExtraDiscard: (context, effect, candidates) =>
    chooseDaifugoExtraDiscardForModel("master", context, effect, candidates),
};
