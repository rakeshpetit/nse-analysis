function extractDateFromFileName(filePath) {
  const fileName = filePath.split("/").pop();
  const datePattern = /(\d{2}[A-Za-z]{3}\d{4})/;
  const match = fileName.match(datePattern);
  if (match) {
    const dateStr = match[0];
    const date = new Date(dateStr);
    const formattedDate = date.toISOString().split("T")[0];
    return formattedDate;
  }
  throw new Error("Date not found in file name");
}

module.exports = { extractDateFromFileName };
