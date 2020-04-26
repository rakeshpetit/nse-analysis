import fs from 'fs'
import https from 'https'

const downloadUrl = (fileUrl, fileName, filePath) => {
    const fileWithPath = `./${filePath}/zips/${fileName}`
    if (fs.existsSync(fileWithPath)) {
        return true
    }
    else {
        fs.mkdirSync(`./${filePath}/zips`, { recursive: true })
    }
    const file = fs.createWriteStream(fileWithPath);
    https.get(fileUrl, function (response) {
        response.pipe(file);
        file.on('finish', function () {
            file.close();
        });
    }).on('error', function (err) { 
        // Handle errors
        console.log(err)
        fs.unlink(dest);
    });
}

export { downloadUrl }