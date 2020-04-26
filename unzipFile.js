import fs from 'fs'
import StreamZip from 'node-stream-zip'
import { getFileWithPath, getFilePath } from './downloadUrl'

const unZip = (url, fileName, filePath) => {
    try {
        const directoryPath = getFilePath(filePath, 'csvs')
        fs.mkdirSync(directoryPath, { recursive: true });
        const fileWithPath = getFileWithPath(fileName, filePath, 'zips')
        const zip = new StreamZip({
            file: fileWithPath,
            storeEntries: true
        });
        zip.on('error', () => {
            return true
        })
        zip.on('ready', () => {
            zip.extract(null, directoryPath, (err, count) => {
                zip.close();
            });
        });
    }
    catch(e) {
        console.log("Error at", url)
        console.log(e)
    }  
}

export { unZip }