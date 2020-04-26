import fs from 'fs'
import https from 'https'

const getFileWithPath = (fileName, filePath, appendStr) => `${getFilePath(filePath, appendStr)}${fileName}`

const getFilePath = (filePath, appendStr) => `./${filePath}${appendStr}/`

const downloadUrl = (fileUrl, fileName, filePath) => {
    const appendStr = 'zips'
    const fileWithPath = getFileWithPath(fileName, filePath, appendStr)
    if (fs.existsSync(fileWithPath)) {
        return true
    }
    else {
        fs.mkdirSync(getFilePath(filePath, appendStr), { recursive: true })
    }
    const file = fs.createWriteStream(fileWithPath);
    https.get(fileUrl, function (response) {
        response.pipe(file);
        file.on('finish', function () {
            file.close();
            console.log('Done with:', fileName)
        });
    }).on('error', function (err) { 
        // Handle errors
        console.log(err)
        fs.unlink(dest);
    });
}

export { downloadUrl, getFilePath, getFileWithPath }