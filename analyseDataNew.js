import moment from 'moment'
import { cleanData } from './cleanData'
import { exceptionList } from './config'
import { findSharpe } from './analyseData'
import { store } from './'

const getCleanData = (dateStr) => {
    const dateMoment = moment(dateStr, 'DD/MM/YYYY')
    const oneYearStrBeforeCurrent = dateMoment.clone().subtract(1, "year").format('DD/MM/YYYY');
    const oneYearStrAfterCurrent = dateMoment.clone().add(1, "year").format('DD/MM/YYYY');
    const nextMonthMoment = dateMoment.clone().add(1, "month")
    let nextMonthData = {}
    return cleanData(oneYearStrBeforeCurrent, dateStr).then((cleanedData) => {
        {
            // console.log('c', cleanedData)
            store.dispatch({ type: 'CLEANED_DATA_PAST', data: cleanedData })
        }
    }).then(() => cleanData(dateStr, oneYearStrAfterCurrent))
        .then((cleanedData) => {
            {
                // console.log('c', cleanedData)s
                store.dispatch({ type: 'CLEANED_DATA_CURRENT', data: cleanedData })
            }
        })
}

const analyseData = (startingDateStr, endingDateStr) => {
    const cleanedData = store.getState()['cleanLastYearPrice']
    const startingDate = moment(startingDateStr, 'DD/MM/YYYY HH:mm')
    const endingDate = moment(endingDateStr, 'DD/MM/YYYY HH:mm')
    const numOfDays = endingDate.diff(startingDate, "days")
    const sharpeSqrt = Math.sqrt(numOfDays)
    let diffData = {}
    Object.keys(cleanedData).map(ticker => {
        const tickerData = Object.keys(cleanedData[ticker])
        if(tickerData.length > 0) {
            tickerData.sort((a, b) => {
                const dateA = moment(a, 'DD/MM/YYYY')
                const dateB = moment(b, 'DD/MM/YYYY')
                return dateA.isSameOrAfter(dateB) ? 1 : -1
            })
            const percentData = []
            let startPrice = 50000
            let endPrice = 1
            for (let i = 0; i < tickerData.length; i++) {
                const currentDay = tickerData[i]
                const previousDay = i > 0 ? tickerData[i - 1] : currentDay
                const currentDayData = cleanedData[ticker][currentDay].close
                const currentDayValue = cleanedData[ticker][currentDay].value
                if (i === 0) {
                    startPrice = currentDayData
                }
                if (i === tickerData.length - 1) {
                    endPrice = currentDayData
                }
                const previousDayData = cleanedData[ticker][previousDay].close
                const percentDiff = 100 * (currentDayData - previousDayData) / previousDayData
                percentData.push({
                    currentDay, percentDiff, currentDayValue
                })
            }
            const analysis = findSharpe(percentData, sharpeSqrt)
            diffData[ticker] = {
                percentData,
                overallDiff: 100 * (endPrice - startPrice) / endPrice,
                analysis
            }
        }
    })
    console.log(diffData)
}

export { getCleanData, analyseData }