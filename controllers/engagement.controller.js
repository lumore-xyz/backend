import mongoose from "mongoose";
import UserPreference from "../models/preference.model.js";
import User from "../models/user.model.js";
import UserGroup from "../models/userGroup.model.js";
import { getOrCreateGlobalOptions } from "../services/options.service.js";
import { sendEmailViaNodemailer } from "../services/nodemailer.service.js";
import { sendNotificationToUser } from "../services/push.service.js";
import {
  buildPreferenceFilter,
  buildUserFilterClauses,
  hasAnySupportedFilters,
  hasPreferenceFilters,
  sanitizeUserFilters,
  splitUserAndPreferenceFilters,
} from "../utils/userFilters.js";

const normalizeUsernames = (list = []) =>
  Array.from(
    new Set(
      (Array.isArray(list) ? list : [])
        .map((item) =>
          String(item || "")
            .trim()
            .toLowerCase(),
        )
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

  const { userFilters, preferenceFilters } =
    splitUserAndPreferenceFilters(filters);
  const userClauses = buildUserFilterClauses(userFilters);

  if (hasPreferenceFilters(preferenceFilters)) {
    const preferenceMatch = buildPreferenceFilter(preferenceFilters);
    const preferenceRows = await UserPreference.find(preferenceMatch)
      .select("user")
      .lean();
    const preferenceUserIds = Array.from(
      new Set(
        preferenceRows.map((row) => row.user?.toString()).filter(Boolean),
      ),
    );

    if (!preferenceUserIds.length) return [];
    userClauses.push({ _id: { $in: preferenceUserIds } });
  }

  const filter = userClauses.length ? { $and: userClauses } : {};
  const users = await User.find(filter).select("_id").lean();
  return users.map((user) => user._id.toString());
};

const resolveUserIds = async ({
  userIds = [],
  usernames = [],
  filters = {},
}) => {
  const normalizedIds = normalizeUserIds(userIds);
  const normalizedNames = normalizeUsernames(usernames);
  const queries = [];

  if (normalizedNames.length) {
    queries.push(
      User.find({ username: { $in: normalizedNames } })
        .select("_id")
        .lean(),
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

const PLACEHOLDER_PATTERN = /\{([a-zA-Z0-9_]+)\}/g;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const getConfiguredFromEmails = async () => {
  const doc = await getOrCreateGlobalOptions();
  const entries = Array.isArray(doc?.options?.campaignFromEmailOptions)
    ? doc.options.campaignFromEmailOptions
    : [];

  const emails = entries
    .flatMap((entry) => [entry?.value, entry?.label])
    .map((item) =>
      String(item || "")
        .trim()
        .toLowerCase(),
    )
    .filter((item) => item && EMAIL_PATTERN.test(item));

  return Array.from(new Set(emails));
};

const computeAge = (dob) => {
  if (!dob) return null;
  const birthDate = new Date(dob);
  if (Number.isNaN(birthDate.getTime())) return null;

  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();

  if (
    monthDiff < 0 ||
    (monthDiff === 0 && today.getDate() < birthDate.getDate())
  ) {
    age -= 1;
  }

  return age >= 0 ? age : null;
};

const buildTemplateVariables = (user) => {
  const nickname = String(user?.nickname || "").trim();
  const realName = String(user?.realName || "").trim();
  const username = String(user?.username || "").trim();
  const email = String(user?.email || "").trim();
  const age = computeAge(user?.dob);

  return {
    nickname: nickname || username || "",
    realname: realName || "",
    age: age === null ? "" : String(age),
    username,
    email,
  };
};

const applyTemplateVariables = (template, variables) =>
  String(template || "").replace(PLACEHOLDER_PATTERN, (fullMatch, key) => {
    const normalizedKey = String(key || "").toLowerCase();
    if (!(normalizedKey in variables)) return fullMatch;
    return String(variables[normalizedKey] || "");
  });

const stripHtmlToText = (value) =>
  String(value || "")
    .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

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
      return res
        .status(400)
        .json({ success: false, message: "name is required" });
    }

    const exists = await UserGroup.findOne({ name }).lean();
    if (exists) {
      return res
        .status(409)
        .json({ success: false, message: "Group already exists" });
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
    const action = String(req.body?.action || "add")
      .trim()
      .toLowerCase();
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
      return res
        .status(404)
        .json({ success: false, message: "Group not found" });
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

export const getAdminCampaignConfig = async (req, res) => {
  try {
    const fromEmails = await getConfiguredFromEmails();
    return res.status(200).json({
      success: true,
      data: {
        fromEmails,
      },
    });
  } catch (error) {
    console.error("[engagement] getAdminCampaignConfig failed:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

export const sendAdminCampaign = async (req, res) => {
  try {
    const channel = String(req.body?.channel || "")
      .trim()
      .toLowerCase();
    const targetType = String(req.body?.targetType || "")
      .trim()
      .toLowerCase();
    const emailCampaignType = String(
      req.body?.emailCampaignType || "personalized",
    )
      .trim()
      .toLowerCase();
    const title = String(req.body?.title || "").trim();
    const body = String(req.body?.body || "").trim();
    const emailBodyHtml = String(req.body?.emailBodyHtml || "").trim();
    const emailBodyText = String(req.body?.emailBodyText || "").trim();
    const emailSubject = String(req.body?.emailSubject || "").trim() || title;
    const fromEmail = String(req.body?.fromEmail || "")
      .trim()
      .toLowerCase();
    const fromName = String(req.body?.fromName || "").trim();
    const replyToEmail = String(req.body?.replyToEmail || "")
      .trim()
      .toLowerCase();
    const replyToName = String(req.body?.replyToName || "").trim();
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

    if (channel === "push" && !title) {
      return res.status(400).json({
        success: false,
        message: "title is required for push notifications",
      });
    }

    if (channel === "push" && !body) {
      return res.status(400).json({
        success: false,
        message: "body is required",
      });
    }

    const resolvedEmailHtmlBody = emailBodyHtml || body;
    const resolvedEmailTextBody =
      emailBodyText || stripHtmlToText(resolvedEmailHtmlBody) || body;

    if (channel === "email" && !resolvedEmailHtmlBody && !resolvedEmailTextBody) {
      return res.status(400).json({
        success: false,
        message: "email body is required",
      });
    }

    if (
      channel === "email" &&
      !["campaign", "personalized"].includes(emailCampaignType)
    ) {
      return res.status(400).json({
        success: false,
        message: "emailCampaignType must be campaign or personalized",
      });
    }

    if (channel === "email" && fromEmail && !EMAIL_PATTERN.test(fromEmail)) {
      return res.status(400).json({
        success: false,
        message: "fromEmail must be a valid email address",
      });
    }

    if (
      channel === "email" &&
      replyToEmail &&
      !EMAIL_PATTERN.test(replyToEmail)
    ) {
      return res.status(400).json({
        success: false,
        message: "replyToEmail must be a valid email address",
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

    const recipientUsers = await User.find({
      _id: { $in: recipients },
    })
      .select("_id username nickname realName email dob")
      .lean();

    if (!recipientUsers.length) {
      return res.status(400).json({
        success: false,
        message: "No target users resolved for this request",
      });
    }

    if (channel === "push") {
      const result = await Promise.all(
        recipientUsers.map((user) => {
          const variables = buildTemplateVariables(user);
          return sendNotificationToUser(user._id, {
            title: applyTemplateVariables(title, variables),
            body: applyTemplateVariables(body, variables),
            data: req.body?.data || {},
          });
        }),
      );

      return res.status(200).json({
        success: true,
        message: "Push notification sent",
        data: { recipientCount: recipientUsers.length, result },
      });
    }

    const usersWithEmail = recipientUsers.filter(
      (user) => String(user?.email || "").trim() !== "",
    );

    if (!usersWithEmail.length) {
      return res.status(400).json({
        success: false,
        message: "No users with email found in selected target",
      });
    }

    if (emailCampaignType === "campaign") {
      const emails = usersWithEmail
        .map((user) =>
          String(user?.email || "")
            .trim()
            .toLowerCase(),
        )
        .filter(Boolean);

      const result = await sendEmailViaNodemailer({
        emails,
        subject: emailSubject || title || "Lumore",
        body,
        htmlBody: resolvedEmailHtmlBody,
        textBody: resolvedEmailTextBody,
        fromEmail,
        fromName,
        replyToEmail,
        replyToName,
      });

      return res.status(200).json({
        success: true,
        message: "Email campaign sent",
        data: {
          recipientCount: usersWithEmail.length,
          result,
        },
      });
    }

    const messages = usersWithEmail.map((user) => {
      const variables = buildTemplateVariables(user);
      return {
        to: user.email,
        subject: applyTemplateVariables(
          emailSubject || title || "Lumore",
          variables,
        ),
        htmlBody: applyTemplateVariables(resolvedEmailHtmlBody, variables),
        textBody: applyTemplateVariables(resolvedEmailTextBody, variables),
      };
    });

    const result = await sendEmailViaNodemailer({
      messages,
      fromEmail,
      fromName,
      replyToEmail,
      replyToName,
    });

    return res.status(200).json({
      success: true,
      message: "Email campaign sent",
      data: {
        recipientCount: usersWithEmail.length,
        result,
      },
    });
  } catch (error) {
    console.error("[engagement] sendAdminCampaign failed:", error);
    const message = error instanceof Error ? error.message : "Server error";
    return res.status(500).json({ success: false, message });
  }
};
