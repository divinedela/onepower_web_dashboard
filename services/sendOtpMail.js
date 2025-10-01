const nodemailer = require("nodemailer");
const path = require("path");
const logger = require("../config/logger");
const newrelic = require("newrelic");
const mailModel = require("../model/mailModel");

const sendOtpMail = async (otp, email, firstname, lastname) => {
  try {
    const SMTP = await mailModel.findOne();
    if (!SMTP) {
      const e = new Error("Mail details not found");
      newrelic.noticeError(e);
      throw e;
    }

    const SMTP_USERNAME = SMTP.mail_username;
    const SMTP_HOSTNAME = SMTP.host;
    const SMTP_SENDER_EMAIL = SMTP.senderEmail;

    logger.info({
      area: "mail",
      action: "create_transporter",
      host: SMTP_HOSTNAME,
      port: SMTP.port,
      user: SMTP_USERNAME,
    });

    const transporter = nodemailer.createTransport({
      host: SMTP_HOSTNAME,
      port: Number(SMTP.port),
      secure: Number(SMTP.port) === 465,
      requireTLS: Number(SMTP.port) !== 465,
      auth: { user: SMTP_USERNAME, pass: SMTP.mail_password },
      logger: true
    });

    const { default: hbs } = await import("nodemailer-express-handlebars");
    const templatesPath = path.resolve(__dirname, "../views/mail-templates/");
    transporter.use(
      "compile",
      hbs({
        viewEngine: { partialsDir: templatesPath, defaultLayout: false },
        viewPath: templatesPath,
      })
    );

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

    const info = await transporter.sendMail({
      from: SMTP_SENDER_EMAIL,
      template: "otp",
      to: email,
      subject: "OTP Verification",
      context: { OTP: otp, email, firstname, lastname },
    });

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
