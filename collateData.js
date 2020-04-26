import fs from 'fs';
import path from 'path';
import * as csv from 'fast-csv';
import { getFileWithPath, getFilePath } from './downloadUrl'

const collateData = (urls) => {
    urls.map(({ url, csvFileName, filePath }) => {
        const fileName = getFileWithPath(csvFileName, filePath, 'csvs')
        if (!fs.existsSync(fileName)) {
            return
        }
        try{
            fs.createReadStream(fileName)
                .pipe(csv.parse({ headers: true }))
                .on('error', error => console.error(error))
                .on('data', row => { })
                .on('end', (rowCount) => console.log(`Parsed ${fileName} with ${rowCount} rows`));
        }
        catch(e){

        }
    })
}

export { collateData }