import { LANGUAGES, landingCopy, type LandingKey, type Language } from "./translations";

/** The landing keys the day renderer, the calendar and the week card read in the browser. */
export type DemoCopyKey = Extract<
  LandingKey,
  `calendar.${string}` | `week.${string}` | "orbit.teamMeeting" | "orbit.dentist"
>;

/** The demo words in both languages. The page ships them in a data attribute, not in a script. */
export type DemoCopy = Record<Language, Record<DemoCopyKey, string>>;

const isDemoKey = (key: string): key is DemoCopyKey =>
  /^(?:calendar|week)\./.test(key) || key === "orbit.teamMeeting" || key === "orbit.dentist";

/** Collects the demo words from the landing tables for the build. */
export function demoCopy(): DemoCopy {
  return Object.fromEntries(
    LANGUAGES.map((language) => [
      language,
      Object.fromEntries(Object.entries(landingCopy[language]).filter(([key]) => isDemoKey(key))),
    ]),
  ) as DemoCopy;
}
