import fs from 'fs'
import https from 'https'

const getFileWithPath = (fileName, filePath) => `${getFilePath(filePath, 'zips')}${fileName}`

const getFilePath = (filePath, appendStr) => `./${filePath}${appendStr}/`

const downloadUrl = (fileUrl, fileName, filePath) => {
    const fileWithPath = getFileWithPath(fileName, filePath)
    if (fs.existsSync(fileWithPath)) {
        return true
    }
    else {
        fs.mkdirSync(getFilePath(filePath, 'zips'), { recursive: true })
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

export { downloadUrl }