import User from "../models/user.model.js";
import { isValidEmail } from "../utils/credentials.js";
import { normalizeString, normalizeStringList } from "../utils/strings.js";
import { buildTargetUserIds } from "./audience.service.js";
import { getOrCreateGlobalOptions } from "./options.service.js";
import {
  sendEmailCampaign,
  sendPushCampaign,
} from "./adminCampaignDelivery.service.js";

const MAX_NOTIFICATION_RECIPIENTS = 5000;
const campaignResponse = (statusCode, payload) => ({ statusCode, payload });

const getConfiguredFromEmails = async () => {
  const doc = await getOrCreateGlobalOptions();
  const entries = Array.isArray(doc?.options?.campaignFromEmailOptions)
    ? doc.options.campaignFromEmailOptions
    : [];

  const emailValues = entries
    .flatMap((entry) => [entry?.value, entry?.label])
    .filter(Boolean);
  const validEmails = normalizeStringList(emailValues).filter(isValidEmail);

  return Array.from(new Set(validEmails));
};

const stripHtmlToText = (value) =>
  String(value || "")
    .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

export const getAdminCampaignConfigData = async () => ({
  fromEmails: await getConfiguredFromEmails(),
});

export const sendAdminCampaignMessage = async ({ input = {}, actorId } = {}) => {
  const channel = normalizeString(input?.channel);
  const targetType = normalizeString(input?.targetType);
  const emailCampaignType = normalizeString(
    input?.emailCampaignType || "personalized",
  );
  const title = String(input?.title || "").trim();
  const body = String(input?.body || "").trim();
  const emailBodyHtml = String(input?.emailBodyHtml || "").trim();
  const emailBodyText = String(input?.emailBodyText || "").trim();
  const emailSubject = String(input?.emailSubject || "").trim() || title;
  const fromEmail = normalizeString(input?.fromEmail);
  const fromName = String(input?.fromName || "").trim();
  const replyToEmail = normalizeString(input?.replyToEmail);
  const replyToName = String(input?.replyToName || "").trim();
  const userIds = input?.userIds || [];
  const usernames = input?.usernames || [];
  const groupIds = input?.groupIds || [];

  if (!["push", "email"].includes(channel)) {
    return campaignResponse(400, {
      success: false,
      message: "channel must be push or email",
    });
  }

  if (!["all", "users", "groups"].includes(targetType)) {
    return campaignResponse(400, {
      success: false,
      message: "targetType must be all, users, or groups",
    });
  }

  if (channel === "push" && !title) {
    return campaignResponse(400, {
      success: false,
      message: "title is required for push notifications",
    });
  }

  if (channel === "push" && !body) {
    return campaignResponse(400, {
      success: false,
      message: "body is required",
    });
  }

  const resolvedEmailHtmlBody = emailBodyHtml || body;
  const resolvedEmailTextBody =
    emailBodyText || stripHtmlToText(resolvedEmailHtmlBody) || body;

  if (channel === "email" && !resolvedEmailHtmlBody && !resolvedEmailTextBody) {
    return campaignResponse(400, {
      success: false,
      message: "email body is required",
    });
  }

  if (
    channel === "email" &&
    !["campaign", "personalized"].includes(emailCampaignType)
  ) {
    return campaignResponse(400, {
      success: false,
      message: "emailCampaignType must be campaign or personalized",
    });
  }

  if (channel === "email" && fromEmail && !isValidEmail(fromEmail)) {
    return campaignResponse(400, {
      success: false,
      message: "fromEmail must be a valid email address",
    });
  }

  if (
    channel === "email" &&
    replyToEmail &&
    !isValidEmail(replyToEmail)
  ) {
    return campaignResponse(400, {
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
    return campaignResponse(400, {
      success: false,
      message: "No target users resolved for this request",
    });
  }

  if (recipients.length > MAX_NOTIFICATION_RECIPIENTS) {
    return campaignResponse(400, {
      success: false,
      message: `Recipient count ${recipients.length} exceeds the per-request maximum of ${MAX_NOTIFICATION_RECIPIENTS}`,
    });
  }

  const recipientUsers = await User.find({
    _id: { $in: recipients },
    isArchived: { $ne: true },
  })
    .select("_id username nickname realName email dob")
    .lean();

  if (!recipientUsers.length) {
    return campaignResponse(400, {
      success: false,
      message: "No target users resolved for this request",
    });
  }

  if (channel === "push") {
    const data = await sendPushCampaign({
      recipientUsers,
      input,
      actorId,
      title,
      body,
    });
    return campaignResponse(200, {
      success: true,
      message: "Push notification sent",
      data,
    });
  }

  const usersWithEmail = recipientUsers.filter(
    (user) => String(user?.email || "").trim() !== "",
  );

  if (!usersWithEmail.length) {
    return campaignResponse(400, {
      success: false,
      message: "No users with email found in selected target",
    });
  }

  const data = await sendEmailCampaign({
    usersWithEmail,
    emailCampaignType,
    emailSubject,
    title,
    body,
    emailBodyHtml: resolvedEmailHtmlBody,
    emailBodyText: resolvedEmailTextBody,
    fromEmail,
    fromName,
    replyToEmail,
    replyToName,
    campaignId: input?.campaignId,
    actorId,
  });

  return campaignResponse(200, {
    success: true,
    message: "Email campaign sent",
    data,
  });
};
