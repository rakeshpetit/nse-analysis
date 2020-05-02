import moment from 'moment'
import { cleanData } from './cleanData'

const findSharpe = (percentData, dataSize) => {
    const average = percentData.reduce((sum, dailyPercent) => {
        return sum + dailyPercent.percentDiff
    }, 0)
    return dataSize * average / percentData.length
}

const analyseData = (startingDateStr, endingDateStr) => {
    return cleanData(startingDateStr, endingDateStr).then((cleanedData) => {
        {
            const startingDate = moment(startingDateStr, 'DD/MM/YYYY HH:mm')
            const endingDate = moment(endingDateStr, 'DD/MM/YYYY HH:mm')
            const numOfDays = endingDate.diff(startingDate, "days")
            const sharpeSqrt = Math.sqrt(numOfDays)
            let diffData = {}
            Object.keys(cleanedData).map(ticker => {
                const tickerData = Object.keys(cleanedData[ticker])
                tickerData.sort((a, b) => {
                    const dateA = moment(a, 'DD/MM/YYYY')
                    const dateB = moment(b, 'DD/MM/YYYY')
                    return dateA.isSameOrAfter(dateB) ? 1 : -1
                })
                const percentData = []
                for (let i = 0; i < tickerData.length; i++) {
                    const currentDay = tickerData[i]
                    const previousDay = i > 0 ? tickerData[i - 1] : currentDay
                    const currentDayData = cleanedData[ticker][currentDay].close
                    const previousDayData = cleanedData[ticker][previousDay].close
                    const percentDiff = 100 * (currentDayData - previousDayData) / previousDayData
                    percentData.push({
                        currentDay, percentDiff
                    })
                }
                const sharpe = findSharpe(percentData, sharpeSqrt)
                diffData[ticker] = {
                    percentData,
                    sharpe
                }
            })
            return diffData
        }
    })
}

export { analyseData }