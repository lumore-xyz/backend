import { resolveUserIds } from "../services/audience.service.js";
import {
  createUserGroup,
  listUserGroups,
  updateUserGroupMembers as saveUserGroupMembers,
} from "../services/userGroup.service.js";
import { sanitizeUserFilters } from "../utils/userFilters.js";
import { normalizeString } from "../utils/strings.js";

const withMemberCount = (group) => ({
  ...group,
  memberCount: group?.members?.length || 0,
});

export const getAdminUserGroups = async (req, res) => {
  const groups = await listUserGroups();
  return res.status(200).json({
    success: true,
    data: groups.map(withMemberCount),
  });
};

export const createAdminUserGroup = async (req, res) => {
  const body = req.body || {};
  const name = String(body.name || "").trim();
  const description = String(body.description || "").trim();
  const { filters, error } = sanitizeUserFilters(body.filters);

  if (error) {
    return res.status(400).json({ success: false, message: error });
  }

  if (!name) {
    return res
      .status(400)
      .json({ success: false, message: "name is required" });
  }

  const memberIds = await resolveUserIds({
    userIds: body.userIds || [],
    usernames: body.usernames || [],
    filters,
  });

  const result = await createUserGroup({
    name,
    description,
    memberIds,
    actorId: req.user?._id || null,
  });
  if (result.error === "GROUP_EXISTS") {
    return res
      .status(409)
      .json({ success: false, message: "Group already exists" });
  }
  return res.status(201).json({
    success: true,
    message: "Group created",
    data: withMemberCount(result),
  });
};

export const updateAdminUserGroupMembers = async (req, res) => {
  const body = req.body || {};
  const { groupId } = req.params;
  const action = normalizeString(body.action || "add");
  const { filters, error } = sanitizeUserFilters(body.filters);

  if (error) {
    return res.status(400).json({ success: false, message: error });
  }

  if (!["add", "remove", "set"].includes(action)) {
    return res.status(400).json({
      success: false,
      message: "action must be add, remove, or set",
    });
  }

  const memberIds = await resolveUserIds({
    userIds: body.userIds || [],
    usernames: body.usernames || [],
    filters,
  });

  const populated = await saveUserGroupMembers({
    groupId,
    action,
    memberIds,
    actorId: req.user?._id || null,
  });
  if (!populated) {
    return res
      .status(404)
      .json({ success: false, message: "Group not found" });
  }

  return res.status(200).json({
    success: true,
    message: "Group members updated",
    data: withMemberCount(populated),
  });
};

