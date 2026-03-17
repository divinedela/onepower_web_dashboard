// Importing required modules
const sha256 = require("sha256");
const moment = require("moment");

const { verifyAdminAccess } = require("../config/verification");
const {
    findAdminByEmail,
    findAdminById,
    updateAdminById,
} = require("../services/supabaseAdminLoginService");
const {
    signInWithPassword,
    ensureAuthUser,
    findAuthUserByEmail,
    updateAuthUserById,
    resetPasswordForEmail,
    updateUserPasswordWithAccessToken,
    getAuthRedirectUrl,
    getSupabaseErrorMessage,
    getSupabaseErrorCode,
} = require("../services/supabaseAuthProviderService");
const {
    countCategories,
    countCampaigns,
    countUserCampaignsApproved,
    countBanners,
    countUsers,
    countActiveUsers,
    countDonations,
    listCampaigns,
    listRecentUsers,
    getCampaignDonationStatsForIds,
} = require("../services/supabaseContentService");
const logger = require("../config/logger");
const {
    getClientIp,
    getSignInLockoutStatus,
    registerSignInFailure,
    registerSignInSuccess,
} = require("../services/authSecurityService");
const { getSupabaseEnvStatus } = require("../config/supabaseEnv");

const isSupabaseDataProvider = true;

function isSuperAdmin(admin) {
    return Number(admin?.isAdmin ?? admin?.is_admin ?? 0) === 1;
}

function auditAdminEvent(event, req, extra = {}) {
    logger.info("admin.auth.audit", {
        event,
        adminId: req?.session?.userId || null,
        ip: getClientIp(req),
        userAgent: req?.headers?.["user-agent"] || "",
        ...extra,
    });
}

function mapAdminSignInError(error) {
    const message = String(getSupabaseErrorMessage(error, "") || "").toLowerCase();
    const code = String(getSupabaseErrorCode(error, "") || "").toLowerCase();
    if (code.includes("email_not_confirmed") || message.includes("email not confirmed")) {
        return "Email not verified for admin account. Please verify email first.";
    }
    if (code.includes("invalid_grant") || message.includes("invalid login credentials")) {
        return "Invalid admin credentials.";
    }
    return "Unable to login right now. Please try again.";
}

function getPasswordResetRedirectUrl() {
    const publicBase = String(process.env.PUBLIC_DASHBOARD_URL || process.env.APP_PUBLIC_URL || "").trim();
    if (publicBase) {
        return `${publicBase.replace(/\/$/, "")}/reset-password`;
    }

    const envRedirect = String(getAuthRedirectUrl() || "").trim();
    if (envRedirect) return envRedirect;

    const appUrl = String(process.env.APP_URL || "http://localhost:4000").trim();
    const basePath = String(process.env.BASE_URL || "/").replace(/\/$/, "");
    return `${appUrl.replace(/\/$/, "")}${basePath}/reset-password`;
}


// Load and render the login view
const loadLogin = async (req, res) => {

    try {

        res.render("login");

    } catch (error) {
        console.log(error.message);
    }
}

