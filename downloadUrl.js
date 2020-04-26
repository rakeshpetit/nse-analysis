import fs from 'fs'
import https from 'https'

const downloadUrl = (fileUrl, fileName, filePath) => {
    if (fs.existsSync(fileName)) {
        return
    }
    console.log(fileName)
    const file = fs.createWriteStream(fileName);
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