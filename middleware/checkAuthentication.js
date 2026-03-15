// Importing required modules 
const passport = require('passport');

require("../config/passport")

const checkAuthentication = (req, res, next) => {

    passport.authenticate('jwt', { session: false }, async (err, user, info) => {

        try {

            if (err) {
                return next(err);
            }

            // If authentication fails
            if (!user) {
                return res.json({ data: { success: 0, message: "Please, Sign In....", error: 1 } });
            }
            else {
                req.user = user;
                return next();
            }

        } catch (error) {
            console.error('Error during authorization:', error);
            return next(error);
        }

    })(req, res, next);
};

module.exports = { checkAuthentication };