//login
const login = async (req, res) => {

    try {

        const email = String(req.body.email || "").trim().toLowerCase();
        const passwordRaw = String(req.body.password || "");
        const password = sha256.x2(passwordRaw);
        const ip = getClientIp(req);

        const isExistEmail = await findAdminByEmail(email);

        if (isSupabaseDataProvider) {
            const lockStatus = await getSignInLockoutStatus({
                scope: "admin_sign_in",
                email,
                ip,
            });
            if (lockStatus.blocked) {
                req.flash(
                    "error",
                    `Too many failed login attempts. Try again in ${lockStatus.retryAfterSec} seconds.`
                );
                auditAdminEvent("login_blocked", req, { email, retryAfterSec: lockStatus.retryAfterSec });
                return res.redirect(process.env.BASE_URL);
            }
        }

        if (!isExistEmail) {
            if (isSupabaseDataProvider) {
                await registerSignInFailure({ scope: "admin_sign_in", email, ip });
                auditAdminEvent("login_failed", req, { email, reason: "admin_not_found" });
            }

            req.flash("error", "We're sorry, something went wrong when attempting to login...");
            return res.redirect(process.env.BASE_URL);
        }
        else {

            if (isSupabaseDataProvider && !isSuperAdmin(isExistEmail)) {
                await registerSignInFailure({ scope: "admin_sign_in", email, ip });
                auditAdminEvent("login_failed", req, { email, reason: "not_admin_role" });
                req.flash("error", "You do not have admin access.");
                return res.redirect(process.env.BASE_URL);
            }

            if (isSupabaseDataProvider) {
                let authData;
                try {
                    authData = await signInWithPassword(email, passwordRaw);
                } catch (error) {
                    await registerSignInFailure({ scope: "admin_sign_in", email, ip });
                    auditAdminEvent("login_failed", req, { email, reason: "invalid_credentials" });
                    req.flash("error", mapAdminSignInError(error));
                    return res.redirect(process.env.BASE_URL);
                }

                const accessToken = authData?.access_token || authData?.session?.access_token;
                const refreshToken = authData?.refresh_token || authData?.session?.refresh_token || "";
                const authUserId = authData?.user?.id || authData?.session?.user?.id || "";
                if (!accessToken) {
                    await registerSignInFailure({ scope: "admin_sign_in", email, ip });
                    auditAdminEvent("login_failed", req, { email, reason: "missing_access_token" });
                    req.flash("error", "We're sorry, something went wrong when attempting to login...");
                    return res.redirect(process.env.BASE_URL);
                }

                if (authUserId && String(isExistEmail.auth_user_id || "") !== String(authUserId)) {
                    await updateAdminById(isExistEmail._id || isExistEmail.id, {
                        authUserId,
                    });
                }

                await new Promise((resolve, reject) =>
                    req.session.regenerate((err) => (err ? reject(err) : resolve()))
                );
                req.session.userId = isExistEmail._id || isExistEmail.id;
                req.session.adminAccessToken = accessToken;
                req.session.adminRefreshToken = refreshToken;
                req.session.adminAuthUserId = authUserId;
                await new Promise((resolve) => req.session.save(() => resolve()));
                await registerSignInSuccess({ scope: "admin_sign_in", email, ip });
                auditAdminEvent("login_success", req, {
                    email,
                    authUserId,
                });
                return res.redirect(process.env.BASE_URL + "dashboard");
            }

            if (password !== isExistEmail.password) {

                req.flash("error", "We're sorry, something went wrong when attempting to login...");
                return res.redirect(process.env.BASE_URL);

            } else {

                req.session.userId = isExistEmail._id || isExistEmail.id;
                return res.redirect(process.env.BASE_URL + "dashboard");
            }
        }

    } catch (error) {
        console.log(error.message);
        if (isSupabaseDataProvider) {
            auditAdminEvent("login_error", req, {
                email: String(req.body.email || "").trim().toLowerCase(),
                reason: error.message,
            });
        }
        req.flash("error", "Failed to login");
        return res.redirect(process.env.BASE_URL);

    }
}

