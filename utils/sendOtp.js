import nodemailer from "nodemailer";
import twilio from "twilio";

const transporter = nodemailer.createTransport({
  service: "Gmail", // or SMTP
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

await transporter.sendMail({
  to: user.email,
  subject: "Your OTP Code",
  html: `<p>Your OTP is <strong>${otp}</strong>. It is valid for 5 minutes.</p>`,
});

const client = twilio(process.env.TWILIO_SID, process.env.TWILIO_TOKEN);

await client.messages.create({
  body: `Your OTP is ${otp}`,
  from: process.env.TWILIO_PHONE_NUMBER,
  to: user.phoneNumber,
});
