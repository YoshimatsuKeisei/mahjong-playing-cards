import type { CpuModelId } from "../types";
import type { CpuModel } from "./cpuTypes";
import { easyCpuModel } from "./easyCpu";
import { masterCpuModel } from "./masterCpu";
import { standardCpuModel } from "./standardCpu";
import { tacticalCpuModel } from "./tacticalCpu";

export const DEFAULT_CPU_MODEL_ID: CpuModelId = "standard";

export const cpuModels: Record<CpuModelId, CpuModel> = {
  easy: easyCpuModel,
  standard: standardCpuModel,
  tactical: tacticalCpuModel,
  master: masterCpuModel,
};

export const cpuModelDisplayNames: Record<CpuModelId, string> = {
  easy: "junior-CPU",
  standard: "standard-CPU",
  tactical: "pro-CPU",
  master: "master-CPU",
};

export function getCpuModel(cpuModelId: CpuModelId | undefined): CpuModel {
  return cpuModels[cpuModelId ?? DEFAULT_CPU_MODEL_ID] ?? standardCpuModel;
}

export function getCpuModelDisplayName(cpuModelId: CpuModelId | undefined): string {
  return cpuModelDisplayNames[cpuModelId ?? DEFAULT_CPU_MODEL_ID] ?? cpuModelDisplayNames.standard;
}