// Load and render the dashboard view
const loadDashboard = async (req, res) => {

    try {

        // check if the user is verified
        await verifyAdminAccess(req, res, async () => {

        if (isSupabaseDataProvider) {
            const [
                totalCategory,
                totalUpcomingCampaign,
                totalRunningCampaign,
                totalEndedCampaign,
                totalUserCampaign,
                totalBanner,
                userCount,
                userActiveCount,
                totalDonor,
                runningCampaigns,
                userCampaign,
                users,
            ] = await Promise.all([
                countCategories("Publish"),
                countCampaigns("Upcoming"),
                countCampaigns("Running"),
                countCampaigns("Ended"),
                countUserCampaignsApproved(),
                countBanners("Publish"),
                countUsers(),
                countActiveUsers(),
                countDonations(),
                listCampaigns({ status: "Running", limit: 5 }),
                listCampaigns({ filter: { is_user: true }, limit: 7 }),
                listRecentUsers(7),
            ]);

            const stats = await getCampaignDonationStatsForIds(runningCampaigns.map((c) => c.id));
            const statsMap = Object.fromEntries(
                stats.map((s) => [String(s.campaign_id), s])
            );

            const enrichCampaign = (c) => {
                const stat = statsMap[String(c.id)] || {};
                const totalDonationAmount = Number(stat.total_donation_amount || 0);
                const remainingAmount =
                    stat.remaining_amount !== undefined
                        ? Number(stat.remaining_amount)
                        : Math.max(0, Number(c.campaign_amount || 0) - totalDonationAmount);
                const totalDonors = Number(stat.total_donors || 0);

                const currentDate = moment();
                const endDate = moment(c.ending_date).endOf("day");
                const startDate = moment(c.starting_date);
                const currentStart = moment().startOf("day");

                const daysUntilStart = startDate.diff(currentStart, "days");
                const daysUntilEnd = endDate.diff(currentStart, "days");

                let remainingTime;
                if (daysUntilEnd < 0) remainingTime = "Campaign ended";
                else if (daysUntilStart > 0) remainingTime = `Upcoming in ${daysUntilStart} days`;
                else if (daysUntilEnd === 0) {
                    const remainingHours = endDate.diff(currentDate, "hours");
                    remainingTime = remainingHours <= 0 ? "Campaign ended" : `${remainingHours} hours left`;
                } else remainingTime = `${daysUntilEnd} days left`;

                let gallery = Array.isArray(c.gallery) ? [...c.gallery] : [];
                if (c.image && !gallery.includes(c.image)) gallery.unshift(c.image);

                return {
                    ...c,
                    gallery,
                    totalDonationAmount,
                    remainingAmount,
                    totalDonors,
                    remainingTime,
                };
            };

            const campaign = runningCampaigns.map(enrichCampaign);
            const usersView = users.map((u) => ({
                ...u,
                isVerified: u.is_verified,
            }));

            return res.render("dashboard", {
                totalIntro: 0,
                totalCategory,
                totalUpcomingCampaign,
                totalRunningCampaign,
                totalEndedCampaign,
                totalUserCampaign,
                totalBanner,
                totalUser: userCount,
                totalDonor,
                userActiveCount,
                userCount,
                campaign,
                userCampaign,
                users: usersView,
                IMAGE_URL: process.env.IMAGE_URL || "",
            });
        }

        // count documents
        const totalIntro = await introModel.countDocuments({ status: "Publish" });
        const totalCategory = await categoryModel.countDocuments({ status: "Publish" });
        const totalUpcomingCampaign = await campaignModel.countDocuments({ campaign_status: "Upcoming" });
        const totalRunningCampaign = await campaignModel.countDocuments({ campaign_status: "Running" });
        const totalEndedCampaign = await campaignModel.countDocuments({ campaign_status: "Ended" });
        const totalUserCampaign = await campaignModel.countDocuments({ isApproved: true, isUser: true });
        const totalBanner = await bannerModel.countDocuments({ status: "Publish" });
        const totalUser = await userModel.countDocuments({ is_active: true });
        const totalDonor = await donationModel.countDocuments();
        const userActiveCount = await userModel.countDocuments({ is_active: true });
        const userCount = await userModel.countDocuments();

        // fetch running campaign
        const campaign = await campaignModel.find({ campaign_status: "Running" }).sort({ createdAt: -1 }).limit(5);

        const updatedCampaign = await combineCampaignAndDonation(campaign);

        // fetch user campaign
        const userCampaign = await campaignModel.find({ isUser: true }).sort({ createdAt: -1 }).limit(7).populate("categoryId");

        // fetch lastest user
        const users = await userModel.find().sort({ createdAt: -1 }).limit(7).exec();

        return res.render("dashboard",
            {
                totalIntro, totalCategory, totalUpcomingCampaign, totalRunningCampaign, totalEndedCampaign, totalUserCampaign, totalBanner,
                totalUser, totalDonor, userActiveCount, userCount, campaign: updatedCampaign, userCampaign, users, IMAGE_URL: process.env.IMAGE_URL
            });

        });

    } catch (error) {
        console.log(error.message);
        req.flash("error", "Failed to load dashboard");
        return res.redirect(req.get("referer"));
    }
}

