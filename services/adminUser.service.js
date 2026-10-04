import User from "../models/user.model.js";
import { hasMorePages } from "../utils/pagination.js";
import { buildFilteredUserQuery } from "./filteredUsers.service.js";
import { escapeRegex } from "../utils/regex.js";
import { disconnectUser } from "./socket.service.js";

export const listAdminUsers = async ({ page, limit, search, filters }) => {
  const skip = (page - 1) * limit;
  const clauses = [];

  if (search) {
    const escapedSearch = escapeRegex(search);
    clauses.push({
      $or: [
        { username: { $regex: escapedSearch, $options: "i" } },
        { email: { $regex: escapedSearch, $options: "i" } },
      ],
    });
  }

  const userFilter = await buildFilteredUserQuery(filters);
  if (userFilter.$and) clauses.push(...userFilter.$and);
  else if (Object.keys(userFilter).length) clauses.push(userFilter);

  const filter = clauses.length ? { $and: clauses } : {};
  const [users, total] = await Promise.all([
    User.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .select(
        "_id username realName profilePicture email phoneNumber gender dob work institution maritalStatus religion hometown languages isArchived isActive credits createdAt verificationStatus",
      )
      .lean(),
    User.countDocuments(filter),
  ]);

  return {
    users,
    total,
    hasMore: hasMorePages({ page, limit, total, itemCount: users.length }),
  };
};

export const updateAdminUserArchiveStatus = async ({ userId, isArchived }) => {
  const user = await User.findByIdAndUpdate(
    userId,
    {
      isArchived,
      archivedAt: isArchived ? new Date() : null,
      ...(isArchived ? { isActive: false, isMatching: false } : {}),
    },
    { returnDocument: "after" },
  )
    .select("_id username isArchived archivedAt")
    .lean();
  if (isArchived && user) disconnectUser(userId);
  return user;
};
