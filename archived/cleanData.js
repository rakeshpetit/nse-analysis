import fs from 'fs'
import moment from 'moment'

const fetchJSONdata = (startingDate, endingDate, year) => {
    
    return new Promise((resolve, reject) => {
        fs.readFile(`data${year}.json`, 'utf8', function readFileCallback(err, data) {
            if (err) {
                console.log(err);
                reject(err)
            } else {
                const numOfDays = endingDate.diff(startingDate, "days")
                const obj = JSON.parse(data); //now it an object
                let cleanedData = {}
                Object.keys(obj).map(ticker => {
                    const numberOfDataPoints = Object.keys(obj[ticker]).length
                    if (numberOfDataPoints > numOfDays * 0.5) {
                        cleanedData[ticker] = obj[ticker]
                    }
                })
                resolve(cleanedData)
            }
        });
    })
}
const cleanData = (startingDateStr, endingDateStr) => {
    const startingDate = moment(startingDateStr, 'DD/MM/YYYY HH:mm')
    const endingDate = moment(endingDateStr, 'DD/MM/YYYY HH:mm')
    const startYear = startingDate.format('YYYY')
    const endYear = endingDate.format('YYYY')
    // console.log('starting', startYear)
    // console.log('end', endYear)
    // return fetchJSONdata(startingDate, endingDate, endYear)
    const allData = {}
    let allDataPromise = []
    for (let year = startYear; year <= endYear; year++){
        allDataPromise.push(fetchJSONdata(startingDate, endingDate, year ))
    }
    return Promise.all(allDataPromise).then((data) => {
         data.map(yearly => {
            Object.keys(yearly).map(ticker => {
                const currentTickerData = yearly[ticker]
                const filteredTickData = Object.keys(currentTickerData)
                    .filter(key => {
                        const keyDate = moment(key, 'DD/MM/YYYY')
                        return keyDate.isBetween(startingDate,endingDate)
                    })
                    .reduce((obj, key) => {
                        obj[key] = currentTickerData[key];
                        return obj;
                    }, {});
                allData[ticker] = { ...allData[ticker], ...filteredTickData}
            })
            // console.log('tegw',Object.keys(yearly['3MINDIA']))
            //  allData

         })
         return allData
        // return data[1]
    })
}


export { cleanData }