//Load and render the profile view
const loadProfile = async (req, res) => {

    try {

        const profile = isSupabaseDataProvider
            ? await findAdminById(req.session.userId)
            : await adminLoginModel.findById(req.session.userId);

        if (!profile) {
            req.flash("error", "Failed to load profile");
            return res.redirect(process.env.BASE_URL);
        }

        return res.render("profile", { profile, IMAGE_URL: process.env.IMAGE_URL });

    } catch (error) {
        console.log(error.message);
        req.flash("error", "Failed to load profile");
        return res.redirect(req.get("referer"));
    }
}

//Load and render the edit profile view
const loadEditProfile = async (req, res) => {

    try {

        const profile = isSupabaseDataProvider
            ? await findAdminById(req.session.userId)
            : await adminLoginModel.findById(req.session.userId);

        if (!profile) {
            req.flash("error", "Failed to load edit profile");
            return res.redirect(process.env.BASE_URL);
        }

        return res.render("editProfile", { profile, IMAGE_URL: process.env.IMAGE_URL });

    } catch (error) {
        console.log(error.message);
        req.flash("error", "Failed to load edit profile");
        return res.redirect(req.get("referer"));
    }
}

// Edit an existing profile
const editProfile = async (req, res) => {

    try {

        const id = req.body.id || req.session.userId;
        const name = req.body.name;
        const contact = req.body.contact;
        const oldImage = req.body.oldImage

        let avatar = oldImage;
        if (req.file) {
            deleteImage(oldImage)
            avatar = req.file.filename;
        }

        if (isSupabaseDataProvider) {
            await updateAdminById(id, { name, contact, avatar });
        } else {
            await adminLoginModel.findOneAndUpdate({ _id: id }, { $set: { name, contact, avatar } });
        }

        return res.redirect(process.env.BASE_URL + "profile");

    } catch (error) {
        console.log(error.message);
        req.flash("error", "Failed to edit profile");
        return res.redirect(req.get("referer"));
    }
}

//Load and render the change password
const loadChangePassword = async (req, res) => {

    try {

        return res.render("changePassword");

    } catch (error) {
        console.log(error.message);
        req.flash("error", "Failed to load change password");
        return res.redirect(req.get("referer"));
    }
}

