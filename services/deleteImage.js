// Importing required modules 
const fs = require("fs");

// Defining the path where uploaded images are stored
const imagePath = './uploads/'

// Function to delete an uploaded file
function deleteImages(filename) {

    try {

        if (fs.existsSync(imagePath + filename)) {

            fs.unlinkSync(imagePath + filename);

        }

    } catch (error) {
        console.error(`Error deleting file`, error.message);
        throw error;
    }
}

module.exports = deleteImages;