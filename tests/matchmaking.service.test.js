import assert from "node:assert/strict";
import test from "node:test";
import MatchRoom from "../models/room.model.js";
import UserPreference from "../models/preference.model.js";
import ThisOrThatAnswer from "../models/thisOrThatAnswer.model.js";
import User from "../models/user.model.js";
import { CREDIT_RULES } from "../services/credits.service.js";
import {
  findBestMatchV2,
  getPreferenceBasedAvailableCount,
} from "../services/matchmaking.service.js";

const NOW = new Date("2026-03-27T12:00:00.000Z");

const createLeanChain = (value) => ({
  select() {
    return this;
  },
  sort() {
    return this;
  },
  lean: async () => value,
});

const createDateOfBirth = (age, now = NOW) =>
  new Date(Date.UTC(now.getUTCFullYear() - age, 0, 1));

const createUser = ({
  _id,
  gender,
  age,
  distance = 1000,
  credits = CREDIT_RULES.CONVERSATION_COST,
  matchmakingTimestamp = new Date("2026-03-27T10:00:00.000Z"),
  interests = ["music", "travel"],
  languages = ["english", "hindi"],
  religion = "hindu",
  diet = "vegetarian",
  lifestyle = {
    drinking: "never",
    smoking: "never",
    pets: "dog",
  },
  location = { coordinates: [77.5946, 12.9716] },
  isMatching = true,
}) => ({
  _id,
  gender,
  dob: createDateOfBirth(age),
  distance,
  credits,
  matchmakingTimestamp,
  interests,
  languages,
  religion,
  diet,
  lifestyle,
  location,
  isMatching,
});

const createPreference = ({
  user,
  interestedIn,
  ageRange = [24, 36],
  distance = 10,
  goal = { primary: "relationship", secondary: null, tertiary: null },
  interests = ["music", "travel"],
  relationshipType = "long_term",
  languages = ["english", "hindi"],
  zodiacPreference = [],
  personalityTypePreference = ["intj"],
  dietPreference = ["vegetarian"],
  heightRange = [150, 200],
  religionPreference = ["hindu"],
  drinkingPreference = ["never"],
  smokingPreference = ["never"],
  petPreference = ["dog"],
} = {}) => ({
  user,
  interestedIn,
  ageRange,
  distance,
  goal,
  interests,
  relationshipType,
  languages,
  zodiacPreference,
  personalityTypePreference,
  dietPreference,
  heightRange,
  religionPreference,
  drinkingPreference,
  smokingPreference,
  petPreference,
});

const createFindNearbyStub = (candidates, calls) => {
  return async (
    longitude,
    latitude,
    maxDistanceMeters,
    additionalQuery,
    userId,
    limit,
  ) => {
    calls.push({
      longitude,
      latitude,
      maxDistanceMeters,
      additionalQuery,
      userId,
      limit,
    });

    const allowedGenders = additionalQuery?.gender?.$in || null;
    const minCredits = Number(additionalQuery?.credits?.$gte || 0);

    return candidates
      .filter((candidate) => {
        if (String(candidate._id) === String(userId)) return false;
        if (candidate.isMatching !== additionalQuery?.isMatching) return false;
        if ((candidate.credits || 0) < minCredits) return false;
        if (candidate.distance > maxDistanceMeters) return false;
        if (allowedGenders && !allowedGenders.includes(candidate.gender)) {
          return false;
        }
        return true;
      })
      .slice(0, limit)
      .map((candidate) => ({ ...candidate }));
  };
};

const withMatchmakingMocks = async (
  {
    seeker,
    seekerPreference = null,
    candidates = [],
    candidatePreferences = [],
    answers = [],
    rooms = [],
    findNearby,
  },
  fn,
) => {
  const originalFindById = User.findById;
  const originalFindNearby = User.findNearby;
  const originalPreferenceFindOne = UserPreference.findOne;
  const originalPreferenceFind = UserPreference.find;
  const originalAnswersFind = ThisOrThatAnswer.find;
  const originalRoomsFind = MatchRoom.find;
  const originalConsoleInfo = console.info;

  User.findById = (userId) =>
    createLeanChain(
      seeker && String(userId) === String(seeker._id) ? { ...seeker } : null,
    );
  User.findNearby =
    findNearby || createFindNearbyStub(candidates, []);
  UserPreference.findOne = ({ user }) =>
    createLeanChain(
      seekerPreference && String(user) === String(seeker._id)
        ? { ...seekerPreference }
        : null,
    );
  UserPreference.find = ({ user }) => ({
    lean: async () =>
      candidatePreferences
        .filter((preference) =>
          user?.$in?.some(
            (candidateId) => String(candidateId) === String(preference.user),
          ),
        )
        .map((preference) => ({ ...preference })),
  });
  ThisOrThatAnswer.find = () => createLeanChain(answers);
  MatchRoom.find = () => createLeanChain(rooms);
  console.info = () => {};

  try {
    await fn();
  } finally {
    User.findById = originalFindById;
    User.findNearby = originalFindNearby;
    UserPreference.findOne = originalPreferenceFindOne;
    UserPreference.find = originalPreferenceFind;
    ThisOrThatAnswer.find = originalAnswersFind;
    MatchRoom.find = originalRoomsFind;
    console.info = originalConsoleInfo;
  }
};