//change password
const changePassword = async (req, res) => {

    try {

        const oldPasswordRaw = String(req.body.oldpassword || "");
        const newPasswordRaw = String(req.body.newpassword || "");
        const confirmPasswordRaw = String(req.body.comfirmpassword || "");
        const oldpassword = sha256.x2(oldPasswordRaw);
        const newpassword = sha256.x2(newPasswordRaw);
        const comfirmpassword = sha256.x2(confirmPasswordRaw);

        if (newpassword !== comfirmpassword) {
            req.flash('error', 'Confirm password does not match');
            return res.redirect(req.get("referer"));
        }

        const matchPassword = isSupabaseDataProvider
            ? await findAdminById(req.session.userId)
            : await adminLoginModel.findOne({ _id: req.session.userId });

        if (!matchPassword) {
            req.flash('error', 'Old password is wrong, please try again');
            return res.redirect(req.get("referer"));
        }

        if (oldpassword !== matchPassword.password) {
            if (isSupabaseDataProvider) {
                try {
                    await signInWithPassword(matchPassword.email, oldPasswordRaw);
                } catch (_error) {
                    auditAdminEvent("password_change_failed", req, {
                        email: matchPassword.email,
                        reason: "invalid_old_password",
                    });
                    req.flash('error', 'Old password is wrong, please try again');
                    return res.redirect(req.get("referer"));
                }
            } else {
                req.flash('error', 'Old password is wrong, please try again');
                return res.redirect(req.get("referer"));
            }
        }

        if (isSupabaseDataProvider) {
            const authUser = await findAuthUserByEmail(matchPassword.email);
            if (authUser?.id) {
                await updateAuthUserById(authUser.id, { password: newPasswordRaw });
                if (String(matchPassword.auth_user_id || "") !== String(authUser.id)) {
                    await updateAdminById(req.session.userId, { authUserId: authUser.id });
                }
            } else {
                await ensureAuthUser({
                    email: matchPassword.email,
                    password: newPasswordRaw,
                    appMetadata: { role: "admin" },
                    userMetadata: { name: matchPassword.name || "" },
                    updatePasswordIfExists: true,
                });
            }

            try {
                const authData = await signInWithPassword(matchPassword.email, newPasswordRaw);
                req.session.adminAccessToken =
                    authData?.access_token || authData?.session?.access_token || "";
                req.session.adminRefreshToken =
                    authData?.refresh_token || authData?.session?.refresh_token || "";
                req.session.adminAuthUserId =
                    authData?.user?.id || authData?.session?.user?.id || "";
            } catch (_error) {
                req.session.adminAccessToken = "";
                req.session.adminRefreshToken = "";
                req.session.adminAuthUserId = "";
            }

            auditAdminEvent("password_change_success", req, {
                email: matchPassword.email,
                authUserId: req.session.adminAuthUserId || null,
            });
        } else {
            await adminLoginModel.findOneAndUpdate({ _id: req.session.userId }, { $set: { password: newpassword } }, { new: true });
        }

        return res.redirect(process.env.BASE_URL + "dashboard");

    } catch (error) {
        console.log(error.message);
        if (isSupabaseDataProvider) {
            auditAdminEvent("password_change_error", req, {
                reason: error.message,
            });
        }
        req.flash("error", "Failed to change password");
        return res.redirect(req.get("referer"));
    }
}

// logout
const logout = async (req, res) => {

    try {
        req.session.adminAccessToken = "";
        req.session.adminRefreshToken = "";
        req.session.adminAuthUserId = "";

        // Destroy the session
        req.session.destroy(function (err) {
            if (err) {
                console.error('Error destroying session:', err);
                return res.status(500).send('Internal Server Error');
            }

            // Clear the cookie
            res.clearCookie('connect.sid');

            return res.redirect(process.env.BASE_URL);
        });

    } catch (error) {
        console.log(error.message);
        req.flash("error", "Failed to logout");
        return res.redirect(req.get("referer"));
    }
}

// Load view for mail config
const loadMailConfig = async (req, res) => {

    try {
        await verifyAdminAccess(req, res, async () => {


        const mailData = await mailModel.findOne();

        return res.render("mailConfig", { mailData });
        });

    } catch (error) {
        console.log(error.message);
        req.flash("error", "Failed to load mail config");
        return res.redirect(req.get("referer"));
    }
}

//edit mail config
const mailConfig = async (req, res) => {

    try {

        if (isSupabaseDataProvider) {
            req.flash(
                "warning",
                "Mail config management is still in Mongo migration. Re-enable after mail settings move to Supabase."
            );
            return res.redirect(process.env.BASE_URL + "dashboard");
        }

        const loginData = await adminLoginModel.findById(req.session.userId);

        if (loginData && loginData.isAdmin === 1) {

            // Extract data from the request
            const id = req.body.id;
            const host = req.body.host;
            const port = req.body.port;
            const mail_username = req.body.mail_username;
            const mail_password = req.body.mail_password;
            const encryption = req.body.encryption;
            const senderEmail = req.body.senderEmail;

            let result;

            if (id) {

                // Attempt to find and update an existing document
                result = await mailModel.findByIdAndUpdate(id, { host, port, mail_username, mail_password, encryption, senderEmail }, { new: true });

                if (result) {
                    req.flash("success", "Mail configuration updated successfully.");
                } else {
                    req.flash("error", "Failed to update mail configuration. Try again later...");
                }

            } else {
                // Create a new document if no id is provided
                result = await mailModel.create({ host, port, mail_username, mail_password, encryption, senderEmail });

                if (result) {
                    req.flash("success", "Mail configuration added successfully.");
                } else {
                    req.flash("error", "Failed to add mail configuration. Try again later...");
                }

            }

            return res.redirect(process.env.BASE_URL + "mail-config");

        }
        else {
            req.flash('error', 'You have no access to edit mail config, Only admin have access to this functionality...!!');
            return res.redirect(process.env.BASE_URL + "mail-config");
        }

    } catch (error) {
        console.log(error.message);
        req.flash("error", "Failed to edit mail config");
        return res.redirect(req.get("referer"));
    }
}

