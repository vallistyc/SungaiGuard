export const TURBIDITY_THRESHOLDS = {
  clear: 10,
  slightlyTurbid: 40,
  turbid: 100,
} as const;

export const TURBIDITY_LEVELS = [
  {
    status: "Jernih",
    range: `≤ ${TURBIDITY_THRESHOLDS.clear}`,
    color: "#26a879",
    riverColor: "#8bd8ee",
  },
  {
    status: "Agak Keruh",
    range: `> ${TURBIDITY_THRESHOLDS.clear}–${TURBIDITY_THRESHOLDS.slightlyTurbid}`,
    color: "#d79b18",
    riverColor: "#c8cf83",
  },
  {
    status: "Keruh",
    range: `> ${TURBIDITY_THRESHOLDS.slightlyTurbid}–${TURBIDITY_THRESHOLDS.turbid}`,
    color: "#e77b25",
    riverColor: "#c58a54",
  },
  {
    status: "Sangat Keruh",
    range: `> ${TURBIDITY_THRESHOLDS.turbid}`,
    color: "#d64d4d",
    riverColor: "#80513d",
  },
] as const;

export type TurbidityStatus = (typeof TURBIDITY_LEVELS)[number]["status"];

export const NEUTRAL_COLOR = "#94a3a0";

export function classifyNtu(
  ntu: number | null | undefined,
): TurbidityStatus | null {
  if (ntu === null || ntu === undefined || !Number.isFinite(ntu)) return null;
  if (ntu <= TURBIDITY_THRESHOLDS.clear) return "Jernih";
  if (ntu <= TURBIDITY_THRESHOLDS.slightlyTurbid) return "Agak Keruh";
  if (ntu <= TURBIDITY_THRESHOLDS.turbid) return "Keruh";
  return "Sangat Keruh";
}

export function isTurbidityStatus(value: unknown): value is TurbidityStatus {
  return TURBIDITY_LEVELS.some((level) => level.status === value);
}

export function getTurbidityColor(status: TurbidityStatus | null): string {
  return (
    TURBIDITY_LEVELS.find((level) => level.status === status)?.color ??
    NEUTRAL_COLOR
  );
}

export function getRiverColor(status: TurbidityStatus | null): string {
  return (
    TURBIDITY_LEVELS.find((level) => level.status === status)?.riverColor ??
    "#a9bdbb"
  );
}