test("invalid seeker state returns zero count and no match", async () => {
  const seeker = createUser({
    _id: "seeker-1",
    gender: "woman",
    age: 29,
    location: { coordinates: [0, 0] },
  });

  await withMatchmakingMocks({ seeker }, async () => {
    const count = await getPreferenceBasedAvailableCount({
      userId: seeker._id,
      now: NOW,
    });
    const match = await findBestMatchV2({
      userId: seeker._id,
      now: NOW,
    });

    assert.equal(count, 0);
    assert.equal(match, null);
  });
});

test("one-sided preference mismatch is excluded from count and matchmaking", async () => {
  const seeker = createUser({
    _id: "seeker-2",
    gender: "woman",
    age: 28,
  });
  const candidate = createUser({
    _id: "candidate-one-sided",
    gender: "man",
    age: 30,
    distance: 1200,
  });

  await withMatchmakingMocks(
    {
      seeker,
      seekerPreference: createPreference({
        user: seeker._id,
        interestedIn: "man",
        ageRange: [26, 34],
        distance: 10,
      }),
      candidates: [candidate],
      candidatePreferences: [
        createPreference({
          user: candidate._id,
          interestedIn: "man",
          ageRange: [24, 32],
        }),
      ],
    },
    async () => {
      const count = await getPreferenceBasedAvailableCount({
        userId: seeker._id,
        now: NOW,
      });
      const match = await findBestMatchV2({
        userId: seeker._id,
        now: NOW,
      });

      assert.equal(count, 0);
      assert.equal(match, null);
    },
  );
});

test("count and matchmaking both honor first-pass distance and credit filters", async () => {
  const seeker = createUser({
    _id: "seeker-3",
    gender: "woman",
    age: 29,
  });
  const eligibleCandidate = createUser({
    _id: "candidate-eligible",
    gender: "man",
    age: 30,
    distance: 4000,
  });
  const farCandidate = createUser({
    _id: "candidate-far",
    gender: "man",
    age: 30,
    distance: 7000,
  });
  const brokeCandidate = createUser({
    _id: "candidate-broke",
    gender: "man",
    age: 31,
    distance: 3000,
    credits: 0,
  });
  const findNearbyCalls = [];

  await withMatchmakingMocks(
    {
      seeker,
      seekerPreference: createPreference({
        user: seeker._id,
        interestedIn: "man",
        ageRange: [26, 34],
        distance: 5,
      }),
      candidates: [eligibleCandidate, farCandidate, brokeCandidate],
      candidatePreferences: [
        createPreference({ user: eligibleCandidate._id, interestedIn: "woman" }),
        createPreference({ user: farCandidate._id, interestedIn: "woman" }),
        createPreference({ user: brokeCandidate._id, interestedIn: "woman" }),
      ],
      findNearby: createFindNearbyStub(
        [eligibleCandidate, farCandidate, brokeCandidate],
        findNearbyCalls,
      ),
    },
    async () => {
      const count = await getPreferenceBasedAvailableCount({
        userId: seeker._id,
        now: NOW,
      });
      const match = await findBestMatchV2({
        userId: seeker._id,
        now: NOW,
      });

      assert.equal(count, 1);
      assert.equal(match?.uid, eligibleCandidate._id);
      assert.equal(findNearbyCalls[0]?.maxDistanceMeters, 5000);
      assert.equal(
        findNearbyCalls[0]?.additionalQuery?.credits?.$gte,
        CREDIT_RULES.CONVERSATION_COST,
      );
    },
  );
});

test("available count matches the initial candidate pool before scoring chooses a winner", async () => {
  const seeker = createUser({
    _id: "seeker-4",
    gender: "woman",
    age: 28,
    interests: ["music", "travel", "books"],
    languages: ["english", "hindi"],
  });
  const strongerCandidate = createUser({
    _id: "candidate-strong",
    gender: "man",
    age: 29,
    distance: 900,
    matchmakingTimestamp: new Date("2026-03-27T09:00:00.000Z"),
    interests: ["music", "travel", "books"],
    languages: ["english", "hindi"],
  });
  const weakerCandidate = createUser({
    _id: "candidate-weak",
    gender: "man",
    age: 31,
    distance: 8500,
    matchmakingTimestamp: new Date("2026-03-27T09:00:00.000Z"),
    interests: [],
    languages: [],
    religion: "other",
    diet: "non_vegetarian",
    lifestyle: {
      drinking: "socially",
      smoking: "sometimes",
      pets: "none",
    },
  });

  await withMatchmakingMocks(
    {
      seeker,
      seekerPreference: createPreference({
        user: seeker._id,
        interestedIn: "man",
        ageRange: [26, 34],
        distance: 10,
        goal: { primary: "relationship", secondary: "dating", tertiary: null },
      }),
      candidates: [strongerCandidate, weakerCandidate],
      candidatePreferences: [
        createPreference({
          user: strongerCandidate._id,
          interestedIn: "woman",
          goal: { primary: "relationship", secondary: "dating", tertiary: null },
        }),
        createPreference({
          user: weakerCandidate._id,
          interestedIn: "woman",
          goal: { primary: "friendship", secondary: null, tertiary: null },
          interests: [],
          languages: [],
          relationshipType: "casual",
          personalityTypePreference: [],
          dietPreference: [],
          religionPreference: [],
          drinkingPreference: [],
          smokingPreference: [],
          petPreference: [],
        }),
      ],
    },
    async () => {
      const count = await getPreferenceBasedAvailableCount({
        userId: seeker._id,
        now: NOW,
      });
      const match = await findBestMatchV2({
        userId: seeker._id,
        now: NOW,
      });

      assert.equal(count, 2);
      assert.equal(match?.uid, strongerCandidate._id);
    },
  );
});
