import type { CpuModelId } from "../types";
import type { CpuModel } from "./cpuTypes";
import { easyCpuModel } from "./easyCpu";
import { standardCpuModel } from "./standardCpu";
import { tacticalCpuModel } from "./tacticalCpu";

export const DEFAULT_CPU_MODEL_ID: CpuModelId = "standard";

export const cpuModels: Record<CpuModelId, CpuModel> = {
  easy: easyCpuModel,
  standard: standardCpuModel,
  tactical: tacticalCpuModel,
};

export function getCpuModel(cpuModelId: CpuModelId | undefined): CpuModel {
  return cpuModels[cpuModelId ?? DEFAULT_CPU_MODEL_ID] ?? standardCpuModel;
}
