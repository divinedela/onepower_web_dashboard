const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const sendOtpMail = require("../services/sendOtpMail");
const {
  findUserByEmail,
  findUserById,
  createUser,
  updateUserById,
  findOtpByEmail,
  upsertOtp,
  deleteOtpByEmail,
  findForgotPasswordOtpByEmail,
  upsertForgotPasswordOtp,
  markForgotPasswordOtpVerified,
  deleteForgotPasswordOtpByEmail,
  upsertUserNotificationDevice,
  deleteUserNotificationDevicesByUserId,
  deleteFavouriteCampaignsByUserId,
} = require("../services/supabaseUserAuthService");

function responseData({ success, message, error = 0, extra = {} }) {
  return {
    data: {
      success,
      message,
      error,
      ...extra,
    },
  };
}

function generateOtp() {
  return Math.floor(1000 + Math.random() * 9000);
}

function sanitizeUser(user) {
  if (!user) return null;
  return {
    _id: user._id || user.id,
    firstname: user.firstname || "",
    lastname: user.lastname || "",
    email: user.email || "",
    country_code: user.country_code || "",
    phone_number: user.phone_number || "",
    is_active: !!user.is_active,
    image: user.image || "",
  };
}

function getBearerToken(req) {
  const authHeader = req.headers.authorization || "";
  if (!authHeader.startsWith("Bearer ")) return null;
  return authHeader.slice(7).trim();
}

async function getAuthenticatedUser(req) {
  const token = getBearerToken(req);
  if (!token) {
    return { user: null, errorResponse: responseData({ success: 0, message: "Please, Sign In....", error: 1 }) };
  }

  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET_KEY);
  } catch (_error) {
    return { user: null, errorResponse: responseData({ success: 0, message: "Please, Sign In....", error: 1 }) };
  }

  const user = await findUserById(payload.id);
  if (!user) {
    return { user: null, errorResponse: responseData({ success: 0, message: "Please, Sign In....", error: 1 }) };
  }

  return { user, errorResponse: null };
}

const checkRegisterUser = async (req, res) => {
  try {
    const email = String(req.body?.email || "").trim().toLowerCase();
    if (!email) {
      return res.json(
        responseData({ success: 2, message: "Email is required", error: 1 })
      );
    }

    const existingUser = await findUserByEmail(email);
    if (!existingUser) {
      return res.json(
        responseData({
          success: 1,
          message: "User does not exist, please sign up",
          error: 0,
        })
      );
    }

    return res.json(
      responseData({
        success: 2,
        message: "User already exists",
        error: 1,
      })
    );
  } catch (error) {
    console.log("checkRegisterUser (supabase) error", error.message);
    return res.json(
      responseData({
        success: 2,
        message: "An error occurred while checking registration",
        error: 1,
      })
    );
  }
};

const signUp = async (req, res) => {
  try {
    const firstname = String(req.body?.firstname || "").trim();
    const lastname = String(req.body?.lastname || "").trim();
    const email = String(req.body?.email || "").trim().toLowerCase();
    const countryCode = String(req.body?.country_code || "").trim();
    const phoneNumber = String(req.body?.phone_number || "").trim();
    const password = String(req.body?.password || "");

    if (!firstname || !lastname || !email || !password) {
      return res.json(
        responseData({
          success: 2,
          message: "First name, last name, email and password are required",
          error: 1,
        })
      );
    }

    let user = await findUserByEmail(email);

    if (user && user.isVerified) {
      return res.json(
        responseData({
          success: 2,
          message: "User already exists",
          error: 1,
        })
      );
    }

    if (!user && (!countryCode || !phoneNumber)) {
      return res.json(
        responseData({
          success: 2,
          message: "Country code and phone number are required",
          error: 1,
        })
      );
    }

    if (!user) {
      const passwordHash = await bcrypt.hash(password, 10);
      user = await createUser({
        firstname,
        lastname,
        email,
        countryCode,
        phoneNumber,
        passwordHash,
      });
    } else {
      // Existing but not verified: refresh stored details/password if provided.
      const updates = {
        firstname,
        lastname,
      };
      if (countryCode) updates.countryCode = countryCode;
      if (phoneNumber) updates.phoneNumber = phoneNumber;
      if (password) updates.passwordHash = await bcrypt.hash(password, 10);
      user = await updateUserById(user._id || user.id, updates);
    }

    const otp = generateOtp();
    await upsertOtp(email, otp);

    try {
      await sendOtpMail(otp, email, firstname, lastname);
    } catch (_mailError) {
      return res.json(
        responseData({
          success: 2,
          message: "Failed to send OTP. Please try again.",
          error: 1,
        })
      );
    }

    return res.json(
      responseData({
        success: 1,
        message: "Successfully signed up! Please check your email to verify OTP.",
        error: 0,
      })
    );
  } catch (error) {
    console.log("signUp (supabase) error", error.message);
    return res.json(
      responseData({
        success: 2,
        message: "An error occurred during sign up",
        error: 1,
      })
    );
  }
};

