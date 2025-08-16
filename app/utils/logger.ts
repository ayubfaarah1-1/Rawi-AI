export const log = {
    info: (...args: any[]) => { if (__DEV__) console.log("[INFO]", ...args); },
    warn: (...args: any[]) => { if (__DEV__) console.warn("[WARN]", ...args); },
    error: (...args: any[]) => { console.error("[ERROR]", ...args); }, // keep errors visible
  };