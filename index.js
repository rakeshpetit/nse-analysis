import moment from 'moment'
import { getURLs } from './getDates'
import { downloadAsync, unZipAsync } from './downloadAsync'
import { collateData } from './collateData'
import { writeToCsv } from './dataToCsv'
import { cleanData } from './cleanData'
const startingDateStr = '01/01/2019'
const endingDateStr = '31/12/2019'

const urls = getURLs(startingDateStr, endingDateStr)
// console.log(urls)
// downloadAsync(urls)
// unZipAsync(urls)
// collateData(urls)
cleanData(startingDateStr, endingDateStr, (cleanedData) => {
    // console.log(cleanedData)
    const startingDate = moment(startingDateStr, 'DD/MM/YYYY HH:mm')
    const endingDate = moment(endingDateStr, 'DD/MM/YYYY HH:mm')
    const currentDate = startingDate.clone()
    const numOfDays = endingDate.diff(startingDate, "days")
    let diffData = {}
    Object.keys(cleanedData).map(ticker => {
        const tickerData = Object.keys(cleanedData[ticker])
        tickerData.sort((a,b) => {
            const dateA = moment(a, 'DD/MM/YYYY')
            const dateB = moment(b, 'DD/MM/YYYY')
            return dateA.isSameOrAfter(dateB) ? 1 : -1
        })
        const diffPercentData = []
        for(let i=0; i<tickerData.length; i++) {
            const currentDay = tickerData[i]
            const previousDay = i > 0 ? tickerData[i-1] : currentDay
            const currentDayData = cleanedData[ticker][currentDay].close
            const previousDayData = cleanedData[ticker][previousDay].close
            const percentDiff = 100 * (currentDayData - previousDayData) / previousDayData
            diffPercentData.push({
                currentDate: currentDay,
                percentDiff: percentDiff
            })
        }
        diffData[ticker] = {
            percentData: diffPercentData
        }
    })
    console.log(diffData['ZYDUSWELL'])
})


// writeToCsv(startingDateStr, endingDateStr)