const { verifyAdminAccess } = require("../config/verification");
const { findAdminById } = require("../services/supabaseAdminLoginService");
const { getPagesSingleton, upsertPages } = require("../services/supabaseContentService");

const sanitize = (text) => (text || "").replace(/"/g, "&quot;");

const loadPrivatePolicy = async (req, res) => {
  try {
    await verifyAdminAccess(req, res, async () => {
      const privatePolicy = await getPagesSingleton();
      return res.render("privatePolicy", { privatePolicy });
    });
  } catch (error) {
    console.log(error.message);
    req.flash("error", "Something went wrong. Please try again.");
    return res.redirect(req.get("referer"));
  }
};

const addPrivatePolicy = async (req, res) => {
  try {
    const admin = await findAdminById(req.session.userId);
    if (!admin || Number(admin.isAdmin ?? admin.is_admin ?? 0) !== 1) {
      req.flash(
        "error",
        "You do not have permission to change private policy. As a demo admin, you can only view the content."
      );
      return res.redirect(process.env.BASE_URL + "private-policy");
    }

    const private_policy = sanitize(req.body.private_policy);
    await upsertPages({ private_policy });
    req.flash("success", "Privacy policy saved.");
    return res.redirect(process.env.BASE_URL + "private-policy");
  } catch (error) {
    console.log(error.message);
    req.flash("error", "Something went wrong. Please try again.");
    return res.redirect(req.get("referer"));
  }
};

const loadTermsAndCondition = async (req, res) => {
  try {
    await verifyAdminAccess(req, res, async () => {
      const termsAndCondition = await getPagesSingleton();
      return res.render("termsAndCondition", { termsAndCondition });
    });
  } catch (error) {
    console.log(error.message);
    req.flash("error", "Something went wrong. Please try again.");
    return res.redirect(req.get("referer"));
  }
};

const addTermsAndCondition = async (req, res) => {
  try {
    const admin = await findAdminById(req.session.userId);
    if (!admin || Number(admin.isAdmin ?? admin.is_admin ?? 0) !== 1) {
      req.flash(
        "error",
        "You do not have permission to change terms and conditions. As a demo admin, you can only view the content."
      );
      return res.redirect(process.env.BASE_URL + "terms-and-condition");
    }

    const terms_and_condition = sanitize(req.body.terms_and_condition);
    await upsertPages({ terms_and_condition });
    req.flash("success", "Terms and conditions saved.");
    return res.redirect(process.env.BASE_URL + "terms-and-condition");
  } catch (error) {
    console.log(error.message);
    req.flash("error", "Something went wrong. Please try again.");
    return res.redirect(req.get("referer"));
  }
};

const loadAboutUs = async (req, res) => {
  try {
    await verifyAdminAccess(req, res, async () => {
      const aboutUs = await getPagesSingleton();
      return res.render("aboutUs", { aboutUs });
    });
  } catch (error) {
    console.log(error.message);
    req.flash("error", "Something went wrong. Please try again.");
    return res.redirect(req.get("referer"));
  }
};

const addAboutUs = async (req, res) => {
  try {
    const admin = await findAdminById(req.session.userId);
    if (!admin || Number(admin.isAdmin ?? admin.is_admin ?? 0) === 0) {
      req.flash(
        "error",
        "You do not have permission to change About Us content. As a demo admin, you can only view the content."
      );
      return res.redirect(process.env.BASE_URL + "about-us");
    }

    const about_us = sanitize(req.body.about_us_content);
    await upsertPages({ about_us });
    req.flash("success", "About Us content saved.");
    return res.redirect(process.env.BASE_URL + "about-us");
  } catch (error) {
    console.log("Error updating About Us:", error.message);
    req.flash("error", "Failed to update About Us content");
    return res.redirect(process.env.BASE_URL + "about-us");
  }
};

module.exports = {
  loadPrivatePolicy,
  addPrivatePolicy,
  loadTermsAndCondition,
  addTermsAndCondition,
  loadAboutUs,
  addAboutUs,
};
