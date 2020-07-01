import moment from 'moment'
import _ from 'lodash'
import { exceptionList } from './config'
import { cleanData } from './cleanData'
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
            store.dispatch({ type: 'CLEANED_DATA_PAST', data: cleanedData })
        }
    })
    .then(() => cleanData(dateStr, oneYearStrAfterCurrent))
        .then((cleanedData) => {
            {
                store.dispatch({ type: 'CLEANED_DATA_CURRENT', data: cleanedData })
            }
        })
        .then(() => {
            const pastData = store.getState()['cleanLastYearPrice']
            const currentData = store.getState()['cleanCurrentYearPrice']
            const combinedData = _.merge(pastData, currentData);
            store.dispatch({ type: 'COMBINED_DATA', data: combinedData })
        })
}

const analyseData = (startingDateStr, endingDateStr) => {
    const cleanedData = store.getState()['combinedYearPrice']
    const startingDate = moment(startingDateStr, 'DD/MM/YYYY HH:mm')
    const endingDate = moment(endingDateStr, 'DD/MM/YYYY HH:mm')
    const numOfDays = endingDate.diff(startingDate, "days")
    const sharpeSqrt = Math.sqrt(numOfDays)
    let diffData = {}
    Object.keys(cleanedData).map(ticker => {
        let tickerData = Object.keys(cleanedData[ticker])
        if(tickerData.length > 0) {
            tickerData = tickerData.filter(a => {
                const dateA = moment(a, 'DD/MM/YYYY')
                return dateA.isBetween(startingDate, endingDate)
            }).sort((a, b) => {
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
    // console.log(diffData)
    return diffData
}

const getMonthlyList = (yearly, dateKey) => {
    const monthlyList = []
    Object.entries(yearly)
        .filter((item) => {
            const isException = exceptionList[item[0]]
            return !isException 
                && item[1].analysis.count > 150
                && item[1].analysis.averageValue > 100000
        })
        .sort((a, b) => {
            return b[1].analysis.sharpe - a[1].analysis.sharpe
        })
        .map((item, index) => {
            if (index < 75)
                monthlyList.push({
                    ticker: item[0],
                    position: index + 1,
                    analysis: item[1].analysis,
                })
        })
    store.dispatch({
        type: 'SAVE_SELECTED_LIST',
        data: {
            dateKey,
            monthlyList
        }
    })
}

const calculateForYear = (year) => {
    let p = Promise.resolve();
    for (let month = 0; month < 12; month++) {
        const iStr = `01/${month < 9 ? '0' : ''}${month + 1}/${year}`
        console.log(iStr)
        const startDateStr = `01/${month < 9 ? '0' : ''}${month + 1}/${year - 1}`
        const endDateStr = `01/${month < 9 ? '0' : ''}${month + 1}/${year}`
        p = p.then(() => getCleanData(endDateStr).then(() => {
            const yearly = analyseData(startDateStr, endDateStr)
            getMonthlyList(yearly, endDateStr)
        }));
    }
    return p
}

export { getCleanData, analyseData, getMonthlyList, calculateForYear }