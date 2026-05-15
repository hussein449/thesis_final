/**
 * Highway Section Setup — Simplified UAV-IoT Accident Simulation Model
 * ====================================================================
 *
 * Implements Section 1 ("System and Road Representation") of the simplified
 * model report (May 13, 2026):
 *
 *   "The highway corridor is modeled as a one-dimensional line. The
 *    coordinate s denotes distance along the road, measured in kilometers
 *    from the beginning of the corridor.
 *
 *        s = 0 at the start of the corridor,  s = L at the end.
 *
 *    The corridor is divided into small highway sections S_1, ..., S_N,
 *    each 1 km long (another fixed length may be used). Section i occupies
 *    [s_start_i, s_end_i]."
 *
 * These highway sections are the unit of MANUAL RISK SCORING (T_i, C_i, M_i)
 * and ACCIDENT GENERATION (P(i | b)). They are NOT the same thing as UAV
 * patrol segments [A_m, B_m] from §6, which are a grouping of one or more
 * consecutive highway sections assigned to a single UAV.
 */

/** Default highway-section length in km, per §1 of the model report. */
export const DEFAULT_SECTION_LENGTH_KM = 1.0

/**
 * Divide a corridor of total length `lengthKm` into N highway sections of
 * fixed length `sectionLengthKm` (default 1 km).
 *
 * Returns an array of section objects:
 *   {
 *     index:   1-based section index i (matches S_i notation in the report)
 *     sStart:  start coordinate s_start in km
 *     sEnd:    end coordinate s_end in km
 *     length:  section length in km (= sectionLengthKm, except possibly the
 *              last section if the corridor length is not an exact multiple)
 *   }
 *
 * The last section is shortened (not stretched) when lengthKm is not an
 * exact multiple of sectionLengthKm, so that s_end of the final section
 * equals exactly L. This preserves the property that the union of all
 * sections covers [0, L] with no gaps and no overlap.
 */
export function buildSections(lengthKm, sectionLengthKm = DEFAULT_SECTION_LENGTH_KM) {
  if (lengthKm <= 0) throw new Error('lengthKm must be positive')
  if (sectionLengthKm <= 0) throw new Error('sectionLengthKm must be positive')

  const sections = []
  const N = Math.ceil(lengthKm / sectionLengthKm)
  for (let i = 0; i < N; i++) {
    const sStart = i * sectionLengthKm
    const sEnd = Math.min((i + 1) * sectionLengthKm, lengthKm)
    sections.push({
      index: i + 1,
      sStart,
      sEnd,
      length: sEnd - sStart,
    })
  }
  return sections
}

/**
 * Find the 1-based index of the section that contains the coordinate s (km).
 * Returns -1 if s is outside [0, L].
 *
 * Boundary convention: s exactly at the end of section i belongs to
 * section i+1 (half-open intervals [sStart, sEnd)), except the very last
 * section which is closed on the right so that s = L is included.
 */
export function sectionIndexAt(sections, s) {
  if (s < 0) return -1
  const last = sections[sections.length - 1]
  if (s > last.sEnd) return -1
  if (s === last.sEnd) return last.index
  for (const sec of sections) {
    if (s >= sec.sStart && s < sec.sEnd) return sec.index
  }
  return -1
}

/** Convenience: km → meters. */
export function kmToMeters(km) { return km * 1000 }

/** Convenience: meters → km. */
export function metersToKm(m) { return m / 1000 }

/**
 * Attach a section grid to a road object (non-mutating).
 * Returns a new object: { ...road, sections, sectionLengthKm, numSections }.
 */
export function withSections(road, sectionLengthKm = DEFAULT_SECTION_LENGTH_KM) {
  const sections = buildSections(road.lengthKm, sectionLengthKm)
  return {
    ...road,
    sections,
    sectionLengthKm,
    numSections: sections.length,
  }
}