// Load forgot password view
const loadForgotPassword = async (req, res) => {
    try {
        return res.render("forgotPassword");
    } catch (error) {
        console.log(error.message);
        req.flash("error", "Failed to load password reset page");
        return res.redirect(process.env.BASE_URL);
    }
};

// Send Supabase password reset email for admins
const sendPasswordResetEmail = async (req, res) => {
    try {
        const email = String(req.body.email || "").trim().toLowerCase();
        if (!email) {
            req.flash("error", "Email is required");
            return res.redirect(req.get("referer") || process.env.BASE_URL);
        }

        const admin = await findAdminByEmail(email);
        if (!admin || !isSuperAdmin(admin)) {
            req.flash("error", "No admin account found for that email");
            return res.redirect(req.get("referer") || process.env.BASE_URL);
        }

        const redirectTo = getPasswordResetRedirectUrl();
        await resetPasswordForEmail({ email, redirectTo });
        auditAdminEvent("password_reset_email_sent", req, { email, redirectTo });
        req.flash("success", "Password reset email sent. Check your inbox.");
        return res.redirect(process.env.BASE_URL);
    } catch (error) {
        logger.error("admin.password_reset_email_failed", {
            err_message: error.message,
            stack: error.stack,
        });
        req.flash("error", getSupabaseErrorMessage(error, "Unable to send reset email"));
        return res.redirect(req.get("referer") || process.env.BASE_URL);
    }
};

// Load reset password view (expects access_token in URL hash)
const loadResetPassword = async (req, res) => {
    try {
        return res.render("resetPassword", {
            accessToken: String(req.query.access_token || "").trim(),
        });
    } catch (error) {
        console.log(error.message);
        req.flash("error", "Failed to load reset page");
        return res.redirect(process.env.BASE_URL);
    }
};

// Handle password reset submission
const completeResetPassword = async (req, res) => {
    try {
        const accessToken = String(req.body.access_token || "").trim();
        const newPassword = String(req.body.newpassword || "");
        const confirmPassword = String(req.body.comfirmpassword || "");

        if (!accessToken) {
            req.flash("error", "Reset link is missing or expired. Please request a new one.");
            return res.redirect(process.env.BASE_URL + "forgot-password");
        }

        if (newPassword.length < 8) {
            req.flash("error", "Password must be at least 8 characters long.");
            return res.redirect(req.get("referer") || process.env.BASE_URL + "reset-password");
        }

        if (newPassword !== confirmPassword) {
            req.flash("error", "Confirm password does not match");
            return res.redirect(req.get("referer") || process.env.BASE_URL + "reset-password");
        }

        await updateUserPasswordWithAccessToken(accessToken, newPassword);
        auditAdminEvent("password_reset_complete", req, {});
        req.flash("success", "Password updated. You can sign in now.");
        return res.redirect(process.env.BASE_URL);
    } catch (error) {
        logger.error("admin.password_reset_complete_failed", {
            err_message: error.message,
            stack: error.stack,
        });
        req.flash("error", getSupabaseErrorMessage(error, "Unable to reset password"));
        return res.redirect(req.get("referer") || process.env.BASE_URL + "reset-password");
    }
};

module.exports = {
    loadLogin,
    login,
    loadDashboard,
    loadProfile,
    loadEditProfile,
    editProfile,
    loadChangePassword,
    changePassword,
    loadForgotPassword,
    sendPasswordResetEmail,
    loadResetPassword,
    completeResetPassword,
    logout,
    loadMailConfig,
    mailConfig
}
