const {
  findUserByEmail,
  findUserByAuthUserId,
  createUser,
  updateUserById,
  upsertUserNotificationDevice,
  deleteUserNotificationDevicesByUserId,
  deleteFavouriteCampaignsByUserId,
} = require("../services/supabaseUserAuthService");
const {
  signInWithPassword,
  signUpWithPassword,
  resendSignupVerificationEmail,
  resetPasswordForEmail,
  updateUserPasswordWithAccessToken,
  getAuthUserByAccessToken,
  ensureAuthUser,
  findAuthUserByEmail,
  updateAuthUserById,
  deleteAuthUserById,
  getSupabaseErrorMessage,
  getSupabaseErrorCode,
} = require("../services/supabaseAuthProviderService");
const {
  getClientIp,
  getSignInLockoutStatus,
  registerSignInFailure,
  registerSignInSuccess,
} = require("../services/authSecurityService");
const { getCurrencyTimezone } = require("../services/supabaseCurrencyService");

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

function extractSessionToken(authData) {
  return authData?.access_token || authData?.session?.access_token || null;
}

function extractAuthUser(authData) {
  return authData?.user || authData?.session?.user || null;
}

function isEmailConfirmed(authUser) {
  return !!(authUser?.email_confirmed_at || authUser?.confirmed_at);
}

function resolveRole(authUser, user = null) {
  const metaRole = String(authUser?.app_metadata?.role || "").trim().toLowerCase();
  if (metaRole) return metaRole;
  const dbAdmin = Number(user?.is_admin ?? user?.isAdmin ?? 0) === 1;
  if (dbAdmin) return "admin";
  return "user";
}

async function resolveUserForAuthUser(authUser) {
  if (!authUser) return null;
  const authUserId = String(authUser.id || "").trim();
  const email = String(authUser.email || "").trim().toLowerCase();

  let user = null;
  if (authUserId) {
    user = await findUserByAuthUserId(authUserId);
  }
  if (!user && email) {
    user = await findUserByEmail(email);
  }
  if (!user) return null;

  const updates = {};
  if (authUserId && String(user.auth_user_id || "").trim() !== authUserId) {
    updates.authUserId = authUserId;
  }
  if (isEmailConfirmed(authUser) && !user.isVerified) {
    updates.isVerified = true;
    updates.isActive = true;
  }

  if (Object.keys(updates).length > 0) {
    user = await updateUserById(user._id || user.id, updates);
  }

  return user;
}

async function authenticateWithSupabaseToken(token) {
  if (!token) return null;
  try {
    const authUser = await getAuthUserByAccessToken(token);
    return authUser?.id ? authUser : null;
  } catch (_error) {
    return null;
  }
}

async function getAuthenticatedUser(req) {
  const token = getBearerToken(req);
  if (!token) {
    return {
      user: null,
      authUser: null,
      token: null,
      errorResponse: {
        status: 401,
        body: responseData({
          success: 0,
          message: "Please, Sign In....",
          error: 1,
        }),
      },
    };
  }

  const authUser = await authenticateWithSupabaseToken(token);
  if (!authUser) {
    return {
      user: null,
      authUser: null,
      token: null,
      errorResponse: {
        status: 401,
        body: responseData({
          success: 0,
          message: "Session expired or invalid token. Please sign in again.",
          error: 1,
        }),
      },
    };
  }

  const user = await resolveUserForAuthUser(authUser);
  if (!user || user.is_active === false) {
    return {
      user: null,
      authUser,
      token,
      errorResponse: {
        status: 401,
        body: responseData({
          success: 0,
          message: "Please, Sign In....",
          error: 1,
        }),
      },
    };
  }

  return { user, authUser, token, errorResponse: null };
}

