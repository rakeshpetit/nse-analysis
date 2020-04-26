import fs from 'fs';
import path from 'path';
import * as csv from 'fast-csv';
import { getFileWithPath, getFilePath } from './downloadUrl'

const collateData = (urls) => {
    urls.map(({ url, csvFileName, filePath }) => {
        // const csvFilePath = getFilePath(filePath, 'csvs')
        const fileName = getFileWithPath(csvFileName, filePath, 'csvs')
        console.log('fileName', fileName)
        fs.createReadStream(fileName)
            .pipe(csv.parse({ headers: true }))
            .on('error', error => console.error(error))
            .on('data', row => console.log(row))
            .on('end', (rowCount) => console.log(`Parsed ${rowCount} rows`));
    })
}

export { collateData }