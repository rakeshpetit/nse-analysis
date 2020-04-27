import fs from 'fs';
import path from 'path';
import * as csv from 'fast-csv';
import { getFileWithPath, getFilePath } from './downloadUrl'

const collateData = (urls) => {
    let currentData = {}
    urls.map(({ fileDate, csvFileName, filePath }) => {
        const fileName = getFileWithPath(csvFileName, filePath, 'csvs')
        if (!fs.existsSync(fileName)) {
            return
        }
        try {
            const headers = [
                'SYMBOL', 'SERIES', undefined,
                undefined, undefined, 'CLOSE',
                undefined, undefined, undefined,
                'TOTTRDVAL', undefined, undefined,
                undefined, undefined, undefined,
            ]
            fs.createReadStream(fileName)
                .pipe(csv.parse({ headers }))
                .on('error', error => console.error(error))
                .on('data', (row) => {
                    const symbol = row['SYMBOL']
                    if (!currentData[symbol]) {
                        currentData[symbol] = {}
                    }
                    const currentSymbol = currentData[symbol]
                    if (row['SERIES'] === 'EQ'
                        && +row['CLOSE'] > 100
                        && +row['TOTTRDVAL'] > 1000000) {
                        const data = {
                            close: row['CLOSE'],
                            //  value: row['TOTTRDVAL']
                        }
                        currentSymbol[fileDate] = data
                    }
                })
                .on('end', (rowCount) => {
                    fs.writeFile('data.json', JSON.stringify(currentData), 'utf8', () => { });
                });
        }
        catch (e) {
            console.log('e', e)
        }
    })
}

export { collateData }