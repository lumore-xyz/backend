import mongoose from "mongoose";
import UserPreference from "../models/preference.model.js";
import UserGroup from "../models/userGroup.model.js";
import User from "../models/user.model.js";
import { sendEmailViaOneSignal } from "../services/onesignal.service.js";
import {
  buildPreferenceFilter,
  buildUserFilterClauses,
  hasAnySupportedFilters,
  hasPreferenceFilters,
  sanitizeUserFilters,
  splitUserAndPreferenceFilters,
} from "../utils/userFilters.js";
import {
  sendNotificationToAll,
  sendNotificationToMultipleUsers,
} from "../services/push.service.js";

const normalizeUsernames = (list = []) =>
  Array.from(
    new Set(
      (Array.isArray(list) ? list : [])
        .map((item) => String(item || "").trim().toLowerCase())
        .filter(Boolean),
    ),
  );

const normalizeUserIds = (list = []) =>
  Array.from(
    new Set(
      (Array.isArray(list) ? list : [])
        .map((item) => String(item || "").trim())
        .filter((item) => mongoose.Types.ObjectId.isValid(item)),
    ),
  );

const resolveFilteredUserIds = async (filters = {}) => {
  if (!hasAnySupportedFilters(filters)) return [];

  const { userFilters, preferenceFilters } = splitUserAndPreferenceFilters(filters);
  const userClauses = buildUserFilterClauses(userFilters);

  if (hasPreferenceFilters(preferenceFilters)) {
    const preferenceMatch = buildPreferenceFilter(preferenceFilters);
    const preferenceRows = await UserPreference.find(preferenceMatch)
      .select("user")
      .lean();
    const preferenceUserIds = Array.from(
      new Set(
        preferenceRows
          .map((row) => row.user?.toString())
          .filter(Boolean),
      ),
    );

    if (!preferenceUserIds.length) return [];
    userClauses.push({ _id: { $in: preferenceUserIds } });
  }

  const filter = userClauses.length ? { $and: userClauses } : {};
  const users = await User.find(filter).select("_id").lean();
  return users.map((user) => user._id.toString());
};

