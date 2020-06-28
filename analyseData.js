import moment from 'moment'
import { cleanData } from './cleanData'
import { exceptionList } from './config'

const findSharpe = (percentData, sharpeSqrt) => {
    let count = 0
    let averageValue = 0
    let average = percentData.reduce((sum, dailyPercent) => {
        // console.log(dailyPercent)
        count++
        averageValue = averageValue + (+dailyPercent.currentDayValue)
        return sum + dailyPercent.percentDiff
    }, 0)
    const dataLength = percentData.length
    average = average / dataLength
    averageValue = averageValue / dataLength
    let variance = percentData.reduce((sum, dailyPercent) => {
        const sigma = dailyPercent.percentDiff - average
        const sigmaSquare = sigma * sigma
        return sum + sigmaSquare
    }, 0)
    const sd = Math.sqrt(variance / (dataLength - 1))
    const sharpe = 100 * average/sd
    const volatility = sharpeSqrt * sd
    return { count, average, averageValue, sd, sharpe, volatility}
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
                    const currentDayValue = cleanedData[ticker][currentDay].value
                    if(i === 0){
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
            })
            return diffData
        }
    })
}

const filterData = (data) => {
    let filteredData = []
    Object.keys(data).map((ticker) => {
        const tickerData = data[ticker]['analysis']
        if (tickerData.count > 30 && tickerData.sharpe > 2) {
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
                // console.log(item)
                return item
                // return item.sharpeMarks > 3 
                // && item.volatilityMarks > 3
                // && item.analysis.averageValue > 500000000
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
                    cap: markData.analysis.averageValue > 10000000 
                        ? 'large' : markData.analysis.averageValue > 20000000 ?'mid' : 'small',
                    totalMarks: markData.sharpeMarks + markData.volatilityMarks
                })

            })
        })
        let totalData = []
        const duplicate = {}
        let totalReturns = 0
        let totalReturnsLarge = 0
        let totalReturnsMid = 0
        let totalReturnsSmall = 0
        let count = 0
        let largeCount = 0
        let midCount = 0
        let smallCount = 0
        finalData.map(data => {
            if (!duplicate[data.scrip]) {
                const scripListTotal = finalData.filter(scripData => {
                    return scripData.scrip === data.scrip
                }).reduce((total, scripData) => {
                    return total + scripData.totalMarks
                }, 0)
                totalData.push({ 
                    scrip: data.scrip,
                    totalMarks: scripListTotal,
                    cap: data.cap
                 })
                duplicate[data.scrip] = true
            }
        })
        totalData.sort((a, b) => {
            return b.totalMarks - a.totalMarks
        }).map(data => {
            const isException = exceptionList[data.scrip]
            if (!isException && data.totalMarks > 10){
                let returns = findReturns(nextMonthData, data.scrip, dateMoment.clone(), nextMonthMoment.clone())
                if (returns !== 0){
                    if (returns < -40) {
                        // console.log('<<<<<<Alert', returns)
                        returns = 0
                    }
                    else if (data.cap === 'large' && largeCount < 50) {
                        count++
                        largeCount++
                        totalReturns = ((count - 1) * totalReturns + returns) / count
                        totalReturnsLarge = ((largeCount - 1) * totalReturnsLarge + returns) / largeCount
                        console.log(`${count}.${data.scrip}\tmarks: ${data.totalMarks}\treturns: (${returns})\tlarge`)
                    }
                    else if (data.cap === 'mid' && midCount < 0) {
                        count++
                        midCount++
                        totalReturns = ((count - 1) * totalReturns + returns) / count
                        totalReturnsMid = ((midCount - 1) * totalReturnsMid + returns) / midCount
                        // console.log(`${count}.${data.scrip}\tmarks: ${data.totalMarks}\treturns: (${returns})\mid`)
                    }
                    else if (data.cap === 'small' && smallCount < 0) {
                        count++
                        smallCount++
                        totalReturns = ((count - 1) * totalReturns + returns) / count
                        totalReturnsSmall = ((smallCount - 1) * totalReturnsSmall + returns) / smallCount
                        // console.log(`${count}.${data.scrip}\tmarks: ${data.totalMarks}\treturns: (${returns})\small`)
                    }
                }
            }
        })
        console.log(`${count} stocks Total returns for ${dateStr}: ${totalReturns}`)
        // console.log(`${largeCount} stocksTotal large returns for ${dateStr}: ${totalReturnsLarge}\n`)
        // console.log(`${midCount} stocksTotal mid returns for ${dateStr}: ${totalReturnsMid}\n`)
        // console.log(`${smallCount} stocksTotal small returns for ${dateStr}: ${totalReturnsSmall}\n`)
        return { totalReturns, totalReturnsLarge, totalReturnsMid, totalReturnsSmall }
    })
}

const filterSelectedAll = () => {
    if (returns < -40) {
        console.log('<<<<<<Alert', returns)
        returns = 0
    }
    else {
        count++
        totalReturns = ((count - 1) * totalReturns + returns) / count
        console.log(`${count}.${data.scrip}\tmarks: ${data.totalMarks}\treturns: (${returns})\tlarge`)
    } 
}

const filterSelected30 = () => {
    if (returns < -40) {
        console.log('<<<<<<Alert', returns)
        returns = 0
    }
    else if (data.cap === 'large' && largeCount < 11) {
        count++
        largeCount++
        totalReturns = ((count - 1) * totalReturns + returns) / count
        totalReturnsLarge = ((largeCount - 1) * totalReturnsLarge + returns) / largeCount
        console.log(`${count}.${data.scrip}\tmarks: ${data.totalMarks}\treturns: (${returns})\tlarge`)
    }
    else if (data.cap === 'mid' && midCount < 8) {
        count++
        midCount++
        totalReturns = ((count - 1) * totalReturns + returns) / count
        totalReturnsMid = ((midCount - 1) * totalReturnsMid + returns) / midCount
        console.log(`${count}.${data.scrip}\tmarks: ${data.totalMarks}\treturns: (${returns})\mid`)
    }
    else if (data.cap === 'small' && smallCount < 11) {
        count++
        smallCount++
        totalReturns = ((count - 1) * totalReturns + returns) / count
        totalReturnsSmall = ((smallCount - 1) * totalReturnsSmall + returns) / smallCount
        console.log(`${count}.${data.scrip}\tmarks: ${data.totalMarks}\treturns: (${returns})\small`)
    }
}

const findReturns = (nextMonthData, scrip, startDateMoment, endDateMoment) => {
    const scripData = nextMonthData[scrip]
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