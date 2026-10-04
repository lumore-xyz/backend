import { getAge } from "../utils/age.js";
import { normalizeStringList } from "../utils/strings.js";
import { mapInBatches } from "../utils/batch.js";
import { buildSystemMessageNotification } from "./notification.templates.js";
import { createManyNotifications } from "./notification.service.js";
import { sendEmailViaNodemailer } from "./nodemailer.service.js";
import { sendNotificationToUser } from "./push.service.js";

const PUSH_SEND_BATCH_SIZE = 50;
const PLACEHOLDER_PATTERN = /\{([a-zA-Z0-9_]+)\}/g;

const buildTemplateVariables = (user) => {
  const nickname = String(user?.nickname || "").trim();
  const realName = String(user?.realName || "").trim();
  const username = String(user?.username || "").trim();
  const email = String(user?.email || "").trim();
  const calculatedAge = getAge(user?.dob);
  const age = Number.isFinite(calculatedAge) && calculatedAge >= 0
    ? calculatedAge
    : null;

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

export const sendPushCampaign = async ({
  recipientUsers,
  input,
  actorId,
  title,
  body,
}) => {
  const personalizedMessages = recipientUsers.map((user) => {
    const variables = buildTemplateVariables(user);
    return {
      user,
      title: applyTemplateVariables(title, variables),
      body: applyTemplateVariables(body, variables),
    };
  });
  const result = await mapInBatches(
    personalizedMessages,
    PUSH_SEND_BATCH_SIZE,
    ({ user, title: messageTitle, body: messageBody }) =>
      sendNotificationToUser(user._id, {
        title: messageTitle,
        body: messageBody,
        data: input?.data || {},
      }),
  );

  const notificationDocs = personalizedMessages
    .map(({ user, title: messageTitle, body: messageBody }) =>
      buildSystemMessageNotification({
        userId: user._id,
        actorId,
        title: messageTitle,
        message: messageBody,
        entityType: "system",
        metadata: {
          campaignId: input?.campaignId || null,
          channel: "push",
        },
      }),
    )
    .filter(Boolean);

  await createManyNotifications(notificationDocs);
  return { recipientCount: recipientUsers.length, result };
};

export const sendEmailCampaign = async ({
  usersWithEmail,
  emailCampaignType,
  emailSubject,
  title,
  body,
  emailBodyHtml,
  emailBodyText,
  fromEmail,
  fromName,
  replyToEmail,
  replyToName,
  campaignId,
  actorId,
}) => {
  const emailDetails = usersWithEmail.map((user) => {
    const variables = buildTemplateVariables(user);
    const subject = applyTemplateVariables(
      emailSubject || title || "Lumore",
      variables,
    );
    const notificationMessage = applyTemplateVariables(body, variables);
    return {
      user,
      subject,
      notificationMessage,
      personalizedMessage:
        emailCampaignType === "personalized"
          ? {
              to: user.email,
              subject,
              htmlBody: applyTemplateVariables(emailBodyHtml, variables),
              textBody: applyTemplateVariables(emailBodyText, variables),
            }
          : null,
    };
  });

  const notificationDocs = emailDetails
    .map(({ user, subject, notificationMessage }) =>
      buildSystemMessageNotification({
        userId: user._id,
        actorId,
        title: subject,
        message: notificationMessage,
        entityType: "system",
        metadata: {
          campaignId: campaignId || null,
          channel: "email",
          emailCampaignType,
        },
      }),
    )
    .filter(Boolean);

  await createManyNotifications(notificationDocs);

  const result = emailCampaignType === "campaign"
    ? await sendEmailViaNodemailer({
        emails: normalizeStringList(usersWithEmail.map((user) => user?.email)),
        subject: emailSubject || title || "Lumore",
        body,
        htmlBody: emailBodyHtml,
        textBody: emailBodyText,
        fromEmail,
        fromName,
        replyToEmail,
        replyToName,
      })
    : await sendEmailViaNodemailer({
        messages: emailDetails.map(({ personalizedMessage }) => personalizedMessage),
        fromEmail,
        fromName,
        replyToEmail,
        replyToName,
      });

  return { recipientCount: usersWithEmail.length, result };
};