function mapSignInError(error) {
  const message = getSupabaseErrorMessage(
    error,
    "Sign in failed. Please try again."
  );
  const normalizedSourceMessage = String(message || "").trim();
  const code = String(getSupabaseErrorCode(error) || "").toLowerCase();
  const status = Number(error?.response?.status || 0);
  const normalizedMessage = normalizedSourceMessage.toLowerCase();

  if (
    code.includes("email_not_confirmed") ||
    normalizedMessage.includes("email not confirmed")
  ) {
    return "Your email is not verified yet. Please check your inbox and verify before signing in.";
  }

  if (
    code.includes("invalid_grant") ||
    normalizedMessage.includes("invalid login credentials") ||
    status === 400 ||
    status === 401
  ) {
    return "Invalid credentials. Please check your email and password.";
  }

  if (
    code.includes("over_request_rate_limit") ||
    code.includes("rate_limit") ||
    normalizedMessage.includes("rate limit") ||
    status === 429
  ) {
    return "Too many attempts. Please wait and try again.";
  }

  if (
    normalizedMessage.includes("requires supabase_url") ||
    normalizedMessage.includes("service_role_key") ||
    normalizedMessage.includes("supabase auth provider requires")
  ) {
    return "Sign in service is temporarily unavailable. Please try again later.";
  }

  if (
    normalizedMessage.includes("timeout") ||
    normalizedMessage.includes("network") ||
    code.includes("econn") ||
    code.includes("enotfound")
  ) {
    return "Authentication service is currently unreachable. Please try again shortly.";
  }

  if (status >= 500) {
    return "Sign in service is temporarily unavailable. Please try again shortly.";
  }

  if (
    normalizedSourceMessage &&
    normalizedMessage !== "supabase auth request failed" &&
    normalizedMessage !== "sign in failed. please try again."
  ) {
    return normalizedSourceMessage;
  }

  return "Unable to sign in right now. Please try again.";
}

function mapSignUpError(error) {
  const message = String(
    getSupabaseErrorMessage(error, "Unable to create account right now.")
  ).trim();
  const code = String(getSupabaseErrorCode(error) || "").toLowerCase();
  const status = Number(error?.response?.status || 0);
  const normalizedMessage = message.toLowerCase();

  if (isUniqueConstraintError(error)) {
    return "User already exists. Please sign in.";
  }

  if (
    normalizedMessage.includes("requires supabase_url") ||
    normalizedMessage.includes("service_role_key")
  ) {
    return "Sign up service is temporarily unavailable. Please try again later.";
  }

  if (
    code.includes("weak_password") ||
    normalizedMessage.includes("password should be")
  ) {
    return "Password is too weak. Use at least 6 characters.";
  }

  if (
    code.includes("validation_failed") ||
    normalizedMessage.includes("invalid email")
  ) {
    return "Please enter a valid email address.";
  }

  if (
    code.includes("over_email_send_rate_limit") ||
    normalizedMessage.includes("rate limit") ||
    status === 429
  ) {
    const retryAfterSec = Number(error?.response?.headers?.["retry-after"] || 0);
    if (Number.isFinite(retryAfterSec) && retryAfterSec > 0) {
      return `Too many attempts. Try again in ${Math.ceil(retryAfterSec)} seconds.`;
    }
    return "Too many attempts. Please wait a few minutes and try again.";
  }

  if (
    code.includes("signup_disabled") ||
    normalizedMessage.includes("signups not allowed")
  ) {
    return "Sign up is temporarily disabled. Please try again later.";
  }

  if (message.length > 0) {
    return message;
  }

  return "Unable to create account right now. Please try again.";
}

function isUniqueConstraintError(error) {
  const message = String(getSupabaseErrorMessage(error, "") || "").toLowerCase();
  const code = String(getSupabaseErrorCode(error) || "").toLowerCase();
  const details = String(error?.response?.data?.details || "").toLowerCase();
  const hint = String(error?.response?.data?.hint || "").toLowerCase();
  const text = `${message} ${details} ${hint}`.trim();
  const status = Number(error?.response?.status || 0);

  return (
    code === "23505" ||
    code.includes("unique_violation") ||
    text.includes("duplicate key value") ||
    text.includes("unique constraint") ||
    status === 409
  );
}

