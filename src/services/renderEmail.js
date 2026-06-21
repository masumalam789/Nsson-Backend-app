const path = require("path");
const ejs = require("ejs");

const renderEmail = async (templateName, data = {}) => {
  const templatePath = path.join(
    process.cwd(),
    "src",
    "templates",
    "emails",
    `${templateName}.ejs`,
  );

  return ejs.renderFile(templatePath, data);
};

module.exports = renderEmail;
