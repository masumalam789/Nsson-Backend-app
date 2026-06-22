const path = require("path");
const ejs = require("ejs");

const renderEmail = async (templateName, data = {}) => {
  // Step 1: render the inner content (no DOCTYPE, just the body fragment)
  const contentPath = path.join(
    process.cwd(),
    "src",
    "templates",
    "emails",
    `${templateName}.ejs`,
  );
  const content = await ejs.renderFile(contentPath, data);

  // Step 2: wrap in layout
  const layoutPath = path.join(
    process.cwd(),
    "src",
    "templates",
    "emails",
    "layout",
    "main.ejs",
  );
  return ejs.renderFile(layoutPath, { ...data, content });
};

module.exports = renderEmail;