function mapEmailActionError(
  error,
  fallback = "Unable to send email right now. Please try again."
) {
  const message = String(getSupabaseErrorMessage(error, fallback)).trim();
  const code = String(getSupabaseErrorCode(error) || "").toLowerCase();
  const status = Number(error?.response?.status || 0);
  const normalizedMessage = message.toLowerCase();

  if (
    code.includes("over_email_send_rate_limit") ||
    normalizedMessage.includes("rate limit") ||
    status === 429
  ) {
    const retryAfterSec = Number(error?.response?.headers?.["retry-after"] || 0);
    if (Number.isFinite(retryAfterSec) && retryAfterSec > 0) {
      return `Too many attempts. Try again in ${Math.ceil(retryAfterSec)} seconds.`;
    }
    return "Too many attempts. Please wait a few minutes and try again.";
  }

  if (
    normalizedMessage.includes("requires supabase_url") ||
    normalizedMessage.includes("service_role_key")
  ) {
    return "Email service is temporarily unavailable. Please try again later.";
  }

  if (
    code.includes("validation_failed") ||
    normalizedMessage.includes("invalid email")
  ) {
    return "Please enter a valid email address.";
  }

  if (message.length > 0) return message;
  return fallback;
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

    let isVerified = !!existingUser.isVerified;
    const linkedAuthUserId = String(existingUser.auth_user_id || "").trim();
    if (!linkedAuthUserId) {
      const authUser = await findAuthUserByEmail(email);
      if (!authUser) {
        return res.json(
          responseData({
            success: 1,
            message:
              "Account found from old system. Please sign up again to migrate this email.",
            error: 0,
          })
        );
      }

      if (!isEmailConfirmed(authUser)) {
        return res.json(
          responseData({
            success: 1,
            message:
              "Account exists but email is not verified yet. Continue sign up to resend verification.",
            error: 0,
          })
        );
      }

      await updateUserById(existingUser._id || existingUser.id, {
        authUserId: authUser.id,
        isVerified: true,
        isActive: true,
      });
      isVerified = true;
    }

    if (!isVerified) {
      return res.json(
        responseData({
          success: 1,
          message:
            "Account exists but email is not verified yet. Continue sign up to resend verification.",
          error: 0,
        })
      );
    }

    return res.json(
      responseData({
        success: 2,
        message: "User already exists. Please sign in.",
        error: 1,
      })
    );
  } catch (_error) {
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
    const linkedAuthUserId = String(user?.auth_user_id || "").trim();
    if (!user && (!countryCode || !phoneNumber)) {
      return res.json(
        responseData({
          success: 2,
          message: "Country code and phone number are required",
          error: 1,
        })
      );
    }

    const existingAuthUser = await findAuthUserByEmail(email);
    if (existingAuthUser?.id) {
      const authUserConfirmed = isEmailConfirmed(existingAuthUser);
      if (authUserConfirmed) {
        if (user && !linkedAuthUserId) {
          await updateUserById(user._id || user.id, {
            authUserId: existingAuthUser.id,
            isVerified: true,
            isActive: true,
          });
        }
        return res.json(
          responseData({
            success: 2,
            message: "User already exists. Please sign in.",
            error: 1,
          })
        );
      }

      try {
        await resendSignupVerificationEmail({ email });
      } catch (error) {
        return res.json(
          responseData({
            success: 2,
            message: mapEmailActionError(
              error,
              "Unable to resend verification email right now. Please try again."
            ),
            error: 1,
          })
        );
      }
      return res.json(
        responseData({
          success: 1,
          message:
            "Account already exists but is not verified. A new verification email has been sent.",
          error: 0,
        })
      );
    }

    let signUpResponse;
    try {
      signUpResponse = await signUpWithPassword({
        email,
        password,
        userMetadata: { firstname, lastname, role: "user" },
      });
    } catch (error) {
      const message = getSupabaseErrorMessage(error);
      if (/already|registered|exists/i.test(message)) {
        const existingAuthUserFromCatch = await findAuthUserByEmail(email);
        const authUserConfirmed =
          !!existingAuthUserFromCatch?.email_confirmed_at ||
          !!existingAuthUserFromCatch?.confirmed_at;

        if (authUserConfirmed) {
          if (user && !linkedAuthUserId && existingAuthUserFromCatch?.id) {
            await updateUserById(user._id || user.id, {
              authUserId: existingAuthUserFromCatch.id,
              isVerified: true,
              isActive: true,
            });
          }
          return res.json(
            responseData({
              success: 2,
              message: "User already exists. Please sign in.",
              error: 1,
            })
          );
        }

        try {
          await resendSignupVerificationEmail({ email });
        } catch (resendError) {
          return res.json(
            responseData({
              success: 2,
              message: mapEmailActionError(
                resendError,
                "Unable to resend verification email right now. Please try again."
              ),
              error: 1,
            })
          );
        }

        return res.json(
          responseData({
            success: 1,
            message:
              "Account already exists but is not verified. A new verification email has been sent.",
            error: 0,
          })
        );
      }

      return res.json(
        responseData({
          success: 2,
          message: mapSignUpError(error),
          error: 1,
        })
      );
    }

    const authUser = signUpResponse?.user || (await findAuthUserByEmail(email));
    const authUserId = String(authUser?.id || "").trim() || null;

    if (!user) {
      try {
        user = await createUser({
          firstname,
          lastname,
          email,
          countryCode,
          phoneNumber,
          authUserId,
        });
      } catch (error) {
        if (!isUniqueConstraintError(error)) {
          throw error;
        }

        const existingUser = await findUserByEmail(email);
        if (!existingUser) {
          throw error;
        }

        user = await updateUserById(existingUser._id || existingUser.id, {
          firstname,
          lastname,
          countryCode: countryCode || existingUser.country_code,
          phoneNumber: phoneNumber || existingUser.phone_number,
          authUserId,
        });
      }
    } else {
      user = await updateUserById(user._id || user.id, {
        firstname,
        lastname,
        countryCode: countryCode || user.country_code,
        phoneNumber: phoneNumber || user.phone_number,
        authUserId,
      });
    }

    if (user && isEmailConfirmed(authUser) && !user.isVerified) {
      user = await updateUserById(user._id || user.id, {
        isVerified: true,
        isActive: true,
      });
    }

    return res.json(
      responseData({
        success: 1,
        message:
          "Successfully signed up. Please check your email to verify your account.",
        error: 0,
      })
    );
  } catch (error) {
    console.log("signUp (supabase) error", error?.message || error);
    return res.json(
      responseData({
        success: 2,
        message: mapSignUpError(error),
        error: 1,
      })
    );
  }
};

