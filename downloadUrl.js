import fs from 'fs'
import https from 'https'

const downloadUrl = (fileUrl) => {
    const file = fs.createWriteStream('./files');
    const request = https.get(fileUrl, function (response) {
        response.pipe(file);
        file.on('finish', function () {
            file.close(cb);  // close() is async, call cb after close completes.
        });
    }).on('error', function (err) { // Handle errors
        fs.unlink(dest); // Delete the file async. (But we don't check the result)
        if (cb) cb(err.message);
    });
}

export { downloadUrl }