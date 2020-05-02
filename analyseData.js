import moment from 'moment'
import { cleanData } from './cleanData'

const findSharpe = (percentData, sharpeSqrt) => {
    let count = 0
    let average = percentData.reduce((sum, dailyPercent) => {
        count++
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
    return { count, average, sd, sharpe, volatility}
}

const analyseData = (startingDateStr, endingDateStr) => {
    return cleanData(startingDateStr, endingDateStr).then((cleanedData) => {
        {
            // console.log(Object.keys(cleanedData[0]['RPGLIFE']))
            // console.log(Object.keys(cleanedData[1]['RPGLIFE']))
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
                let startPrice = 50000
                let endPrice = 1
                for (let i = 0; i < tickerData.length; i++) {
                    const currentDay = tickerData[i]
                    const previousDay = i > 0 ? tickerData[i - 1] : currentDay
                    const currentDayData = cleanedData[ticker][currentDay].close
                    if(i === 0){
                        startPrice = currentDayData
                    }
                    if (i === tickerData.length - 1) {
                        endPrice = currentDayData
                    }
                    const previousDayData = cleanedData[ticker][previousDay].close
                    const percentDiff = 100 * (currentDayData - previousDayData) / previousDayData
                    percentData.push({
                        currentDay, percentDiff
                    })
                }
                const analysis = findSharpe(percentData, sharpeSqrt)
                diffData[ticker] = {
                    percentData,
                    overallDiff: 100 * (endPrice - startPrice) / endPrice,
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
        if (tickerData.count > 50 && tickerData.sharpe > 4) {
            return filteredData.push({
                scrip: ticker,
                overallDiff: data[ticker]['overallDiff'],
                analysis: tickerData
            })
        }
    })
    filteredData.sort((a, b) => {
        return a.analysis.sharpe > b.analysis.sharpe ? -1 : 1
    }).map((data, index) => {
        if(index < 51){
            console.log(`${data.scrip} - count ${data.analysis.count} - sharpe ${data.analysis.sharpe} - volatility ${data.analysis.volatility} (${data.overallDiff})`)
        }
    })
}

export { analyseData, filterData }