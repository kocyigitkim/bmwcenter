export const ELM327Commands = {
  reset: "ATZ",
  echoOff: "ATE0",
  linefeedOff: "ATL0",
  spacesOff: "ATS0",
  headersOff: "ATH0",
  adaptiveTiming: "ATAT1",
  autoProtocol: "ATSP0",
  supportedPIDs00: "0100",
  supportedPIDs20: "0120",
  supportedPIDs40: "0140",
  readDTCs: "03",
  readPendingDTCs: "07",
  readPermanentDTCs: "0A",
  clearDTCs: "04",

  mode01(pid: number): string {
    return `01${pid.toString(16).toUpperCase().padStart(2, "0")}`;
  },

  /** ISO-TP header targeting DME (functional/physical request on many F-series). */
  headerDME: "ATSH7E0",
  protocolCAN11_500: "ATSP6",
  /** BMW F30/N13 MEVD1725 oil temperature (Mode 22 DID 0xD3B0). */
  bmwOilTempMode22: "22D3B0",
} as const;

export interface InitStep {
  command: string;
  delayAfterMs: number;
}

/** Note: ATS0 (spaces off) omitted — VLinker MC-iOS / some clones mis-handle spaced replies when disabled early. */
export const initSequence: InitStep[] = [
  { command: ELM327Commands.reset, delayAfterMs: 1500 },
  { command: ELM327Commands.echoOff, delayAfterMs: 200 },
  { command: ELM327Commands.linefeedOff, delayAfterMs: 200 },
  { command: ELM327Commands.headersOff, delayAfterMs: 200 },
  { command: ELM327Commands.adaptiveTiming, delayAfterMs: 200 },
  { command: ELM327Commands.autoProtocol, delayAfterMs: 500 },
  { command: ELM327Commands.supportedPIDs00, delayAfterMs: 400 },
];
