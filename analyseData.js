import fs from 'fs'
import moment from 'moment'

const generateRowData = (tickerData, ticker, startingDate, numOfDays) => {
    const currentDate = startingDate.clone()
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
                else if(cellData.close > 0) {
                    data.push(cellData.close)
                }
            }
            else {
                // data.push(cellData)
            }
        }
        currentDate.add(1, "days")
    }
    return data
}
const analyseData = (startingDateStr, endingDateStr) => {
    fs.readFile('data.json', 'utf8', function readFileCallback(err, data) {
        if (err) {
            console.log(err);
        } else {
            const startingDate = moment(startingDateStr, 'DD/MM/YYYY HH:mm')
            const endingDate = moment(endingDateStr, 'DD/MM/YYYY HH:mm')            
            const numOfDays = endingDate.diff(startingDate, "days")
            const obj = JSON.parse(data); //now it an object
            let writeStream = fs.createWriteStream('./data.csv')
            Object.keys(obj).map(ticker => {
                const rowData = generateRowData(
                    obj[ticker],
                    ticker,
                    startingDate,
                    numOfDays)
                if (rowData.length > numOfDays * 0.5){
                    writeStream.write(rowData.join(',') + '\n', () => { })
                }
            })
        }
    });
}


export { analyseData }