const verifyOTP = async (req, res) => {
  try {
    const email = String(req.body?.email || "").trim().toLowerCase();
    const otpRaw = req.body?.otp;
    const otpValue = Number(String(otpRaw || "").trim());

    if (!email || !Number.isInteger(otpValue)) {
      return res.json(
        responseData({
          success: 2,
          message: "Email and OTP is required",
          error: 1,
        })
      );
    }

    const otpRecord = await findOtpByEmail(email);
    if (!otpRecord) {
      return res.json(
        responseData({
          success: 2,
          message: "Email not found. Please try again...",
          error: 1,
        })
      );
    }

    if (otpRecord.expires_at && new Date(otpRecord.expires_at) < new Date()) {
      return res.json(
        responseData({
          success: 2,
          message: "OTP has expired. Please request a new one.",
          error: 1,
        })
      );
    }

    if (Number(otpRecord.otp) !== otpValue) {
      return res.json(
        responseData({
          success: 2,
          message: "Incorrect OTP. Please try again...",
          error: 1,
        })
      );
    }

    const user = await findUserByEmail(email);
    if (!user) {
      return res.json(
        responseData({
          success: 2,
          message: "User not found. Please sign up again.",
          error: 1,
        })
      );
    }

    const updatedUser = await updateUserById(user._id || user.id, {
      isVerified: true,
      isActive: true,
    });

    const token = jwt.sign(
      { id: updatedUser._id || updatedUser.id, email: updatedUser.email },
      process.env.JWT_SECRET_KEY
    );

    await deleteOtpByEmail(email);

    const registrationToken = String(req.body?.registrationToken || "").trim();
    const deviceId = String(req.body?.deviceId || "").trim();
    if (registrationToken && deviceId) {
      await upsertUserNotificationDevice({
        userId: updatedUser._id || updatedUser.id,
        deviceId,
        registrationToken,
        platform: "mobile",
      });
    }

    return res.json(
      responseData({
        success: 1,
        message: "OTP verified successfully",
        error: 0,
        extra: {
          token,
          user: sanitizeUser(updatedUser),
        },
      })
    );
  } catch (error) {
    console.log("verifyOTP (supabase) error", error.message);
    return res.json(
      responseData({
        success: 2,
        message: "An error occurred while verifying OTP",
        error: 1,
      })
    );
  }
};

const signIn = async (req, res) => {
  try {
    const email = String(req.body?.email || "").trim().toLowerCase();
    const password = String(req.body?.password || "");

    if (!email || !password) {
      return res.json(
        responseData({
          success: 0,
          message: "Email and password is required",
          error: 1,
        })
      );
    }

    const user = await findUserByEmail(email);
    if (!user) {
      return res.json(
        responseData({
          success: 0,
          message:
            "We're sorry, something went wrong when attempting to sign in.",
          error: 1,
        })
      );
    }

    const passwordMatch = await bcrypt.compare(password, user.password || "");
    if (!passwordMatch) {
      return res.json(
        responseData({
          success: 0,
          message:
            "We're sorry, something went wrong when attempting to sign in.",
          error: 1,
        })
      );
    }

    if (user.is_active === false) {
      return res.json(
        responseData({
          success: 0,
          message:
            "Your account has been banned. Please contact support for more details.",
          error: 1,
        })
      );
    }

    const token = jwt.sign(
      { id: user._id || user.id, email: user.email },
      process.env.JWT_SECRET_KEY
    );

    const registrationToken = String(req.body?.registrationToken || "").trim();
    const deviceId = String(req.body?.deviceId || "").trim();
    if (registrationToken && deviceId) {
      await upsertUserNotificationDevice({
        userId: user._id || user.id,
        deviceId,
        registrationToken,
        platform: "mobile",
      });
    }

    return res.json(
      responseData({
        success: 1,
        message: user.isVerified
          ? "Logged in successfully."
          : "Login successful ..., but your account is pending verification. Please check your email to complete the verification process.",
        error: 0,
        extra: {
          token,
          user: sanitizeUser(user),
        },
      })
    );
  } catch (error) {
    console.log("signIn (supabase) error", error.message);
    return res.json(
      responseData({
        success: 0,
        message: "An error occurred",
        error: 1,
      })
    );
  }
};