const verifyOTP = async (req, res) => {
  try {
    const token = getBearerToken(req);
    if (!token) {
      return res.status(401).json(
        responseData({
          success: 0,
          message:
            "Open the verification link from your email to complete sign up. The link includes the required session.",
          error: 1,
        })
      );
    }

    const authUser = await authenticateWithSupabaseToken(token);
    if (!authUser || !isEmailConfirmed(authUser)) {
      return res.status(401).json(
        responseData({
          success: 0,
          message:
            "Verification requires an active Supabase session from the email link.",
          error: 1,
        })
      );
    }

    let user = await resolveUserForAuthUser(authUser);
    if (!user) {
      const email = String(authUser.email || "").trim().toLowerCase();
      user = email ? await findUserByEmail(email) : null;
      if (!user) {
        return res.status(404).json(
          responseData({
            success: 0,
            message: "Profile not found for this session.",
            error: 1,
          })
        );
      }

      user = await updateUserById(user._id || user.id, {
        authUserId: authUser.id,
        isVerified: true,
        isActive: true,
      });
    } else if (!user.isVerified || user.is_active === false) {
      user = await updateUserById(user._id || user.id, {
        isVerified: true,
        isActive: true,
      });
    }

    return res.json(
      responseData({
        success: 1,
        message: "Email verified via Supabase session.",
        error: 0,
        extra: {
          user: sanitizeUser(user),
        },
      })
    );
  } catch (error) {
    console.log("verifyOTP (supabase) error", error?.message || error);
    return res.status(500).json(
      responseData({
        success: 0,
        message: "Unable to verify account right now. Please try again.",
        error: 1,
      })
    );
  }
};

