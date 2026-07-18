// Yemeni governorates for the delivery address book. `value` is the stable
// stored string; `ar`/`en` are display labels for the locale-aware dropdown.
// Shipping zones (DECISIONS.md §5) are built from these governorates.
export const GOVERNORATES = [
  { value: "Amanat Al Asimah", ar: "أمانة العاصمة", en: "Amanat Al Asimah" },
  { value: "Sana'a", ar: "صنعاء", en: "Sana'a" },
  { value: "Aden", ar: "عدن", en: "Aden" },
  { value: "Taiz", ar: "تعز", en: "Taiz" },
  { value: "Al Hudaydah", ar: "الحديدة", en: "Al Hudaydah" },
  { value: "Ibb", ar: "إب", en: "Ibb" },
  { value: "Dhamar", ar: "ذمار", en: "Dhamar" },
  { value: "Hajjah", ar: "حجة", en: "Hajjah" },
  { value: "Hadhramaut", ar: "حضرموت", en: "Hadhramaut" },
  { value: "Lahij", ar: "لحج", en: "Lahij" },
  { value: "Abyan", ar: "أبين", en: "Abyan" },
  { value: "Al Bayda", ar: "البيضاء", en: "Al Bayda" },
  { value: "Sa'dah", ar: "صعدة", en: "Sa'dah" },
  { value: "Shabwah", ar: "شبوة", en: "Shabwah" },
  { value: "Al Mahwit", ar: "المحويت", en: "Al Mahwit" },
  { value: "Amran", ar: "عمران", en: "Amran" },
  { value: "Ad Dali'", ar: "الضالع", en: "Ad Dali'" },
  { value: "Raymah", ar: "ريمة", en: "Raymah" },
  { value: "Al Jawf", ar: "الجوف", en: "Al Jawf" },
  { value: "Ma'rib", ar: "مأرب", en: "Ma'rib" },
  { value: "Al Mahrah", ar: "المهرة", en: "Al Mahrah" },
  { value: "Socotra", ar: "سقطرى", en: "Socotra" },
] as const;

export const GOVERNORATE_VALUES = GOVERNORATES.map((g) => g.value);
