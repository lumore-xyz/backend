import User from "../models/user.model.js";
import UserGroup from "../models/userGroup.model.js";
import { normalizeUniqueStringList } from "../utils/strings.js";
import { hasAnySupportedFilters } from "../utils/userFilters.js";
import { isValidObjectId } from "../utils/objectId.js";
import { buildFilteredUserQuery } from "./filteredUsers.service.js";

const normalizeUserIds = (list = []) =>
  Array.from(
    new Set(
      (Array.isArray(list) ? list : [])
        .map((item) => String(item || "").trim())
        .filter(isValidObjectId),
    ),
  );

const resolveFilteredUserIds = async (filters = {}) => {
  if (!hasAnySupportedFilters(filters)) return [];
  const filter = await buildFilteredUserQuery(filters);
  const users = await User.find(filter).select("_id").lean();
  return users.map((user) => user._id.toString());
};

export const resolveUserIds = async ({
  userIds = [],
  usernames = [],
  filters = {},
}) => {
  const normalizedIds = normalizeUserIds(userIds);
  const normalizedNames = normalizeUniqueStringList(usernames);
  const queries = [];

  if (normalizedNames.length) {
    queries.push(
      User.find({ username: { $in: normalizedNames } })
        .select("_id")
        .lean()
        .then((users) => users.map(({ _id }) => _id.toString())),
    );
  }

  if (hasAnySupportedFilters(filters)) {
    queries.push(resolveFilteredUserIds(filters));
  }

  if (!queries.length) return normalizedIds;

  const resolvedIds = (await Promise.all(queries)).flat();
  return Array.from(new Set([...normalizedIds, ...resolvedIds]));
};

const getGroupUserIds = async (groupIds = []) => {
  const validGroupIds = normalizeUserIds(groupIds);
  if (!validGroupIds.length) return [];

  const groups = await UserGroup.find({ _id: { $in: validGroupIds } })
    .select("members")
    .lean();

  const ids = groups.flatMap((group) =>
    (group.members || []).map((member) => member.toString()),
  );
  return Array.from(new Set(ids));
};

export const buildTargetUserIds = async ({
  targetType,
  userIds,
  usernames,
  groupIds,
}) => {
  if (targetType === "all") {
    const users = await User.find({ isArchived: { $ne: true } })
      .select("_id")
      .lean();
    return users.map((user) => user._id.toString());
  }

  if (targetType === "groups") {
    return getGroupUserIds(groupIds);
  }

  return resolveUserIds({ userIds, usernames });
};