const signIn = async (req, res) => {
  try {
    const email = String(req.body?.email || "").trim().toLowerCase();
    const password = String(req.body?.password || "");
    const ip = getClientIp(req);

    if (!email || !password) {
      return res.json(
        responseData({
          success: 0,
          message: "Email and password is required",
          error: 1,
        })
      );
    }

    const existingUser = await findUserByEmail(email);
    const linkedAuthUserId = String(existingUser?.auth_user_id || "").trim();
    if (existingUser && !linkedAuthUserId) {
      const existingAuthUser = await findAuthUserByEmail(email);
      if (!existingAuthUser?.id) {
        await registerSignInFailure({
          scope: "mobile_user_sign_in",
          email,
          ip,
        });
        return res.json(
          responseData({
            success: 0,
            message:
              "Your account is from the old system. Please sign up again to continue.",
            error: 1,
          })
        );
      }
    }

    const lockStatus = await getSignInLockoutStatus({
      scope: "mobile_user_sign_in",
      email,
      ip,
    });
    if (lockStatus.blocked) {
      return res.status(429).json(
        responseData({
          success: 0,
          message: `Too many failed sign-in attempts. Try again in ${lockStatus.retryAfterSec} seconds.`,
          error: 1,
        })
      );
    }

    let authSignIn = null;
    try {
      authSignIn = await signInWithPassword(email, password);
    } catch (error) {
      const mapped = mapSignInError(error);
      await registerSignInFailure({
        scope: "mobile_user_sign_in",
        email,
        ip,
      });
      return res.status(401).json(
        responseData({
          success: 0,
          message: mapped,
          error: 1,
        })
      );
    }

    const token = extractSessionToken(authSignIn);
    if (!token) {
      await registerSignInFailure({
        scope: "mobile_user_sign_in",
        email,
        ip,
      });
      return res.status(401).json(
        responseData({
          success: 0,
          message: "Unable to create session. Please try again.",
          error: 1,
        })
      );
    }

    const authUser =
      extractAuthUser(authSignIn) || (await getAuthUserByAccessToken(token));
    if (!authUser) {
      await registerSignInFailure({
        scope: "mobile_user_sign_in",
        email,
        ip,
      });
      return res.status(401).json(
        responseData({
          success: 0,
          message: "Unable to load account profile. Please try again.",
          error: 1,
        })
      );
    }

    const user = await resolveUserForAuthUser(authUser);

    if (!user) {
      await registerSignInFailure({
        scope: "mobile_user_sign_in",
        email,
        ip,
      });
      return res.status(404).json(
        responseData({
          success: 0,
          message: "Account profile not found. Please contact support.",
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

    const role = resolveRole(authUser, user);

    await registerSignInSuccess({
      scope: "mobile_user_sign_in",
      email,
      ip,
    });

    const registrationToken = String(req.body?.registrationToken || "").trim();
    const deviceId = String(req.body?.deviceId || "").trim();
    if (registrationToken && deviceId) {
      try {
        await upsertUserNotificationDevice({
          userId: user._id || user.id,
          deviceId,
          registrationToken,
          platform: "mobile",
        });
      } catch (error) {
        console.log("signIn device registration warning", {
          requestId: req.id || null,
          message: error?.message || String(error || ""),
          code: getSupabaseErrorCode(error),
        });
      }
    }

    return res.json(
      responseData({
        success: 1,
        message: "Logged in successfully.",
        error: 0,
        extra: {
          token,
          user: sanitizeUser(user),
          role,
        },
      })
    );
  } catch (error) {
    console.log("signIn (supabase) error", {
      requestId: req.id || null,
      message: error?.message || String(error || ""),
      code: getSupabaseErrorCode(error),
      status: Number(error?.response?.status || 0),
    });
    const mapped = mapSignInError(error);
    return res.status(401).json(
      responseData({
        success: 0,
        message: mapped,
        error: 1,
        extra: {
          requestId: req.id || null,
        },
      })
    );
  }
};

const isVerifyAccount = async (req, res) => {
  try {
    const { user, authUser, errorResponse } = await getAuthenticatedUser(req);
    if (!user || !authUser) return res.status(errorResponse.status).json(errorResponse.body);

    if (!isEmailConfirmed(authUser)) {
      return res.status(403).json(
        responseData({
          success: 0,
          message: "Email is not verified for this session.",
          error: 1,
        })
      );
    }

    if (!user.isVerified || String(user.auth_user_id || "") !== String(authUser.id)) {
      await updateUserById(user._id || user.id, {
        isVerified: true,
        isActive: true,
        authUserId: authUser.id,
      });
    }

    return res.json(
      responseData({
        success: 1,
        message: "Your account has been successfully verified.",
        error: 0,
      })
    );
  } catch (error) {
    console.log("isVerifyAccount (supabase) error", error?.message || error);
    return res.status(500).json(
      responseData({
        success: 0,
        message: "Unable to verify account status right now. Please try again.",
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

    const authUser = await findAuthUserByEmail(email);
    if (!authUser) {
      return res.json(
        responseData({
          success: 0,
          message: "User not found",
          error: 1,
        })
      );
    }

    if (isEmailConfirmed(authUser)) {
      return res.json(
        responseData({
          success: 1,
          message: "Your account is already verified.",
          error: 0,
        })
      );
    }

    await resendSignupVerificationEmail({ email });

    return res.json(
      responseData({
        success: 1,
        message:
          "A verification email has been sent. Please use the link in your inbox to verify.",
        error: 0,
      })
    );
  } catch (error) {
    console.log("resendOtp (supabase) error", error?.message || error);
    return res.json(
      responseData({
        success: 0,
        message: mapEmailActionError(
          error,
          "Unable to resend verification email right now. Please try again."
        ),
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
    if (user && user.is_active === false) {
      return res.json(
        responseData({
          success: 0,
          message: "This account is not active. Please contact support.",
          error: 1,
        })
      );
    }

    if (user) {
      await resetPasswordForEmail({ email });
    }

    return res.json(
      responseData({
        success: 1,
        message:
          "If this email is registered, a password reset link has been sent.",
        error: 0,
      })
    );
  } catch (error) {
    console.log("forgotPassword (supabase) error", error?.message || error);
    return res.json(
      responseData({
        success: 0,
        message: mapEmailActionError(
          error,
          "Unable to process password reset right now. Please try again."
        ),
        error: 1,
      })
    );
  }
};

const forgotPasswordOtpVerification = async (_req, res) => {
  return res.json(
    responseData({
      success: 1,
      message:
        "OTP verification is deprecated. Use the reset link sent to your email.",
      error: 0,
    })
  );
};

const resetPassword = async (req, res) => {
  try {
    const newPassword = String(
      req.body?.new_password || req.body?.newPassword || ""
    );
    const confirmPassword = String(req.body?.confirm_password || "").trim();
    const bearer = getBearerToken(req);
    const bodyToken = String(req.body?.access_token || "").trim();
    const token = bearer || bodyToken;

    if (!newPassword) {
      return res.status(400).json(
        responseData({
          success: 0,
          message: "New password is required",
          error: 1,
        })
      );
    }

    if (confirmPassword && confirmPassword !== newPassword) {
      return res.status(400).json(
        responseData({
          success: 0,
          message: "Confirm password does not match",
          error: 1,
        })
      );
    }

    if (!token) {
      return res.status(400).json(
        responseData({
          success: 0,
          message:
            "Reset link session is missing or expired. Request a new reset link.",
          error: 1,
        })
      );
    }

    try {
      await updateUserPasswordWithAccessToken(token, newPassword);
    } catch (error) {
      const message = getSupabaseErrorMessage(
        error,
        "Reset session is invalid or expired. Request a new reset link."
      );
      const code = String(getSupabaseErrorCode(error) || "").toLowerCase();
      if (
        code.includes("jwt") ||
        code.includes("token") ||
        /expired|invalid|session/i.test(message)
      ) {
        return res.status(401).json(
          responseData({
            success: 0,
            message: "Reset session is invalid or expired. Request a new reset link.",
            error: 1,
          })
        );
      }
      return res.status(400).json(
        responseData({
          success: 0,
          message: "Unable to reset password right now. Please try again.",
          error: 1,
        })
      );
    }

    const authUser = await getAuthUserByAccessToken(token);
    let user = await resolveUserForAuthUser(authUser);
    if (user) {
      user = await updateUserById(user._id || user.id, {
        isVerified: true,
        isActive: true,
        authUserId: authUser?.id || user.auth_user_id || null,
      });
    }

    return res.json(
      responseData({
        success: 1,
        message: "Successfully reset password",
        error: 0,
      })
    );
  } catch (_error) {
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
    const publicUrl = req.file?.publicUrl;

    if (!avatar) {
      return res.json(
        responseData({
          success: 0,
          message: "Image Not uploaded",
          error: 1,
        })
      );
    }

    const imageValue = publicUrl || avatar;

    return res.json(
      responseData({
        success: 1,
        message: "Image Uploaded Successfully",
        error: 0,
        extra: {
          image: imageValue,
          filename: avatar,
        },
      })
    );
  } catch (_error) {
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
    if (!user) return res.status(errorResponse.status).json(errorResponse.body);

    const firstname = String(req.body?.firstname || "").trim();
    const lastname = String(req.body?.lastname || "").trim();
    const countryCode = String(req.body?.country_code || "").trim();
    const phoneNumber = String(req.body?.phone_number || "").trim();
    const image =
      req.body?.image !== undefined
        ? String(req.body.image || "").trim()
        : user.image;

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
  } catch (_error) {
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
    const { user, authUser, errorResponse } = await getAuthenticatedUser(req);
    if (!user) return res.status(errorResponse.status).json(errorResponse.body);

    const currentPassword = String(req.body?.currentPassword || "");
    const newPassword = String(req.body?.newPassword || "");
    const confirmPassword = String(req.body?.confirmPassword || "");

    if (!currentPassword || !newPassword || !confirmPassword) {
      return res.json(
        responseData({
          success: 0,
          message: "Current, new and confirm password are required",
          error: 1,
        })
      );
    }

    if (newPassword !== confirmPassword) {
      return res.json(
        responseData({
          success: 0,
          message: "Confirm password does not match",
          error: 1,
        })
      );
    }

    try {
      await signInWithPassword(user.email, currentPassword);
    } catch (_error) {
      return res.json(
        responseData({
          success: 0,
          message:
            "Incorrect current password. Please enter the correct password and try again...",
          error: 1,
        })
      );
    }

    if (authUser?.id) {
      await updateAuthUserById(authUser.id, { password: newPassword });
    } else {
      await ensureAuthUser({
        email: user.email,
        password: newPassword,
        appMetadata: { role: "user" },
        userMetadata: {
          firstname: user.firstname,
          lastname: user.lastname,
        },
        updatePasswordIfExists: true,
      });
    }

    return res.json(
      responseData({
        success: 1,
        message: "Password changed successfully",
        error: 0,
      })
    );
  } catch (_error) {
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
    const { user, authUser, errorResponse } = await getAuthenticatedUser(req);
    if (!user) return res.status(errorResponse.status).json(errorResponse.body);

    const userId = user._id || user.id;
    const deletedEmail = `deleted+${String(userId)}@onepower.local`;

    await Promise.all([
      deleteFavouriteCampaignsByUserId(userId),
      deleteUserNotificationDevicesByUserId(userId),
    ]);

    await updateUserById(userId, {
      firstname: "Deleted",
      lastname: "User",
      email: deletedEmail,
      countryCode: "",
      phoneNumber: "",
      image: "",
      authUserId: null,
      isVerified: false,
      isActive: false,
    });

    try {
      if (authUser?.id) {
        await deleteAuthUserById(authUser.id);
      } else {
        const existingAuthUser = await findAuthUserByEmail(user.email);
        if (existingAuthUser?.id) await deleteAuthUserById(existingAuthUser.id);
      }
    } catch (_error) {
      // Profile is already anonymized; ignore auth-user deletion failure.
    }

    return res.json(
      responseData({
        success: 1,
        message: "Successfully deleted user",
        error: 0,
      })
    );
  } catch (_error) {
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
    if (!user) return res.status(errorResponse.status).json(errorResponse.body);

    const role = resolveRole(req.authUser, user);

    return res.json(
      responseData({
        success: 1,
        message: "User details fetched successfully",
        error: 0,
        extra: {
          user: sanitizeUser(user),
          role,
        },
      })
    );
  } catch (_error) {
    return res.json(
      responseData({
        success: 0,
        message: "Unable to fetch user details",
        error: 1,
      })
    );
  }
};

const getOtp = async (_req, res) => {
  return res.json(
    responseData({
      success: 0,
      message:
        "getOtp is deprecated in Supabase mode. Use email verification links instead.",
      error: 1,
    })
  );
};

const getForgotPasswordOtp = async (_req, res) => {
  return res.json(
    responseData({
      success: 0,
      message:
        "getForgotPasswordOtp is deprecated in Supabase mode. Use password reset links instead.",
      error: 1,
    })
  );
};

const getCurrency = async (_req, res) => {
  try {
    const currencyTimezone = await getCurrencyTimezone();
    if (!currencyTimezone) {
      return res.json(
        responseData({
          success: 0,
          message: "Currency Not Found",
          error: 1,
          extra: {
            currency: null,
          },
        })
      );
    }

    return res.json(
      responseData({
        success: 1,
        message: "Currency Found",
        error: 0,
        extra: {
          currency: currencyTimezone,
        },
      })
    );
  } catch (error) {
    console.log("getCurrency (supabase) error", error?.message || error);
    return res.json(
      responseData({
        success: 0,
        message: "Unable to fetch currency right now. Please try again.",
        error: 1,
      })
    );
  }
};

module.exports = {
  checkRegisterUser,
  signUp,
  signIn,
  isVerifyAccount,
  forgotPassword,
  resendOtp,
  resetPassword,
  uploadImage,
  editUserProfile,
  changePassword,
  deleteAccountUser,
  getUserDetails,
  getCurrency,
  // Deprecated OTP endpoint is kept to avoid runtime crashes from missing handlers.
  // It responds with a deprecation message for legacy clients.
  forgotPasswordOtpVerification,
};
