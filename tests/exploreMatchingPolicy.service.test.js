import test from "node:test";
import assert from "node:assert/strict";
import { scoreExploreCandidate } from "../services/exploreMatchingPolicy.service.js";
import { normalizePreference } from "../services/matchingPolicy.service.js";

const score = ({ seeker = {}, candidate = {}, seekerPrefs = {}, candidatePrefs = {},
  distanceKm = null, seekerAnswers = new Map(), candidateAnswers = new Map() } = {}) =>
  scoreExploreCandidate({
    seeker,
    candidate,
    distanceKm,
    context: {
      seekerPrefs: normalizePreference(seekerPrefs),
      candidatePrefs: normalizePreference(candidatePrefs),
      seekerAnswers,
      candidateAnswers,
    },
  });

test("unrestricted preferences provide no compatibility evidence", () => {
  const result = score({ seekerPrefs: { religionPreference: ["any"], dietPreference: ["all"] } });
  assert.equal(result.components.preferences, 0);
  assert.equal(result.score, 0);
});

test("one person's many matching preferences cannot conceal poor reciprocal fit", () => {
  const result = score({
    seeker: { religion: "hindu" },
    candidate: { diet: "vegan", personalityType: "intj" },
    seekerPrefs: { dietPreference: ["vegan"], personalityTypePreference: ["intj"] },
    candidatePrefs: { religionPreference: ["buddhist"] },
  });
  assert.equal(result.components.preferences, 0);
  const oneDirection = score({ candidate: { diet: "vegan" }, seekerPrefs: { dietPreference: ["vegan"] } });
  assert.equal(oneDirection.components.preferences, 20);
});

test("distance respects both radii and is symmetric", () => {
  const wide = score({ distanceKm: 20, seekerPrefs: { distance: 50 }, candidatePrefs: { distance: 50 } });
  const narrow = score({ distanceKm: 20, seekerPrefs: { distance: 50 }, candidatePrefs: { distance: 5 } });
  const reversed = score({ distanceKm: 20, seekerPrefs: { distance: 5 }, candidatePrefs: { distance: 50 } });
  assert.ok(narrow.components.distance < wide.components.distance);
  assert.equal(narrow.components.distance, reversed.components.distance);
});

test("shared goal priority matters and adding languages cannot reduce communication fit", () => {
  const primary = score({ seekerPrefs: { goal: { primary: "friendship" } }, candidatePrefs: { goal: { primary: "friendship" } } });
  const secondary = score({ seekerPrefs: { goal: { primary: "friendship" } }, candidatePrefs: { goal: { secondary: "friendship" } } });
  const tertiary = score({ seekerPrefs: { goal: { primary: "friendship" } }, candidatePrefs: { goal: { tertiary: "friendship" } } });
  assert.ok(primary.components.goals > secondary.components.goals);
  assert.ok(secondary.components.goals > tertiary.components.goals);
  const bilingual = score({ seeker: { languages: ["english"] }, candidate: { languages: ["english", "hindi"] } });
  assert.equal(bilingual.components.languages, 10);
});

test("answer disagreement reduces points even when matched-answer counts are equal", () => {
  const all = new Map(Array.from({ length: 20 }, (_, index) => [`q${index}`, "a"]));
  const five = new Map([...all].slice(0, 5));
  const mixed = new Map([...all].map(([key, value], index) => [key, index < 5 ? value : "b"]));
  const consistent = score({ seekerAnswers: all, candidateAnswers: five });
  const disagreement = score({ seekerAnswers: all, candidateAnswers: mixed });
  assert.equal(consistent.components.thisOrThat, 5);
  assert.equal(disagreement.components.thisOrThat, 1.25);
});

test("missing evidence and malformed height ranges cannot create an invalid score", () => {
  const result = score({ distanceKm: NaN, seekerPrefs: { heightRange: [200, 150] } });
  assert.equal(result.score, 0);
  assert.ok(Object.values(result.components).every(Number.isFinite));
});
