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
    const options = {
        headers: { 
            // 'Accept-Encoding': 'gzip, deflate, sdch, br',
            // 'Accept-Language': 'fr-FR,fr;q=0.8,en-US;q=0.6,en;q=0.4',
            // 'Host': 'www.nseindia.com',
            'Referer': 'https://www.nseindia.com/',
            // 'User-Agent': 'Mozilla/5.0 (X11; Linux i686) AppleWebKit/537.36 (KHTML, like Gecko) Ubuntu Chromium/53.0.2785.143 Chrome/53.0.2785.143 Safari/537.36',
            // 'X-Requested-With': 'XMLHttpRequest'
        },
    };
    https.get(fileUrl, options, function (response) {
        response.pipe(file);
        console.log(response.statusCode)
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