// ===========================================================================
// MCQ bulk-import parser + validator (JSON).
//
// Accepts a JSON array in EITHER shape:
//
//   canonical:
//     { "question": "...", "options": ["A","B","C","D"],
//       "correct_index": 0, "explanation": "..." }
//
//   friendly:
//     { "question": "...", "option_a": "...", "option_b": "...",
//       "option_c": "...", "option_d": "...",
//       "correct_answer": "B",          // letter A–F, OR 1-based number "2"
//       "explanation": "..." }
//
// It normalizes both to our DB shape: options = string[] and correct_index =
// 0-based integer. Validation is ALL-OR-NOTHING: parseMcqJson returns the list
// of per-row errors; the caller must write nothing if errors.length > 0.
//
// The correct_index mapping is the high-risk part (a wrong index silently
// flips every "correct" answer), so it is explicit and range-checked.
// ===========================================================================

const LETTERS = ["a", "b", "c", "d", "e", "f"];

// "B" -> 1, "b" -> 1, "2" -> 1 (1-based number), "0" -> -1 (invalid). NaN if junk.
export function parseCorrectAnswer(v) {
  if (v == null) return NaN;
  const s = String(v).trim();
  if (s === "") return NaN;
  if (/^[0-9]+$/.test(s)) return Number(s) - 1;          // 1-based -> 0-based
  if (/^[A-Za-z]$/.test(s)) return s.toUpperCase().charCodeAt(0) - 65; // A->0
  return NaN;
}

// Normalize one raw object. Returns { value, errors:[strings] }.
export function normalizeRow(raw) {
  const errors = [];
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) {
    return { value: null, errors: ["row is not an object"] };
  }

  const question = String(raw.question ?? raw.Question ?? "").trim();
  if (!question) errors.push("question is empty");

  // Options: explicit array, else assemble option_a..option_f.
  let options;
  if (Array.isArray(raw.options)) {
    options = raw.options;
  } else {
    options = LETTERS
      .map((L) => raw[`option_${L}`] ?? raw[`option_${L.toUpperCase()}`])
      .filter((v) => v != null && String(v).trim() !== "");
  }
  options = (options || []).map((o) => (o == null ? "" : String(o).trim())).filter((s) => s.length > 0);
  if (options.length < 2 || options.length > 6) {
    errors.push(`needs 2–6 options (got ${options.length})`);
  }

  // Correct index: prefer explicit 0-based correct_index, else correct_answer.
  let ci;
  if (raw.correct_index !== undefined && raw.correct_index !== null && String(raw.correct_index).trim() !== "") {
    ci = Number(raw.correct_index);
    if (!Number.isInteger(ci)) errors.push(`correct_index "${raw.correct_index}" is not an integer`);
  } else if (raw.correct_answer !== undefined && raw.correct_answer !== null && String(raw.correct_answer).trim() !== "") {
    ci = parseCorrectAnswer(raw.correct_answer);
    if (Number.isNaN(ci)) errors.push(`correct_answer "${raw.correct_answer}" is not a letter (A–F) or number (1–6)`);
  } else {
    errors.push("missing correct_index or correct_answer");
    ci = NaN;
  }

  if (Number.isInteger(ci) && options.length > 0 && (ci < 0 || ci >= options.length)) {
    errors.push(`correct answer points to option #${ci + 1}, but there are only ${options.length} options`);
  }

  const explanation =
    raw.explanation != null && String(raw.explanation).trim() !== ""
      ? String(raw.explanation)
      : null;

  return {
    value: errors.length ? null : { question, options, correct_index: ci, explanation },
    errors,
  };
}

// Parse a JSON string. Returns { ok, rows, errors }.
//   errors: [{ row: 1-based number, messages: [...] }]   (empty when ok)
//   rows:   normalized objects (only meaningful when ok === true)
export function parseMcqJson(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch (e) {
    return { ok: false, rows: [], errors: [{ row: 0, messages: [`invalid JSON: ${e.message}`] }] };
  }
  if (!Array.isArray(data)) {
    return { ok: false, rows: [], errors: [{ row: 0, messages: ["top-level JSON must be an array of questions"] }] };
  }
  if (data.length === 0) {
    return { ok: false, rows: [], errors: [{ row: 0, messages: ["the file contains no questions"] }] };
  }

  const rows = [];
  const errors = [];
  data.forEach((raw, i) => {
    const { value, errors: rowErrors } = normalizeRow(raw);
    if (rowErrors.length) errors.push({ row: i + 1, messages: rowErrors });
    else rows.push(value);
  });

  return { ok: errors.length === 0, rows, errors };
}