const isVerifyAccount = async (req, res) => {
  try {
    const email = String(req.body?.email || "").trim().toLowerCase();
    if (!email) {
      return res.json(
        responseData({
          success: 0,
          message: "Email is required",
          error: 1,
        })
      );
    }

    const user = await findUserByEmail(email);
    if (!user) {
      return res.json(
        responseData({
          success: 0,
          message: "User not found",
          error: 1,
        })
      );
    }

    if (!user.isVerified) {
      return res.json(
        responseData({
          success: 0,
          message:
            "Your account is not verified. Please verify your account...",
          error: 1,
        })
      );
    }

    return res.json(
      responseData({
        success: 1,
        message: "Your account has been successfully verified.",
        error: 0,
      })
    );
  } catch (error) {
    console.log("isVerifyAccount (supabase) error", error.message);
    return res.json(
      responseData({
        success: 0,
        message: "An error occurred",
        error: 1,
      })
    );
  }
};

const resendOtp = async (req, res) => {
  try {
    const email = String(req.body?.email || "").trim().toLowerCase();
    if (!email) {
      return res.json(
        responseData({
          success: 0,
          message: "Email is required",
          error: 1,
        })
      );
    }

    const user = await findUserByEmail(email);
    if (!user) {
      return res.json(
        responseData({
          success: 0,
          message: "User not found",
          error: 1,
        })
      );
    }

    if (user.isVerified) {
      return res.json(
        responseData({
          success: 0,
          message: "Your account is already verified.",
          error: 1,
        })
      );
    }

    const otp = generateOtp();
    await upsertOtp(email, otp);

    try {
      await sendOtpMail(otp, email, user.firstname, user.lastname);
    } catch (_mailError) {
      return res.json(
        responseData({
          success: 0,
          message: "Something went wrong. Please try again...",
          error: 1,
        })
      );
    }

    return res.json(
      responseData({
        success: 1,
        message:
          "We've sent an OTP to your email. Please check your inbox to verify your account.",
        error: 0,
      })
    );
  } catch (error) {
    console.log("resendOtp (supabase) error", error.message);
    return res.json(
      responseData({
        success: 0,
        message: "An error occurred",
        error: 1,
      })
    );
  }
};

const forgotPassword = async (req, res) => {
  try {
    const email = String(req.body?.email || "").trim().toLowerCase();
    if (!email) {
      return res.json(
        responseData({
          success: 0,
          message: "Email is required",
          error: 1,
        })
      );
    }

    const user = await findUserByEmail(email);
    if (!user) {
      return res.json(
        responseData({
          success: 0,
          message: "Incorrect Email, please try again...",
          error: 1,
        })
      );
    }

    const otp = generateOtp();
    await upsertForgotPasswordOtp(email, otp);

    try {
      await sendOtpMail(otp, email, user.firstname, user.lastname);
    } catch (_mailError) {
      return res.json(
        responseData({
          success: 0,
          message: "Something went wrong. Please try again...",
          error: 1,
        })
      );
    }

    return res.json(
      responseData({
        success: 1,
        message:
          "We've sent an OTP to your email. Please check your inbox to reset your password.",
        error: 0,
      })
    );
  } catch (error) {
    console.log("forgotPassword (supabase) error", error.message);
    return res.json(
      responseData({
        success: 0,
        message: "An error occurred",
        error: 1,
      })
    );
  }
};

