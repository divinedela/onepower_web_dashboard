//Import required modules
const mongoose = require("mongoose");

const connectUrl = process.env.DB_CONNECTION;

mongoose.connect(connectUrl).then(() => {

    console.log("DB Connect");

}).catch((error) => {

    console.log("Not connect", error);

})