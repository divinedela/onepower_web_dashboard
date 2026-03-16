// Importing models
const adminLoginModel = require("../model/adminLoginModel");
const { findAdminById } = require("../services/supabaseAdminLoginService");

const dataProvider = (process.env.DATA_PROVIDER || "mongodb").toLowerCase();
const isSupabaseDataProvider = dataProvider === "supabase";

const isLogin = async (req, res, next) => {

    try {

        if (req.session.userId) {
            const admin = isSupabaseDataProvider
                ? await findAdminById(req.session.userId)
                : await adminLoginModel.findById({ _id: req.session.userId });
            if (!admin) {
                req.session.destroy(() => {});
                return res.redirect(process.env.BASE_URL);
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
