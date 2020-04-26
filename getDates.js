import moment from 'moment'

const getURLs = (startingDateStr, endingDateStr) => {
    const startingDate = moment(startingDateStr, 'DD/MM/YYYY HH:mm')
    const endingDate = moment(endingDateStr, 'DD/MM/YYYY HH:mm')
    const currentDate = startingDate.clone()
    const numOfDays = endingDate.diff(startingDate, "days")
    let urls = []
    for (let i = 0; i <= numOfDays; i++) {
        const day = currentDate.format('d')
        if (day > 0 && day < 6)
        {
            const date = currentDate.format('DD')
            const year = currentDate.format('YYYY')
            const month = currentDate.format('MMM').toUpperCase()
            const fileName = `cm${date}${month}${year}bhav.csv.zip`
            const url = `https://www1.nseindia.com/content/historical/EQUITIES/${year}/${month}/${fileName}`
            urls.push({
                url,
                fileName: `${date}${month}${year}.zip`,
                csvFileName: `cm${date}${month}${year}bhav.csv`,
                filePath: `files/${year}/${month}/`,
                fileDate: currentDate.format('DD/MM/YYYY')
            })
        }
        currentDate.add(1, "days")
    }
    return urls
}

export { getURLs }