const forgotPasswordOtpVerification = async (req, res) => {
  try {
    const email = String(req.body?.email || "").trim().toLowerCase();
    const otpRaw = req.body?.otp;
    const otpValue = Number(String(otpRaw || "").trim());

    if (!email || !Number.isInteger(otpValue)) {
      return res.json(
        responseData({
          success: 0,
          message: "Email and OTP is required",
          error: 1,
        })
      );
    }

    const otpRecord = await findForgotPasswordOtpByEmail(email);
    if (!otpRecord) {
      return res.json(
        responseData({
          success: 0,
          message: "Incorrect Email. Please try again...",
          error: 1,
        })
      );
    }

    if (otpRecord.expires_at && new Date(otpRecord.expires_at) < new Date()) {
      return res.json(
        responseData({
          success: 0,
          message: "OTP has expired. Please request a new one.",
          error: 1,
        })
      );
    }

    if (Number(otpRecord.otp) !== otpValue) {
      return res.json(
        responseData({
          success: 0,
          message: "Incorrect OTP. Please try again...",
          error: 1,
        })
      );
    }

    await markForgotPasswordOtpVerified(email);

    return res.json(
      responseData({
        success: 1,
        message: "OTP verified successfully",
        error: 0,
      })
    );
  } catch (error) {
    console.log("forgotPasswordOtpVerification (supabase) error", error.message);
    return res.json(
      responseData({
        success: 0,
        message: "An error occurred",
        error: 1,
      })
    );
  }
};

