const STATE_OPTIONS = [
  { code: "AN", name: "Andaman and Nicobar Islands", aliases: ["Andaman & Nicobar Islands"] },
  { code: "AP", name: "Andhra Pradesh" },
  { code: "AR", name: "Arunachal Pradesh" },
  { code: "AS", name: "Assam" },
  { code: "BR", name: "Bihar", aliases: ["BH"] },
  { code: "CH", name: "Chandigarh" },
  { code: "CG", name: "Chhattisgarh" },
  {
    code: "DD",
    name: "Dadra and Nagar Haveli and Daman and Diu",
    aliases: ["Dadra and Nagar Haveli", "Daman and Diu"],
  },
  { code: "DL", name: "Delhi", aliases: ["New Delhi", "NCT of Delhi"] },
  { code: "GA", name: "Goa" },
  { code: "GJ", name: "Gujarat" },
  { code: "HR", name: "Haryana" },
  { code: "HP", name: "Himachal Pradesh" },
  { code: "JH", name: "Jharkhand" },
  { code: "JK", name: "Jammu and Kashmir", aliases: ["Jammu & Kashmir"] },
  { code: "KA", name: "Karnataka" },
  { code: "KL", name: "Kerala" },
  { code: "LA", name: "Ladakh" },
  { code: "LD", name: "Lakshadweep" },
  { code: "MH", name: "Maharashtra" },
  { code: "ML", name: "Meghalaya" },
  { code: "MN", name: "Manipur" },
  { code: "MP", name: "Madhya Pradesh" },
  { code: "MZ", name: "Mizoram" },
  { code: "NL", name: "Nagaland" },
  { code: "OD", name: "Odisha", aliases: ["Orissa"] },
  { code: "PB", name: "Punjab" },
  { code: "PY", name: "Puducherry", aliases: ["Pondicherry"] },
  { code: "RJ", name: "Rajasthan" },
  { code: "SK", name: "Sikkim" },
  { code: "TN", name: "Tamil Nadu" },
  { code: "TS", name: "Telangana" },
  { code: "TR", name: "Tripura" },
  { code: "UK", name: "Uttarakhand", aliases: ["Uttaranchal"] },
  { code: "UP", name: "Uttar Pradesh" },
  { code: "WB", name: "West Bengal" },
];

function normalizeStateKey(value = "") {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]/g, "");
}

const STATE_LOOKUP = new Map();

for (const state of STATE_OPTIONS) {
  STATE_LOOKUP.set(normalizeStateKey(state.code), state.code);
  STATE_LOOKUP.set(normalizeStateKey(state.name), state.code);

  for (const alias of state.aliases || []) {
    STATE_LOOKUP.set(normalizeStateKey(alias), state.code);
  }
}

function normalizeStateCode(value) {
  const key = normalizeStateKey(value);
  return STATE_LOOKUP.get(key) || null;
}

module.exports = {
  STATE_OPTIONS,
  normalizeStateCode,
};