const resolveUserIds = async ({ userIds = [], usernames = [], filters = {} }) => {
  const normalizedIds = normalizeUserIds(userIds);
  const normalizedNames = normalizeUsernames(usernames);
  const queries = [];

  if (normalizedNames.length) {
    queries.push(
      User.find({ username: { $in: normalizedNames } }).select("_id").lean(),
    );
  }

  if (hasAnySupportedFilters(filters)) {
    queries.push(resolveFilteredUserIds(filters));
  }

  if (!queries.length) return normalizedIds;

  const results = await Promise.all(queries);
  const extraIds = [];
  for (const result of results) {
    if (!Array.isArray(result)) continue;
    for (const item of result) {
      if (!item) continue;
      if (typeof item === "string") {
        extraIds.push(item);
      } else if (item._id) {
        extraIds.push(item._id.toString());
      }
    }
  }

  return Array.from(new Set([...normalizedIds, ...extraIds]));
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

const buildTargetUserIds = async ({
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

export const getAdminUserGroups = async (req, res) => {
  try {
    const groups = await UserGroup.find({})
      .sort({ createdAt: -1 })
      .populate("members", "_id username email")
      .lean();

    return res.status(200).json({
      success: true,
      data: groups.map((group) => ({
        ...group,
        memberCount: group.members?.length || 0,
      })),
    });
  } catch (error) {
    console.error("[engagement] getAdminUserGroups failed:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

export const createAdminUserGroup = async (req, res) => {
  try {
    const name = String(req.body?.name || "").trim();
    const description = String(req.body?.description || "").trim();
    const { filters, error } = sanitizeUserFilters(req.body?.filters);

    if (error) {
      return res.status(400).json({ success: false, message: error });
    }

    const memberIds = await resolveUserIds({
      userIds: req.body?.userIds || [],
      usernames: req.body?.usernames || [],
      filters,
    });

    if (!name) {
      return res.status(400).json({ success: false, message: "name is required" });
    }

    const exists = await UserGroup.findOne({ name }).lean();
    if (exists) {
      return res.status(409).json({ success: false, message: "Group already exists" });
    }

    const group = await UserGroup.create({
      name,
      description,
      members: memberIds,
      createdBy: req.user?._id || null,
      updatedBy: req.user?._id || null,
    });

    const populated = await UserGroup.findById(group._id)
      .populate("members", "_id username email")
      .lean();

    return res.status(201).json({
      success: true,
      message: "Group created",
      data: {
        ...populated,
        memberCount: populated?.members?.length || 0,
      },
    });
  } catch (error) {
    console.error("[engagement] createAdminUserGroup failed:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

export const updateAdminUserGroupMembers = async (req, res) => {
  try {
    const { groupId } = req.params;
    const action = String(req.body?.action || "add").trim().toLowerCase();
    const { filters, error } = sanitizeUserFilters(req.body?.filters);

    if (error) {
      return res.status(400).json({ success: false, message: error });
    }

    const memberIds = await resolveUserIds({
      userIds: req.body?.userIds || [],
      usernames: req.body?.usernames || [],
      filters,
    });

    if (!["add", "remove", "set"].includes(action)) {
      return res.status(400).json({
        success: false,
        message: "action must be add, remove, or set",
      });
    }

    const group = await UserGroup.findById(groupId);
    if (!group) {
      return res.status(404).json({ success: false, message: "Group not found" });
    }

    const current = new Set((group.members || []).map((id) => id.toString()));

    if (action === "set") {
      group.members = memberIds;
    } else if (action === "add") {
      memberIds.forEach((id) => current.add(id));
      group.members = Array.from(current);
    } else {
      memberIds.forEach((id) => current.delete(id));
      group.members = Array.from(current);
    }

    group.updatedBy = req.user?._id || null;
    await group.save();

    const populated = await UserGroup.findById(group._id)
      .populate("members", "_id username email")
      .lean();

    return res.status(200).json({
      success: true,
      message: "Group members updated",
      data: {
        ...populated,
        memberCount: populated?.members?.length || 0,
      },
    });
  } catch (error) {
    console.error("[engagement] updateAdminUserGroupMembers failed:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

export const sendAdminCampaign = async (req, res) => {
  try {
    const channel = String(req.body?.channel || "").trim().toLowerCase();
    const targetType = String(req.body?.targetType || "").trim().toLowerCase();
    const title = String(req.body?.title || "").trim();
    const body = String(req.body?.body || "").trim();
    const emailSubject = String(req.body?.emailSubject || "").trim() || title;
    const userIds = req.body?.userIds || [];
    const usernames = req.body?.usernames || [];
    const groupIds = req.body?.groupIds || [];

    if (!["push", "email"].includes(channel)) {
      return res.status(400).json({
        success: false,
        message: "channel must be push or email",
      });
    }

    if (!["all", "users", "groups"].includes(targetType)) {
      return res.status(400).json({
        success: false,
        message: "targetType must be all, users, or groups",
      });
    }

    if (!body) {
      return res.status(400).json({
        success: false,
        message: "body is required",
      });
    }

    if (channel === "push" && !title) {
      return res.status(400).json({
        success: false,
        message: "title is required for push notifications",
      });
    }

    const recipients = await buildTargetUserIds({
      targetType,
      userIds,
      usernames,
      groupIds,
    });

    if (!recipients.length) {
      return res.status(400).json({
        success: false,
        message: "No target users resolved for this request",
      });
    }

    if (channel === "push") {
      if (targetType === "all") {
        const result = await sendNotificationToAll({
          title,
          body,
          data: req.body?.data || {},
        });
        return res.status(200).json({
          success: true,
          message: "Push notification sent",
          data: { recipientCount: recipients.length, result },
        });
      }

      const result = await sendNotificationToMultipleUsers(recipients, {
        title,
        body,
        data: req.body?.data || {},
      });
      return res.status(200).json({
        success: true,
        message: "Push notification sent",
        data: { recipientCount: recipients.length, result },
      });
    }

    const usersWithEmail = await User.find({
      _id: { $in: recipients },
      email: { $exists: true, $ne: "" },
    })
      .select("email")
      .lean();

    const emails = usersWithEmail.map((user) => user.email).filter(Boolean);
    if (!emails.length) {
      return res.status(400).json({
        success: false,
        message: "No users with email found in selected target",
      });
    }

    const result = await sendEmailViaOneSignal({
      emails,
      subject: emailSubject || title || "Lumore",
      body,
    });

    return res.status(200).json({
      success: true,
      message: "Email campaign sent",
      data: {
        recipientCount: emails.length,
        result,
      },
    });
  } catch (error) {
    console.error("[engagement] sendAdminCampaign failed:", error);
    const message = error instanceof Error ? error.message : "Server error";
    return res.status(500).json({ success: false, message });
  }
};
