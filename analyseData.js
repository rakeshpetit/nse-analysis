import moment from 'moment'
import { cleanData } from './cleanData'

const findSharpe = (percentData, sharpeSqrt) => {
    let average = percentData.reduce((sum, dailyPercent) => {
        return sum + dailyPercent.percentDiff
    }, 0)
    const dataLength = percentData.length
    average = average / dataLength
    let variance = percentData.reduce((sum, dailyPercent) => {
        const sigma = dailyPercent.percentDiff - average
        const sigmaSquare = sigma * sigma
        return sum + sigmaSquare
    }, 0)
    const sd = Math.sqrt(variance / (dataLength - 1))
    const sharpe = 100 * average/sd
    const volatility = sharpeSqrt * sd
    return { average, sd, sharpe, volatility}
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
                const analysis = findSharpe(percentData, sharpeSqrt)
                diffData[ticker] = {
                    percentData,
                    analysis
                }
            })
            return diffData
        }
    })
}

const filterData = (data) => {
    let filteredData = []
    Object.keys(data).map((ticker) => {
        const tickerData = data[ticker]['analysis']
        if (tickerData.sharpe > 2) {
            return filteredData.push({
                scrip: ticker,
                analysis: tickerData
            })
        }
    })
    filteredData.sort((a, b) => {
        return a.analysis.sharpe > b.analysis.sharpe ? -1 : 1
    }).map(data => {
        console.log(`${data.scrip} - ${data.analysis.sharpe}`)
    })
}

export { analyseData, filterData }