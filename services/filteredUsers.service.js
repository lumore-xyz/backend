import {
  buildPreferenceFilter,
  buildUserFilterClauses,
  hasPreferenceFilters,
  splitUserAndPreferenceFilters,
} from "../utils/userFilters.js";
import { getUserIdsByPreferenceFilter } from "./profilePreference.service.js";

export const buildFilteredUserQuery = async (filters = {}) => {
  const { userFilters, preferenceFilters } = splitUserAndPreferenceFilters(filters);
  const clauses = buildUserFilterClauses(userFilters);

  if (hasPreferenceFilters(preferenceFilters)) {
    const userIds = await getUserIdsByPreferenceFilter(
      buildPreferenceFilter(preferenceFilters),
    );
    clauses.push({ _id: { $in: userIds } });
  }

  return clauses.length ? { $and: clauses } : {};
};
