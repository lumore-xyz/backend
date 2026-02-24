import nodemailer from "nodemailer";
import sanitizeHtml from "sanitize-html";

const parseSmtpPort = (value) => {
  const parsed = Number.parseInt(String(value || ""), 10);
  return Number.isFinite(parsed) ? parsed : 587;
};

const createTransporter = () => {
  const host = process.env.SMTP_HOST;
  const port = parseSmtpPort(process.env.SMTP_PORT);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    throw new Error("SMTP_HOST, SMTP_USER and SMTP_PASS are required");
  }

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: {
      user,
      pass,
    },
  });
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const sanitizeHeaderValue = (value) =>
  String(value || "")
    .replace(/[\r\n"]/g, "")
    .trim();

const resolveMailboxHeader = ({
  email,
  name,
  fallbackEmail = "",
  required = false,
  emailLabel = "email",
}) => {
  const chosenEmail =
    String(email || "")
      .trim()
      .toLowerCase() ||
    String(fallbackEmail || "")
      .trim()
      .toLowerCase();

  if (!chosenEmail) {
    if (required) {
      throw new Error("EMAIL_FROM or SMTP_USER is required for sender address");
    }
    return "";
  }

  if (!EMAIL_PATTERN.test(chosenEmail)) {
    throw new Error(`Invalid ${emailLabel} address`);
  }

  const cleanName = sanitizeHeaderValue(name);
  return cleanName ? `${cleanName} <${chosenEmail}>` : chosenEmail;
};

const resolveFromHeader = ({ fromEmail, fromName }) => {
  const fallbackFrom = String(
    process.env.EMAIL_FROM || process.env.SMTP_USER || "",
  ).trim();
  return resolveMailboxHeader({
    email: fromEmail,
    name: fromName,
    fallbackEmail: fallbackFrom,
    required: true,
    emailLabel: "from email",
  });
};

const EMAIL_SANITIZE_OPTIONS = {
  allowedTags: [
    "p",
    "br",
    "strong",
    "b",
    "em",
    "i",
    "u",
    "ul",
    "ol",
    "li",
    "a",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "blockquote",
    "code",
    "pre",
  ],
  allowedAttributes: {
    a: ["href", "target", "rel"],
  },
  allowedSchemes: ["http", "https", "mailto"],
  allowedSchemesAppliedToAttributes: ["href"],
  transformTags: {
    a: (tagName, attribs) => ({
      tagName,
      attribs: {
        ...attribs,
        rel: "noopener noreferrer",
        target: "_blank",
      },
    }),
  },
};

const sanitizeEmailHtml = (value) =>
  sanitizeHtml(String(value || ""), EMAIL_SANITIZE_OPTIONS).trim();

const htmlToText = (value) =>
  sanitizeHtml(String(value || ""), {
    allowedTags: [],
    allowedAttributes: {},
  })
    .replace(/\s+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

export const sendEmailViaNodemailer = async ({
  emails,
  subject,
  body,
  htmlBody,
  textBody,
  messages,
  fromEmail,
  fromName,
  replyToEmail,
  replyToName,
}) => {
  const transporter = createTransporter();
  const from = resolveFromHeader({ fromEmail, fromName });
  const replyTo = resolveMailboxHeader({
    email: replyToEmail,
    name: replyToName,
    required: false,
    emailLabel: "reply-to email",
  });

  const personalizedMessages = Array.isArray(messages)
    ? messages
        .map((item) => ({
          to: String(item?.to || "")
            .trim()
            .toLowerCase(),
          subject: String(item?.subject || "").trim() || "Lumore",
          htmlBody: sanitizeEmailHtml(item?.htmlBody || item?.body || ""),
          textBody:
            String(item?.textBody || "").trim() ||
            htmlToText(item?.htmlBody || item?.body || ""),
        }))
        .filter((item) => item.to && (item.htmlBody || item.textBody))
    : [];

  if (personalizedMessages.length) {
    const results = await Promise.all(
      personalizedMessages.map((message) =>
        transporter.sendMail({
          from,
          replyTo: replyTo || undefined,
          to: message.to,
          subject: message.subject,
          text: message.textBody || undefined,
          html: message.htmlBody || undefined,
        }),
      ),
    );

    return {
      recipientCount: personalizedMessages.length,
      accepted: results.flatMap((result) => result.accepted || []),
      rejected: results.flatMap((result) => result.rejected || []),
      messageIds: results.map((result) => result.messageId),
    };
  }

  const uniqueEmails = Array.from(
    new Set(
      (emails || [])
        .map((email) =>
          String(email || "")
            .trim()
            .toLowerCase(),
        )
        .filter(Boolean),
    ),
  );

  if (!uniqueEmails.length) {
    throw new Error("No valid email recipients found");
  }

  const finalHtmlBody = sanitizeEmailHtml(htmlBody || body || "");
  const finalTextBody =
    String(textBody || "").trim() || htmlToText(finalHtmlBody || body || "");

  const result = await transporter.sendMail({
    from,
    replyTo: replyTo || undefined,
    to: from,
    bcc: uniqueEmails,
    subject: String(subject || "").trim() || "Lumore",
    text: finalTextBody || undefined,
    html: finalHtmlBody || undefined,
  });

  return {
    messageId: result.messageId,
    accepted: result.accepted,
    rejected: result.rejected,
    recipientCount: uniqueEmails.length,
  };
};
