const { verifyAdminAccess } = require("../config/verification");
const { findAdminById } = require("../services/supabaseAdminLoginService");
const {
  listIntros,
  getIntroById,
  createIntro,
  updateIntroById,
  deleteIntroById,
  toggleIntroStatus,
} = require("../services/supabaseIntroService");
const deleteImage = require("../services/deleteImage");

function isSuperAdmin(admin) {
  return Number(admin?.isAdmin ?? admin?.is_admin ?? 0) === 1;
}

async function getCurrentAdmin(req) {
  const adminId = req.session?.userId;
  if (!adminId) return null;
  return findAdminById(adminId);
}

async function guardIntroWriteAccess(req, res, redirectPath) {
  const admin = await getCurrentAdmin(req);
  if (!admin) {
    req.flash("error", "Admin session not found. Please login again.");
    res.redirect(process.env.BASE_URL);
    return null;
  }

  if (!isSuperAdmin(admin)) {
    req.flash(
      "error",
      "You do not have permission to modify intro content. As a demo admin, you can only view the content."
    );
    res.redirect(redirectPath);
    return null;
  }

  return admin;
}

const loadAddIntro = async (req, res) => {
  try {
    return res.render("addIntro");
  } catch (error) {
    console.log(error.message);
    req.flash("error", "Failed to load add intro");
    return res.redirect(process.env.BASE_URL + "intro");
  }
};

const addIntro = async (req, res) => {
  try {
    const admin = await guardIntroWriteAccess(
      req,
      res,
      process.env.BASE_URL + "add-intro"
    );
    if (!admin) {
      if (req.file?.filename) deleteImage(req.file.filename);
      return;
    }

    if (!req.file?.filename) {
      req.flash("error", "Intro image is required.");
      return res.redirect(process.env.BASE_URL + "add-intro");
    }

    const payload = {
      image: req.file.filename,
      title: req.body.title,
      description: req.body.description,
    };

    await createIntro(payload);

    return res.redirect(process.env.BASE_URL + "intro");
  } catch (error) {
    console.log(error.message);
    req.flash("error", "Failed to add intro");
    return res.redirect(process.env.BASE_URL + "intro");
  }
};

const loadIntro = async (req, res) => {
  try {
    await verifyAdminAccess(req, res, async () => {
      const intro = await listIntros();
      const loginData = res.locals.admin ? [res.locals.admin] : [];

      return res.render("intro", {
        intro,
        IMAGE_URL: process.env.IMAGE_URL,
        loginData,
      });
    });
  } catch (error) {
    console.log(error.message);
    req.flash("error", "Failed to load intro");
    return res.redirect(req.get("referer"));
  }
};

const loadEditIntro = async (req, res) => {
  try {
    const id = req.query.id;
    if (!id) {
      req.flash("error", "Invalid intro id.");
      return res.redirect(process.env.BASE_URL + "intro");
    }

    const intro = await getIntroById(id);

    if (!intro) {
      req.flash("error", "Intro not found.");
      return res.redirect(process.env.BASE_URL + "intro");
    }

    return res.render("editIntro", { intro, IMAGE_URL: process.env.IMAGE_URL });
  } catch (error) {
    console.log(error.message);
    req.flash("error", "Failed to load edit intro");
    return res.redirect(req.get("referer"));
  }
};

const editIntro = async (req, res) => {
  const id = req.body.id;
  try {
    const admin = await guardIntroWriteAccess(
      req,
      res,
      process.env.BASE_URL + "intro"
    );
    if (!admin) return;

    if (!id) {
      req.flash("error", "Invalid intro id.");
      return res.redirect(process.env.BASE_URL + "intro");
    }

    const title = req.body.title;
    const description = req.body.description;
    const oldImage = req.body.oldImage;

    let image = oldImage;
    if (req.file?.filename) {
      if (oldImage) deleteImage(oldImage);
      image = req.file.filename;
    }

    await updateIntroById(id, { title, description, image });

    return res.redirect(process.env.BASE_URL + "intro");
  } catch (error) {
    console.log(error.message);
    req.flash("error", "Failed to edit intro");
    return res.redirect(process.env.BASE_URL + "edit-intro?id=" + id);
  }
};

const deleteIntro = async (req, res) => {
  try {
    const admin = await guardIntroWriteAccess(
      req,
      res,
      process.env.BASE_URL + "intro"
    );
    if (!admin) return;

    const id = req.query.id;
    if (!id) {
      req.flash("error", "Invalid intro id.");
      return res.redirect(process.env.BASE_URL + "intro");
    }

    const intro = isSupabaseDataProvider
      ? await getIntroById(id)
      : await introModel.findById(id);

    if (!intro) {
      req.flash("error", "Intro not found.");
      return res.redirect(process.env.BASE_URL + "intro");
    }

    if (intro.image) deleteImage(intro.image);

    await deleteIntroById(id);

    return res.redirect(process.env.BASE_URL + "intro");
  } catch (error) {
    console.log(error.message);
    req.flash("error", "Failed to delete intro");
    return res.redirect(process.env.BASE_URL + "intro");
  }
};

const updateIntroStatus = async (req, res) => {
  try {
    const admin = await guardIntroWriteAccess(
      req,
      res,
      process.env.BASE_URL + "intro"
    );
    if (!admin) return;

    const id = req.query.id;
    if (!id) {
      req.flash("error", "Something went wrong. Please try again.");
      return res.redirect(process.env.BASE_URL + "intro");
    }

    const updated = await toggleIntroStatus(id);
    if (!updated) {
      req.flash("error", "Intro not found.");
    }

    return res.redirect(process.env.BASE_URL + "intro");
  } catch (error) {
    console.error(error.message);
    req.flash("error", "Something went wrong. Please try again.");
    return res.redirect(process.env.BASE_URL + "intro");
  }
};

module.exports = {
  loadAddIntro,
  addIntro,
  loadIntro,
  loadEditIntro,
  editIntro,
  deleteIntro,
  updateIntroStatus,
};
