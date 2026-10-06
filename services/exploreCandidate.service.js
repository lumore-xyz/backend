import Report from "../models/report.model.js";
import RejectedProfile from "../models/reject.model.js";
import { getDateOfBirthRange } from "../utils/age.js";
import { idsEqual, toObjectId } from "../utils/objectId.js";
import { getMatchedUserIdSet } from "./matching.service.js";

export const SELECT = "_id nickname profilePicture gender dob height zodiacSign bio interests languages work institution personalityType lifestyle diet religion hometown isVerified fieldVisibility location isArchived";

export const buildExploreCandidateQuery = ({ userId, prefs, excludedIds, now }) => ({
  _id: { $nin: [userId, ...excludedIds].map(toObjectId) },
  isArchived: { $ne: true },
  gender: { $in: prefs.interestedIn.includes("any") ? ["man", "woman"] : prefs.interestedIn },
  dob: getDateOfBirthRange(prefs.ageRange, now),
});

export const getExcludedIds = async (userId, includeMatched = true) => {
  const [matched, reports, rejections] = await Promise.all([
    includeMatched ? getMatchedUserIdSet({ userId }) : Promise.resolve(new Set()),
    Report.find({ $or: [{ reporter: userId }, { reportedUser: userId }] })
      .select("reporter reportedUser")
      .lean(),
    RejectedProfile.find({ $or: [{ user: userId }, { rejectedUser: userId }] })
      .select("user rejectedUser")
      .lean(),
  ]);
  const excluded = new Set(matched);
  for (const entry of [...reports, ...rejections]) {
    for (const id of [entry.reporter, entry.reportedUser, entry.user, entry.rejectedUser]) {
      if (id && !idsEqual(id, userId)) excluded.add(String(id));
    }
  }
  return [...excluded];
};
