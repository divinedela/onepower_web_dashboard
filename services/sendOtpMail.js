const logger = require("../config/logger");
const newrelic = require("newrelic");
const { Resend } = require("resend");
const resend = new Resend(process.env.RESEND_API_KEY);
const SENDER_EMAIL = process.env.SENDER_EMAIL;

const sendOtpMail = async (otp, email, firstname, lastname) => {
  try {
    logger.info({
      area: "mail",
      action: "generate otp",
      otp,
      userEmail: email || "",
      userFirstname: firstname || "",
      userLastname: lastname || "",
    });

    if (!otp || !email || !firstname || !lastname) {
      const e = new Error("Invalid input parameters");
      newrelic.noticeError(e, { email });
      throw e;
    }

    // Record a custom event & attributes around the send
    newrelic.recordCustomEvent("OtpMailAttempt", { email, hasOtp: !!otp });

    const { data, error } = await resend.emails.send({
      from: SENDER_EMAIL, // must be verified in Resend
      to: email,
      subject: "OTP Verification - Onepower Foundation",
      html: `
    <p>Hello <strong>${firstname} ${lastname}</strong>,</p>
    <p>Your OTP code is:</p>
    <h2 style="color:#2e86de;">${otp}</h2>
    <p>This code will expire in 10 minutes.</p>
  `,
    });

    if (error) {
      throw new Error(error.message || "Failed to send OTP mail");
    }

    // mimic nodemailer info object shape a little
    const info = { messageId: data?.id, response: "Sent via Resend" };

    logger.info({
      area: "mail",
      action: "sent",
      to: email,
      messageId: info.messageId,
      response: info.response,
    });
    newrelic.recordCustomEvent("OtpMailSent", { email });

    return info;
  } catch (error) {
    logger.error(
      {
        area: "mail",
        action: "send_failed",
        message: error.message,
        stack: error.stack,
        email,
      },
      "Error sending OTP mail"
    );
    newrelic.noticeError(error, { email });
    throw error;
  }
};

module.exports = sendOtpMail;
