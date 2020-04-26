import fs from 'fs'
import moment from 'moment'

const generateRowData = (tickerData, ticker, startingDateStr, endingDateStr) => {
    const startingDate = moment(startingDateStr, 'DD/MM/YYYY HH:mm')
    const endingDate = moment(endingDateStr, 'DD/MM/YYYY HH:mm')
    const currentDate = startingDate.clone()
    const numOfDays = endingDate.diff(startingDate, "days")
    let data = []
    data.push(ticker)
    for (let i = 0; i <= numOfDays; i++) {
        const day = currentDate.format('d')
        if (day > 0 && day < 6) {
            const date = currentDate.format('DD')
            const year = currentDate.format('YYYY')
            const month = currentDate.format('MM').toUpperCase()
            const dateKey = `${date}/${month}/${year}`
            const cellData = tickerData[dateKey]
            if (cellData) {
                if (cellData.close === 'CLOSE') {
                    data.push(dateKey)
                }
                else {
                    data.push(cellData.close)
                }
            }
            else {
                data.push(cellData)
            }
        }
        currentDate.add(1, "days")
    }
    return data
}
const analyseData = (startingDateStr, endingDateStr) => {
    fs.readFile('data1.json', 'utf8', function readFileCallback(err, data) {
        if (err) {
            console.log(err);
        } else {
            const obj = JSON.parse(data); //now it an object
            let writeStream = fs.createWriteStream('./data1.csv')
            Object.keys(obj).map(ticker => {
                const rowData = generateRowData(
                    obj[ticker],
                    ticker,
                    startingDateStr,
                    endingDateStr)
                writeStream.write(rowData.join(',') + '\n', () => { })
            })
        }
    });
}


export { analyseData }