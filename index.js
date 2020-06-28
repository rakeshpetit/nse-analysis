import moment from 'moment'
import async from 'async'
import { createStore } from 'redux'
import { getURLs } from './getDates'
import { downloadAsync, unZipAsync } from './downloadAsync'
import { collateData } from './collateData'
import { counter } from './reducers'
import { getCleanData, analyseData, getMonthlyList } from './analyseDataNew'
import { writeToCsv } from './dataToCsv'
const startingDateStr = '01/01/2018'
const endingDateStr = '31/12/2018'

const urls = getURLs(startingDateStr, endingDateStr)
// downloadAsync(urls)
// unZipAsync(urls)
// collateData(urls)
// writeToCsv(startingDateStr, endingDateStr)

export const store = createStore(counter)

const calculateForYear = (year) => {
    let yearlyCalc = []
    let p = Promise.resolve();
    for (let month = 0; month < 12; month++) {
        const iStr = `01/${month < 9 ? '0' : ''}${month + 1}/${year}`
        console.log(iStr)
        const startDateStr = `01/${month < 9 ? '0' : ''}${month + 1}/${year - 1}`
        const endDateStr = `01/${month < 9 ? '0' : ''}${month + 1}/${year}`
        p = p.then(() => getCleanData(endDateStr).then(() => {
            const yearly = analyseData(startDateStr, endDateStr)
            console.log('yearly', endDateStr, Object.keys(yearly).length)
            getMonthlyList(yearly, endDateStr)
        }));
    }
    return p
}

calculateForYear(2019).then(() => {
    console.log('store', store.getState()['selectedList'])
})

// getCleanData('01/01/2019').then(() => {
//     const yearly = analyseData("01/01/2018", "01/01/2019")
//     getMonthlyList(yearly)
// })