const resetPassword = async (req, res) => {
  try {
    const email = String(req.body?.email || "").trim().toLowerCase();
    const newPassword = String(req.body?.new_password || "");

    if (!email || !newPassword) {
      return res.json(
        responseData({
          success: 0,
          message: "Email and password is required",
          error: 1,
        })
      );
    }

    const otpRecord = await findForgotPasswordOtpByEmail(email);
    if (!otpRecord) {
      return res.status(400).json(
        responseData({
          success: 0,
          message: "Invalid email. Please try again",
          error: 1,
        })
      );
    }

    if (otpRecord.expires_at && new Date(otpRecord.expires_at) < new Date()) {
      return res.status(400).json(
        responseData({
          success: 0,
          message: "OTP has expired. Please request a new one.",
          error: 1,
        })
      );
    }

    if (!otpRecord.is_verified) {
      return res.status(400).json(
        responseData({
          success: 0,
          message: "Please verify your OTP",
          error: 1,
        })
      );
    }

    const user = await findUserByEmail(email);
    if (!user) {
      return res.status(400).json(
        responseData({
          success: 0,
          message: "Invalid email. Please try again",
          error: 1,
        })
      );
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await updateUserById(user._id || user.id, { passwordHash: hashedPassword });
    await deleteForgotPasswordOtpByEmail(email);

    return res.json(
      responseData({
        success: 1,
        message: "Successfully reset password",
        error: 0,
      })
    );
  } catch (error) {
    console.log("resetPassword (supabase) error", error.message);
    return res.status(500).json(
      responseData({
        success: 0,
        message: "An error occurred",
        error: 1,
      })
    );
  }
};

const uploadImage = async (req, res) => {
  try {
    const avatar = req.file?.filename;
    if (!avatar) {
      return res.json(
        responseData({
          success: 0,
          message: "Image Not uploaded",
          error: 1,
        })
      );
    }

    return res.json(
      responseData({
        success: 1,
        message: "Image Uploaded Successfully",
        error: 0,
        extra: { image: avatar },
      })
    );
  } catch (error) {
    console.log("uploadImage (supabase) error", error.message);
    return res.status(500).json(
      responseData({
        success: 0,
        message: "An error occurred",
        error: 1,
      })
    );
  }
};

const editUserProfile = async (req, res) => {
  try {
    const { user, errorResponse } = await getAuthenticatedUser(req);
    if (!user) return res.json(errorResponse);

    const firstname = String(req.body?.firstname || "").trim();
    const lastname = String(req.body?.lastname || "").trim();
    const countryCode = String(req.body?.country_code || "").trim();
    const phoneNumber = String(req.body?.phone_number || "").trim();
    const image = req.body?.image !== undefined ? String(req.body.image || "").trim() : user.image;

    const updatedUser = await updateUserById(user._id || user.id, {
      firstname: firstname || user.firstname,
      lastname: lastname || user.lastname,
      countryCode: countryCode || user.country_code,
      phoneNumber: phoneNumber || user.phone_number,
      image,
    });

    if (!updatedUser) {
      return res.json(
        responseData({
          success: 0,
          message: "Profile update failed",
          error: 1,
        })
      );
    }

    return res.json(
      responseData({
        success: 1,
        message: "Profile updated successfully",
        error: 0,
      })
    );
  } catch (error) {
    console.log("editUserProfile (supabase) error", error.message);
    return res.status(500).json(
      responseData({
        success: 0,
        message: "An error occurred",
        error: 1,
      })
    );
  }
};

const changePassword = async (req, res) => {
  try {
    const { user, errorResponse } = await getAuthenticatedUser(req);
    if (!user) return res.json(errorResponse);

    const currentPassword = String(req.body?.currentPassword || "");
    const newPassword = String(req.body?.newPassword || "");
    const confirmPassword = String(req.body?.confirmPassword || "");

    if (newPassword !== confirmPassword) {
      return res.json(
        responseData({
          success: 0,
          message: "Confirm password does not match",
          error: 1,
        })
      );
    }

    const passwordMatch = await bcrypt.compare(
      currentPassword,
      user.password || ""
    );

    if (!passwordMatch) {
      return res.json(
        responseData({
          success: 0,
          message:
            "Incorrect current password. Please enter the correct password and try again...",
          error: 1,
        })
      );
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await updateUserById(user._id || user.id, { passwordHash: hashedPassword });

    return res.json(
      responseData({
        success: 1,
        message: "Password changed successfully",
        error: 0,
      })
    );
  } catch (error) {
    console.log("changePassword (supabase) error", error.message);
    return res.status(500).json(
      responseData({
        success: 0,
        message: "An error occurred",
        error: 1,
      })
    );
  }
};

const deleteAccountUser = async (req, res) => {
  try {
    const { user, errorResponse } = await getAuthenticatedUser(req);
    if (!user) return res.json(errorResponse);

    const userId = user._id || user.id;
    const deletedEmail = `deleted+${String(userId)}@onepower.local`;

    await Promise.all([
      deleteFavouriteCampaignsByUserId(userId),
      deleteUserNotificationDevicesByUserId(userId),
      deleteOtpByEmail(user.email),
      deleteForgotPasswordOtpByEmail(user.email),
    ]);

    await updateUserById(userId, {
      firstname: "Deleted",
      lastname: "User",
      email: deletedEmail,
      countryCode: "",
      phoneNumber: "",
      image: "",
      passwordHash: null,
      isVerified: false,
      isActive: false,
    });

    return res.json(
      responseData({
        success: 1,
        message: "Successfully deleted user",
        error: 0,
      })
    );
  } catch (error) {
    console.log("deleteAccountUser (supabase) error", error.message);
    return res.status(500).json(
      responseData({
        success: 0,
        message: "An error occurred",
        error: 1,
      })
    );
  }
};

const getUserDetails = async (req, res) => {
  try {
    const { user, errorResponse } = await getAuthenticatedUser(req);
    if (!user) return res.json(errorResponse);

    return res.json(
      responseData({
        success: 1,
        message: "User details fetched successfully",
        error: 0,
        extra: {
          user: sanitizeUser(user),
        },
      })
    );
  } catch (error) {
    console.log("getUserDetails (supabase) error", error.message);
    return res.json(
      responseData({
        success: 0,
        message: "Unable to fetch user details",
        error: 1,
      })
    );
  }
};

module.exports = {
  checkRegisterUser,
  signUp,
  verifyOTP,
  signIn,
  isVerifyAccount,
  resendOtp,
  forgotPassword,
  forgotPasswordOtpVerification,
  resetPassword,
  uploadImage,
  editUserProfile,
  changePassword,
  deleteAccountUser,
  getUserDetails,
};
