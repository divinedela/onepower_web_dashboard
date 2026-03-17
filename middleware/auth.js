const {
  findAdminById,
  findAdminByAuthUserId,
} = require("../services/supabaseAdminLoginService");
const { getAuthUserByAccessToken } = require("../services/supabaseAuthProviderService");

const isSupabaseDataProvider = true;

function isAdminRole(admin) {
    return Number(admin?.isAdmin ?? admin?.is_admin ?? 0) === 1;
}

const isLogin = async (req, res, next) => {

    try {

        if (req.session.userId) {
            const admin = await findAdminById(req.session.userId);
            if (!admin) {
                req.session.destroy(() => {});
                return res.redirect(process.env.BASE_URL);
            }

            if (isSupabaseDataProvider) {
                const accessToken = String(req.session.adminAccessToken || "").trim();
                if (!accessToken) {
                    req.session.destroy(() => {});
                    return res.redirect(process.env.BASE_URL);
                }

                try {
                    const authUser = await getAuthUserByAccessToken(accessToken);
                    const authEmail = String(authUser?.email || "").trim().toLowerCase();
                    const authUserId = String(authUser?.id || "").trim();
                    const adminEmail = String(admin.email || "").trim().toLowerCase();

                    if (!isAdminRole(admin)) {
                        req.session.destroy(() => {});
                        return res.redirect(process.env.BASE_URL);
                    }

                    if (!authUserId || !authEmail || authEmail !== adminEmail) {
                        req.session.destroy(() => {});
                        return res.redirect(process.env.BASE_URL);
                    }

                    if (String(admin.auth_user_id || "").trim()) {
                        if (String(admin.auth_user_id).trim() !== authUserId) {
                            req.session.destroy(() => {});
                            return res.redirect(process.env.BASE_URL);
                        }
                    } else {
                        const mappedAdmin = await findAdminByAuthUserId(authUserId);
                        if (!mappedAdmin || String(mappedAdmin.id) !== String(admin.id)) {
                            req.session.destroy(() => {});
                            return res.redirect(process.env.BASE_URL);
                        }
                    }

                    const role = String(authUser?.app_metadata?.role || "").trim().toLowerCase();
                    if (role && role !== "admin") {
                        req.session.destroy(() => {});
                        return res.redirect(process.env.BASE_URL);
                    }
                } catch (_error) {
                    req.session.destroy(() => {});
                    return res.redirect(process.env.BASE_URL);
                }
            }

            res.locals.admin = admin;
            next();
        }
        else {
            return res.redirect(process.env.BASE_URL);
        }

    } catch (error) {
        console.log(error.message);
        return res.redirect(process.env.BASE_URL);
    }
}

const isLogout = async (req, res, next) => {

    try {

        if (req.session.userId) {
            return res.redirect(process.env.BASE_URL + 'dashboard');
        }
        next();

    } catch (error) {
        console.log(error.message);
    }

}

module.exports = {
    isLogin,
    isLogout,
}
