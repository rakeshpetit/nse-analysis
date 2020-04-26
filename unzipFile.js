import fs from 'fs'
import StreamZip from 'node-stream-zip'
import { getFileWithPath, getFilePath } from './downloadUrl'

const unZip = (urls) => {
    urls.map(({ url, fileName, filePath }) => {
        const directoryPath = getFilePath(filePath, 'csvs')
        console.log(directoryPath)
        fs.mkdirSync(directoryPath, { recursive: true });
        const fileWithPath = getFileWithPath(fileName, filePath, 'zips')
        const zip = new StreamZip({
            file: fileWithPath,
            storeEntries: true
        });

        zip.on('ready', () => {
            zip.extract(null, directoryPath, (err, count) => {
                console.log(err ? 'Extract error' : `Extracted ${count} entries`);
                zip.close();
            });
        });
    })

}

export { unZip }