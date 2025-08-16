// app/databases/text.ts
// Normalization + tokenization must be used consistently for storage and search.

export function normalizeArabicText(input: string): string {
    return input
      .replace(/[\u064B-\u065F]/g, "") // remove diacritics
      .replace(/\u0640/g, "")          // remove tatweel (kashida)
      .replace(/[إأآ]/g, "ا")          // unify alef forms
      .replace(/ى/g, "ي")              // alif maqsura -> ya
      .replace(/ة/g, "ه")              // choose one rule and stick with it
      .replace(/[^\u0600-\u06FF\s]/g, "") // remove punctuation/latin digits
      .trim();
  }
  
  export function tokenizeArabicText(input: string): string[] {
    return normalizeArabicText(input).split(/\s+/).filter(Boolean);
  }
  
  export function tokensToSearchKeys(tokens: string[]): string {
    return tokens.join(" ");
  }
  