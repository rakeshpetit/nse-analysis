import moment from 'moment'
import { cleanData } from './cleanData'
import { exceptionList } from './config'

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
        if (tickerData.count > 30 && tickerData.sharpe > 4) {
            return filteredData.push({
                scrip: ticker,
                overallDiff: data[ticker]['overallDiff'],
                analysis: tickerData
            })
        }
    })
    return filteredData
}

const getMultiplePeriodData = (dateStr) => {
    const dateMoment = moment(dateStr, 'DD/MM/YYYY')
    const oneYearStr = dateMoment.clone().subtract(1, "year").format('DD/MM/YYYY');
    const halfYearStr = dateMoment.clone().subtract(6, "month").format('DD/MM/YYYY');
    const quarterYearStr = dateMoment.clone().subtract(3, "month").format('DD/MM/YYYY');

    const analysisPromise = [
        analyseData(quarterYearStr, dateStr),
        analyseData(halfYearStr, dateStr),
        analyseData(oneYearStr, dateStr)
    ]
    return Promise.all(analysisPromise).then(threeData => {
        return threeData.map((data) => {
            const eachData = filterData(data)
            const maxMinData = eachData.reduce((acc, data) => {
                if (data.analysis.sharpe > acc.maxSharpe) {
                    acc.maxSharpe = data.analysis.sharpe
                }
                if (data.analysis.volatility < acc.minVolatility) {
                    acc.minVolatility = data.analysis.volatility
                }
                return acc
            }, {
                maxSharpe: 0,
                minVolatility: 1000,
            })
            const markData = eachData.map(filteredData => {
                const sharpeMarks = filteredData.analysis.sharpe * (50 / maxMinData.maxSharpe)
                const volatilityMarks = 10 + ((15 * maxMinData.minVolatility) / filteredData.analysis.volatility)
                return { ...filteredData, sharpeMarks, volatilityMarks }
            })
            return markData.filter(item => {
                return item.sharpeMarks > 5 && item.volatilityMarks > 5
            }).sort((a, b) => {
                return ((a.sharpeMarks + a.volatilityMarks) > (b.sharpeMarks + b.volatilityMarks) ? 1 : -1)
            })
        })
    })
}

const calculateMarks = (dateStr) => {
    const dateMoment = moment(dateStr, 'DD/MM/YYYY')
    const nextMonthMoment = dateMoment.clone().add(1, "month")
    let nextMonthData = {}
    return cleanData(dateStr, nextMonthMoment.format('DD/MM/YYYY')).then((cleanedData) => {
        nextMonthData = cleanedData
    }).then(() => {
        return getMultiplePeriodData(dateStr)
    }).then(data => {
        let finalData = []
        data.map(periodicData => {
            periodicData.map(markData => {
                finalData.push({
                    scrip: markData.scrip,
                    totalMarks: markData.sharpeMarks + markData.volatilityMarks
                })

            })
        })
        let totalData = []
        const duplicate = {}
        let totalReturns = 0
        let count = 0
        finalData.map(data => {
            if (!duplicate[data.scrip]) {
                const scripListTotal = finalData.filter(scripData => {
                    return scripData.scrip === data.scrip
                }).reduce((total, scripData) => {
                    return total + scripData.totalMarks
                }, 0)
                totalData.push({ scrip: data.scrip, totalMarks: scripListTotal })
                duplicate[data.scrip] = true
            }
        })
        totalData.sort((a, b) => {
            return b.totalMarks - a.totalMarks
        }).map(data => {
            const isException = exceptionList[data.scrip]
            if (!isException && data.totalMarks > 40){
                let returns = findReturns(nextMonthData, data.scrip, dateMoment, nextMonthMoment)
                if(returns !== 0 && count < 30){
                    if(returns < -50){
                        console.log('<<<<<<Alert', returns)
                        returns = -20
                    }
                    count++
                    totalReturns = ((count -1) * totalReturns + returns) / count
                    console.log(`${count}.${data.scrip}\tmarks: ${data.totalMarks}\treturns: (${returns})`)
                }
            }
        })
        console.log(`Total returns for ${dateStr}: ${totalReturns}\n\n`)
        return totalReturns
    })
}

const findReturns = (nextMonthData, scrip, startDateMoment, endDateMoment) => {
    const scripData = nextMonthData[scrip]
    // if (scrip === 'TITAN') {
    //     console.log('scripData', scripData )
    // }
    const startPrice = scripData && (
        scripData[startDateMoment.format('DD/MM/YYYY')] || scripData[startDateMoment.add(1, "day").format('DD/MM/YYYY')] || scripData[startDateMoment.add(1, "day").format('DD/MM/YYYY')] ||
        scripData[startDateMoment.add(1, "day").format('DD/MM/YYYY')] ||
        scripData[startDateMoment.add(1, "day").format('DD/MM/YYYY')] ||
        scripData[startDateMoment.add(1, "day").format('DD/MM/YYYY')]
    )
    const endPrice = scripData && (scripData[endDateMoment.format('DD/MM/YYYY')] || scripData[endDateMoment.subtract(1, "day").format('DD/MM/YYYY')] || scripData[endDateMoment.subtract(1, "day").format('DD/MM/YYYY')] || scripData[endDateMoment.subtract(1, "day").format('DD/MM/YYYY')] ||
        scripData[endDateMoment.subtract(1, "day").format('DD/MM/YYYY')] || scripData[endDateMoment.subtract(1, "day").format('DD/MM/YYYY')]
    )
    return (endPrice && startPrice) ? 100 * (endPrice.close - startPrice.close) / startPrice.close : 0
}

export { calculateMarks, analyseData, filterData }