export const CPU_THINK_DELAY_MS = 900;
export const CPU_AFTER_DRAW_DELAY_MS = 650;
export const CPU_DISCARD_DELAY_MS = 900;
export const CPU_DECISION_DELAY_MS = 900;

export { createCpuDecisionContext, type CpuDecisionContext, type CpuModel } from "./cpuTypes";
export { getCpuModel, DEFAULT_CPU_MODEL_ID, cpuModels } from "./cpuModelRegistry";
export {
  standardChooseCpuDiscardCard as chooseCpuDiscardCard,
  standardChooseCpuDrawSource as chooseCpuDrawSource,
  standardChooseCpuCall as chooseCpuCall,
  standardChooseCpuWinningDiscard as chooseCpuWinningDiscard,
  standardShouldCpuCall as shouldCpuCall,
  standardShouldCpuWin as shouldCpuWin,
  standardCpuModel,
} from "./standardCpu";
export { tacticalCpuModel } from "./tacticalCpu";
