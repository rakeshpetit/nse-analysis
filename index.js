import moment from 'moment'
import async from 'async'
import { createStore } from 'redux'
import { exceptionList } from './config'
import { getURLs } from './getDates'
import { downloadAsync, unZipAsync } from './downloadAsync'
import { collateData } from './collateData'
import { counter } from './reducers'
// import { calculateMarks, analyseData, filterData } from './analyseData'
import { getCleanData, analyseData } from './analyseDataNew'
// import { writeToCsv } from './dataToCsv'
const startingDateStr = '01/01/2018'
const endingDateStr = '31/12/2018'

const urls = getURLs(startingDateStr, endingDateStr)
// downloadAsync(urls)
// unZipAsync(urls)
// collateData(urls)
// writeToCsv(startingDateStr, endingDateStr)

export const store = createStore(counter)

// store.dispatch({ type: 'INCREMENT' })
// store.dispatch({ type: 'INCREMENT' })
// console.log(store.getState())
// store.dispatch({ type: 'DECREMENT' })
// store.dispatch({ type: 'DECREMENT' })

getCleanData('01/01/2019').then(() => {
    // const currentYear = store.getState()['cleanCurrentYearPrice']
    const yearly = analyseData("01/01/2018", "01/01/2019")
    // const halfYearly = analyseData("01/07/2016", "01/01/2017")
    // const quarterly = analyseData("01/10/2016", "01/01/2017")
    // console.log('quarterly', quarterly['NESCO'].analysis)
    // console.log('halfYearly', halfYearly['NESCO'].analysis)
    // console.log('yearly', yearly['BAJFINANCE'])
    const monthlyList = []
    Object.entries(yearly)
    .filter((item) => {
        const isException = exceptionList[item[0]]
        return !isException && item[1].analysis.averageValue > 10000000
    })
    .sort((a,b) => {
        return b[1].analysis.sharpe - a[1].analysis.sharpe
    })
    .map((item, index) => {
        if(index < 50)
            monthlyList.push({
                ticker: item[0],
                position: index+1,
                analysis: item[1].analysis,
            })
    })
    
    store.dispatch({
        type: 'SAVE_SELECTED_LIST',
        data: {
            dateKey: '01/01/2019',
            monthlyList
        }
    })

    console.log(store.getState()['selectedList'])
})
