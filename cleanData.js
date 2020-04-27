import fs from 'fs'
import moment from 'moment'

const cleanData = (startingDateStr, endingDateStr, cb) => {
    fs.readFile('data.json', 'utf8', function readFileCallback(err, data) {
        if (err) {
            console.log(err);
        } else {
            const startingDate = moment(startingDateStr, 'DD/MM/YYYY HH:mm')
            const endingDate = moment(endingDateStr, 'DD/MM/YYYY HH:mm')
            const numOfDays = endingDate.diff(startingDate, "days")
            const obj = JSON.parse(data); //now it an object
            let cleanedData = {}
            Object.keys(obj).map(ticker => {
                // console.log(ticker)
                const numberOfDataPoints = Object.keys(obj[ticker]).length
                if (numberOfDataPoints > numOfDays * 0.5) {
                    cleanedData[ticker] = obj[ticker]
                }
            })
            cb(cleanedData)
        }
    });
}


export { cleanData }