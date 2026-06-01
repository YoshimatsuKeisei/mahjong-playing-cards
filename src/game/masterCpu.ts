import type { CpuModel } from "./cpuTypes";
import { chooseDaifugoSevenExchangeCardForModel } from "./daifugoCpu";
import { tacticalCpuModel } from "./tacticalCpu";
export { createMasterRankEstimate } from "./masterRankEstimate";

export const masterCpuModel: CpuModel = {
  ...tacticalCpuModel,
  id: "master",
  name: "Master CPU",
  chooseDaifugoSevenExchangeCard: (context, candidates, role) =>
    chooseDaifugoSevenExchangeCardForModel("master", context, candidates, role),
};
